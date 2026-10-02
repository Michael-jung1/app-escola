import { strict as assert } from 'node:assert';

const DAYS_OF_WEEK = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function normalizeSubjectName(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getUniqueSubjects(classes, initialSubject = '') {
  if (!Array.isArray(classes)) return [];
  const map = new Map();

  for (const c of classes) {
    if (!c || !c.subject) continue;
    const raw = String(c.subject).trim();
    if (!raw) continue;
    const norm = normalizeSubjectName(raw);
    if (!norm || norm === 'livre') continue;

    if (!map.has(norm)) {
      map.set(norm, raw);
    }
  }

  if (initialSubject && typeof initialSubject === 'string') {
    const trimmedInit = initialSubject.trim();
    const normInit = normalizeSubjectName(trimmedInit);
    if (normInit && normInit !== 'livre' && !map.has(normInit)) {
      map.set(normInit, trimmedInit);
    }
  }

  const subjects = Array.from(map.values());
  subjects.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  return subjects;
}

function getNextClassDate(subject, classes, now = new Date()) {
  const normSubject = normalizeSubjectName(subject);
  if (!normSubject || !Array.isArray(classes) || classes.length === 0) {
    return null;
  }

  const matching = classes.filter(c => {
    if (!c || !c.subject) return false;
    const sub = normalizeSubjectName(c.subject);
    return sub === normSubject && sub !== 'livre';
  });

  if (matching.length === 0) return null;

  let earliest = null;

  for (const c of matching) {
    const dayIndex = DAYS_OF_WEEK.indexOf(c.dayOfWeek);
    if (dayIndex === -1) continue;

    const timeStr = String(c.startTime || '').trim();
    const timeParts = timeStr.split(':');
    if (timeParts.length < 2) continue;

    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      continue;
    }

    const currentDay = now.getDay();
    const daysUntil = (dayIndex - currentDay + 7) % 7;

    const occurrence = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + daysUntil,
      hours,
      minutes,
      0,
      0
    );

    if (occurrence <= now) {
      occurrence.setDate(occurrence.getDate() + 7);
    }

    if (!earliest || occurrence < earliest.dateObj) {
      earliest = {
        dateObj: occurrence,
        subjectName: c.subject,
        dayOfWeek: c.dayOfWeek,
        startTime: timeStr,
        hours,
        minutes
      };
    }
  }

  if (!earliest) return null;

  const target = earliest.dateObj;
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, '0');
  const day = String(target.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const dayOfWeekName = DAYS_OF_WEEK[target.getDay()];
  const formattedDayMonth = `${day}/${month}`;
  const formattedTime = earliest.startTime;

  return {
    date: dateStr,
    dayOfWeek: dayOfWeekName,
    formattedDate: formattedDayMonth,
    startTime: formattedTime,
    subjectName: earliest.subjectName,
    label: `${dayOfWeekName}, ${formattedDayMonth} às ${formattedTime}`
  };
}

console.log('--- TESTANDO getUniqueSubjects e getNextClassDate ---');

// Test 1: Deduplicação e ordenação de matérias
const sampleClasses = [
  { subject: 'Matemática', dayOfWeek: 'Segunda', startTime: '07:30' },
  { subject: 'matematica ', dayOfWeek: 'Quarta', startTime: '13:00' },
  { subject: 'HISTÓRIA', dayOfWeek: 'Terça', startTime: '08:20' },
  { subject: 'Português', dayOfWeek: 'Sexta', startTime: '10:00' },
  { subject: 'Livre', dayOfWeek: 'Sexta', startTime: '11:00' },
  { subject: '', dayOfWeek: 'Segunda', startTime: '07:30' },
];

const unique = getUniqueSubjects(sampleClasses);
console.log('Matérias únicas:', unique);
assert.deepEqual(unique, ['HISTÓRIA', 'Matemática', 'Português']);

// Test 2: Matéria de item em edição que não está na lista
const withEditing = getUniqueSubjects(sampleClasses, 'Filosofia Antiga');
assert.ok(withEditing.includes('Filosofia Antiga'));

// Test 3: Próxima aula quando a aula é hoje e o horário ainda NÃO passou
// Ex: Hoje é Quarta-feira 10:00, aula é Quarta-feira 13:00
const mockWednesdayMorning = new Date(2026, 9, 7, 10, 0, 0); // 07/10/2026 (Quarta) às 10:00
assert.equal(mockWednesdayMorning.getDay(), 3); // 3 = Quarta

const nextMath = getNextClassDate('Matemática', sampleClasses, mockWednesdayMorning);
console.log('Próxima aula de Matemática (manhã de quarta):', nextMath);
assert.ok(nextMath !== null);
assert.equal(nextMath.date, '2026-10-07');
assert.equal(nextMath.dayOfWeek, 'Quarta');
assert.equal(nextMath.startTime, '13:00');

// Test 4: Próxima aula quando a aula é hoje, mas o horário JÁ PASSOU
// Ex: Hoje é Quarta-feira 14:00, aula foi às 13:00 -> próxima aula de matemática é Segunda às 07:30
const mockWednesdayAfternoon = new Date(2026, 9, 7, 14, 0, 0);
const nextMathAfternoon = getNextClassDate('matemática', sampleClasses, mockWednesdayAfternoon);
console.log('Próxima aula de Matemática (tarde de quarta):', nextMathAfternoon);
assert.ok(nextMathAfternoon !== null);
assert.equal(nextMathAfternoon.date, '2026-10-12'); // Próxima segunda
assert.equal(nextMathAfternoon.dayOfWeek, 'Segunda');
assert.equal(nextMathAfternoon.startTime, '07:30');

// Test 5: Matéria que não existe no horário
const nextPhysics = getNextClassDate('Física Quântica', sampleClasses, mockWednesdayMorning);
assert.equal(nextPhysics, null);

console.log('✓ Todos os testes de getUniqueSubjects e getNextClassDate passaram com sucesso!');
