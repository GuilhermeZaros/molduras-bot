import test from 'node:test';
import assert from 'node:assert/strict';
import { semFotoUrl } from '../lib/tools.js';

// O modelo NÃO deve receber a foto_url (senão ele cola o link no texto pro cliente).
// A foto é enviada pela tool enviar_foto, que busca a URL no servidor por código.
test('semFotoUrl: remove foto_url de cada moldura', () => {
  const out = semFotoUrl([
    { codigo: 'MOL-1', nome: 'X', preco_metro: 10, foto_url: 'https://drive.google.com/thumbnail?id=abc' }
  ]);
  assert.equal(out[0].foto_url, undefined);
  assert.equal(out[0].codigo, 'MOL-1');
  assert.equal(out[0].nome, 'X');
  assert.equal(out[0].preco_metro, 10);
});
test('semFotoUrl: lista vazia/undefined não quebra', () => {
  assert.deepEqual(semFotoUrl([]), []);
  assert.deepEqual(semFotoUrl(undefined), []);
});
