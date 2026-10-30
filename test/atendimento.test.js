import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import {
  detectarDespedida, detectarAceiteDeAviso, equipeFalouRecente,
  avaliarAtendimento, CONFIG_PADRAO,
  avaliarToque, horaUtil, montarMensagemToque,
  lerAtendimentos, gravarAtendimentos, verificarAtendimentos, atendimentoSoDaEquipe
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
test('detectarDespedida: respostas curtas de fechamento (ok/blz/beleza/tá bom) -> true', () => {
  for (const t of ['ok', 'OK', 'Ok 👍', 'ok!', 'blz', 'BLZ', 'beleza', 'Beleza.',
                   'tá bom', 'ta bom', 'está bom', 'tá certo', 'tudo bem', 'tudo certo',
                   'combinado', 'fechado', 'aguardo', 'vou aguardar', 'okay']) {
    assert.equal(detectarDespedida(t), true, t);
  }
});
test('detectarDespedida: frases de aguardo -> true', () => {
  for (const t of ['estarei no aguardo', 'fico no aguardo então', 'no aguardo então!',
                   'aguardo o retorno da equipe']) {
    assert.equal(detectarDespedida(t), true, t);
  }
});
test('detectarDespedida: NÃO cai em falso positivo com "ok/beleza/ta bom" no meio de dúvidas', () => {
  for (const t of ['ok isso é caro?', 'acho ok mas quero saber o prazo',
                   'beleza isso mas e o vidro?', 'não está bom pra mim',
                   'acho que está bom o preço mas queria ver outra opção',
                   'não tá certo esse valor', 'não tá tudo bem não']) {
    assert.equal(detectarDespedida(t), false, t);
  }
});

// ---- detectarAceiteDeAviso ----
test('detectarAceiteDeAviso: agradecimentos ao aviso (equipe falou de quadro pronto)', () => {
  for (const t of ['obrigada!', 'ok', 'Ok 👍', 'beleza', 'blz', 'tá bom', 'perfeito',
                   'Ah que ótimo!', 'que bom!', 'que boa notícia', 'ótimo saber',
                   'certinho', 'tranquilo', 'joia', 'combinado', 'fechado']) {
    assert.equal(detectarAceiteDeAviso(t), true, t);
  }
});
test('detectarAceiteDeAviso: cliente disse que está indo pegar', () => {
  for (const t of ['vou passar aí depois', 'vou pegar amanhã', 'estou indo', 'já to indo',
                   'já to a caminho', 'estou a caminho', 'chegando aí', 'passo aí mais tarde',
                   'já vou pra aí', 'passo amanhã de manhã']) {
    assert.equal(detectarAceiteDeAviso(t), true, t);
  }
});
test('detectarAceiteDeAviso: pergunta real NÃO é aceite (Julia ainda responde)', () => {
  for (const t of ['posso passar amanhã?', 'que horas fecha hoje?', 'quanto ficou?',
                   'aceita cartão?', 'onde fica a loja?', 'tem que pagar antes?',
                   'quanto custa a moldura?', 'até que horas atende?']) {
    assert.equal(detectarAceiteDeAviso(t), false, t);
  }
});
test('detectarAceiteDeAviso: msg vazia -> false', () => {
  assert.equal(detectarAceiteDeAviso(''), false);
  assert.equal(detectarAceiteDeAviso(null), false);
});

// ---- equipeFalouRecente ----
const cfgEq = { EQUIPE_RECENTE_MS: 30 * 60 * 1000 };
test('equipeFalouRecente: sem marca -> false', () => {
  assert.equal(equipeFalouRecente({}, Date.now(), cfgEq), false);
  assert.equal(equipeFalouRecente(null, Date.now(), cfgEq), false);
});
test('equipeFalouRecente: falou há 10min -> true', () => {
  const meta = { ultimaMensagemEquipe: 1_000_000 };
  assert.equal(equipeFalouRecente(meta, 1_000_000 + 10 * 60 * 1000, cfgEq), true);
});
test('equipeFalouRecente: falou há 31min -> false (janela expirou)', () => {
  const meta = { ultimaMensagemEquipe: 1_000_000 };
  assert.equal(equipeFalouRecente(meta, 1_000_000 + 31 * 60 * 1000, cfgEq), false);
});
test('equipeFalouRecente com CONFIG_PADRAO: equipe assumiu -> muda por 1h30, depois volta', () => {
  const MIN = 60 * 1000;
  const meta = { ultimaMensagemEquipe: 1_000_000 };
  assert.equal(equipeFalouRecente(meta, 1_000_000 + 80 * MIN, CONFIG_PADRAO), true);   // 1h20: ainda muda
  assert.equal(equipeFalouRecente(meta, 1_000_000 + 100 * MIN, CONFIG_PADRAO), false); // 1h40: Julia volta
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

// ---- avaliarToque / horaUtil / montarMensagemToque ----
const cfgT = { TOQUE_MS: 36 * 60 * min }; // 36h
test('avaliarToque: sumiu >= 36h, sem despedida, não tocou -> true', () => {
  assert.equal(avaliarToque({ ultimaAtividade: 0, despedida: false, toqueEnviado: false }, 37 * 60 * min, cfgT), true);
});
test('avaliarToque: sumiu < 36h -> false', () => {
  assert.equal(avaliarToque({ ultimaAtividade: 0, despedida: false, toqueEnviado: false }, 35 * 60 * min, cfgT), false);
});
test('avaliarToque: já tocou -> false (não repete o toque)', () => {
  assert.equal(avaliarToque({ ultimaAtividade: 0, despedida: false, toqueEnviado: true }, 40 * 60 * min, cfgT), false);
});
test('avaliarToque: cliente se despediu -> false (não é "sumiço")', () => {
  assert.equal(avaliarToque({ ultimaAtividade: 0, despedida: true, toqueEnviado: false }, 40 * 60 * min, cfgT), false);
});
test('horaUtil: dentro de [8,18) -> true; madrugada/fora -> false', () => {
  assert.equal(horaUtil(8, 8, 18), true);
  assert.equal(horaUtil(13, 8, 18), true);
  assert.equal(horaUtil(17, 8, 18), true);
  assert.equal(horaUtil(18, 8, 18), false); // teto exclusivo
  assert.equal(horaUtil(7, 8, 18), false);
  assert.equal(horaUtil(3, 8, 18), false);  // madrugada
});
test('montarMensagemToque: mensagem gentil e sem emoji de coração', () => {
  const m = montarMensagemToque();
  assert.match(m, /interesse|dúvida/);
  assert.doesNotMatch(m, /❤️|🩷|💛/);
});

// ---- CONFIG_PADRAO ----
test('CONFIG_PADRAO: valores acordados (3h / 5min / 72h / 5min / 36h / 8-18h / 1h30 equipe)', () => {
  assert.equal(CONFIG_PADRAO.SILENCIO_MS, 3 * 60 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.FOLGA_DESPEDIDA_MS, 5 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.ESQUECER_MS, 72 * 60 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.VARREDURA_MS, 5 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.TOQUE_MS, 36 * 60 * 60 * 1000);
  assert.equal(CONFIG_PADRAO.TOQUE_HORA_INICIO, 8);
  assert.equal(CONFIG_PADRAO.TOQUE_HORA_FIM, 18);
  assert.equal(CONFIG_PADRAO.EQUIPE_RECENTE_MS, 90 * 60 * 1000);
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
  const chamadas = { enviadas: [], encerrados: [], esquecidos: [], toques: [] };
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
    marcarToque: (jid) => chamadas.toques.push(jid),
    agora: opts.agora ?? T0,
    // Janela de horário 0..24 no teste: horaUtil sempre true (independe do fuso da máquina).
    cfg: { SILENCIO_MS: 3 * H, FOLGA_DESPEDIDA_MS: 5 * 60 * 1000, ESQUECER_MS: 72 * H,
           TOQUE_MS: 36 * H, TOQUE_HORA_INICIO: 0, TOQUE_HORA_FIM: 24 },
    numeroResumo: '44999999999',
    log: () => {}
  };
  return { deps, chamadas };
}

const ativoSilencio = () => ({ ultimaAtividade: T0 - 4 * H, despedida: false, fimAtendimento: null, resumoEnviado: false });
const encerradoVencido = () => ({ ultimaAtividade: T0 - 80 * H, despedida: false, fimAtendimento: T0 - 73 * H, resumoEnviado: true });
// Sumiu há 40h (>=36h), atendimento já encerrado (resumo saiu em 3h) mas < 72h após o fim.
const sumido36h = () => ({ ultimaAtividade: T0 - 40 * H, despedida: false, fimAtendimento: T0 - 37 * H, resumoEnviado: true, toqueEnviado: false });

test('verificarAtendimentos: cliente sumido >=36h em horário útil -> toca o PRÓPRIO cliente, marca, não encerra/esquece', async () => {
  const metas = { 'h@s.whatsapp.net': sumido36h() };
  const { deps, chamadas } = fakesAtend(metas);
  const r = await verificarAtendimentos(deps);
  assert.equal(r.toques, 1);
  assert.deepEqual(chamadas.toques, ['h@s.whatsapp.net']);
  assert.equal(chamadas.enviadas.length, 1);
  assert.equal(chamadas.enviadas[0].jid, 'h@s.whatsapp.net'); // vai pro cliente, não pro dono
  assert.match(chamadas.enviadas[0].texto, /interesse|dúvida/);
  assert.equal(r.encerrados, 0);
  assert.equal(r.esquecidos, 0);
});

test('verificarAtendimentos: sumido >=36h mas FORA do horário -> não toca', async () => {
  const metas = { 'i@s.whatsapp.net': sumido36h() };
  const { deps, chamadas } = fakesAtend(metas);
  deps.cfg = { ...deps.cfg, TOQUE_HORA_INICIO: 0, TOQUE_HORA_FIM: 0 }; // janela vazia
  const r = await verificarAtendimentos(deps);
  assert.equal(r.toques, 0);
  assert.equal(chamadas.enviadas.length, 0);
});

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

test('atendimentoSoDaEquipe: nasce encerrado (sem relatório) e é esquecido em 72h', () => {
  const meta = atendimentoSoDaEquipe(T0);
  assert.deepEqual(avaliarAtendimento(meta, T0 + 5 * H, CONFIG_PADRAO), { encerrar: false, esquecer: false });
  assert.equal(avaliarAtendimento(meta, T0 + 73 * H, CONFIG_PADRAO).esquecer, true);
});

test('verificarAtendimentos: conversa em que só a equipe falou não manda relatório pro dono', async () => {
  const metas = { 'z@s.whatsapp.net': { ...atendimentoSoDaEquipe(T0 - 4 * H), ultimaMensagemEquipe: T0 - 4 * H } };
  const { deps, chamadas } = fakesAtend(metas, { conversa: [] });
  const r = await verificarAtendimentos(deps);
  assert.equal(r.encerrados, 0);
  assert.equal(chamadas.enviadas.length, 0);
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
