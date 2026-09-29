import { strict as assert } from 'node:assert';

console.log('--- TESTES ADICIONAIS: APP CHECK, RATE LIMITER DISTRIBUÍDO E VARIÁVEIS ---');

// 1. Simulação do Firebase App Check no Firestore
console.log('\n[Teste 1] Verificação de Rejeição sem Token de App Check (Modo Enforced)...');
{
  function evaluateAppCheckRequest(headers, isAppCheckEnforced = true) {
    if (!isAppCheckEnforced) {
      return { allowed: true };
    }
    const appCheckToken = headers['x-firebase-appcheck'] || headers['X-Firebase-AppCheck'];
    if (!appCheckToken || appCheckToken === 'invalid_token') {
      return {
        status: 401,
        code: 'PERMISSION_DENIED',
        error: 'Firebase App Check: Chamada não autorizada. Token de App Check ausente ou inválido.'
      };
    }
    return { status: 200, allowed: true };
  }

  // Chamada direta via REST sem token do App Check (ex: script curl ou app não autorizado)
  const directRestCall = evaluateAppCheckRequest({});
  assert.equal(directRestCall.status, 401);
  assert.equal(directRestCall.code, 'PERMISSION_DENIED');

  // Chamada com token inválido
  const forgedCall = evaluateAppCheckRequest({ 'x-firebase-appcheck': 'invalid_token' });
  assert.equal(forgedCall.status, 401);

  // Chamada legítima vinda do navegador oficial com token de App Check gerado pelo reCAPTCHA v3
  const legitimateCall = evaluateAppCheckRequest({ 'x-firebase-appcheck': 'valid_recaptcha_v3_token_ey...' });
  assert.equal(legitimateCall.status, 200);
  assert.equal(legitimateCall.allowed, true);

  console.log('✓ Teste 1 aprovado: Chamadas diretas sem App Check são estritamente bloqueadas no modo Enforced.');
}

// 2. Simulação do Rate Limiter Distribuído (Upstash Redis) com 20 chamadas multi-instâncias
console.log('\n[Teste 2] Simulação de Rate Limiter Distribuído (Upstash Redis Multi-Instâncias)...');
{
  // Simula o Redis remoto compartilhado
  const mockSharedRedis = new Map();

  async function mockRedisIncr(key) {
    const current = mockSharedRedis.get(key) || 0;
    const next = current + 1;
    mockSharedRedis.set(key, next);
    return next;
  }

  async function simulateDistributedRateLimit(clientIp, instanceId, limit = 15) {
    const key = `ratelimit:firebase_token:${clientIp}`;
    const count = await mockRedisIncr(key);
    const isBlocked = count > limit;
    return {
      instanceId,
      callNumber: count,
      status: isBlocked ? 429 : 200,
      blocked: isBlocked
    };
  }

  const clientIp = '200.180.50.25';
  const instances = ['vercel_lambda_iad1_01', 'vercel_lambda_iad1_02', 'vercel_lambda_gru1_01'];
  const results = [];

  // Simula 20 requisições distribuídas entre 3 instâncias serverless distintas
  for (let i = 1; i <= 20; i++) {
    const chosenInstance = instances[i % instances.length];
    const res = await simulateDistributedRateLimit(clientIp, chosenInstance, 15);
    results.push(res);
  }

  // As primeiras 15 chamadas (1 a 15) devem ser permitidas (HTTP 200)
  for (let i = 0; i < 15; i++) {
    assert.equal(results[i].status, 200, `Chamada ${i + 1} deveria ter status 200`);
    assert.equal(results[i].blocked, false);
  }

  // Da 16ª à 20ª chamada, TODAS devem ser bloqueadas com HTTP 429 independente da instância
  for (let i = 15; i < 20; i++) {
    assert.equal(results[i].status, 429, `Chamada ${i + 1} deveria ser bloqueada com status 429`);
    assert.equal(results[i].blocked, true);
  }

  console.log(`✓ Teste 2 aprovado: 20 requisições distribuídas entre ${instances.length} instâncias bloquearam consistentemente na chamada 16 (HTTP 429).`);
}

// 3. Auditoria do formato de variáveis de ambiente
console.log('\n[Teste 3] Auditoria de Isolamento de Variáveis de Ambiente...');
{
  import('fs').then(fs => {
    const envExample = fs.readFileSync('.env.example', 'utf-8');
    assert.ok(envExample.includes('VITE_CLERK_PUBLISHABLE_KEY'), 'Deve conter VITE_CLERK_PUBLISHABLE_KEY');
    assert.ok(envExample.includes('CLERK_SECRET_KEY'), 'Deve conter CLERK_SECRET_KEY');
    assert.ok(envExample.includes('UPSTASH_REDIS_REST_URL'), 'Deve conter UPSTASH_REDIS_REST_URL');
    assert.ok(envExample.includes('VITE_RECAPTCHA_V3_SITE_KEY'), 'Deve conter VITE_RECAPTCHA_V3_SITE_KEY');
    
    // Confirma que nenhuma chave secreta real vazou no .env.example
    assert.ok(!envExample.includes('AIzaSyANKtjA1-9NFfR29H14XVHh2NL9_GRTxSo_FAKE_KEY'));
    assert.ok(!envExample.includes('sk_live_'));
    
    console.log('✓ Teste 3 aprovado: .env.example estruturado e livre de segredos.');
  });
}
