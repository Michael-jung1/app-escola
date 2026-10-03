import {
  collection as realCollection,
  doc as realDoc,
  onSnapshot as realOnSnapshot,
  addDoc as realAddDoc,
  updateDoc as realUpdateDoc,
  deleteDoc as realDeleteDoc,
  writeBatch as realWriteBatch,
  getDocs as realGetDocs,
} from 'firebase/firestore';
import { db, auth } from './firebase';

const listeners = new Map();

const DEFAULT_SEED_DATA = {
  classes: [
    { id: 'c1', subject: 'Matemática', teacher: 'Carlos Silva', dayOfWeek: 'Segunda', startTime: '13:00', endTime: '13:45', color: 'bg-blue-500' },
    { id: 'c2', subject: 'Português', teacher: 'Ana Oliveira', dayOfWeek: 'Segunda', startTime: '13:45', endTime: '14:30', color: 'bg-purple-500' },
    { id: 'c3', subject: 'História', teacher: 'Marcos Souza', dayOfWeek: 'Terça', startTime: '13:00', endTime: '13:45', color: 'bg-yellow-500' },
    { id: 'c4', subject: 'Geografia', teacher: 'Lucia Santos', dayOfWeek: 'Terça', startTime: '13:45', endTime: '14:30', color: 'bg-emerald-500' },
    { id: 'c5', subject: 'Física', teacher: 'Roberto Dias', dayOfWeek: 'Quarta', startTime: '14:30', endTime: '15:30', color: 'bg-orange-500' },
    { id: 'c6', subject: 'Biologia', teacher: 'Juliana Mendes', dayOfWeek: 'Quinta', startTime: '15:30', endTime: '16:15', color: 'bg-pink-500' },
    { id: 'c7', subject: 'Química', teacher: 'Fernanda Lima', dayOfWeek: 'Sexta', startTime: '13:00', endTime: '13:45', color: 'bg-red-500' },
  ],
  tasks: [
    {
      id: 't1',
      title: 'Maquete de Célula Animal',
      subject: 'Biologia',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      priority: 'alta',
      status: 'em andamento',
      steps: [
        { title: 'Comprar isopor e tintas', done: true },
        { title: 'Modelar núcleo e organelas', done: false },
        { title: 'Identificar as partes com plaquinhas', done: false },
      ],
    },
    {
      id: 't2',
      title: 'Lista de Exercícios: Trigonometria',
      subject: 'Matemática',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      priority: 'média',
      status: 'pendente',
      steps: [
        { title: 'Exercícios 1 a 10', done: false },
        { title: 'Revisar fórmulas de seno e cosseno', done: false },
      ],
    },
  ],
  exams: [
    {
      id: 'e1',
      subject: 'Química',
      title: 'Prova Bimestral: Ligações Químicas',
      date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      topics: [
        { title: 'Ligações Iônicas e Covalentes', done: true },
        { title: 'Geometria Molecular', done: false },
        { title: 'Forças Intermoleculares', done: false },
      ],
    },
  ],
  grades: [
    { id: 'g1', subject: 'Matemática', title: 'Prova 1', value: 8.5, weight: 2 },
    { id: 'g2', subject: 'Matemática', title: 'Trabalho em Grupo', value: 9.0, weight: 1 },
    { id: 'g3', subject: 'História', title: 'Seminário Brasil Colonial', value: 9.5, weight: 1 },
    { id: 'g4', subject: 'Física', title: 'Teste de Cinemática', value: 7.0, weight: 2 },
  ],
};

function normalizeUser(userId) {
  return userId || auth.currentUser?.uid || 'estudante-demo';
}

function assertUserAuthorization(requestedUserId) {
  if (auth.currentUser && requestedUserId && requestedUserId !== auth.currentUser.uid) {
    throw new Error('PERMISSION_DENIED: Tentativa não autorizada de acessar dados de outro usuário.');
  }
}

function getStorageKey(userId, collectionName) {
  return `studyapp_data_${normalizeUser(userId)}_${collectionName}`;
}

function getLocalCollection(userId, collectionName) {
  const storageKey = getStorageKey(userId, collectionName);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      const seed = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA[collectionName] || []));
      localStorage.setItem(storageKey, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SEED_DATA[collectionName] || []));
  }
}

function saveLocalCollection(userId, collectionName, items) {
  const storageKey = getStorageKey(userId, collectionName);
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (e) {
    console.warn('Erro ao salvar no localStorage:', e);
  }
  emitChange(userId, collectionName);
}

function emitChange(userId, collectionName) {
  const normUser = normalizeUser(userId);
  const key = `${normUser}:${collectionName}`;
  const subs = listeners.get(key);
  if (subs && subs.size > 0) {
    const data = getLocalCollection(normUser, collectionName);
    const snapshot = {
      docs: data.map(item => ({
        id: String(item.id),
        data: () => {
          const { id: _, ...rest } = item;
          return rest;
        },
      })),
    };
    subs.forEach(cb => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error('Error in listener callback:', err);
      }
    });
  }
}

export function collection(firstArg, ...segments) {
  let allParts = [];
  for (const seg of segments) {
    if (typeof seg === 'string') {
      allParts.push(...seg.split('/').filter(Boolean));
    }
  }

  let userId = 'estudante-demo';
  let collectionName = '';

  if (allParts.length >= 3 && allParts[0] === 'users') {
    userId = allParts[1] || 'estudante-demo';
    collectionName = allParts[2] || '';
  } else if (allParts.length === 2 && allParts[0] === 'users') {
    userId = allParts[1] || 'estudante-demo';
  } else if (allParts.length === 1) {
    collectionName = allParts[0];
  } else if (allParts.length > 0) {
    collectionName = allParts[allParts.length - 1];
  }

  assertUserAuthorization(userId);

  if (auth.currentUser) {
    return realCollection(firstArg, ...segments);
  }

  return {
    _isLocal: true,
    userId: normalizeUser(userId),
    collectionName,
  };
}

