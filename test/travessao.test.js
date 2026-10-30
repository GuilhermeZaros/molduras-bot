import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';

const { semTravessao, MENSAGEM_FOTO_QUADRO_PRONTO } = await import('../lib/mensagens.js');
const { SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM } = await import('../lib/bot.js');
const { modelosDe } = await import('../lib/modelos.js');
const { montarMensagemPronto } = await import('../lib/oficina.js');
const { montarMensagemRelatorio, montarMensagemResumo } = await import('../lib/resumo.js');
const { montarMensagemAvaliacao, montarConviteAvaliacao } = await import('../lib/avaliacao.js');
const { montarMensagemToque } = await import('../lib/atendimento.js');
const { MENSAGENS_PORTA_DESENHOS } = await import('../lib/portaDesenhos.js');
const { RESPOSTA_PORTA_RETRATO } = await import('../lib/portaRetrato.js');

const TRAVESSAO = /[–—]/;

test('semTravessao troca o travessão de frase por vírgula', () => {
  assert.equal(
    semTravessao('Vou passar pra nossa equipe finalizar o seu pedido — eles retornam a partir das 13:30 👍'),
    'Vou passar pra nossa equipe finalizar o seu pedido, eles retornam a partir das 13:30 👍'
  );
  assert.equal(semTravessao('a moldura — que é preta — fica linda.'), 'a moldura, que é preta, fica linda.');
  assert.equal(semTravessao('pedido—eles retornam'), 'pedido, eles retornam');
});

test('semTravessao escreve intervalo com "a"', () => {
  assert.equal(semTravessao('seg–sex 8h–18h, sáb 8h–12h'), 'seg a sex 8h a 18h, sáb 8h a 12h');
  assert.equal(semTravessao('uns 3–5 dias ou 3 - 5 dias'), 'uns 3 a 5 dias ou 3 a 5 dias');
});

test('semTravessao arruma lista numerada, marcador no começo da linha e sobra no fim', () => {
  assert.equal(semTravessao('1 — Moldura preta\n2 - Moldura branca'), '1. Moldura preta\n2. Moldura branca');
  assert.equal(semTravessao('— Com vidro R$ 196,00\n— Sem vidro R$ 116,00'), 'Com vidro R$ 196,00\nSem vidro R$ 116,00');
  assert.equal(semTravessao('Pode sim —'), 'Pode sim');
  assert.equal(semTravessao('Oi! — tudo bem?'), 'Oi! tudo bem?');
  assert.equal(semTravessao('(— detalhe)'), '(detalhe)');
});

test('semTravessao troca hífen solto no meio da frase', () => {
  assert.equal(semTravessao('Av. Parigot de Souza, 2475 - Paranavaí'), 'Av. Parigot de Souza, 2475, Paranavaí');
});

test('semTravessao não mexe no que não é travessão', () => {
  for (const texto of [
    'quebra-cabeça, e-mail, (44) 99999-9999, 8h-18h',
    'https://g.page/r/CbnIF7ufnJ3MEBM/review',
    '- item um\n- item dois',
    'Oi Maria,\ntudo certo?',
    MENSAGENS_PORTA_DESENHOS[0],
    RESPOSTA_PORTA_RETRATO,
    ''
  ]) {
    assert.equal(semTravessao(texto), texto);
  }
  assert.equal(semTravessao(undefined), undefined);
});

test('os dois prompts da Julia não têm travessão e mandam ela não usar', () => {
  for (const prompt of [SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM]) {
    assert.equal(TRAVESSAO.test(prompt), false);
    assert.match(prompt, /SEM TRAVESSÃO/);
  }
});

test('as mensagens fixas que a Julia manda não têm travessão', () => {
  const textos = [
    MENSAGEM_FOTO_QUADRO_PRONTO,
    ...MENSAGENS_PORTA_DESENHOS,
    RESPOSTA_PORTA_RETRATO,
    ...modelosDe('certificado').map((m) => m.legenda),
    ...modelosDe('camiseta').map((m) => m.legenda),
    montarMensagemPronto('Maria'),
    montarMensagemRelatorio('5544999999999@s.whatsapp.net', 'Maria', '• O que quer: quadro', null),
    montarMensagemRelatorio('5544999999999@s.whatsapp.net', '', null, 'Cliente: oi'),
    montarMensagemResumo('5544999999999@s.whatsapp.net', 'Resumo'),
    montarMensagemAvaliacao(),
    montarConviteAvaliacao(),
    montarMensagemToque()
  ];
  for (const texto of textos) {
    assert.equal(TRAVESSAO.test(texto), false, texto);
  }
});

test('semTravessao não deixa vírgula sobrando antes de pontuação', () => {
  assert.equal(semTravessao('Anotado, o preto —.'), 'Anotado, o preto.');
  assert.equal(semTravessao('(o preto —)'), '(o preto)');
  assert.equal(semTravessao('Fica pronto —?'), 'Fica pronto?');
});
