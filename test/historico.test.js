import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { lerHistorico, gravarHistorico } from '../lib/historico.js';

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
