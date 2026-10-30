import test from 'node:test';
import assert from 'node:assert/strict';

const MENSAGEM = 'Oi! 😊 Nós temos o costume de não enviar fotos dos quadros antes da retirada, porque gostamos que o cliente veja o resultado pessoalmente, já finalizado e preparado com todo carinho.';
const mensagens = await import('../lib/mensagens.js');

test('pedido de foto do quadro pronto recebe a mensagem definida pela loja', () => {
  const resposta = mensagens.respostaParaPedidoFotoQuadroPronto?.('Pode me mandar uma foto do quadro?');
  assert.equal(resposta, MENSAGEM);
});

test('pedido de fotos das molduras não usa a resposta de quadro pronto', () => {
  const resposta = mensagens.respostaParaPedidoFotoQuadroPronto?.('Pode me mandar fotos das molduras pretas?');
  assert.equal(resposta, null);
});

test('pedido para ver como ficou o quadro recebe a mensagem definida pela loja', () => {
  const resposta = mensagens.respostaParaPedidoFotoQuadroPronto?.('Tem como ver como ficou meu quadro antes de eu buscar?');
  assert.equal(resposta, MENSAGEM);
});

test('cliente enviando uma foto para fazer um quadro não ativa a resposta', () => {
  const resposta = mensagens.respostaParaPedidoFotoQuadroPronto?.('Vou mandar uma foto para fazer um quadro');
  assert.equal(resposta, null);
});

test('processarMensagem responde sem consultar o modelo', async () => {
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';
  const { genai } = await import('../lib/gemini.js');
  const { processarMensagem } = await import('../lib/bot.js');
  const original = genai.models.generateContent;
  let chamouModelo = false;
  genai.models.generateContent = async () => {
    chamouModelo = true;
    return { candidates: [{ content: { parts: [{ text: 'Resposta genérica' }] } }] };
  };

  try {
    const resultado = await processarMensagem([], 'Pode me mandar uma foto do quadro?', {});
    assert.equal(resultado.resposta, MENSAGEM);
    assert.equal(chamouModelo, false);
    assert.equal(resultado.historico.at(-1).parts[0].text, MENSAGEM);
  } finally {
    genai.models.generateContent = original;
  }
});
