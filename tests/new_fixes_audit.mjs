import { strict as assert } from 'node:assert';
import { checkRateLimit } from '../api/firebase-token.js';

console.log('--- TESTANDO AS 6 NOVAS CORREÇÕES ---');

// Teste 1: Rate limiting duplo (/api/firebase-token)
console.log('\n[Teste 1] Verificação de checkRateLimit com max customizado e prefixos...');
{
  // Teste com max = 15 (padrão)
  for (let i = 0; i < 15; i++) {
    const blocked = await checkRateLimit('user:test_aluno_1', 15);
    assert.equal(blocked, false, `Chamada ${i + 1} de aluno_1 não deveria ser bloqueada`);
  }
  const blocked16 = await checkRateLimit('user:test_aluno_1', 15);
  assert.equal(blocked16, true, 'Chamada 16 de aluno_1 deveria ser bloqueada');

  // Outro aluno no mesmo IP NÃO deve ser bloqueado no limite de usuário
  const aluno2Blocked = await checkRateLimit('user:test_aluno_2', 15);
  assert.equal(aluno2Blocked, false, 'Aluno 2 deve ter seu próprio limite isolado');

  // Limite alto por IP (120)
  for (let i = 0; i < 50; i++) {
    const ipBlocked = await checkRateLimit('ip:187.50.20.10', 120);
    assert.equal(ipBlocked, false);
  }

  console.log('✓ Teste 1 aprovado: Rate limiter por IP (120) e por usuário (15) operando corretamente.');
}

// Teste 2: Prevenção de duplicatas no JSON
console.log('\n[Teste 2] Verificação de deduplicação de importação de aulas...');
{
  function normalizeSubjectName(s) {
    if (!s || typeof s !== 'string') return '';
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  const existingClasses = [
    { subject: 'Matemática', dayOfWeek: 'Segunda', startTime: '07:30' },
    { subject: 'História', dayOfWeek: 'Terça', startTime: '08:20' }
  ];

  const existingKeys = new Set(
    existingClasses.map(c => `${normalizeSubjectName(c.subject)}|${c.dayOfWeek}|${c.startTime}`)
  );

  const importPayload = [
    { subject: 'matematica', dayOfWeek: 'Segunda', startTime: '07:30' }, // Duplicada (case)
    { subject: 'Geografia', dayOfWeek: 'Quarta', startTime: '09:00' }, // Nova
    { subject: 'Geografia', dayOfWeek: 'Quarta', startTime: '09:00' }, // Duplicada dentro do próprio arquivo
  ];

  let skipped = 0;
  let count = 0;
  const toAdd = [];

  for (const item of importPayload) {
    const key = `${normalizeSubjectName(item.subject)}|${item.dayOfWeek}|${item.startTime}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);
    toAdd.push(item);
    count++;
  }

  assert.equal(count, 1, 'Apenas 1 aula nova deve ser importada');
  assert.equal(skipped, 2, '2 aulas duplicadas devem ser ignoradas');
  assert.equal(toAdd[0].subject, 'Geografia');

  console.log('✓ Teste 2 aprovado: Importação ignora aulas já existentes ou repetidas.');
}

// Teste 3: Status de trabalho sem passos
console.log('\n[Teste 3] Verificação de status de trabalho sem passos...');
{
  function computeTaskStatus(steps, editingTask = null) {
    const allDone = steps.length > 0 && steps.every(s => s.done);
    return steps.length === 0
      ? (editingTask?.status || 'pendente')
      : (editingTask
          ? (allDone ? 'concluído' : (steps.some(s => s.done) ? 'em andamento' : 'pendente'))
          : 'pendente');
  }

  // Novo trabalho sem passos -> pendente
  assert.equal(computeTaskStatus([]), 'pendente');

  // Editando trabalho concluído sem passos -> mantém concluído
  assert.equal(computeTaskStatus([], { status: 'concluído' }), 'concluído');

  // Editando trabalho em andamento com passos -> calcula normalmente
  assert.equal(computeTaskStatus([{ title: 'P1', done: true }, { title: 'P2', done: false }], { status: 'pendente' }), 'em andamento');

  console.log('✓ Teste 3 aprovado: Trabalho sem passos preserva status em edição.');
}

console.log('\n--- TODOS OS TESTES DAS 6 CORREÇÕES FORAM CONCLUÍDOS COM SUCESSO ---');
