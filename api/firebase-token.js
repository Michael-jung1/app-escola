import { verifyToken } from '@clerk/backend';
import admin from 'firebase-admin';
import { Redis } from '@upstash/redis';

// Inicializa o Firebase Admin apenas uma vez (evita erro de "app already exists"
// em ambiente serverless, onde a função pode ser reaproveitada entre chamadas).
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // A chave privada vem com \n escapados na variável de ambiente — precisa reverter.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// Configuração do Upstash Redis para Rate Limiter Distribuído (Serverless multi-instância)
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } catch (err) {
    console.warn('Aviso: Não foi possível instanciar cliente Upstash Redis:', err.message);
  }
}

// Rate limiter em memória (fallback local caso Upstash não esteja configurado ou oscile)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 15;

function isMemoryRateLimited(clientIp) {
  const now = Date.now();
  const record = rateLimitMap.get(clientIp) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  
  record.count++;
  rateLimitMap.set(clientIp, record);
  return record.count > MAX_REQUESTS_PER_WINDOW;
}

export async function checkRateLimit(clientIp) {
  // Se Upstash Redis estiver configurado, usa contador atômico compartilhado entre instâncias
  if (redis) {
    try {
      const key = `ratelimit:firebase_token:${clientIp}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 60);
      }
      return count > MAX_REQUESTS_PER_WINDOW;
    } catch (err) {
      console.warn('Erro ao consultar Upstash Redis, utilizando fallback em memória:', err.message);
    }
  }

  // Fallback seguro em memória
  return isMemoryRateLimited(clientIp);
}

/**
 * Ponte entre Clerk e Firestore: o usuário já está autenticado no Clerk (frontend
 * manda o token de sessão dele), aqui verificamos esse token e, se válido, geramos
 * um Firebase Custom Token com o MESMO userId do Clerk. O frontend usa esse token
 * para logar no Firebase Auth via signInWithCustomToken — e a partir daí, o
 * Firestore enxerga request.auth.uid igual ao userId do Clerk, sem o usuário
 * precisar criar uma conta separada no Firebase.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const blocked = await checkRateLimit(clientIp);
  if (blocked) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token do Clerk ausente' });
  }

  const clerkToken = authHeader.replace('Bearer ', '').trim();
  if (!clerkToken) {
    return res.status(401).json({ error: 'Token do Clerk inválido' });
  }

  try {
    const claims = await verifyToken(clerkToken, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const clerkUserId = claims?.sub;
    if (!clerkUserId || typeof clerkUserId !== 'string') {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    const firebaseToken = await admin.auth().createCustomToken(clerkUserId);

    return res.status(200).json({ firebaseToken });
  } catch (error) {
    console.error('Erro de validação do token Clerk:', error.message || 'Token inválido');
    return res.status(401).json({ error: 'Não foi possível validar a sessão do usuário.' });
  }
}
