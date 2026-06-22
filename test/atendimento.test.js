import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import {
  detectarDespedida, avaliarAtendimento, CONFIG_PADRAO,
  lerAtendimentos, gravarAtendimentos, verificarAtendimentos
} from '../lib/atendimento.js';

// lib/gemini.js exige GEMINI_API_KEY no import. Setar um dummy antes de importar resumo.js.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';

const { extrairDialogo, formatarNumero, montarMensagemResumo, gerarResumo } = await import('../lib/resumo.js');

// ---- extrairDialogo ----
test('extrairDialogo: monta Cliente/Julia só do texto, ignora tool parts', () => {
  const hist = [
    { role: 'user', parts: [{ text: 'quero uma moldura 60x90' }] },
    { role: 'model', parts: [{ functionCall: { name: 'buscar_molduras', args: {} } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'buscar_molduras', response: {} } }] },
    { role: 'model', parts: [{ text: 'achei estas opções' }] }
  ];
  assert.equal(extrairDialogo(hist), 'Cliente: quero uma moldura 60x90\nJulia: achei estas opções');
});
test('extrairDialogo: histórico vazio -> string vazia', () => {
  assert.equal(extrairDialogo([]), '');
  assert.equal(extrairDialogo(null), '');
});
test('extrairDialogo: junta várias partes de texto do mesmo turno com espaço', () => {
  const hist = [{ role: 'user', parts: [{ text: 'oi' }, { text: 'quero uma moldura' }] }];
  assert.equal(extrairDialogo(hist), 'Cliente: oi quero uma moldura');
});

// ---- formatarNumero ----
test('formatarNumero: celular BR com DDI vira "DD 9XXXX-XXXX"', () => {
  assert.equal(formatarNumero('5544999999999@s.whatsapp.net'), '44 99999-9999');
});
test('formatarNumero: fixo (10 dígitos) vira "DD XXXX-XXXX"', () => {
  assert.equal(formatarNumero('554433334444@s.whatsapp.net'), '44 3333-4444');
});
test('formatarNumero: jid sem telefone real (@lid) degrada sem quebrar', () => {
  assert.equal(formatarNumero('123456789@lid'), '123456789');
});

// ---- montarMensagemResumo ----
test('montarMensagemResumo: com resumo -> cabeçalho + parágrafo', () => {
  const m = montarMensagemResumo('5544999999999@s.whatsapp.net', 'Cliente queria moldura 60x90, orçamento R$ 200.');
  assert.match(m, /📝 Cliente 44 99999-9999:/);
  assert.match(m, /orçamento R\$ 200/);
});
test('montarMensagemResumo: resumo nulo -> mensagem de fallback', () => {
  const m = montarMensagemResumo('5544999999999@s.whatsapp.net', null);
  assert.match(m, /Atendimento encerrado com o cliente 44 99999-9999/);
  assert.match(m, /Não consegui gerar o resumo/);
});

// ---- gerarResumo ----
test('gerarResumo: histórico sem diálogo -> null sem chamar a API', async () => {
  assert.equal(await gerarResumo([]), null);
  assert.equal(await gerarResumo(null), null);
});

// ---- detectarDespedida ----
test('detectarDespedida: fechamentos comuns -> true', () => {
  for (const t of ['obrigado!', 'Obrigada', 'valeu', 'vlw', 'tchau', 'flw',
                   'era só isso', 'era isso mesmo', 'até mais', 'falou']) {
    assert.equal(detectarDespedida(t), true, t);
  }
});
test('detectarDespedida: pergunta/saudação normal -> false', () => {
  for (const t of ['qual o valor?', 'bom dia', 'quero uma moldura', '']) {
    assert.equal(detectarDespedida(t), false, t);
  }
});
test('detectarDespedida: não confunde reclamação/pedido com fechamento', () => {
  for (const t of ['não era isso que eu pedi', 'agradeceria uma resposta']) {
    assert.equal(detectarDespedida(t), false, t);
  }
});

