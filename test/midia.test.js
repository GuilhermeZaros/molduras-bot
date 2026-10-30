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
test('classificarMensagem: texto embrulhado em ephemeralMessage', () => {
  const r = g.classificarMensagem({ message: { ephemeralMessage: { message: { conversation: 'oi' } } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'oi');
});
test('classificarMensagem: texto embrulhado em viewOnceMessage', () => {
  const r = g.classificarMensagem({ message: { viewOnceMessage: { message: { extendedTextMessage: { text: 'tudo bem?' } } } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'tudo bem?');
});
test('classificarMensagem: texto embrulhado em viewOnceMessageV2', () => {
  const r = g.classificarMensagem({ message: { viewOnceMessageV2: { message: { conversation: 'oi' } } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'oi');
});
test('classificarMensagem: imagem embrulhada em ephemeralMessage', () => {
  const r = g.classificarMensagem({ message: { ephemeralMessage: { message: { imageMessage: { caption: 'esse' } } } } });
  assert.equal(r.tipo, 'imagem');
  assert.equal(r.legenda, 'esse');
});
test('classificarMensagem: resposta a botão vira texto', () => {
  const r = g.classificarMensagem({ message: { buttonsResponseMessage: { selectedDisplayText: 'Sim', selectedButtonId: 'btn_yes' } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'Sim');
});
test('classificarMensagem: botão sem texto cai no id', () => {
  const r = g.classificarMensagem({ message: { buttonsResponseMessage: { selectedButtonId: 'btn_yes' } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'btn_yes');
});
test('classificarMensagem: resposta a template button vira texto', () => {
  const r = g.classificarMensagem({ message: { templateButtonReplyMessage: { selectedDisplayText: 'Certificado' } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'Certificado');
});
test('classificarMensagem: resposta a lista vira texto (title)', () => {
  const r = g.classificarMensagem({ message: { listResponseMessage: { title: 'Camiseta' } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'Camiseta');
});
test('classificarMensagem: resposta a lista sem title cai no selectedRowId', () => {
  const r = g.classificarMensagem({ message: { listResponseMessage: { singleSelectReply: { selectedRowId: 'row_1' } } } });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'row_1');
});
test('classificarMensagem: extendedTextMessage vindo de anúncio (com contextInfo) ainda vira texto', () => {
  const r = g.classificarMensagem({
    message: {
      extendedTextMessage: {
        text: 'Olá! Gostaria de trocar a moldura do meu quadro.',
        contextInfo: { externalAdReply: { title: 'Anúncio do Facebook', sourceUrl: 'https://fb.me/x' } }
      }
    }
  });
  assert.equal(r.tipo, 'texto');
  assert.equal(r.texto, 'Olá! Gostaria de trocar a moldura do meu quadro.');
});
test('mensagemInterna: desembrulha ephemeral aninhado em viewOnce', () => {
  const inner = { conversation: 'oi' };
  const wrapped = { viewOnceMessage: { message: { ephemeralMessage: { message: inner } } } };
  assert.equal(g.mensagemInterna(wrapped), inner);
});
test('mensagemInterna: msg sem envelope volta ela mesma', () => {
  const m = { conversation: 'oi' };
  assert.equal(g.mensagemInterna(m), m);
});
test('mensagemInterna: null/undefined → null', () => {
  assert.equal(g.mensagemInterna(null), null);
  assert.equal(g.mensagemInterna(undefined), null);
});
test('textoCitado: devolve o texto da mensagem que o cliente citou', () => {
  const citandoTexto = {
    message: {
      extendedTextMessage: {
        text: 'quero o 15x21',
        contextInfo: { stanzaId: 'ABC', quotedMessage: { conversation: 'COMEÇOU A SEMANA DO PORTA-RETRATO!' } }
      }
    }
  };
  assert.equal(g.textoCitado(citandoTexto), 'COMEÇOU A SEMANA DO PORTA-RETRATO!');
  const citandoFoto = {
    message: {
      ephemeralMessage: {
        message: {
          extendedTextMessage: {
            text: 'tem preto?',
            contextInfo: { quotedMessage: { imageMessage: { caption: 'Semana do Porta-Retrato' } } }
          }
        }
      }
    }
  };
  assert.equal(g.textoCitado(citandoFoto), 'Semana do Porta-Retrato');
  const citandoLongo = {
    message: {
      extendedTextMessage: { text: 'oi', contextInfo: { quotedMessage: { extendedTextMessage: { text: 'texto longo' } } } }
    }
  };
  assert.equal(g.textoCitado(citandoLongo), 'texto longo');
});
test('textoCitado: sem citação devolve vazio', () => {
  assert.equal(g.textoCitado({ message: { conversation: 'oi' } }), '');
  assert.equal(g.textoCitado({ message: { extendedTextMessage: { text: 'oi', contextInfo: { externalAdReply: {} } } } }), '');
  assert.equal(g.textoCitado({}), '');
  assert.equal(g.textoCitado(null), '');
});
test('classificarMensagem: arquivo (documento) com nome, tipo e legenda', () => {
  const r = g.classificarMensagem({ message: { documentMessage: { fileName: 'IMG_2031.jpg', mimetype: 'image/jpeg', caption: 'essa aqui' } } });
  assert.deepEqual(r, { tipo: 'documento', nome: 'IMG_2031.jpg', mime: 'image/jpeg', legenda: 'essa aqui' });
});
test('classificarMensagem: arquivo com legenda embrulhado em documentWithCaptionMessage', () => {
  const r = g.classificarMensagem({ message: { documentWithCaptionMessage: { message: { documentMessage: { fileName: 'foto.png', mimetype: 'image/png', caption: 'imprime 20x30' } } } } });
  assert.equal(r.tipo, 'documento');
  assert.equal(r.nome, 'foto.png');
  assert.equal(r.legenda, 'imprime 20x30');
});
test('descreverArquivo: o que a Julia lê quando chega um arquivo', () => {
  assert.equal(g.descreverArquivo({ tipo: 'documento', nome: 'IMG_2031.jpg', mime: 'image/jpeg', legenda: '' }), '[Cliente enviou um arquivo: IMG_2031.jpg (imagem)]');
  assert.equal(g.descreverArquivo({ tipo: 'documento', nome: 'diploma.pdf', mime: 'application/pdf', legenda: 'esse' }), '[Cliente enviou um arquivo: diploma.pdf (PDF)] Legenda do cliente: "esse"');
  assert.equal(g.descreverArquivo({ tipo: 'documento', nome: '', mime: 'image/heic', legenda: '' }), '[Cliente enviou um arquivo (imagem)]');
  assert.equal(g.descreverArquivo({ tipo: 'documento', nome: 'planilha.xlsx', mime: 'application/vnd.ms-excel', legenda: '' }), '[Cliente enviou um arquivo: planilha.xlsx]');
});
test('parteInline: vira inlineData base64 + mime', () => {
  const p = g.parteInline(Buffer.from('abc'), 'image/jpeg');
  assert.deepEqual(p, { inlineData: { mimeType: 'image/jpeg', data: 'YWJj' } }); // 'abc' -> YWJj
});
