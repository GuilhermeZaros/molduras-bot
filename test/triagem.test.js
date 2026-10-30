import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFlag } from '../lib/modo.js';
import { semPreco, TOOLS_TRIAGEM } from '../lib/tools.js';

// lib/resumo.js -> lib/gemini.js exige GEMINI_API_KEY no import. Setar dummy antes de importar.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';
const { montarMensagemRelatorio } = await import('../lib/resumo.js');

// ---- parseFlag (modo.js) ----
test('parseFlag: liga pros valores esperados (ignora caixa e espaços)', () => {
  for (const v of ['true', 'TRUE', '1', 'sim', 'SIM', 'on', 'ligado', '  true  ']) {
    assert.equal(parseFlag(v), true, JSON.stringify(v));
  }
});
test('parseFlag: desliga pro resto (vazio/lixo/negativos)', () => {
  for (const v of ['', 'false', '0', 'nao', 'off', 'talvez', undefined, null]) {
    assert.equal(parseFlag(v), false, JSON.stringify(v));
  }
});

// ---- semPreco (tools.js) ----
// ATENÇÃO: os nomes dos campos têm que ser os REAIS que a API devolve (Catalogo.gs:
// buscarMolduras -> preco_metro; listarMateriais -> preco_m2). Um teste com nome inventado
// passaria com a defesa quebrada — foi exatamente o bug da 1ª versão.
test('semPreco: remove preco_metro e preco_m2 (nomes reais da API), preserva o resto', () => {
  const out = semPreco([
    { codigo: '060-116', nome: 'Preta', cor: 'preta', preco_metro: 25, largura_perfil_cm: 3 },
    { codigo: 'VID-001', nome: 'Incolor', preco_m2: 300 }
  ]);
  assert.equal(out[0].preco_metro, undefined);
  assert.equal(out[0].codigo, '060-116');
  assert.equal(out[0].cor, 'preta');
  assert.equal(out[0].largura_perfil_cm, 3);
  assert.equal(out[1].preco_m2, undefined);
  assert.equal(out[1].nome, 'Incolor');
});
test('semPreco: lista vazia/undefined não quebra', () => {
  assert.deepEqual(semPreco([]), []);
  assert.deepEqual(semPreco(undefined), []);
});

// ---- TOOLS_TRIAGEM (tools.js) ----
test('TOOLS_TRIAGEM: consulta + enviar_modelos + porta desenhos, mas sem foto de catálogo nem orçamento', () => {
  const nomes = TOOLS_TRIAGEM[0].functionDeclarations.map((d) => d.name).sort();
  assert.deepEqual(nomes, ['apresentar_porta_desenhos', 'buscar_molduras', 'enviar_modelos', 'listar_materiais']);
  for (const proibida of ['calcular_orcamento', 'enviar_foto']) {
    assert.equal(nomes.includes(proibida), false, proibida);
  }
});

// ---- montarMensagemRelatorio (resumo.js) ----
test('montarMensagemRelatorio: com relatório -> cabeçalho com nome+número + tópicos', () => {
  const m = montarMensagemRelatorio('5544999999999@s.whatsapp.net', 'Maria',
    '• O que quer: quadro\n• Tamanho: 60x70', null);
  assert.match(m, /📋 Novo pedido \(triagem\): Cliente Maria · 44 99999-9999/);
  assert.match(m, /O que quer: quadro/);
});
test('montarMensagemRelatorio: sem nome -> só o número (sem separador)', () => {
  const m = montarMensagemRelatorio('5544999999999@s.whatsapp.net', '', '• O que quer: quadro', null);
  assert.match(m, /Cliente 44 99999-9999/);
  assert.doesNotMatch(m, /·/);
});
test('montarMensagemRelatorio: relatório nulo -> cai na transcrição de fallback', () => {
  const m = montarMensagemRelatorio('5544999999999@s.whatsapp.net', 'Maria', null,
    'Cliente: quero moldura\nJulia: qual tamanho?');
  assert.match(m, /segue a conversa/);
  assert.match(m, /Cliente: quero moldura/);
});
test('montarMensagemRelatorio: sem relatório e sem conversa -> aviso mínimo', () => {
  const m = montarMensagemRelatorio('123@lid', '', null, '');
  assert.match(m, /Sem conteúdo para resumir/);
});
