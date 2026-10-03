import { verifyToken } from '@clerk/backend';
import admin from 'firebase-admin';
import { Redis } from '@upstash/redis';

// Inicializa o Firebase Admin com tratamento de erro
try {
  if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // A chave privada vem com \n escapados na variável de ambiente — precisa reverter.
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
} catch (err) {
  console.error('Erro ao inicializar Firebase Admin:', err.message || err);
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

function isMemoryRateLimited(key, max = MAX_REQUESTS_PER_WINDOW) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  
  record.count++;
  rateLimitMap.set(key, record);
  return record.count > max;
}

export async function checkRateLimit(key, max = MAX_REQUESTS_PER_WINDOW) {
  // Se Upstash Redis estiver configurado, usa contador atômico compartilhado entre instâncias
  if (redis) {
    try {
      const redisKey = `ratelimit:firebase_token:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, 60);
      }
      return count > max;
    } catch (err) {
      console.warn('Erro ao consultar Upstash Redis, utilizando fallback em memória:', err.message);
    }
  }

  // Fallback seguro em memória
  return isMemoryRateLimited(key, max);
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

  const missingVars = [];
  if (!process.env.FIREBASE_PROJECT_ID) missingVars.push('FIREBASE_PROJECT_ID');
  if (!process.env.FIREBASE_CLIENT_EMAIL) missingVars.push('FIREBASE_CLIENT_EMAIL');
  if (!process.env.FIREBASE_PRIVATE_KEY) missingVars.push('FIREBASE_PRIVATE_KEY');
  if (!process.env.CLERK_SECRET_KEY) missingVars.push('CLERK_SECRET_KEY');

  if (!admin.apps.length || missingVars.length > 0) {
    console.error('Configuração do servidor incompleta. Variáveis ausentes:', missingVars.join(', '));
    return res.status(500).json({ error: 'Configuração do servidor incompleta.' });
  }

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const ipBlocked = await checkRateLimit('ip:' + clientIp, 120);
  if (ipBlocked) {
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

    const userBlocked = await checkRateLimit('user:' + clerkUserId, 15);
    if (userBlocked) {
      return res.status(429).json({ error: 'Muitas requisições. Aguarde um momento antes de tentar novamente.' });
    }

    const firebaseToken = await admin.auth().createCustomToken(clerkUserId);

    return res.status(200).json({ firebaseToken });
  } catch (error) {
    console.error('Erro de validação do token Clerk:', error.message || 'Token inválido');
    return res.status(401).json({ error: 'Não foi possível validar a sessão do usuário.' });
  }
}
