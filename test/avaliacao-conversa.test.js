import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';
const { genai } = await import('../lib/gemini.js');
const { processarMensagem } = await import('../lib/bot.js');
const { LINK_AVALIACAO, montarConviteAvaliacao } = await import('../lib/avaliacao.js');

const BLOCO = '[CONTEXTO DO SISTEMA: teste]\n[terça, 22/09/2026, 17:20] você (mensagem automática): Gostou do seu quadro?\n[FIM DO CONTEXTO: teste]';

async function comModeloFalso(fn) {
  const original = genai.models.generateContent;
  const chamadas = [];
  genai.models.generateContent = async (params) => {
    chamadas.push({ ...params, contents: [...params.contents] });
    return { candidates: [{ content: { parts: [{ text: 'Resposta do modelo' }] } }] };
  };
  try {
    return await fn(chamadas);
  } finally {
    genai.models.generateContent = original;
  }
}

test('elogio logo depois do pedido de avaliação: convite fixo com o link, sem chamar o modelo', async () => {
  await comModeloFalso(async (chamadas) => {
    const r = await processarMensagem([], 'Sim gostei', { antes: BLOCO, aguardandoAvaliacao: true });
    assert.equal(r.resposta, montarConviteAvaliacao());
    assert.ok(r.resposta.includes(LINK_AVALIACAO));
    assert.equal(chamadas.length, 0);
    assert.equal(r.historico.at(-1).role, 'model');
    assert.equal(r.historico.at(-1).parts[0].text, r.resposta);
  });
});

test('o contexto entra ANTES do carimbo na mensagem do cliente e fica no histórico', async () => {
  await comModeloFalso(async () => {
    const r = await processarMensagem([], 'Sim gostei', { antes: BLOCO, aguardandoAvaliacao: true });
    const turnoCliente = r.historico.at(-2);
    assert.equal(turnoCliente.role, 'user');
    assert.ok(turnoCliente.parts[0].text.startsWith(BLOCO + '\n'));
    assert.match(turnoCliente.parts[0].text, /\] Sim gostei$/);
  });
});

test('elogio SEM pedido de avaliação pendente vai pro modelo (com o contexto junto)', async () => {
  await comModeloFalso(async (chamadas) => {
    const r = await processarMensagem([], 'Amei!', { antes: BLOCO, aguardandoAvaliacao: false });
    assert.equal(r.resposta, 'Resposta do modelo');
    assert.equal(chamadas.length, 1);
    const ultimo = chamadas[0].contents.at(-1).parts[0].text;
    assert.ok(ultimo.startsWith(BLOCO));
  });
});

test('reclamação depois do pedido de avaliação vai pro modelo, não recebe convite', async () => {
  await comModeloFalso(async (chamadas) => {
    const r = await processarMensagem([], 'amei mas o vidro veio riscado', { antes: BLOCO, aguardandoAvaliacao: true });
    assert.equal(r.resposta, 'Resposta do modelo');
    assert.equal(chamadas.length, 1);
  });
});

test('sem contexto nenhum, a mensagem segue igual a antes (só o carimbo)', async () => {
  await comModeloFalso(async (chamadas) => {
    await processarMensagem([], 'Quero fazer um quadro', {});
    const ultimo = chamadas[0].contents.at(-1).parts[0].text;
    assert.match(ultimo, /^\[[^\]]+\] Quero fazer um quadro$/);
  });
});

test('os dois prompts ensinam a ler o contexto e a convidar pra avaliação com o link', async () => {
  await comModeloFalso(async (chamadas) => {
    await processarMensagem([], 'oi', {});
    const prompt = chamadas[0].config.systemInstruction;
    assert.match(prompt, /CONTEXTO DO SISTEMA/);
    assert.ok(prompt.includes(LINK_AVALIACAO));
  });
});
