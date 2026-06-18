import test from 'node:test';
import assert from 'node:assert/strict';
// gemini.js exige GEMINI_API_KEY no import; nos testes puros não chamamos a API.
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-dummy';
const g = await import('../lib/midia.js');

test('classificarMensagem: texto simples (conversation)', () => {
  const r = g.classificarMensagem({ message: { conversation: 'oi' } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'oi');
});
test('classificarMensagem: texto estendido', () => {
  const r = g.classificarMensagem({ message: { extendedTextMessage: { text: 'tudo bem?' } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'tudo bem?');
});
test('classificarMensagem: imagem com legenda', () => {
  const r = g.classificarMensagem({ message: { imageMessage: { caption: 'esse aqui' } } });
  assert.equal(r.tipo, 'imagem');
  assert.equal(r.legenda, 'esse aqui');
});
test('classificarMensagem: imagem sem legenda', () => {
  const r = g.classificarMensagem({ message: { imageMessage: {} } });
  assert.equal(r.tipo, 'imagem');
  assert.equal(r.legenda, '');
});
test('classificarMensagem: áudio (voz/ptt)', () => {
  const r = g.classificarMensagem({ message: { audioMessage: { ptt: true } } });
  assert.equal(r.tipo, 'audio');
});
test('classificarMensagem: figurinha → outro', () => {
  assert.equal(g.classificarMensagem({ message: { stickerMessage: {} } }).tipo, 'outro');
});
test('classificarMensagem: sem mensagem → vazio', () => {
  assert.equal(g.classificarMensagem({}).tipo, 'vazio');
});
test('parteInline: vira inlineData base64 + mime', () => {
  const p = g.parteInline(Buffer.from('abc'), 'image/jpeg');
  assert.deepEqual(p, { inlineData: { mimeType: 'image/jpeg', data: 'YWJj' } }); // 'abc' -> YWJj
});
