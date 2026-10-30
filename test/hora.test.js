import test from 'node:test';
import assert from 'node:assert/strict';
import { carimboHora, horaDaLoja } from '../lib/hora.js';

// As datas dos testes são instantes UTC ('...Z') de propósito: o carimbo é sempre
// no fuso da LOJA (America/Sao_Paulo), então o resultado não muda com o fuso da
// máquina que roda o teste (o VPS está em UTC, o PC do dono em -03).

test('carimboHora: dia da semana, data e hora com zero à esquerda', () => {
  const d = new Date('2026-07-01T12:05:00Z'); // 09:05 em Brasília; 01/07/2026 é quarta
  assert.equal(carimboHora(d), '[quarta, 01/07/2026, 09:05]');
});

test('carimboHora: domingo à noite', () => {
  const d = new Date('2026-07-06T01:30:00Z'); // 22:30 de domingo 05/07 em Brasília
  assert.equal(carimboHora(d), '[domingo, 05/07/2026, 22:30]');
});

test('carimboHora: usa o fuso da LOJA, não o UTC do servidor (bug de 2026-08-06)', () => {
  // O VPS roda em UTC: 18:31Z são 15:31 em Paranavaí. A Julia dizia "já fechamos
  // às 18h" às 15h30 da tarde porque lia a hora do servidor.
  const d = new Date('2026-08-06T18:31:00Z');
  assert.equal(carimboHora(d), '[quinta, 06/08/2026, 15:31]');
});

test('carimboHora: meia-noite sai como 00, não 24', () => {
  const d = new Date('2026-08-07T03:00:00Z'); // 00:00 de 07/08 em Brasília
  assert.equal(carimboHora(d), '[sexta, 07/08/2026, 00:00]');
});

test('horaDaLoja: hora 0-23 no fuso da loja, não no do servidor', () => {
  assert.equal(horaDaLoja(new Date('2026-08-06T18:31:00Z')), 15);
  assert.equal(horaDaLoja(new Date('2026-08-07T03:00:00Z')), 0);
});
