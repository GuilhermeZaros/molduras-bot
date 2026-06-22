import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import {
  detectarDespedida, avaliarAtendimento, CONFIG_PADRAO,
  lerAtendimentos, gravarAtendimentos
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