export function doc(firstArg, ...segments) {
  if (firstArg?._isLocal) {
    assertUserAuthorization(firstArg.userId);
    const docId = segments[0] || 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    return {
      _isLocal: true,
      userId: normalizeUser(firstArg.userId),
      collectionName: firstArg.collectionName,
      id: String(docId),
    };
  }

  // doc(collectionRef) sem segmentos: gera ID automático dentro da coleção.
  // O userId vem do caminho da própria coleção, não do valor padrão.
  if (segments.length === 0 && firstArg && !firstArg._isLocal && firstArg.type === 'collection') {
    const parts = String(firstArg.path || '').split('/').filter(Boolean);
    if (parts[0] === 'users' && parts[1]) {
      assertUserAuthorization(parts[1]);
    }
    return realDoc(firstArg);
  }

  let allParts = [];
  for (const seg of segments) {
    if (typeof seg === 'string') {
      allParts.push(...seg.split('/').filter(Boolean));
    } else if (seg) {
      allParts.push(String(seg));
    }
  }

  let userId = 'estudante-demo';
  let collectionName = '';
  let docId = '';

  if (allParts.length >= 4 && allParts[0] === 'users') {
    userId = allParts[1];
    collectionName = allParts[2];
    docId = allParts[3];
  } else if (allParts.length === 2) {
    collectionName = allParts[0];
    docId = allParts[1];
  } else if (allParts.length === 3 && allParts[0] === 'users') {
    userId = allParts[1];
    docId = allParts[2];
  } else if (allParts.length === 1) {
    docId = allParts[0];
  }

  assertUserAuthorization(userId);

  if (auth.currentUser) {
    return realDoc(firstArg, ...segments);
  }

  return {
    _isLocal: true,
    userId: normalizeUser(userId),
    collectionName,
    id: String(docId || 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
  };
}

export function onSnapshot(ref, onNext, onError) {
  assertUserAuthorization(ref.userId);

  if (auth.currentUser && !ref._isLocal) {
    return realOnSnapshot(ref, onNext, onError);
  }

  const userId = normalizeUser(ref.userId);
  const collectionName = ref.collectionName;
  const key = `${userId}:${collectionName}`;

  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  const set = listeners.get(key);
  set.add(onNext);

  // Send current data immediately
  const data = getLocalCollection(userId, collectionName);
  try {
    onNext({
      docs: data.map(item => ({
        id: String(item.id),
        data: () => {
          const { id: _, ...rest } = item;
          return rest;
        },
      })),
    });
  } catch (err) {
    console.error('Error during initial snapshot dispatch:', err);
  }

  return () => {
    set.delete(onNext);
  };
}

export async function addDoc(collectionRef, data) {
  assertUserAuthorization(collectionRef.userId);

  if (auth.currentUser && !collectionRef._isLocal) {
    return await realAddDoc(collectionRef, data);
  }

  const userId = normalizeUser(collectionRef.userId);
  const collectionName = collectionRef.collectionName;
  const items = getLocalCollection(userId, collectionName);
  const newId = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const newItem = { id: newId, ...data };
  items.push(newItem);
  saveLocalCollection(userId, collectionName, items);
  return { id: newId };
}

export async function updateDoc(docRef, data) {
  assertUserAuthorization(docRef.userId);

  if (auth.currentUser && !docRef._isLocal) {
    return await realUpdateDoc(docRef, data);
  }

  const userId = normalizeUser(docRef.userId);
  const collectionName = docRef.collectionName;
  const id = String(docRef.id);
  const items = getLocalCollection(userId, collectionName);
  const index = items.findIndex(i => String(i.id) === id);
  if (index !== -1) {
    items[index] = { ...items[index], ...data };
    saveLocalCollection(userId, collectionName, items);
  }
}

export async function deleteDoc(docRef) {
  assertUserAuthorization(docRef.userId);

  if (auth.currentUser && !docRef._isLocal) {
    return await realDeleteDoc(docRef);
  }

  const userId = normalizeUser(docRef.userId);
  const collectionName = docRef.collectionName;
  const id = String(docRef.id);
  const items = getLocalCollection(userId, collectionName);
  const filtered = items.filter(i => String(i.id) !== id);
  saveLocalCollection(userId, collectionName, filtered);
}

export function writeBatch(dbInstance) {
  if (auth.currentUser) {
    return realWriteBatch(dbInstance);
  }

  const operations = [];

  return {
    set(docRef, data) {
      assertUserAuthorization(docRef.userId);
      operations.push({ docRef, data });
    },
    async commit() {
      operations.forEach(({ docRef, data }) => {
        assertUserAuthorization(docRef.userId);
        const userId = normalizeUser(docRef.userId);
        const collectionName = docRef.collectionName;
        const id = String(docRef.id);
        const items = getLocalCollection(userId, collectionName);
        const index = items.findIndex(i => String(i.id) === id);
        if (index !== -1) {
          items[index] = { ...items[index], ...data };
        } else {
          items.push({ id, ...data });
        }
        saveLocalCollection(userId, collectionName, items);
      });
    },
  };
}

export async function clearCollection(userId, collectionName) {
  assertUserAuthorization(userId);
  const normUser = normalizeUser(userId);
  if (auth.currentUser) {
    const snap = await realGetDocs(realCollection(db, 'users', normUser, collectionName));
    const docs = snap.docs;
    const BATCH_SIZE = 450;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = realWriteBatch(db);
      const chunk = docs.slice(i, i + BATCH_SIZE);
      chunk.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }

  saveLocalCollection(normUser, collectionName, []);
}
