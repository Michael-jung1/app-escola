import { verifyToken } from '@clerk/backend';
import admin from 'firebase-admin';

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

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token do Clerk ausente' });
  }

  const clerkToken = authHeader.replace('Bearer ', '');

  try {
    const claims = await verifyToken(clerkToken, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const clerkUserId = claims.sub;
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const firebaseToken = await admin.auth().createCustomToken(clerkUserId);

    return res.status(200).json({ firebaseToken });
  } catch (error) {
    console.error('Erro ao gerar Firebase custom token:', error);
    return res.status(401).json({ error: 'Não foi possível validar o login.' });
  }
}
