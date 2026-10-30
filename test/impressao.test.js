import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';

const { SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM } = await import('../lib/bot.js');

test('os dois prompts: revelação é impressão, pede a foto em HD ou como arquivo e o resto vai pra equipe', () => {
  for (const prompt of [SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM]) {
    assert.match(prompt, /IMPRESSÃO E REVELAÇÃO DE FOTO/);
    assert.match(prompt, /REVELAÇÃO \(revelar foto/);
    assert.match(prompt, /em HD ou como arquivo/);
    assert.match(prompt, /opção Documento/);
    assert.match(prompt, /NEGATIVO/);
    assert.match(prompt, /QUANDO A EQUIPE VOLTA/);
  }
});

test('os dois prompts sabem que "[Cliente enviou um arquivo: ...]" é arquivo de verdade', () => {
  for (const prompt of [SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM]) {
    assert.ok(prompt.includes('"[Cliente enviou um arquivo: ...]"'));
    assert.match(prompt, /NUNCA diga que não chegou/);
  }
});
