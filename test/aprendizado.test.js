import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { montarLinhaAprendizado, registrarAprendizado } from '../lib/aprendizado.js';

test('montarLinhaAprendizado: JSON com campos certos e termina em quebra de linha', () => {
  const linha = montarLinhaAprendizado('55@s.whatsapp.net', 'equipe', 'fica pronto quinta', 123);
  assert.equal(linha.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(linha), { ts: 123, jid: '55@s.whatsapp.net', quem: 'equipe', texto: 'fica pronto quinta' });
});

test('montarLinhaAprendizado: texto/jid ausentes viram string vazia; ts default é número', () => {
  const o = JSON.parse(montarLinhaAprendizado(null, 'cliente', null));
  assert.equal(o.texto, '');
  assert.equal(o.jid, '');
  assert.equal(typeof o.ts, 'number');
});

test('registrarAprendizado: append em JSONL (round-trip com 2 mensagens)', () => {
  const caminho = path.join(tmpdir(), `aprend-test-${Date.now()}.jsonl`);
  try {
    registrarAprendizado('c@s.whatsapp.net', 'cliente', 'quero uma moldura', caminho);
    registrarAprendizado('c@s.whatsapp.net', 'equipe', 'claro! te mando as opções', caminho);
    const linhas = readFileSync(caminho, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(linhas.length, 2);
    assert.equal(linhas[0].quem, 'cliente');
    assert.equal(linhas[0].texto, 'quero uma moldura');
    assert.equal(linhas[1].quem, 'equipe');
    assert.equal(linhas[1].texto, 'claro! te mando as opções');
  } finally {
    rmSync(caminho, { force: true });
  }
});
