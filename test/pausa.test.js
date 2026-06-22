import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rmSync, writeFileSync } from 'node:fs';
import { aoEditarLabel, aoAssociar, estaPausado, lerPausados, gravarPausados } from '../lib/pausa.js';

const CFG = { nome: 'Pausar Julia', id: '' };

// ---- aoEditarLabel ----
test('aoEditarLabel: upsert do nome por id', () => {
  const e = aoEditarLabel({ labels: {}, assocs: {} }, { id: 'L1', name: 'Pausar Julia', deleted: false });
  assert.equal(e.labels['L1'], 'Pausar Julia');
});
test('aoEditarLabel: deleted remove o id', () => {
  const e = aoEditarLabel({ labels: { L1: 'Pausar Julia' }, assocs: {} }, { id: 'L1', name: 'Pausar Julia', deleted: true });
  assert.equal(e.labels['L1'], undefined);
});
test('aoEditarLabel: label sem id não quebra', () => {
  const e = aoEditarLabel({ labels: {}, assocs: {} }, {});
  assert.deepEqual(e.labels, {});
});

// ---- aoAssociar ----
test('aoAssociar: add cria assocs[chat][label]', () => {
  const e = aoAssociar({ labels: {}, assocs: {} }, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'add' });
  assert.equal(e.assocs['c@x']['L1'], true);
});
test('aoAssociar: remove tira; chat vazio some', () => {
  let e = aoAssociar({ labels: {}, assocs: {} }, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'add' });
  e = aoAssociar(e, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'remove' });
  assert.equal(e.assocs['c@x'], undefined);
});
test('aoAssociar: associação de MENSAGEM (tem messageId) é ignorada', () => {
  const e = aoAssociar({ labels: { L1: 'Pausar Julia' }, assocs: {} },
    { association: { chatId: 'c@x', labelId: 'L1', messageId: 'm1' }, type: 'add' });
  assert.equal(estaPausado(e, 'c@x', CFG), false);
});

// ---- estaPausado ----
test('estaPausado: casa por nome (tolerante a caixa/espaço)', () => {
  let e = aoEditarLabel({ labels: {}, assocs: {} }, { id: 'L1', name: '  PAUSAR julia ' });
  e = aoAssociar(e, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'add' });
  assert.equal(estaPausado(e, 'c@x', CFG), true);
});
test('estaPausado: independente da ordem (assoc antes do nome)', () => {
  let e = aoAssociar({ labels: {}, assocs: {} }, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'add' });
  assert.equal(estaPausado(e, 'c@x', CFG), false); // nome ainda desconhecido
  e = aoEditarLabel(e, { id: 'L1', name: 'Pausar Julia' });
  assert.equal(estaPausado(e, 'c@x', CFG), true); // nome chegou -> pausado
});
test('estaPausado: casa por id quando cfg.id setado (sem precisar do nome)', () => {
  const e = aoAssociar({ labels: {}, assocs: {} }, { association: { chatId: 'c@x', labelId: 'L9' }, type: 'add' });
  assert.equal(estaPausado(e, 'c@x', { nome: 'Outra', id: 'L9' }), true);
});
test('estaPausado: conversa sem a etiqueta de pausa -> false', () => {
  let e = aoEditarLabel({ labels: {}, assocs: {} }, { id: 'L2', name: 'Cliente novo' });
  e = aoAssociar(e, { association: { chatId: 'c@x', labelId: 'L2' }, type: 'add' });
  assert.equal(estaPausado(e, 'c@x', CFG), false);
});
test('estaPausado: jid sem associação nenhuma -> false', () => {
  assert.equal(estaPausado({ labels: {}, assocs: {} }, 'z@x', CFG), false);
});
test('estaPausado: cfg.id setado mas labelId diferente -> false', () => {
  const e = aoAssociar({ labels: {}, assocs: {} }, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'add' });
  assert.equal(estaPausado(e, 'c@x', { nome: '', id: 'L2' }), false);
});
test('aoAssociar: evento com type ausente não corrompe o estado', () => {
  const base = aoAssociar({ labels: {}, assocs: {} }, { association: { chatId: 'c@x', labelId: 'L1' }, type: 'add' });
  const depois = aoAssociar(base, { association: { chatId: 'c@x', labelId: 'L1' } }); // sem type
  assert.equal(depois.assocs['c@x']['L1'], true); // intacto
});

// ---- persistência ----
test('lerPausados: arquivo ausente -> estado vazio', () => {
  const caminho = path.join(tmpdir(), `pausa-test-${Date.now()}-a.json`);
  assert.deepEqual(lerPausados(caminho), { labels: {}, assocs: {} });
});
test('gravarPausados/lerPausados: round-trip', () => {
  const caminho = path.join(tmpdir(), `pausa-test-${Date.now()}-b.json`);
  try {
    const estado = { labels: { L1: 'Pausar Julia' }, assocs: { 'c@x': { L1: true } } };
    gravarPausados(estado, caminho);
    assert.deepEqual(lerPausados(caminho), estado);
  } finally {
    rmSync(caminho, { force: true });
  }
});
test('lerPausados: JSON corrompido -> estado vazio', () => {
  const caminho = path.join(tmpdir(), `pausa-test-${Date.now()}-c.json`);
  try {
    writeFileSync(caminho, 'CORROMPIDO{', 'utf8');
    assert.deepEqual(lerPausados(caminho), { labels: {}, assocs: {} });
  } finally {
    rmSync(caminho, { force: true });
  }
});
