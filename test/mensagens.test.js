import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividirEmMensagens, resolverRespostaFinal } from '../lib/mensagens.js';

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

test('não repete balões idênticos (modelo às vezes repete a mesma frase)', () => {
  const texto = 'Com vidro incolor R$ 196,00\n\nSem vidro R$ 116,00\n\nCom vidro incolor R$ 196,00';
  assert.deepEqual(dividirEmMensagens(texto), [
    'Com vidro incolor R$ 196,00',
    'Sem vidro R$ 116,00'
  ]);
});

test('balão inteiro repetido vira uma mensagem só', () => {
  const texto = 'Oi! Aqui é a Julia 😊\n\nOi! Aqui é a Julia 😊';
  assert.deepEqual(dividirEmMensagens(texto), ['Oi! Aqui é a Julia 😊']);
});

test('limita ao máximo, juntando o excedente no último balão', () => {
  const texto = 'a\n\nb\n\nc\n\nd\n\ne\n\nf';
  const r = dividirEmMensagens(texto, 4);
  assert.equal(r.length, 4);
  assert.deepEqual(r.slice(0, 3), ['a', 'b', 'c']);
  assert.equal(r[3], 'd\n\ne\n\nf');
});

test('resolverRespostaFinal: texto normal passa direto', () => {
  assert.equal(resolverRespostaFinal('Fica R$ 120', false), 'Fica R$ 120');
  assert.equal(resolverRespostaFinal('  espaços  ', false), 'espaços');
});

test('resolverRespostaFinal: texto vazio + mídia enviada vira a pergunta de escolha (não a msg-lixo)', () => {
  assert.equal(resolverRespostaFinal('', true), 'Qual você prefere? Me diz o número.');
  assert.equal(resolverRespostaFinal('   ', true), 'Qual você prefere? Me diz o número.');
});

test('resolverRespostaFinal: texto vazio sem mídia pede pra repetir (nunca "o bot não soube responder")', () => {
  assert.equal(resolverRespostaFinal('', false), 'Desculpa, pode repetir?');
  assert.equal(resolverRespostaFinal(null, false), 'Desculpa, pode repetir?');
});
