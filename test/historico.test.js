import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { lerHistorico, gravarHistorico, apararHistorico } from '../lib/historico.js';

const FC = (n) => ({ role: 'model', parts: [{ functionCall: { name: n, args: {} } }] });
const FR = (n) => ({ role: 'user', parts: [{ functionResponse: { name: n, response: {} } }] });
const UTexto = (t) => ({ role: 'user', parts: [{ text: t }] });
const MTexto = (t) => ({ role: 'model', parts: [{ text: t }] });

test('apararHistorico: nunca começa com functionResponse órfão', () => {
  // simula um corte que deixou um functionResponse sem o functionCall antes
  const h = [FR('calcular_orcamento'), MTexto('texto'), UTexto('quero um quadro'), MTexto('qual tamanho?')];
  const r = apararHistorico(h, 40);
  assert.equal(r[0].role, 'user');
  assert.ok(r[0].parts.some(p => typeof p.text === 'string'));
  assert.equal(r.some((t, i) => i === 0 && t.parts.some(p => p.functionResponse)), false);
  assert.deepEqual(r, [UTexto('quero um quadro'), MTexto('qual tamanho?')]);
});

test('apararHistorico: corta pra até N e começa numa msg de usuário', () => {
  const h = [UTexto('oi'), MTexto('ola'), FC('x'), FR('x'), MTexto('pronto'), UTexto('mais')];
  const r = apararHistorico(h, 4); // últimas 4: [FC,FR,MTexto,UTexto] -> começa só no UTexto
  assert.equal(r[0].role, 'user');
  assert.ok(r[0].parts.some(p => typeof p.text === 'string'));
});

test('apararHistorico: histórico já válido fica igual (só aplica o limite)', () => {
  const h = [UTexto('quero quadro'), MTexto('qual cor?'), UTexto('preta')];
  assert.deepEqual(apararHistorico(h, 40), h);
});

test('apararHistorico: vazio devolve []', () => {
  assert.deepEqual(apararHistorico([], 40), []);
  assert.deepEqual(apararHistorico(undefined, 40), []);
});

function tmpFile(nome) {
  return path.join(os.tmpdir(), nome + '-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
}

test('lerHistorico: arquivo inexistente devolve {}', () => {
  assert.deepEqual(lerHistorico(tmpFile('nao-existe')), {});
});

test('lerHistorico/gravarHistorico: round-trip preserva as conversas', () => {
  const caminho = tmpFile('conversas');
  const dados = {
    'a@s.whatsapp.net': [{ role: 'user', parts: [{ text: 'quero um certificado' }] }],
    'b@lid': [{ role: 'model', parts: [{ text: 'oi!' }] }]
  };
  gravarHistorico(dados, caminho);
  assert.deepEqual(lerHistorico(caminho), dados);
  rmSync(caminho, { force: true });
});

test('lerHistorico: arquivo corrompido nao quebra (devolve {})', () => {
  const caminho = tmpFile('corrompido');
  writeFileSync(caminho, '{isso nao e json valido', 'utf8');
  assert.deepEqual(lerHistorico(caminho), {});
  rmSync(caminho, { force: true });
});

test('gravarHistorico: cria a pasta se nao existir', () => {
  const caminho = path.join(os.tmpdir(), 'dir-novo-' + Date.now(), 'conversas.json');
  gravarHistorico({ 'x@lid': [] }, caminho);
  assert.deepEqual(lerHistorico(caminho), { 'x@lid': [] });
  rmSync(path.dirname(caminho), { recursive: true, force: true });
});
