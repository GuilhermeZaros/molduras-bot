import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarDeduplicador } from '../lib/dedupe.js';

test('id novo na 1ª vez não foi processado; na 2ª sim', () => {
  const d = criarDeduplicador();
  assert.equal(d.jaProcessou('ABC'), false);
  assert.equal(d.jaProcessou('ABC'), true);
  assert.equal(d.jaProcessou('ABC'), true);
});

test('ids diferentes são independentes', () => {
  const d = criarDeduplicador();
  assert.equal(d.jaProcessou('A'), false);
  assert.equal(d.jaProcessou('B'), false);
  assert.equal(d.jaProcessou('A'), true);
  assert.equal(d.jaProcessou('B'), true);
});

test('sem id (null/vazio/undefined) nunca deduplica — deixa a mensagem passar', () => {
  const d = criarDeduplicador();
  assert.equal(d.jaProcessou(null), false);
  assert.equal(d.jaProcessou(null), false);
  assert.equal(d.jaProcessou(''), false);
  assert.equal(d.jaProcessou(undefined), false);
});

test('esquece os ids mais antigos ao passar do máximo', () => {
  const d = criarDeduplicador(2);
  assert.equal(d.jaProcessou('A'), false); // lembra [A]
  assert.equal(d.jaProcessou('B'), false); // lembra [A,B]
  assert.equal(d.jaProcessou('C'), false); // lembra [B,C] — A caiu
  assert.equal(d.jaProcessou('A'), false); // A foi esquecido → conta como novo; lembra [C,A] — B caiu
  assert.equal(d.jaProcessou('C'), true);  // C ainda está lembrado
});
