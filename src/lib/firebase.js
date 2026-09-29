import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyANKtjA1-9NFfR29H14XVHh2NL9_GRTxSo',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'app-escola-536ab.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://app-escola-536ab-default-rtdb.firebaseio.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'app-escola-536ab',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'app-escola-536ab.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '559115035640',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:559115035640:web:72b5fc0135e2194e82ac0d',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-LGH6VMKHRY',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// --- Configuração do Firebase App Check ---
// Protege os recursos do Firestore contra acessos vindos de fora do domínio oficial da aplicação.
let appCheckInstance = null;
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;

if (typeof window !== 'undefined') {
  // Suporte a token de depuração no ambiente de desenvolvimento ou testes
  if (import.meta.env.DEV || debugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
  }

  if (recaptchaSiteKey) {
    try {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      console.info('Firebase App Check ativado com sucesso.');
    } catch (err) {
      console.warn('Não foi possível inicializar o Firebase App Check:', err.message || err);
    }
  }
}

export const appCheck = appCheckInstance;

// Ativa cache offline: os dados ficam salvos no dispositivo e sincronizam
// automaticamente quando a internet voltar. Se o navegador não suportar
// (ex: aba anônima em alguns casos), cai de volta pro modo online normal.
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;