// ---- avaliarAtendimento ----
const cfg = { SILENCIO_MS: 10800000, FOLGA_DESPEDIDA_MS: 300000, ESQUECER_MS: 259200000 };
const min = 60000;
test('avaliarAtendimento: ativo, silêncio < 3h, sem despedida -> nada', () => {
  const meta = { ultimaAtividade: 100 * min, despedida: false, fimAtendimento: null };
  const r = avaliarAtendimento(meta, 100 * min + 60 * min, cfg); // 1h depois
  assert.equal(r.encerrar, false);
  assert.equal(r.esquecer, false);
});
test('avaliarAtendimento: ativo, silêncio >= 3h -> encerrar', () => {
  const meta = { ultimaAtividade: 0, despedida: false, fimAtendimento: null };
  assert.equal(avaliarAtendimento(meta, 181 * min, cfg).encerrar, true); // 3h01
});
test('avaliarAtendimento: ativo, despedida, folga < 5min -> nada', () => {
  const meta = { ultimaAtividade: 0, despedida: true, fimAtendimento: null };
  assert.equal(avaliarAtendimento(meta, 2 * min, cfg).encerrar, false);
});
test('avaliarAtendimento: ativo, despedida, folga >= 5min -> encerrar', () => {
  const meta = { ultimaAtividade: 0, despedida: true, fimAtendimento: null };
  assert.equal(avaliarAtendimento(meta, 6 * min, cfg).encerrar, true);
});
test('avaliarAtendimento: encerrado < 72h -> não esquece', () => {
  const meta = { ultimaAtividade: 0, despedida: false, fimAtendimento: 0 };
  const r = avaliarAtendimento(meta, 71 * 60 * min, cfg); // 71h
  assert.equal(r.encerrar, false);
  assert.equal(r.esquecer, false);
});
test('avaliarAtendimento: encerrado >= 72h -> esquecer', () => {
  const meta = { ultimaAtividade: 0, despedida: false, fimAtendimento: 0 };
  assert.equal(avaliarAtendimento(meta, 73 * 60 * min, cfg).esquecer, true);
});

// ---- CONFIG_PADRAO ----
test('CONFIG_PADRAO: valores acordados (3h / 5min / 72h / 5min)', () => {
  assert.equal(CONFIG_PADRAO.SILENCIO_MS, 3 * 60 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.FOLGA_DESPEDIDA_MS, 5 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.ESQUECER_MS, 72 * 60 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.VARREDURA_MS, 5 * 60 * 1000);
});

// ---- persistência (round-trip) ----
test('lerAtendimentos/gravarAtendimentos: round-trip; arquivo ausente -> {}', () => {
  const caminho = path.join(tmpdir(), `atend-test-${Date.now()}.json`);
  try {
    assert.deepEqual(lerAtendimentos(caminho), {});
    const dados = { 'x@s.whatsapp.net': { ultimaAtividade: 5, despedida: true, fimAtendimento: null, resumoEnviado: false } };
    gravarAtendimentos(dados, caminho);
    assert.deepEqual(lerAtendimentos(caminho), dados);
  } finally {
    rmSync(caminho, { force: true });
  }
});

// ---- verificarAtendimentos (orquestração) ----
const T0 = 1_000_000_000; // base de tempo arbitrária (ms)
const H = 60 * 60 * 1000; // 1 hora

function fakesAtend(metas, opts = {}) {
  const chamadas = { enviadas: [], encerrados: [], esquecidos: [] };
  const deps = {
    listarAtendimentos: () => metas,
    lerConversa: (jid) => opts.conversa || [{ role: 'user', parts: [{ text: 'oi' }] }],
    gerarResumo: async () => {
      if (opts.gerarThrow) throw new Error('gemini caiu');
      return opts.resumo === undefined ? 'resumo do atendimento' : opts.resumo;
    },
    onWhatsApp: async () => (opts.semDestino ? null : '5544999999999@s.whatsapp.net'),
    enviar: async (jid, texto) => {
      if (opts.falhaEnvio) throw new Error('rede caiu');
      chamadas.enviadas.push({ jid, texto });
    },
    encerrar: (jid) => chamadas.encerrados.push(jid),
    esquecer: (jid) => chamadas.esquecidos.push(jid),
    agora: opts.agora ?? T0,
    cfg: { SILENCIO_MS: 3 * H, FOLGA_DESPEDIDA_MS: 5 * 60 * 1000, ESQUECER_MS: 72 * H },
    numeroResumo: '44999999999',
    log: () => {}
  };
  return { deps, chamadas };
}

