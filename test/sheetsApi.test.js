import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APPS_SCRIPT_URL = 'https://fake.exec'; // antes do import

const { apiGet, _limparCache } = await import('../lib/sheetsApi.js');

function mockFetch(payload, { status = 200 } = {}) {
  let chamadas = 0;
  globalThis.fetch = async () => {
    chamadas++;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload
    };
  };
  return () => chamadas;
}

test('apiGet: desembrulha dados quando ok:true', async () => {
  _limparCache();
  mockFetch({ ok: true, dados: [{ codigo: 'MOL-001' }] });
  const r = await apiGet('buscarMolduras', { cor: 'preto' });
  assert.deepEqual(r, [{ codigo: 'MOL-001' }]);
});

test('apiGet: lança erro quando ok:false', async () => {
  _limparCache();
  mockFetch({ ok: false, erro: 'Produto não encontrado: X' });
  await assert.rejects(() => apiGet('consultarProduto', { codigo: 'X' }), /não encontrado/);
});

test('apiGet: usa cache na 2ª chamada com os mesmos params', async () => {
  _limparCache();
  const conta = mockFetch({ ok: true, dados: 42 });
  await apiGet('ping', {});
  await apiGet('ping', {});
  assert.equal(conta(), 1); // só 1 fetch real
});

test('apiGet: lança erro em HTTP não-ok', async () => {
  _limparCache();
  mockFetch({}, { status: 500 });
  await assert.rejects(() => apiGet('ping', {}), /HTTP 500/);
});
