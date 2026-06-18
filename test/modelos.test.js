// test/modelos.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELOS, modelosDe } from '../lib/modelos.js';

test('modelosDe: certificado tem 3 fotos com url e legenda', () => {
  const r = modelosDe('certificado');
  assert.equal(r.length, 3);
  assert.ok(r.every(m => m.url && m.legenda));
  assert.ok(r[0].legenda.startsWith('1'));
});
test('modelosDe: camiseta tem 2 fotos', () => {
  assert.equal(modelosDe('camiseta').length, 2);
});
test('modelosDe: tipo invalido lanca', () => {
  assert.throws(() => modelosDe('xpto'));
});
test('MODELOS: urls usam o thumbnail do Drive', () => {
  assert.ok(MODELOS.certificado.every(m => m.url.includes('drive.google.com/thumbnail?id=')));
});
