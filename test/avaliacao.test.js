import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  AVISO_PRONTO_MODELO, LINK_AVALIACAO, CONFIG_AVALIACAO,
  ehAvisoDePronto, montarMensagemAvaliacao, ehElogioSimples, montarConviteAvaliacao,
  agendarAvaliacao, avaliacaoVencida, dentroDaJanela,
  lerAvaliacoes, gravarAvaliacoes, verificarAvaliacoes
} from '../lib/avaliacao.js';

const H = 60 * 60 * 1000;
// Horários fixos no fuso da loja (America/Sao_Paulo), pra o teste não depender do fuso da máquina.
const TARDE = new Date('2026-09-15T15:00:00-03:00').getTime();
const MADRUGADA = new Date('2026-09-15T03:00:00-03:00').getTime();

// ---- reconhecer o aviso-modelo ----

test('ehAvisoDePronto: o texto exato do modelo casa', () => {
  assert.equal(ehAvisoDePronto(AVISO_PRONTO_MODELO), true);
});

test('ehAvisoDePronto: tolera espaço sobrando, quebra de linha e emoji ausente', () => {
  assert.equal(ehAvisoDePronto('Oi! \nSeu quadro ficou pronto! ✨\nPode vir retirar na Vera Molduras — depois me conta o que achou, vou adorar saber!'), true);
  assert.equal(ehAvisoDePronto('Oi! Seu quadro ficou pronto! Pode vir retirar na Vera Molduras - depois me conta o que achou, vou adorar saber!'), true);
  assert.equal(ehAvisoDePronto('  OI! SEU QUADRO FICOU PRONTO!  PODE VIR RETIRAR NA VERA MOLDURAS — DEPOIS ME CONTA O QUE ACHOU, VOU ADORAR SABER!  '), true);
});

test('ehAvisoDePronto: mensagem parecida mas diferente NÃO casa', () => {
  assert.equal(ehAvisoDePronto('Oi! Seu quadro ficou pronto!'), false);
  assert.equal(ehAvisoDePronto('Seu quadro ficou pronto, pode vir buscar quando quiser'), false);
  assert.equal(ehAvisoDePronto('Oi! Seu espelho ficou pronto! Pode vir retirar na Vera Molduras — depois me conta o que achou, vou adorar saber!'), false);
  assert.equal(ehAvisoDePronto(AVISO_PRONTO_MODELO + ' Valor: R$ 180,00'), false);
  assert.equal(ehAvisoDePronto(''), false);
  assert.equal(ehAvisoDePronto(null), false);
});

// ---- mensagem da avaliação ----

test('montarMensagemAvaliacao: leva o link do Google e o convite', () => {
  const m = montarMensagemAvaliacao();
  assert.ok(m.includes(LINK_AVALIACAO));
  assert.match(m, /avalia[çc][ãa]o/i);
  assert.match(m, /Gostou do seu quadro/);
});

// ---- agendamento (puro) ----

test('agendarAvaliacao: marca o envio pra 96h depois', () => {
  const estado = agendarAvaliacao({}, '55449@s.whatsapp.net', TARDE);
  assert.equal(estado['55449@s.whatsapp.net'].enviarApos, TARDE + 96 * H);
});

test('agendarAvaliacao: aviso repetido REINICIA o relógio (não empilha 2 pedidos)', () => {
  let estado = agendarAvaliacao({}, 'a@s.whatsapp.net', TARDE);
  estado = agendarAvaliacao(estado, 'a@s.whatsapp.net', TARDE + 2 * H);
  assert.equal(Object.keys(estado).length, 1);
  assert.equal(estado['a@s.whatsapp.net'].enviarApos, TARDE + 2 * H + 96 * H);
});

test('agendarAvaliacao: é pura (não muda o estado antigo) e mantém os outros contatos', () => {
  const antes = agendarAvaliacao({}, 'a@s.whatsapp.net', TARDE);
  const depois = agendarAvaliacao(antes, 'b@s.whatsapp.net', TARDE);
  assert.equal(Object.keys(antes).length, 1);
  assert.equal(Object.keys(depois).length, 2);
});

test('avaliacaoVencida: só depois das 96h', () => {
  const item = { avisoEm: TARDE, enviarApos: TARDE + 96 * H };
  assert.equal(avaliacaoVencida(item, TARDE + 95 * H), false);
  assert.equal(avaliacaoVencida(item, TARDE + 96 * H), true);
  assert.equal(avaliacaoVencida(item, TARDE + 200 * H), true);
  assert.equal(avaliacaoVencida(null, TARDE + 200 * H), false);
});

test('dentroDaJanela: 8h-18h no fuso da loja', () => {
  assert.equal(dentroDaJanela(8, CONFIG_AVALIACAO), true);
  assert.equal(dentroDaJanela(15, CONFIG_AVALIACAO), true);
  assert.equal(dentroDaJanela(17, CONFIG_AVALIACAO), true);
  assert.equal(dentroDaJanela(18, CONFIG_AVALIACAO), false);
  assert.equal(dentroDaJanela(3, CONFIG_AVALIACAO), false);
});

