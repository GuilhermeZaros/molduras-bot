import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { montarMensagemPronto, normalizarTelefone, verificarOficina } from '../lib/oficina.js';

// ---- lib/oficina.js (bot) ----

test('montarMensagemPronto: usa o nome do cliente', () => {
  const m = montarMensagemPronto('Maria');
  assert.match(m, /Oi Maria!/);
  assert.match(m, /pronto/i);
  assert.match(m, /Julia/);
});
test('montarMensagemPronto: sem nome, não quebra', () => {
  assert.match(montarMensagemPronto(''), /^Oi! /);
  assert.match(montarMensagemPronto(null), /^Oi! /);
});

test('normalizarTelefone: celular com DDD vira 55+DDD+numero', () => {
  assert.equal(normalizarTelefone('44 99999-8888'), '5544999998888');
  assert.equal(normalizarTelefone('(44) 99999-8888'), '5544999998888');
});
test('normalizarTelefone: fixo (10 dígitos) também ganha o 55', () => {
  assert.equal(normalizarTelefone('4433334444'), '554433334444');
});
test('normalizarTelefone: já com DDI 55 fica igual', () => {
  assert.equal(normalizarTelefone('5544999998888'), '5544999998888');
});
test('normalizarTelefone: sem DDD ou vazio -> null', () => {
  assert.equal(normalizarTelefone('99998888'), null); // 8 dígitos, sem DDD
  assert.equal(normalizarTelefone(''), null);
  assert.equal(normalizarTelefone('abc'), null);
});

function fakesOficina(pendentes, opts = {}) {
  const chamadas = { enviadas: [], confirmadas: [] };
  return {
    chamadas,
    deps: {
      buscarPendentes: async () => pendentes,
      onWhatsApp: async (tel) => (opts.semWhatsApp && opts.semWhatsApp.includes(tel)) ? null : (tel + '@s.whatsapp.net'),
      enviar: async (jid, texto) => {
        if (opts.falhaEnvio) throw new Error('rede caiu');
        chamadas.enviadas.push({ jid, texto });
      },
      confirmar: async (id, ok, motivo) => { chamadas.confirmadas.push({ id, ok, motivo }); }
    }
  };
}

test('verificarOficina: pendente com número bom -> envia e confirma ok', async () => {
  const { deps, chamadas } = fakesOficina([{ id: 'OS-001', cliente: 'Ana', telefone: '44999998888' }]);
  const n = await verificarOficina(deps);
  assert.equal(n, 1);
  assert.equal(chamadas.enviadas.length, 1);
  assert.equal(chamadas.enviadas[0].jid, '5544999998888@s.whatsapp.net');
  assert.deepEqual(chamadas.confirmadas, [{ id: 'OS-001', ok: true, motivo: undefined }]);
});

test('verificarOficina: telefone inválido -> confirma falha, não envia', async () => {
  const { deps, chamadas } = fakesOficina([{ id: 'OS-002', cliente: 'Bia', telefone: '123' }]);
  const n = await verificarOficina(deps);
  assert.equal(n, 0);
  assert.equal(chamadas.enviadas.length, 0);
  assert.equal(chamadas.confirmadas[0].ok, false);
});

test('verificarOficina: número não está no WhatsApp -> confirma falha', async () => {
  const { deps, chamadas } = fakesOficina(
    [{ id: 'OS-003', cliente: 'Cris', telefone: '44999998888' }],
    { semWhatsApp: ['5544999998888'] }
  );
  const n = await verificarOficina(deps);
  assert.equal(n, 0);
  assert.equal(chamadas.enviadas.length, 0);
  assert.equal(chamadas.confirmadas[0].ok, false);
});

test('verificarOficina: erro de envio -> NÃO confirma (tenta de novo depois)', async () => {
  const { deps, chamadas } = fakesOficina(
    [{ id: 'OS-004', cliente: 'Dan', telefone: '44999998888' }],
    { falhaEnvio: true }
  );
  const n = await verificarOficina(deps);
  assert.equal(n, 0);
  assert.equal(chamadas.confirmadas.length, 0);
});

// ---- Apps Script puro (carregado via vm) ----

const dir = path.dirname(fileURLToPath(import.meta.url));
function carregarGs(nome) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(dir, '..', 'apps-script', nome), 'utf8'), ctx);
  return ctx;
}

test('Oficina.gs _proximoIdOS: maior número + 1, 3 dígitos', () => {
  const ctx = carregarGs('Oficina.gs');
  assert.equal(ctx._proximoIdOS([]), 'OS-001');
  assert.equal(ctx._proximoIdOS(['OS-001', 'OS-009']), 'OS-010');
  assert.equal(ctx._proximoIdOS(['OS-001', 'OS-013', 'OS-007']), 'OS-014');
});
test('Oficina.gs _prazoStr: ISO do input date vira DD/MM/AAAA', () => {
  const ctx = carregarGs('Oficina.gs');
  assert.equal(ctx._prazoStr('2026-06-25'), '25/06/2026');
  assert.equal(ctx._prazoStr('25/06/2026'), '25/06/2026');
  assert.equal(ctx._prazoStr(''), '');
});

test('Auth.gs papeisDe: separa por vírgula; vazio = atendimento (retrocompat)', () => {
  const ctx = carregarGs('Auth.gs');
  // .join: array vindo do vm quebra o deepEqual (cross-realm) — asserir só primitivos.
  assert.equal(ctx.papeisDe('atendimento,oficina').join(','), 'atendimento,oficina');
  assert.equal(ctx.papeisDe(' Oficina ').join(','), 'oficina');
  assert.equal(ctx.papeisDe('').join(','), 'atendimento');
  assert.equal(ctx.papeisDe(null).join(','), 'atendimento');
});
test('Auth.gs temGestao / ehSomenteOficina', () => {
  const ctx = carregarGs('Auth.gs');
  assert.equal(ctx.temGestao(['atendimento']), true);
  assert.equal(ctx.temGestao(['dono']), true);
  assert.equal(ctx.temGestao(['oficina']), false);
  assert.equal(ctx.ehSomenteOficina(['oficina']), true);
  assert.equal(ctx.ehSomenteOficina(['oficina', 'atendimento']), false);
  assert.equal(ctx.ehSomenteOficina(['atendimento']), false);
});