const ativoSilencio = () => ({ ultimaAtividade: T0 - 4 * H, despedida: false, fimAtendimento: null, resumoEnviado: false });
const encerradoVencido = () => ({ ultimaAtividade: T0 - 80 * H, despedida: false, fimAtendimento: T0 - 73 * H, resumoEnviado: true });

test('verificarAtendimentos: ativo+silêncio>=3h -> envia resumo ao destino e encerra', async () => {
  const metas = { 'a@s.whatsapp.net': ativoSilencio() };
  const { deps, chamadas } = fakesAtend(metas);
  const r = await verificarAtendimentos(deps);
  assert.equal(r.encerrados, 1);
  assert.equal(chamadas.enviadas.length, 1);
  assert.equal(chamadas.enviadas[0].jid, '5544999999999@s.whatsapp.net');
  assert.match(chamadas.enviadas[0].texto, /resumo do atendimento/);
  assert.deepEqual(chamadas.encerrados, ['a@s.whatsapp.net']);
});

test('verificarAtendimentos: encerrado>=72h -> esquece e não envia', async () => {
  const metas = { 'b@s.whatsapp.net': encerradoVencido() };
  const { deps, chamadas } = fakesAtend(metas);
  const r = await verificarAtendimentos(deps);
  assert.equal(r.esquecidos, 1);
  assert.equal(chamadas.enviadas.length, 0);
  assert.deepEqual(chamadas.esquecidos, ['b@s.whatsapp.net']);
});

test('verificarAtendimentos: ativo recente -> não faz nada', async () => {
  const metas = { 'c@s.whatsapp.net': { ultimaAtividade: T0 - 60000, despedida: false, fimAtendimento: null, resumoEnviado: false } };
  const { deps, chamadas } = fakesAtend(metas);
  const r = await verificarAtendimentos(deps);
  assert.equal(r.encerrados, 0);
  assert.equal(r.esquecidos, 0);
  assert.equal(chamadas.enviadas.length, 0);
});

test('verificarAtendimentos: gerarResumo falha -> manda fallback e ainda encerra', async () => {
  const metas = { 'd@s.whatsapp.net': ativoSilencio() };
  const { deps, chamadas } = fakesAtend(metas, { gerarThrow: true });
  const r = await verificarAtendimentos(deps);
  assert.equal(r.encerrados, 1);
  assert.match(chamadas.enviadas[0].texto, /Não consegui gerar o resumo/);
});

test('verificarAtendimentos: envio falha -> NÃO encerra (tenta de novo depois)', async () => {
  const metas = { 'e@s.whatsapp.net': ativoSilencio() };
  const { deps, chamadas } = fakesAtend(metas, { falhaEnvio: true });
  const r = await verificarAtendimentos(deps);
  assert.equal(r.encerrados, 0);
  assert.equal(chamadas.encerrados.length, 0);
});

test('verificarAtendimentos: destino fora do WhatsApp -> não envia, mas ainda esquece os vencidos', async () => {
  const metas = {
    'f@s.whatsapp.net': ativoSilencio(),      // encerraria
    'g@s.whatsapp.net': encerradoVencido()    // esquece
  };
  const { deps, chamadas } = fakesAtend(metas, { semDestino: true });
  const r = await verificarAtendimentos(deps);
  assert.equal(chamadas.enviadas.length, 0);
  assert.equal(r.encerrados, 0);
  assert.deepEqual(chamadas.esquecidos, ['g@s.whatsapp.net']);
});
