import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividirEmMensagens } from '../lib/mensagens.js';

test('divide em vários balões separados por linha em branco', () => {
  const texto = 'Oii! 😊\n\nMe conta o tamanho?\n\nE já tem a chapa de eucatex?';
  assert.deepEqual(dividirEmMensagens(texto), [
    'Oii! 😊',
    'Me conta o tamanho?',
    'E já tem a chapa de eucatex?'
  ]);
});

test('sem linha em branco vira uma mensagem só', () => {
  assert.deepEqual(
    dividirEmMensagens('Tudo certo, pode vir buscar'),
    ['Tudo certo, pode vir buscar']
  );
});

test('aceita linha em branco com espaços e remove vazios', () => {
  const texto = 'Primeira\n   \nSegunda';
  assert.deepEqual(dividirEmMensagens(texto), ['Primeira', 'Segunda']);
});

test('texto vazio ou só espaço retorna lista vazia', () => {
  assert.deepEqual(dividirEmMensagens('   \n\n  '), []);
});

test('limita ao máximo, juntando o excedente no último balão', () => {
  const texto = 'a\n\nb\n\nc\n\nd\n\ne\n\nf';
  const r = dividirEmMensagens(texto, 4);
  assert.equal(r.length, 4);
  assert.deepEqual(r.slice(0, 3), ['a', 'b', 'c']);
  assert.equal(r[3], 'd\n\ne\n\nf');
});
