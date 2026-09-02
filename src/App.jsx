import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookOpen, Calendar, CheckSquare, Clock, GraduationCap, Home,
  Plus, Settings, Trash2, X, ChevronRight, ChevronLeft, AlertCircle, Edit2,
  CheckCircle2, Circle, Timer, Bell, User, Play, Pause, RefreshCw, LogOut, FileText,
  Search, Sun, Moon, Download, Calculator, CalendarDays
} from 'lucide-react';
import { useUser, useClerk } from '@clerk/clerk-react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, writeBatch
} from 'firebase/firestore';
import { db } from './lib/firebase';
import { useFirebaseSync } from './lib/useFirebaseSync';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const COLORS = [
  { name: 'Azul', value: 'bg-blue-500' },
  { name: 'Roxo', value: 'bg-purple-500' },
  { name: 'Amarelo', value: 'bg-yellow-500' },
  { name: 'Laranja', value: 'bg-orange-500' },
  { name: 'Verde', value: 'bg-emerald-500' },
  { name: 'Rosa', value: 'bg-pink-500' },
  { name: 'Vermelho', value: 'bg-red-500' }
];

export default function StudyCompanionApp() {
  const [activeTab, setActiveTab] = useState('home');

  const [classes, setClasses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [exams, setExams] = useState([]);

  const [isClassModalOpen, setClassModalOpen] = useState(false);
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [isExamModalOpen, setExamModalOpen] = useState(false);
  const [isNotificationsOpen, setNotificationsOpen] = useState(false);

  // Guarda o item sendo editado (null = criando um novo)
  const [editingClass, setEditingClass] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingExam, setEditingExam] = useState(null);
  const [isSavingItem, setIsSavingItem] = useState(false);

  // Guarda o item que está pedindo confirmação antes de excluir
  // formato: { type: 'classes' | 'tasks' | 'exams', id, label }
  const [pendingDelete, setPendingDelete] = useState(null);

  // Mostra um erro rápido tipo "toast" quando uma ação no Firestore falha
  const [actionError, setActionError] = useState('');
  const actionErrorTimeoutRef = useRef(null);
  const showActionError = (msg) => {
    if (actionErrorTimeoutRef.current) clearTimeout(actionErrorTimeoutRef.current);
    setActionError(msg);
    actionErrorTimeoutRef.current = setTimeout(() => setActionError(''), 4000);
  };

  // --- Notas/médias ---
  const [grades, setGrades] = useState([]);
  const [isGradeModalOpen, setGradeModalOpen] = useState(false);
  const [editingGrade, setEditingGrade] = useState(null);

  // --- Tema claro/escuro ---
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('studyapp_theme') || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    try { localStorage.setItem('studyapp_theme', theme); } catch { /* ok se não tiver localStorage */ }
  }, [theme]);

  // --- Busca e filtros ---
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('todos');
  const [examSearch, setExamSearch] = useState('');

  // --- Calendário ---
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);

  const [pomodoroMode, setPomodoroMode] = useState('work');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) { console.error("Audio error", e); }
  };

  useEffect(() => {
    let interval = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isTimerRunning && timeLeft === 0) {
      playBeep();
      if (pomodoroMode === 'work') {
        setPomodoroMode('break');
        setTimeLeft(5 * 60);
      } else {
        setPomodoroMode('work');
        setTimeLeft(25 * 60);
        setIsTimerRunning(false);
      }
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timeLeft, pomodoroMode]);

  // Ponte Clerk -> Firebase: garante que o Firestore só é usado depois que
  // o usuário também estiver autenticado no Firebase Auth (com o mesmo ID do Clerk).
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut: clerkSignOut, openSignIn } = useClerk();
  const { firebaseReady, syncError } = useFirebaseSync();

  // Mantém o resto do arquivo funcionando sem reescrever cada `user.uid`/`user.email`:
  // aqui simulamos o formato do antigo objeto `user` do Firebase, mas value vem do Clerk.
  const user = isSignedIn && firebaseReady
    ? { uid: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress || '' }
    : null;
  const loading = !clerkLoaded || (isSignedIn && !firebaseReady && !syncError);

  const handleLogout = async () => {
    await clerkSignOut();
  };


  useEffect(() => {
    if (!user) {
      setClasses([]); setTasks([]); setExams([]); setGrades([]);
      return;
    }

    const classesRef = collection(db, 'users', user.uid, 'classes');
    const tasksRef = collection(db, 'users', user.uid, 'tasks');
    const examsRef = collection(db, 'users', user.uid, 'exams');
    const gradesRef = collection(db, 'users', user.uid, 'grades');

    const unsubClasses = onSnapshot(classesRef, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);

    const unsubTasks = onSnapshot(tasksRef, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);

    const unsubExams = onSnapshot(examsRef, (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);

    const unsubGrades = onSnapshot(gradesRef, (snapshot) => {
      setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, console.error);

    // Assim que qualquer um desses documentos muda no servidor (por causa de
    // outro dispositivo logado na mesma conta, por exemplo), esse listener
    // dispara de novo automaticamente e atualiza a tela aqui também.
    return () => { unsubClasses(); unsubTasks(); unsubExams(); unsubGrades(); };
  }, [user]);

  const notifications = useMemo(() => {
    const notifs = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    tasks.filter(t => t.status !== 'concluído').forEach(task => {
      if (!task.dueDate) return;
      const taskDate = new Date(task.dueDate + 'T00:00:00');
      const diffDays = Math.ceil((taskDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= 2 && diffDays >= 0) {
        notifs.push({ type: 'task', id: task.id, title: `Trabalho "${task.title}" vence em ${diffDays} dia(s)!` });
      } else if (diffDays < 0) {
        notifs.push({ type: 'task', id: task.id, title: `Trabalho "${task.title}" está atrasado!` });
      }
    });

    exams.forEach(exam => {
      if (!exam.date) return;
      const examDate = new Date(exam.date + 'T00:00:00');
      const diffDays = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
      if (diffDays <= 5 && diffDays >= 0) {
        notifs.push({ type: 'exam', id: exam.id, title: `A prova de ${exam.subject} é em ${diffDays} dia(s)!` });
      }
    });

    return notifs;
  }, [tasks, exams]);

  // --- Notificações do navegador (avisam mesmo com o app em segundo plano) ---
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    } catch (e) {
      console.error('Erro ao pedir permissão de notificação', e);
    }
  };

  // Em PWA instalado (modo standalone), o navegador NÃO permite "new Notification()"
  // direto — precisa passar pela Service Worker. Por isso tentamos a Service Worker
  // primeiro, e só usamos "new Notification()" como alternativa em navegador comum.
  // Tudo protegido por try/catch para nunca travar a tela do app.
  const sendLocalNotification = async (title, options) => {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && registration.showNotification) {
          await registration.showNotification(title, options);
          return;
        }
      }
      if (typeof Notification !== 'undefined') {
        new Notification(title, options);
      }
    } catch (e) {
      console.error('Não foi possível mostrar a notificação', e);
    }
  };

  useEffect(() => {
    if (notifPermission !== 'granted' || notifications.length === 0) return;

    // Evita repetir o mesmo aviso várias vezes no mesmo dia: guardamos
    // no localStorage quais IDs já foram notificados hoje.
    const todayKey = new Date().toISOString().slice(0, 10);
    const storageKey = `studyapp_notified_${todayKey}`;
    let alreadyNotified = [];
    try {
      alreadyNotified = JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      alreadyNotified = [];
    }

    const newOnes = notifications.filter(n => !alreadyNotified.includes(`${n.type}-${n.id}`));
    if (newOnes.length === 0) return;

    newOnes.forEach(n => {
      sendLocalNotification('StudyApp', { body: n.title, icon: '/icon-192.png' });
    });

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify([...alreadyNotified, ...newOnes.map(n => `${n.type}-${n.id}`)])
      );
    } catch { /* localStorage indisponível, tudo bem, só não vai "lembrar" pra próxima vez */ }
  }, [notifications, notifPermission]);

  const toggleTaskStep = async (taskId, stepIndex) => {
    if (!user) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Cria uma cópia nova de cada passo (não mutamos os objetos originais do estado)
    const newSteps = (task.steps || []).map((step, idx) =>
      idx === stepIndex ? { ...step, done: !step.done } : step
    );

    const allDone = newSteps.length > 0 && newSteps.every(s => s.done);
    const newStatus = allDone ? 'concluído' : (newSteps.some(s => s.done) ? 'em andamento' : 'pendente');

    try {
      await updateDoc(doc(db, 'users', user.uid, 'tasks', taskId), {
        steps: newSteps,
        status: newStatus
      });
    } catch (error) {
      console.error(error);
      showActionError('Não foi possível salvar. Verifique sua conexão.');
    }
  };

  const toggleExamTopic = async (examId, topicIndex) => {
    if (!user) return;
    const exam = exams.find(e => e.id === examId);
    if (!exam) return;

    const newTopics = (exam.topics || []).map((topic, idx) =>
      idx === topicIndex ? { ...topic, done: !topic.done } : topic
    );

    try {
      await updateDoc(doc(db, 'users', user.uid, 'exams', examId), { topics: newTopics });
    } catch (error) {
      console.error(error);
      showActionError('Não foi possível salvar. Verifique sua conexão.');
    }
  };

  const confirmDelete = async () => {
    if (!user || !pendingDelete) return;
    const { type, id } = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteDoc(doc(db, 'users', user.uid, type, id));
    } catch (error) {
      console.error(error);
      showActionError('Não foi possível excluir. Verifique sua conexão.');
    }
  };

  // Agrupa as notas por matéria e calcula a média ponderada de cada uma
  const gradesBySubject = useMemo(() => {
    const groups = {};
    grades.forEach(g => {
      if (!groups[g.subject]) groups[g.subject] = [];
      groups[g.subject].push(g);
    });
    return Object.entries(groups).map(([subject, items]) => {
      const totalWeight = items.reduce((sum, g) => sum + (Number(g.weight) || 1), 0);
      const weightedSum = items.reduce((sum, g) => sum + (Number(g.value) || 0) * (Number(g.weight) || 1), 0);
      const average = totalWeight > 0 ? weightedSum / totalWeight : 0;
      return { subject, items, average };
    }).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [grades]);

  // Gera e baixa um arquivo CSV a partir de uma lista de linhas (arrays de valores)
  const downloadCSV = (filename, headers, rows) => {
    const escapeCell = (val) => {
      let str = String(val ?? '');
      // Neutraliza fórmulas maliciosas (CSV Injection) que o Excel poderia executar
      if (/^[=+\-@]/.test(str)) str = `'${str}`;
      // Coloca entre aspas se tiver vírgula, aspas ou quebra de linha
      if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const csvContent = [headers, ...rows]
      .map(row => row.map(escapeCell).join(';'))
      .join('\r\n');
    // BOM no início para o Excel abrir os acentos corretamente
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportTasksCSV = () => {
    const rows = tasks.map(t => [t.title, t.subject, t.dueDate, t.priority, t.status]);
    downloadCSV('trabalhos.csv', ['Título', 'Matéria', 'Entrega', 'Prioridade', 'Status'], rows);
  };

  const exportExamsCSV = () => {
    const rows = exams.map(e => [e.subject, e.title, e.date, `${(e.topics || []).filter(t => t.done).length}/${(e.topics || []).length}`]);
    downloadCSV('provas.csv', ['Matéria', 'Assunto', 'Data', 'Tópicos concluídos'], rows);
  };

  const exportGradesCSV = () => {
    const rows = grades.map(g => [g.subject, g.title, g.value, g.weight || 1]);
    downloadCSV('notas.csv', ['Matéria', 'Avaliação', 'Nota', 'Peso'], rows);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleImportJSON = (event) => {
    const file = event.target.files[0];
    if (!file || !user) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);

        if (!Array.isArray(data)) {
          alert("O arquivo precisa ser uma lista de horários (formato [...]). Gere o arquivo novamente pelo leitor de PDF.");
          return;
        }
        
        const timeMap = {
          "13:00": "13:45", "13:45": "14:30", "14:30": "15:30", 
          "15:30": "16:15", "16:15": "17:00", "17:00": "17:45"
        };
        const dias = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

        // Usamos um "batch": todas as aulas são gravadas juntas, de uma vez.
        // Se algo der errado no meio do caminho, NADA é salvo (evita importação pela metade).
        const batch = writeBatch(db);
        const classesRef = collection(db, 'users', user.uid, 'classes');
        let count = 0;

        for (const row of data) {
          const startTime = row["Horário"];
          if (!startTime) continue;
          
          const endTime = timeMap[startTime] || "18:00";

          for (const dia of dias) {
            const rawSubject = row[dia];
            const ignorar = ["Verificar PDF", "Extrair do PDF", "Livre", "-", "", null, undefined];
            
            if (rawSubject && typeof rawSubject === 'string' && !ignorar.includes(rawSubject.trim()) && !rawSubject.startsWith("Livre")) {
              
              let subject = rawSubject;
              let teacher = "Não informado";
              
              // Separa a matéria do professor usando a barra gerada pelo Python
              if (rawSubject.includes("|")) {
                const parts = rawSubject.split("|");
                subject = parts[0].trim();
                teacher = parts[1].trim();
              }

              const newDocRef = doc(classesRef);
              batch.set(newDocRef, {
                subject: subject,
                teacher: teacher,
                dayOfWeek: dia,
                startTime: startTime,
                endTime: endTime,
                color: "bg-blue-500"
              });
              count++;

              // Limite de 500 operações por batch no Firestore
              if (count >= 500) break;
            }
          }
          if (count >= 500) break;
        }

        if (count === 0) {
          alert("Nenhuma aula válida encontrada nesse arquivo.");
          return;
        }

        await batch.commit();
        alert(`🎉 ${count} aula(s) importada(s) com sucesso!`);
        
      } catch (error) {
        console.error("Erro ao importar", error);
        alert("Erro ao ler o arquivo JSON. Tente gerar o arquivo novamente.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const renderHome = () => {
    const today = new Date().getDay(); 
    const todayClasses = classes.filter(c => c.dayOfWeek === DAYS_OF_WEEK[today]).sort((a,b) => (a.startTime || '').localeCompare(b.startTime || ''));
    const pendingTasks = tasks.filter(t => t.status !== 'concluído').sort((a,b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0)).slice(0,3);

    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-white">Resumo de Hoje</h2>
        
        <div className="bg-slate-800 p-5 rounded-2xl shadow-lg border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><Clock className="w-5 h-5 mr-2 text-yellow-500"/> Aulas ({DAYS_OF_WEEK[today]})</h3>
          {todayClasses.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhuma aula cadastrada para hoje.</p>
          ) : (
            <div className="space-y-3">
              {todayClasses.map(c => (
                <div key={c.id} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-xl border border-slate-600">
                  <div className="flex items-center">
                    <div className={`w-3 h-10 rounded-full ${c.color} mr-3`}></div>
                    <div>
                      <p className="font-bold text-white">{c.subject}</p>
                      {/* Removido o campo Sala */}
                      <p className="text-xs text-slate-300">Prof. {c.teacher}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-yellow-400">{c.startTime}</p>
                    <p className="font-mono text-xs text-slate-400">{c.endTime}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-800 p-5 rounded-2xl shadow-lg border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center"><AlertCircle className="w-5 h-5 mr-2 text-orange-500"/> Entregas Próximas</h3>
          {pendingTasks.length === 0 ? (
            <p className="text-slate-400 text-sm">Nenhuma tarefa pendente no momento! 🎉</p>
          ) : (
            <div className="space-y-3">
              {pendingTasks.map(t => (
                <div key={t.id} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-xl border border-slate-600">
                  <div>
                    <p className="font-bold text-white">{t.title}</p>
                    <p className="text-xs text-slate-300">{t.subject}</p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${t.priority === 'alta' ? 'bg-red-500/20 text-red-400' : t.priority === 'média' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {(t.dueDate || '').split('-').reverse().join('/')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSchedule = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Horário de Aulas</h2>
        
        <div className="flex space-x-2">
          <label className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-xl flex items-center cursor-pointer transition-colors text-sm font-bold">
            <span className="hidden md:inline mr-2">Importar JSON</span>
            <FileText className="w-5 h-5"/>
            <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
          </label>
          <button onClick={() => { if(user) { setEditingClass(null); setIsSavingItem(false); setClassModalOpen(true); } else openSignIn(); }} className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl flex items-center transition-colors">
            <Plus className="w-5 h-5"/>
          </button>
        </div>
      </div>
      
      {/* Container alterado para flex-nowrap. Dá espaço suficiente para as caixas não se esmagarem. */}
      <div className="flex gap-6 overflow-x-auto pb-6 snap-x">
        {DAYS_OF_WEEK.slice(1, 6).map(day => (
          <div key={day} className="bg-slate-800 rounded-2xl p-4 min-w-[280px] flex-shrink-0 border border-slate-700 snap-center">
            <h3 className="text-center font-bold text-yellow-500 mb-4">{day}</h3>
            <div className="space-y-3">
              {classes.filter(c => c.dayOfWeek === day).sort((a,b) => (a.startTime || '').localeCompare(b.startTime || '')).map(c => (
                <div key={c.id} className="relative group bg-slate-700 p-3 rounded-xl border border-slate-600 hover:border-slate-500 transition-all">
                  <div className="flex items-center mb-2">
                    <div className={`w-3 h-3 rounded-full ${c.color} mr-2`}></div>
                    <span className="font-bold text-white truncate">{c.subject}</span>
                  </div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <p className="flex justify-between"><span className="text-slate-400">Hora:</span> <span className="font-mono text-yellow-400">{c.startTime} - {c.endTime}</span></p>
                    <p className="flex justify-between"><span className="text-slate-400">Prof:</span> <span className="truncate ml-2">{c.teacher}</span></p>
                    {/* Linha da Sala foi completamente removida daqui */}
                  </div>
                  <div className="absolute top-2 right-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingClass(c); setIsSavingItem(false); setClassModalOpen(true); }} className="text-slate-400 hover:text-yellow-400">
                      <Edit2 className="w-4 h-4"/>
                    </button>
                    <button onClick={() => setPendingDelete({ type: 'classes', id: c.id, label: `a aula de ${c.subject}` })} className="text-red-400 hover:text-red-300">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                </div>
              ))}
              {classes.filter(c => c.dayOfWeek === day).length === 0 && (
                <p className="text-center text-xs text-slate-500 py-4">Livre</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTasks = () => {
    const filteredTasks = [...tasks]
      .filter(t => taskStatusFilter === 'todos' || t.status === taskStatusFilter)
      .filter(t => {
        const q = taskSearch.trim().toLowerCase();
        if (!q) return true;
        return (t.title || '').toLowerCase().includes(q) || (t.subject || '').toLowerCase().includes(q);
      })
      .sort((a,b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));

    return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Trabalhos</h2>
        <div className="flex items-center space-x-2">
          {tasks.length > 0 && (
            <button onClick={exportTasksCSV} title="Exportar CSV" className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-xl flex items-center transition-colors">
              <Download className="w-5 h-5"/>
            </button>
          )}
          <button onClick={() => { if(user) { setEditingTask(null); setIsSavingItem(false); setTaskModalOpen(true); } else openSignIn(); }} className="bg-orange-600 hover:bg-orange-500 text-white p-2 rounded-xl flex items-center transition-colors">
            <Plus className="w-5 h-5"/>
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text" value={taskSearch} onChange={e => setTaskSearch(e.target.value)}
            placeholder="Buscar por título ou matéria..."
            className="w-full bg-slate-800 text-white rounded-xl p-3 pl-10 border border-slate-700 focus:border-yellow-500 outline-none text-sm"
          />
        </div>
        <select value={taskStatusFilter} onChange={e => setTaskStatusFilter(e.target.value)} className="bg-slate-800 text-white rounded-xl p-3 border border-slate-700 text-sm">
          <option value="todos">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="em andamento">Em andamento</option>
          <option value="concluído">Concluído</option>
        </select>
      </div>

      <div className="space-y-4">
        {filteredTasks.map(task => {
          const completedSteps = task.steps ? task.steps.filter(s => s.done).length : 0;
          const totalSteps = task.steps ? task.steps.length : 0;
          const progress = totalSteps === 0 ? (task.status === 'concluído' ? 100 : 0) : Math.round((completedSteps / totalSteps) * 100);

          return (
            <div key={task.id} className={`bg-slate-800 p-5 rounded-2xl border ${task.status === 'concluído' ? 'border-emerald-500/50 opacity-70' : 'border-slate-700'}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className={`text-xl font-bold ${task.status === 'concluído' ? 'text-emerald-400 line-through' : 'text-white'}`}>{task.title}</h3>
                  <p className="text-sm text-slate-400">{task.subject}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${task.priority === 'alta' ? 'bg-red-500/20 text-red-400' : task.priority === 'média' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                    {task.priority.toUpperCase()}
                  </span>
                  <button onClick={() => { setEditingTask(task); setIsSavingItem(false); setTaskModalOpen(true); }} className="text-slate-500 hover:text-yellow-400 transition-colors">
                    <Edit2 className="w-5 h-5"/>
                  </button>
                  <button onClick={() => setPendingDelete({ type: 'tasks', id: task.id, label: `o trabalho "${task.title}"` })} className="text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-5 h-5"/>
                  </button>
                </div>
              </div>
              
              <div className="flex items-center text-sm text-slate-300 mb-4 bg-slate-700/30 p-2 rounded-lg inline-block">
                <Calendar className="w-4 h-4 mr-2 inline text-yellow-500" />
                Entrega: {(task.dueDate || '').split('-').reverse().join('/')}
              </div>

              {totalSteps > 0 && (
                <div className="mt-4 border-t border-slate-700 pt-4">
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Progresso do Projeto</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
                    <div className="bg-gradient-to-r from-orange-500 to-yellow-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="space-y-2">
                    {task.steps.map((step, idx) => (
                      <button key={idx} onClick={() => toggleTaskStep(task.id, idx)} className="flex items-center w-full text-left text-sm group">
                        {step.done ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mr-2 flex-shrink-0" /> : <Circle className="w-5 h-5 text-slate-500 group-hover:text-yellow-400 mr-2 flex-shrink-0 transition-colors" />}
                        <span className={step.done ? 'text-slate-500 line-through' : 'text-slate-200'}>{step.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {tasks.length === 0 && <div className="text-center p-10 text-slate-500">Nenhum trabalho cadastrado.</div>}
        {tasks.length > 0 && filteredTasks.length === 0 && <div className="text-center p-10 text-slate-500">Nenhum trabalho encontrado com esse filtro.</div>}
      </div>
    </div>
  );
  };

  const renderExams = () => {
    const filteredExams = [...exams]
      .filter(e => {
        const q = examSearch.trim().toLowerCase();
        if (!q) return true;
        return (e.subject || '').toLowerCase().includes(q) || (e.title || '').toLowerCase().includes(q);
      })
      .sort((a,b) => new Date(a.date || 0) - new Date(b.date || 0));

    return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Provas</h2>
        <div className="flex items-center space-x-2">
          {exams.length > 0 && (
            <button onClick={exportExamsCSV} title="Exportar CSV" className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-xl flex items-center transition-colors">
              <Download className="w-5 h-5"/>
            </button>
          )}
          <button onClick={() => { if(user) { setEditingExam(null); setIsSavingItem(false); setExamModalOpen(true); } else openSignIn(); }} className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-xl flex items-center transition-colors">
            <Plus className="w-5 h-5"/>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text" value={examSearch} onChange={e => setExamSearch(e.target.value)}
          placeholder="Buscar por matéria ou assunto..."
          className="w-full bg-slate-800 text-white rounded-xl p-3 pl-10 border border-slate-700 focus:border-yellow-500 outline-none text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredExams.map(exam => {
          const examDate = new Date((exam.date || '1970-01-01') + 'T00:00:00');
          const today = new Date();
          today.setHours(0,0,0,0);
          const diffDays = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));
          
          return (
            <div key={exam.id} className="bg-slate-800 p-5 rounded-2xl border border-slate-700 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 flex items-center space-x-1">
                <button onClick={() => { setEditingExam(exam); setIsSavingItem(false); setExamModalOpen(true); }} className="text-slate-500 hover:text-yellow-400 transition-colors">
                  <Edit2 className="w-5 h-5"/>
                </button>
                <button onClick={() => setPendingDelete({ type: 'exams', id: exam.id, label: `a prova de ${exam.subject}` })} className="text-slate-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-5 h-5"/>
                </button>
              </div>

              <h3 className="text-xl font-bold text-white mb-1">{exam.subject}</h3>
              <p className="text-sm text-slate-400 mb-4">{exam.title}</p>
              
              <div className="flex items-center justify-between mb-4 bg-slate-700/50 p-3 rounded-xl border border-slate-600">
                <div className="flex items-center text-slate-200">
                  <Calendar className="w-5 h-5 mr-2 text-purple-400" />
                  {(exam.date || '').split('-').reverse().join('/')}
                </div>
                <div className={`font-bold ${diffDays < 0 ? 'text-slate-500' : diffDays === 0 ? 'text-red-500' : diffDays <= 3 ? 'text-orange-500' : 'text-emerald-500'}`}>
                  {diffDays < 0 ? 'Passou' : diffDays === 0 ? 'Hoje!' : `Faltam ${diffDays} dias`}
                </div>
              </div>

              {exam.topics && exam.topics.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">Checklist de Estudo</h4>
                  <div className="space-y-2">
                    {exam.topics.map((topic, idx) => (
                      <button key={idx} onClick={() => toggleExamTopic(exam.id, idx)} className="flex items-center w-full text-left text-sm group">
                        {topic.done ? <CheckSquare className="w-4 h-4 text-purple-400 mr-2 flex-shrink-0" /> : <div className="w-4 h-4 border border-slate-500 rounded mr-2 flex-shrink-0 group-hover:border-purple-400 transition-colors" />}
                        <span className={topic.done ? 'text-slate-500 line-through' : 'text-slate-200'}>{topic.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {exams.length === 0 && <div className="text-center p-10 text-slate-500 col-span-2">Nenhuma prova cadastrada.</div>}
        {exams.length > 0 && filteredExams.length === 0 && <div className="text-center p-10 text-slate-500 col-span-2">Nenhuma prova encontrada com esse filtro.</div>}
      </div>
    </div>
  );
  };

  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startWeekday = firstDayOfMonth.getDay(); // 0 = domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthLabel = calendarMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // Mapeia cada dia do mês para os eventos (provas e trabalhos) daquele dia
    const eventsByDay = {};
    tasks.forEach(t => {
      if (!t.dueDate) return;
      if (!eventsByDay[t.dueDate]) eventsByDay[t.dueDate] = [];
      eventsByDay[t.dueDate].push({ kind: 'task', label: t.title, subject: t.subject });
    });
    exams.forEach(ex => {
      if (!ex.date) return;
      if (!eventsByDay[ex.date]) eventsByDay[ex.date] = [];
      eventsByDay[ex.date].push({ kind: 'exam', label: ex.title || 'Prova', subject: ex.subject });
    });

    const todayKey = toDateKey(new Date());

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);

    const selectedEvents = selectedCalendarDay ? (eventsByDay[selectedCalendarDay] || []) : [];

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white capitalize">{monthLabel}</h2>
          <div className="flex items-center space-x-2">
            <button onClick={() => { setCalendarMonth(new Date(year, month - 1, 1)); setSelectedCalendarDay(null); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl transition-colors">
              <ChevronLeft className="w-5 h-5"/>
            </button>
            <button onClick={() => { setCalendarMonth(new Date()); setSelectedCalendarDay(null); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-xl transition-colors text-xs font-bold">
              Hoje
            </button>
            <button onClick={() => { setCalendarMonth(new Date(year, month + 1, 1)); setSelectedCalendarDay(null); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-xl transition-colors">
              <ChevronRight className="w-5 h-5"/>
            </button>
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['D','S','T','Q','Q','S','S'].map((d, i) => (
              <div key={i} className="text-center text-xs font-bold text-slate-500 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, idx) => {
              if (day === null) return <div key={idx} />;
              const dateObj = new Date(year, month, day);
              const dateKey = toDateKey(dateObj);
              const dayEvents = eventsByDay[dateKey] || [];
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedCalendarDay;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedCalendarDay(dayEvents.length > 0 ? dateKey : null)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center relative text-sm transition-colors
                    ${isSelected ? 'bg-yellow-500 text-slate-900 font-bold' : isToday ? 'border-2 border-yellow-500 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                >
                  {day}
                  {dayEvents.length > 0 && !isSelected && (
                    <span className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${dayEvents.some(e => e.kind === 'exam') ? 'bg-purple-400' : 'bg-orange-400'}`}></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selectedCalendarDay && (
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
            <h3 className="font-bold text-white mb-3">{selectedCalendarDay.split('-').reverse().join('/')}</h3>
            <div className="space-y-2">
              {selectedEvents.map((ev, i) => (
                <div key={i} className="flex items-center bg-slate-700/50 p-3 rounded-xl">
                  {ev.kind === 'exam' ? <BookOpen className="w-4 h-4 mr-2 text-purple-400 flex-shrink-0" /> : <CheckSquare className="w-4 h-4 mr-2 text-orange-400 flex-shrink-0" />}
                  <div>
                    <p className="text-sm text-white font-medium">{ev.label}</p>
                    <p className="text-xs text-slate-400">{ev.subject} • {ev.kind === 'exam' ? 'Prova' : 'Trabalho'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!selectedCalendarDay && (
          <p className="text-center text-xs text-slate-500">Toque em um dia marcado para ver os detalhes.</p>
        )}
      </div>
    );
  };

  const renderGrades = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Notas</h2>
        <div className="flex items-center space-x-2">
          {grades.length > 0 && (
            <button onClick={exportGradesCSV} title="Exportar CSV" className="bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-xl flex items-center transition-colors">
              <Download className="w-5 h-5"/>
            </button>
          )}
          <button onClick={() => { if(user) { setEditingGrade(null); setIsSavingItem(false); setGradeModalOpen(true); } else openSignIn(); }} className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-xl flex items-center transition-colors">
            <Plus className="w-5 h-5"/>
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {gradesBySubject.map(group => (
          <div key={group.subject} className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-white">{group.subject}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${group.average >= 6 ? 'bg-emerald-500/20 text-emerald-400' : group.average >= 4 ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                Média: {group.average.toFixed(1)}
              </span>
            </div>
            <div className="space-y-2">
              {group.items.map(g => (
                <div key={g.id} className="flex justify-between items-center bg-slate-700/50 p-3 rounded-xl">
                  <div>
                    <p className="text-sm text-white">{g.title}</p>
                    <p className="text-xs text-slate-400">Peso {g.weight || 1}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-yellow-400">{Number(g.value).toFixed(1)}</span>
                    <button onClick={() => { setEditingGrade(g); setIsSavingItem(false); setGradeModalOpen(true); }} className="text-slate-500 hover:text-yellow-400 transition-colors">
                      <Edit2 className="w-4 h-4"/>
                    </button>
                    <button onClick={() => setPendingDelete({ type: 'grades', id: g.id, label: `a nota "${g.title}"` })} className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {grades.length === 0 && <div className="text-center p-10 text-slate-500">Nenhuma nota cadastrada ainda. Adicione as notas das suas provas e trabalhos para ver a média por matéria.</div>}
      </div>
    </div>
  );

  const renderPomodoro = () => (
    <div className="flex flex-col items-center justify-center py-10">
      <h2 className="text-3xl font-bold text-white mb-2">Modo Foco</h2>
      <p className="text-slate-400 mb-8">Método Pomodoro</p>
      
      <div className="flex space-x-4 mb-8">
        <button 
          onClick={() => { setPomodoroMode('work'); setTimeLeft(25 * 60); setIsTimerRunning(false); }}
          className={`px-6 py-2 rounded-full font-bold transition-colors ${pomodoroMode === 'work' ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          Trabalho (25m)
        </button>
        <button 
          onClick={() => { setPomodoroMode('break'); setTimeLeft(5 * 60); setIsTimerRunning(false); }}
          className={`px-6 py-2 rounded-full font-bold transition-colors ${pomodoroMode === 'break' ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          Pausa (5m)
        </button>
      </div>

      <div className={`w-64 h-64 rounded-full flex items-center justify-center border-8 shadow-2xl shadow-black/50 mb-8 ${pomodoroMode === 'work' ? 'border-orange-500 text-orange-400' : 'border-emerald-500 text-emerald-400'}`}>
        <span className="text-6xl font-mono font-bold tracking-tighter">{formatTime(timeLeft)}</span>
      </div>

      <div className="flex space-x-4">
        <button 
          onClick={() => setIsTimerRunning(!isTimerRunning)}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${isTimerRunning ? 'bg-red-500' : 'bg-blue-600'}`}
        >
          {isTimerRunning ? <Pause className="w-8 h-8" fill="currentColor" /> : <Play className="w-8 h-8 pl-1" fill="currentColor" />}
        </button>
        <button 
          onClick={() => { setIsTimerRunning(false); setTimeLeft(pomodoroMode === 'work' ? 25 * 60 : 5 * 60); }}
          className="w-16 h-16 rounded-full flex items-center justify-center text-slate-400 bg-slate-800 hover:bg-slate-700 shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <RefreshCw className="w-6 h-6" />
        </button>
      </div>
    </div>
  );

  if (syncError) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-red-400 text-center px-6">{syncError}</div>;
  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-yellow-500">Carregando...</div>;

  return (
    <div className={`min-h-screen bg-slate-900 text-slate-100 font-sans pb-20 md:pb-0 ${theme === 'light' ? 'theme-light' : ''}`}>
      <header className="bg-slate-800 border-b border-slate-700 p-4 sticky top-0 z-10 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <GraduationCap className="w-8 h-8 text-yellow-500 mr-2" />
            <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">StudyApp</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Alternar tema" className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-700/50 rounded-full">
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="relative">
              <button onClick={() => setNotificationsOpen(!isNotificationsOpen)} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-700/50 rounded-full">
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-800"></span>}
              </button>
              
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 z-50">
                  <h4 className="font-bold text-white mb-3">Notificações</h4>
                  {notifPermission === 'default' && (
                    <button onClick={requestNotifPermission} className="w-full text-left text-xs bg-blue-600/20 text-blue-300 border border-blue-500/40 rounded-lg p-2 mb-3 hover:bg-blue-600/30 transition-colors">
                      🔔 Ativar avisos mesmo com o app fechado
                    </button>
                  )}
                  {notifPermission === 'denied' && (
                    <p className="text-xs text-slate-500 mb-3">Notificações bloqueadas pelo navegador. Ative nas configurações do site, se quiser.</p>
                  )}
                  {notifications.length === 0 ? <p className="text-sm text-slate-400">Tudo tranquilo por aqui!</p> : (
                    <div className="space-y-3">
                      {notifications.map((n, i) => (
                        <div key={i} className="flex items-start p-2 bg-slate-700/50 rounded-lg">
                          <AlertCircle className={`w-4 h-4 mr-2 mt-0.5 flex-shrink-0 ${n.type === 'exam' ? 'text-purple-400' : 'text-orange-400'}`} />
                          <p className="text-sm text-slate-200">{n.title}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={() => user ? handleLogout() : openSignIn()} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-700/50 rounded-full group relative">
              {user ? <LogOut className="w-5 h-5 group-hover:text-red-400" /> : <User className="w-5 h-5" />}
              {user && <span className="absolute -bottom-8 right-0 text-xs bg-slate-800 border border-slate-600 p-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">Sair ({user.email.split('@')[0]})</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 pt-6">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'schedule' && renderSchedule()}
        {activeTab === 'tasks' && renderTasks()}
        {activeTab === 'exams' && renderExams()}
        {activeTab === 'calendar' && renderCalendar()}
        {activeTab === 'grades' && renderGrades()}
        {activeTab === 'focus' && renderPomodoro()}
      </main>

      <nav className="fixed bottom-0 left-0 w-full bg-slate-800 border-t border-slate-700 flex justify-around overflow-x-auto p-2 pb-safe md:relative md:border-t-0 md:bg-transparent md:max-w-7xl md:mx-auto md:p-4 md:mt-4">
        <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon={<Home className="w-6 h-6"/>} label="Início" />
        <NavButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<Calendar className="w-6 h-6"/>} label="Horário" />
        <NavButton active={activeTab === 'tasks'} onClick={() => setActiveTab('tasks')} icon={<CheckSquare className="w-6 h-6"/>} label="Trabalhos" />
        <NavButton active={activeTab === 'exams'} onClick={() => setActiveTab('exams')} icon={<BookOpen className="w-6 h-6"/>} label="Provas" />
        <NavButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarDays className="w-6 h-6"/>} label="Calendário" />
        <NavButton active={activeTab === 'grades'} onClick={() => setActiveTab('grades')} icon={<Calculator className="w-6 h-6"/>} label="Notas" />
        <NavButton active={activeTab === 'focus'} onClick={() => setActiveTab('focus')} icon={<Timer className="w-6 h-6"/>} label="Foco" />
        
        <a 
          href="https://app-organizacao-escolar.streamlit.app/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex flex-col items-center p-2 rounded-xl transition-all text-slate-400 hover:text-yellow-400 hover:bg-slate-700/50 flex-shrink-0"
        >
          <FileText className="w-6 h-6" />
          <span className="text-[10px] mt-1 font-medium">Ler PDF</span>
        </a>
      </nav>

      {/* Toast de erro de ação (falha ao salvar/excluir) */}
      {actionError && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-2xl z-[60] flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" /> {actionError}
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-3xl p-6 w-full max-w-sm border border-slate-700 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Excluir?</h2>
            <p className="text-slate-300 text-sm mb-6">Tem certeza que quer excluir {pendingDelete.label}? Essa ação não pode ser desfeita.</p>
            <div className="flex space-x-3">
              <button onClick={() => setPendingDelete(null)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl p-3 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmDelete} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl p-3 transition-colors">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Aulas (cria ou edita) */}
      {isClassModalOpen && (
        <GenericModal
          title={editingClass ? 'Editar Aula' : 'Nova Aula'}
          onClose={() => { setClassModalOpen(false); setEditingClass(null); }}
          submitting={false}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const data = {
              subject: fd.get('subject'), teacher: fd.get('teacher'),
              dayOfWeek: fd.get('dayOfWeek'), startTime: fd.get('startTime'), endTime: fd.get('endTime'), color: fd.get('color')
            };
            const currentId = editingClass?.id;
            setClassModalOpen(false);
            setEditingClass(null);
            try {
              if (currentId) {
                await updateDoc(doc(db, 'users', user.uid, 'classes', currentId), data);
              } else {
                await addDoc(collection(db, 'users', user.uid, 'classes'), data);
              }
            } catch (error) {
              console.error(error);
              showActionError('Não foi possível salvar a aula. Verifique sua conexão.');
            }
          }}
        >
          <input name="subject" placeholder="Matéria (ex: Matemática)" defaultValue={editingClass?.subject} required maxLength={100} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <input name="teacher" placeholder="Professor" defaultValue={editingClass?.teacher} maxLength={100} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <select name="dayOfWeek" defaultValue={editingClass?.dayOfWeek} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3">
            {DAYS_OF_WEEK.slice(1,6).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="flex space-x-3 mb-3">
            <input name="startTime" type="time" defaultValue={editingClass?.startTime} required className="w-1/2 bg-slate-700 text-white rounded-xl p-3" />
            <input name="endTime" type="time" defaultValue={editingClass?.endTime} required className="w-1/2 bg-slate-700 text-white rounded-xl p-3" />
          </div>
          <select name="color" defaultValue={editingClass?.color} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-4">
            {COLORS.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}
          </select>
        </GenericModal>
      )}

      {/* Modal Trabalhos (cria ou edita) */}
      {isTaskModalOpen && (
        <GenericModal
          title={editingTask ? 'Editar Trabalho' : 'Novo Trabalho'}
          onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
          submitting={false}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const stepsStr = fd.get('steps');
            const newStepTitles = stepsStr.split(',').map(s => s.trim()).filter(s => s);
            // Ao editar, mantém o "done" dos passos que já existiam com o mesmo título
            const previousSteps = editingTask?.steps || [];
            const steps = newStepTitles.map(title => {
              const existing = previousSteps.find(s => s.title === title);
              return { title, done: existing ? existing.done : false };
            });
            const allDone = steps.length > 0 && steps.every(s => s.done);
            const status = editingTask
              ? (allDone ? 'concluído' : (steps.some(s => s.done) ? 'em andamento' : 'pendente'))
              : 'pendente';

            const data = {
              title: fd.get('title'), subject: fd.get('subject'), dueDate: fd.get('dueDate'),
              priority: fd.get('priority'), status, steps
            };
            const currentId = editingTask?.id;
            setTaskModalOpen(false);
            setEditingTask(null);
            try {
              if (currentId) {
                await updateDoc(doc(db, 'users', user.uid, 'tasks', currentId), data);
              } else {
                await addDoc(collection(db, 'users', user.uid, 'tasks'), data);
              }
            } catch (error) {
              console.error(error);
              showActionError('Não foi possível salvar o trabalho. Verifique sua conexão.');
            }
          }}
        >
          <input name="title" placeholder="Título (ex: Maquete Célula)" defaultValue={editingTask?.title} required maxLength={150} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <input name="subject" placeholder="Matéria" defaultValue={editingTask?.subject} required maxLength={100} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <div className="flex space-x-3 mb-3">
            <input name="dueDate" type="date" defaultValue={editingTask?.dueDate} required className="w-1/2 bg-slate-700 text-white rounded-xl p-3" />
            <select name="priority" defaultValue={editingTask?.priority} className="w-1/2 bg-slate-700 text-white rounded-xl p-3">
              <option value="baixa">Baixa Prioridade</option>
              <option value="média">Média Prioridade</option>
              <option value="alta">Alta Prioridade</option>
            </select>
          </div>
          <textarea name="steps" placeholder="Passos (separados por vírgula)" defaultValue={editingTask?.steps?.map(s => s.title).join(', ')} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-4 h-24" />
        </GenericModal>
      )}

      {/* Modal Provas (cria ou edita) */}
      {isExamModalOpen && (
        <GenericModal
          title={editingExam ? 'Editar Prova' : 'Nova Prova'}
          onClose={() => { setExamModalOpen(false); setEditingExam(null); }}
          submitting={false}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const topicsStr = fd.get('topics');
            const newTopicTitles = topicsStr.split(',').map(s => s.trim()).filter(s => s);
            const previousTopics = editingExam?.topics || [];
            const topics = newTopicTitles.map(title => {
              const existing = previousTopics.find(t => t.title === title);
              return { title, done: existing ? existing.done : false };
            });

            const data = { subject: fd.get('subject'), title: fd.get('title'), date: fd.get('date'), topics };
            const currentId = editingExam?.id;
            setExamModalOpen(false);
            setEditingExam(null);
            try {
              if (currentId) {
                await updateDoc(doc(db, 'users', user.uid, 'exams', currentId), data);
              } else {
                await addDoc(collection(db, 'users', user.uid, 'exams'), data);
              }
            } catch (error) {
              console.error(error);
              showActionError('Não foi possível salvar a prova. Verifique sua conexão.');
            }
          }}
        >
          <input name="subject" placeholder="Matéria (ex: Química)" defaultValue={editingExam?.subject} required maxLength={100} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <input name="title" placeholder="Assunto (ex: Prova Bimestral)" defaultValue={editingExam?.title} required maxLength={150} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <input name="date" type="date" defaultValue={editingExam?.date} required className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <textarea name="topics" placeholder="Tópicos (separados por vírgula)" defaultValue={editingExam?.topics?.map(t => t.title).join(', ')} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-4 h-24" />
        </GenericModal>
      )}

      {/* Modal Notas (cria ou edita) */}
      {isGradeModalOpen && (
        <GenericModal
          title={editingGrade ? 'Editar Nota' : 'Nova Nota'}
          onClose={() => { setGradeModalOpen(false); setEditingGrade(null); }}
          submitting={false}
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const gradeValue = Number(fd.get('value'));
            if (isNaN(gradeValue) || gradeValue < 0 || gradeValue > 10) {
              showActionError('Digite uma nota válida entre 0 e 10.');
              return;
            }
            const data = {
              subject: fd.get('subject'),
              title: fd.get('title'),
              value: gradeValue,
              weight: Number(fd.get('weight')) || 1,
            };
            const currentId = editingGrade?.id;
            setGradeModalOpen(false);
            setEditingGrade(null);
            try {
              if (currentId) {
                await updateDoc(doc(db, 'users', user.uid, 'grades', currentId), data);
              } else {
                await addDoc(collection(db, 'users', user.uid, 'grades'), data);
              }
            } catch (error) {
              console.error(error);
              showActionError('Não foi possível salvar a nota. Verifique sua conexão.');
            }
          }}
        >
          <input name="subject" placeholder="Matéria (ex: Matemática)" defaultValue={editingGrade?.subject} required maxLength={100} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <input name="title" placeholder="Avaliação (ex: Prova 1º Bimestre)" defaultValue={editingGrade?.title} required maxLength={150} className="w-full bg-slate-700 text-white rounded-xl p-3 mb-3" />
          <div className="flex space-x-3 mb-4">
            <input name="value" type="number" step="0.1" min="0" max="10" placeholder="Nota (0 a 10)" defaultValue={editingGrade?.value} required className="w-1/2 bg-slate-700 text-white rounded-xl p-3" />
            <input name="weight" type="number" step="0.1" min="0.1" placeholder="Peso (padrão 1)" defaultValue={editingGrade?.weight || 1} className="w-1/2 bg-slate-700 text-white rounded-xl p-3" />
          </div>
        </GenericModal>
      )}

    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center p-2 rounded-xl transition-all flex-shrink-0 ${active ? 'text-yellow-400 bg-slate-700/50' : 'text-slate-400 hover:text-slate-200'}`}>
      {icon}
      <span className="text-[10px] mt-1 font-medium whitespace-nowrap">{label}</span>
    </button>
  );
}

function GenericModal({ title, children, onClose, onSubmit, submitting }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-3xl p-6 w-full max-w-md border border-slate-700 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X className="w-6 h-6"/></button>
        <h2 className="text-2xl font-bold text-white mb-6">{title}</h2>
        <form onSubmit={onSubmit}>
          {children}
          <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl p-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>
    </div>
  );
}
