import test from 'node:test';
import assert from 'node:assert/strict';
import { deveEsperarDigitando } from '../lib/espera.js';

const VALID = 6000, MAX = 15000, AGORA = 100000;

test('espera enquanto o cliente está digitando (composing recente, dentro do teto)', () => {
  // composing há 1s, última msg há 1s → espera
  assert.equal(deveEsperarDigitando(AGORA - 1000, AGORA - 1000, AGORA, VALID, MAX), true);
});

test('NÃO espera se o cliente não está digitando', () => {
  assert.equal(deveEsperarDigitando(0, AGORA - 1000, AGORA, VALID, MAX), false);
});

test('NÃO espera se o "digitando" já é antigo (passou da validade)', () => {
  // último composing há 7s (> 6s) → considera que parou
  assert.equal(deveEsperarDigitando(AGORA - 7000, AGORA - 1000, AGORA, VALID, MAX), false);
});

test('NÃO espera além do teto, mesmo digitando', () => {
  // digitando agora, mas última msg há 16s (> 15s teto) → responde
  assert.equal(deveEsperarDigitando(AGORA - 500, AGORA - 16000, AGORA, VALID, MAX), false);
});

test('valores ausentes (sem presence) não quebram → não espera', () => {
  assert.equal(deveEsperarDigitando(undefined, AGORA - 1000, AGORA, VALID, MAX), false);
});
