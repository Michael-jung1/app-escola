import {
  collection as realCollection,
  doc as realDoc,
  onSnapshot as realOnSnapshot,
  addDoc as realAddDoc,
  updateDoc as realUpdateDoc,
  deleteDoc as realDeleteDoc,
  writeBatch as realWriteBatch,
} from 'firebase/firestore';
import { auth } from './firebase';

const listeners = new Map();

function emitChange(userId, collectionName) {
  const key = `${userId}:${collectionName}`;
  const subs = listeners.get(key);
  if (subs) {
    const data = getLocalCollection(userId, collectionName);
    const snapshot = {
      docs: data.map(item => ({
        id: item.id,
        data: () => {
          const { id: _, ...rest } = item;
          return rest;
        },
      })),
    };
    subs.forEach(cb => cb(snapshot));
  }
}

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

function getLocalCollection(userId, collectionName) {
  const storageKey = `studyapp_data_${userId}_${collectionName}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      const seed = DEFAULT_SEED_DATA[collectionName] || [];
      localStorage.setItem(storageKey, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SEED_DATA[collectionName] || [];
  }
}

function saveLocalCollection(userId, collectionName, items) {
  const storageKey = `studyapp_data_${userId}_${collectionName}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (e) {
    console.warn('Erro ao salvar no localStorage:', e);
  }
  emitChange(userId, collectionName);
}

export function collection(firstArg, ...segments) {
  if (auth.currentUser) {
    return realCollection(firstArg, ...segments);
  }

  let userId = '';
  let collectionName = '';
  if (segments.length >= 3 && segments[0] === 'users') {
    userId = segments[1];
    collectionName = segments[2];
  } else if (segments.length === 1) {
    collectionName = segments[0];
  }

  return {
    _isLocal: true,
    userId,
    collectionName,
  };
}

export function doc(firstArg, ...segments) {
  if (auth.currentUser) {
    return realDoc(firstArg, ...segments);
  }

  if (firstArg?._isLocal) {
    const docId = segments[0] || 'local_' + Math.random().toString(36).substring(2, 9);
    return {
      _isLocal: true,
      userId: firstArg.userId,
      collectionName: firstArg.collectionName,
      id: docId,
    };
  }

  let userId = '';
  let collectionName = '';
  let docId = '';

  if (segments.length >= 4 && segments[0] === 'users') {
    userId = segments[1];
    collectionName = segments[2];
    docId = segments[3];
  } else if (segments.length === 2) {
    collectionName = segments[0];
    docId = segments[1];
  }

  return {
    _isLocal: true,
    userId,
    collectionName,
    id: docId || 'local_' + Math.random().toString(36).substring(2, 9),
  };
}

export function onSnapshot(ref, onNext, onError) {
  if (auth.currentUser && !ref._isLocal) {
    return realOnSnapshot(ref, onNext, onError);
  }

  const { userId, collectionName } = ref;
  const key = `${userId}:${collectionName}`;

  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  const set = listeners.get(key);
  set.add(onNext);

  // Initial trigger asynchronously
  setTimeout(() => {
    const data = getLocalCollection(userId, collectionName);
    onNext({
      docs: data.map(item => ({
        id: item.id,
        data: () => {
          const { id: _, ...rest } = item;
          return rest;
        },
      })),
    });
  }, 0);

  return () => {
    set.delete(onNext);
  };
}

export async function addDoc(collectionRef, data) {
  if (auth.currentUser && !collectionRef._isLocal) {
    return await realAddDoc(collectionRef, data);
  }

  const { userId, collectionName } = collectionRef;
  const items = getLocalCollection(userId, collectionName);
  const newId = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const newItem = { id: newId, ...data };
  items.push(newItem);
  saveLocalCollection(userId, collectionName, items);
  return { id: newId };
}

export async function updateDoc(docRef, data) {
  if (auth.currentUser && !docRef._isLocal) {
    return await realUpdateDoc(docRef, data);
  }

  const { userId, collectionName, id } = docRef;
  const items = getLocalCollection(userId, collectionName);
  const index = items.findIndex(i => i.id === id);
  if (index !== -1) {
    items[index] = { ...items[index], ...data };
    saveLocalCollection(userId, collectionName, items);
  }
}

export async function deleteDoc(docRef) {
  if (auth.currentUser && !docRef._isLocal) {
    return await realDeleteDoc(docRef);
  }

  const { userId, collectionName, id } = docRef;
  const items = getLocalCollection(userId, collectionName);
  const filtered = items.filter(i => i.id !== id);
  saveLocalCollection(userId, collectionName, filtered);
}

export function writeBatch(dbInstance) {
  if (auth.currentUser) {
    return realWriteBatch(dbInstance);
  }

  const operations = [];

  return {
    set(docRef, data) {
      operations.push({ docRef, data });
    },
    async commit() {
      operations.forEach(({ docRef, data }) => {
        const { userId, collectionName, id } = docRef;
        const items = getLocalCollection(userId, collectionName);
        const index = items.findIndex(i => i.id === id);
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
