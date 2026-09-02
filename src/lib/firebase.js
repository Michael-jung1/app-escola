import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyANKtjA1-9NFfR29H14XVHh2NL9_GRTxSo',
  authDomain: 'app-escola-536ab.firebaseapp.com',
  databaseURL: 'https://app-escola-536ab-default-rtdb.firebaseio.com',
  projectId: 'app-escola-536ab',
  storageBucket: 'app-escola-536ab.firebasestorage.app',
  messagingSenderId: '559115035640',
  appId: '1:559115035640:web:72b5fc0135e2194e82ac0d',
  measurementId: 'G-LGH6VMKHRY',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

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
