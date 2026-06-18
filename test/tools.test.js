import test from 'node:test';
import assert from 'node:assert/strict';
import { semFotoUrl, extrairChamadasFotoTexto, extrairChamadasModelosTexto, textoTemChamadaDeFerramenta } from '../lib/tools.js';

test('textoTemChamadaDeFerramenta: detecta calcular_orcamento/buscar_molduras narrados', () => {
  assert.equal(textoTemChamadaDeFerramenta('[calcular_orcamento(altura_cm=35.7, largura_cm=27)]'), true);
  assert.equal(textoTemChamadaDeFerramenta('buscar_molduras(cor="preto")'), true);
});
test('textoTemChamadaDeFerramenta: texto normal nao dispara', () => {
  assert.equal(textoTemChamadaDeFerramenta('Com vidro R$ 100, sem vidro R$ 70. Qual prefere?'), false);
});

// Rede de segurança do enviar_modelos: o modelo às vezes escreve [enviar_modelos tipo="X"] como texto.
test('extrairChamadasModelosTexto: pega [enviar_modelos tipo="certificado"] e limpa o texto', () => {
  const r = extrairChamadasModelosTexto('[enviar_modelos tipo="certificado"]\n\nMe diz o número (1, 2 ou 3) 👍');
  assert.deepEqual(r.tipos, ['certificado']);
  assert.equal(r.texto, 'Me diz o número (1, 2 ou 3) 👍');
  assert.equal(/enviar_modelos|\[/.test(r.texto), false);
});
test('extrairChamadasModelosTexto: com parenteses e aspas simples', () => {
  const r = extrairChamadasModelosTexto("Oi! enviar_modelos(tipo='camiseta') tudo bem?");
  assert.deepEqual(r.tipos, ['camiseta']);
});
test('extrairChamadasModelosTexto: texto normal nao muda', () => {
  const r = extrairChamadasModelosTexto('Com vidro R$ 100, sem vidro R$ 70.');
  assert.deepEqual(r.tipos, []);
  assert.equal(r.texto, 'Com vidro R$ 100, sem vidro R$ 70.');
});

// Rede de segurança: se o modelo ESCREVER a chamada da tool como texto
// (ex: [enviar_foto(moldura_id="X", legenda="Y")]), a gente detecta, executa e tira do texto.
test('extrairChamadasFotoTexto: extrai 3 chamadas e limpa o texto', () => {
  const txt = [
    '[enviar_foto(moldura_id="060-116", legenda="Clássica preta lisa, fica perfeita! ✨")]',
    '[enviar_foto(moldura_id="160-RM9", legenda="Madeira aconchegante.")]',
    '',
    'enviar_foto(moldura_id="066-R315", legenda="Madeira mais clara, moderna.")',
    '',
    'O que você quer emoldurar? Me conta o tamanho! 👍'
  ].join('\n');
  const r = extrairChamadasFotoTexto(txt);
  assert.equal(r.fotos.length, 3);
  assert.equal(r.fotos[0].moldura_id, '060-116');
  assert.equal(r.fotos[0].legenda, 'Clássica preta lisa, fica perfeita! ✨');
  assert.equal(r.fotos[2].moldura_id, '066-R315');
  assert.equal(r.texto, 'O que você quer emoldurar? Me conta o tamanho! 👍');
  assert.equal(/enviar_foto|\[/.test(r.texto), false);
});
test('extrairChamadasFotoTexto: aspas simples e sem legenda', () => {
  const r = extrairChamadasFotoTexto("Oi! enviar_foto(moldura_id='MOL-9') tudo bem?");
  assert.equal(r.fotos.length, 1);
  assert.equal(r.fotos[0].moldura_id, 'MOL-9');
  assert.equal(r.fotos[0].legenda, '');
});
test('extrairChamadasFotoTexto: texto normal não muda', () => {
  const r = extrairChamadasFotoTexto('Com vidro R$ 100, sem vidro R$ 70. O que acha?');
  assert.equal(r.fotos.length, 0);
  assert.equal(r.texto, 'Com vidro R$ 100, sem vidro R$ 70. O que acha?');
});

// O modelo NÃO deve receber a foto_url (senão ele cola o link no texto pro cliente).
// A foto é enviada pela tool enviar_foto, que busca a URL no servidor por código.
test('semFotoUrl: remove foto_url de cada moldura', () => {
  const out = semFotoUrl([
    { codigo: 'MOL-1', nome: 'X', preco_metro: 10, foto_url: 'https://drive.google.com/thumbnail?id=abc' }
  ]);
  assert.equal(out[0].foto_url, undefined);
  assert.equal(out[0].codigo, 'MOL-1');
  assert.equal(out[0].nome, 'X');
  assert.equal(out[0].preco_metro, 10);
});
test('semFotoUrl: lista vazia/undefined não quebra', () => {
  assert.deepEqual(semFotoUrl([]), []);
  assert.deepEqual(semFotoUrl(undefined), []);
});
