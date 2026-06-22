import test from 'node:test';
import assert from 'node:assert/strict';

// lib/gemini.js exige GEMINI_API_KEY no import. Setar um dummy antes de importar resumo.js.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';

const { extrairDialogo, formatarNumero, montarMensagemResumo } = await import('../lib/resumo.js');

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