// ---- orquestração ----

function fakes(fila, opts = {}) {
  const chamadas = { enviadas: [], concluidas: [] };
  return {
    chamadas,
    deps: {
      listar: () => fila,
      enviar: async (jid, texto) => {
        if (opts.falhaEnvio) throw new Error('offline');
        chamadas.enviadas.push({ jid, texto });
      },
      concluir: (jid) => { chamadas.concluidas.push(jid); delete fila[jid]; },
      agora: opts.agora ?? TARDE
    }
  };
}

test('verificarAvaliacoes: manda pro contato vencido e tira da fila', async () => {
  const fila = {
    'a@s.whatsapp.net': { avisoEm: TARDE - 100 * H, enviarApos: TARDE - 4 * H },
    'b@s.whatsapp.net': { avisoEm: TARDE - 2 * H, enviarApos: TARDE + 94 * H }
  };
  const { deps, chamadas } = fakes(fila);
  const n = await verificarAvaliacoes(deps);
  assert.equal(n, 1);
  assert.equal(chamadas.enviadas.length, 1);
  assert.equal(chamadas.enviadas[0].jid, 'a@s.whatsapp.net');
  assert.ok(chamadas.enviadas[0].texto.includes(LINK_AVALIACAO));
  assert.deepEqual(chamadas.concluidas, ['a@s.whatsapp.net']);
  assert.deepEqual(Object.keys(fila), ['b@s.whatsapp.net']);
});

test('verificarAvaliacoes: de madrugada não manda nada (segura pra janela útil)', async () => {
  const fila = { 'a@s.whatsapp.net': { avisoEm: MADRUGADA - 100 * H, enviarApos: MADRUGADA - 4 * H } };
  const { deps, chamadas } = fakes(fila, { agora: MADRUGADA });
  const n = await verificarAvaliacoes(deps);
  assert.equal(n, 0);
  assert.equal(chamadas.enviadas.length, 0);
  assert.deepEqual(Object.keys(fila), ['a@s.whatsapp.net']); // continua na fila
});

test('verificarAvaliacoes: falha no envio NÃO tira da fila (tenta de novo no próximo ciclo)', async () => {
  const fila = { 'a@s.whatsapp.net': { avisoEm: TARDE - 100 * H, enviarApos: TARDE - 4 * H } };
  const { deps, chamadas } = fakes(fila, { falhaEnvio: true });
  const n = await verificarAvaliacoes({ ...deps, log: () => {} });
  assert.equal(n, 0);
  assert.equal(chamadas.concluidas.length, 0);
  assert.deepEqual(Object.keys(fila), ['a@s.whatsapp.net']);
});

test('verificarAvaliacoes: fila vazia não quebra', async () => {
  const { deps } = fakes({});
  assert.equal(await verificarAvaliacoes(deps), 0);
});

// ---- persistência ----

test('ler/gravarAvaliacoes: ida e volta; arquivo ausente vira {}', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'aval-'));
  const arq = path.join(dir, 'avaliacoes.json');
  try {
    assert.deepEqual(lerAvaliacoes(arq), {});
    const estado = agendarAvaliacao({}, 'a@s.whatsapp.net', TARDE);
    gravarAvaliacoes(estado, arq);
    assert.deepEqual(lerAvaliacoes(arq), estado);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- elogio depois do pedido de avaliação ----

test('ehElogioSimples: elogios reais de clientes casam', () => {
  for (const t of [
    'Sim gostei', 'Amei! 💖', 'ADOREIIIIII!!!!!!', 'Ficou lindoooooo', 'ficou lindo', 'Ficou maravilhoso',
    'Maravilhosas', 'Nossa ele faz muito sucesso em casa ficou lindo', 'Amei, muito obrigada!',
    'gostei muito', 'ficou perfeito', 'Maravilha', 'muito bom'
  ]) assert.equal(ehElogioSimples(t), true, t);
});

test('ehElogioSimples: reclamação, pergunta, pedido novo ou texto longo NÃO casam', () => {
  for (const t of [
    'amei mas o vidro veio riscado', 'Não gostei muito', 'gostei, só que ficou torto',
    'Oi que maravilha. seria pedir muito uma foto?', 'ficou lindo, quanto fica outro igual?',
    'São maravilhosos. Ah, eu vou querer um de cada desses aí que você tá mandando.',
    'Maravilha, passo amanhã pra buscar', 'Eu vi um quadro na internet e amei, dai resolvi te mandar para ver se vc consegue fazer igual',
    'obrigada', 'ok', 'vamos ver', '🤍🤍🤍', '', null
  ]) assert.equal(ehElogioSimples(t), false, String(t));
});

test('montarConviteAvaliacao: agradece, convida e leva o link do Google', () => {
  const m = montarConviteAvaliacao();
  assert.ok(m.includes(LINK_AVALIACAO));
  assert.match(m, /gostou/i);
  assert.match(m, /Google/);
  assert.match(m, /rapidinho/);
});
