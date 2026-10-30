import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';

const {
  MENSAGENS_PORTA_DESENHOS,
  TOOL_PORTA_DESENHOS,
  ehPedidoPortaDesenhos,
  jaApresentouPortaDesenhos
} = await import('../lib/portaDesenhos.js');
const { genai } = await import('../lib/gemini.js');
const { processarMensagem } = await import('../lib/bot.js');
const { TOOLS, TOOLS_TRIAGEM, textoTemChamadaDeFerramenta } = await import('../lib/tools.js');

const MENSAGEM_1 = '🎨 SEU PEQUENO ARTISTA VAI AMAR! 🖍️\n\nChega de desenhos espalhados pela casa! 😍\n\nNosso Porta Desenhos 20x30 cm comporta aproximadamente 100 folhas sulfite, perfeito para guardar e organizar todas aquelas obras de arte que você não quer perder. ❤️\n\n✨ À pronta entrega\n⚪ Branco\n⚫ Preto\n\n💳 R$ 120,00 em até 3x no cartão\n💰 R$ 105,00 à vista';
const MENSAGEM_2 = 'Qual cor você vai querer: branco ou preto? 🤍🖤';

function mockModelo(respostas) {
  const original = genai.models.generateContent;
  const chamadas = [];
  genai.models.generateContent = async (params) => {
    chamadas.push(structuredClone(params.contents));
    const parts = respostas.shift();
    if (!parts) throw new Error('modelo chamado mais vezes que o esperado');
    return { candidates: [{ content: { role: 'model', parts } }] };
  };
  return { chamadas, restaurar: () => { genai.models.generateContent = original; } };
}

test('as duas mensagens são exatamente as do dono', () => {
  assert.equal(MENSAGENS_PORTA_DESENHOS.length, 2);
  assert.equal(MENSAGENS_PORTA_DESENHOS[0], MENSAGEM_1);
  assert.equal(MENSAGENS_PORTA_DESENHOS[1], MENSAGEM_2);
});

test('detector reconhece a mensagem pronta do anúncio e as variações fortes', () => {
  for (const texto of [
    'Olá! Me interessei pela caixinha para desenhos.',
    'ola me interessei pela caixinha para desenhos',
    'OLÁ!! ME INTERESSEI PELA CAIXINHA PARA DESENHOS',
    'Oi, queria saber da caixinha de desenho',
    'vocês têm aquela caixa pra guardar desenhos?',
    'quero o porta desenhos',
    'Porta-desenhos ainda tem?',
    'guarda desenhos',
    'vi o porta quadros no insta',
    'quanto é o guarda-quadros?'
  ]) {
    assert.equal(ehPedidoPortaDesenhos(texto), true, texto);
  }
});

test('detector não dispara em atendimento comum da loja', () => {
  for (const texto of [
    'Olá! Quero emoldurar meu quebra-cabeça',
    'quero um quadro 60x70 com moldura preta',
    'vocês fazem moldura caixa pra camiseta?',
    'quanto fica um porta retrato?',
    'pode me mandar uma foto do quadro?',
    ''
  ]) {
    assert.equal(ehPedidoPortaDesenhos(texto), false, texto);
  }
});

test('jaApresentouPortaDesenhos olha só as mensagens da Julia', () => {
  assert.equal(jaApresentouPortaDesenhos([]), false);
  assert.equal(jaApresentouPortaDesenhos([{ role: 'user', parts: [{ text: MENSAGEM_1 }] }]), false);
  assert.equal(jaApresentouPortaDesenhos([{ role: 'model', parts: [{ text: `${MENSAGEM_1}\n\n${MENSAGEM_2}` }] }]), true);
});

test('a ferramenta existe no modo normal e no triagem, e o nome dela nunca vaza pro cliente', () => {
  const nomesNormal = TOOLS[0].functionDeclarations.map((d) => d.name);
  const nomesTriagem = TOOLS_TRIAGEM[0].functionDeclarations.map((d) => d.name);
  assert.equal(nomesNormal.includes(TOOL_PORTA_DESENHOS), true);
  assert.equal(nomesTriagem.includes(TOOL_PORTA_DESENHOS), true);
  assert.equal(textoTemChamadaDeFerramenta('[apresentar_porta_desenhos()]'), true);
});

test('mensagem do anúncio manda as 2 mensagens sem chamar o modelo', async () => {
  const mock = mockModelo([]);
  try {
    const r = await processarMensagem([], 'Olá! Me interessei pela caixinha para desenhos.', {});
    assert.equal(mock.chamadas.length, 0);
    assert.equal(r.baloes.length, 2);
    assert.equal(r.baloes[0], MENSAGEM_1);
    assert.equal(r.baloes[1], MENSAGEM_2);
    assert.equal(r.historico.at(-1).role, 'model');
    assert.equal(jaApresentouPortaDesenhos(r.historico), true);
  } finally {
    mock.restaurar();
  }
});

test('se a apresentação já foi mandada, a mesma frase vai pro modelo e não repete', async () => {
  const mock = mockModelo([[{ text: 'Anotado, o preto.' }]]);
  try {
    const historico = [
      { role: 'user', parts: [{ text: 'Olá! Me interessei pela caixinha para desenhos.' }] },
      { role: 'model', parts: [{ text: `${MENSAGEM_1}\n\n${MENSAGEM_2}` }] }
    ];
    const r = await processarMensagem(historico, 'quero o porta desenhos preto', {});
    assert.equal(mock.chamadas.length, 1);
    assert.equal(r.baloes, undefined);
    assert.equal(r.resposta, 'Anotado, o preto.');
  } finally {
    mock.restaurar();
  }
});

test('variação que só o modelo reconhece: ele chama a ferramenta e sai a apresentação exata', async () => {
  const mock = mockModelo([[{ functionCall: { name: TOOL_PORTA_DESENHOS, args: {} } }]]);
  try {
    const r = await processarMensagem([], 'oi, vi o anúncio do quadro que guarda os desenhos das crianças', {});
    assert.equal(mock.chamadas.length, 1);
    assert.deepEqual(r.baloes, [MENSAGEM_1, MENSAGEM_2]);
    const papeis = r.historico.map((t) => t.role);
    assert.deepEqual(papeis, ['user', 'model', 'user', 'model']);
    assert.equal(r.historico[2].parts[0].functionResponse.name, TOOL_PORTA_DESENHOS);
  } finally {
    mock.restaurar();
  }
});

test('modelo chamando a ferramenta de novo não reenvia a apresentação', async () => {
  const mock = mockModelo([
    [{ functionCall: { name: TOOL_PORTA_DESENHOS, args: {} } }],
    [{ text: 'É o 20x30, em branco ou preto.' }]
  ]);
  try {
    const historico = [
      { role: 'user', parts: [{ text: 'Olá! Me interessei pela caixinha para desenhos.' }] },
      { role: 'model', parts: [{ text: `${MENSAGEM_1}\n\n${MENSAGEM_2}` }] }
    ];
    const r = await processarMensagem(historico, 'qual o tamanho do quadro do desenho?', {});
    assert.equal(mock.chamadas.length, 2);
    assert.equal(r.baloes, undefined);
    assert.equal(r.resposta, 'É o 20x30, em branco ou preto.');
    const resposta = mock.chamadas[1].at(-1).parts[0].functionResponse.response;
    assert.match(resposta.erro, /já foi enviada/);
  } finally {
    mock.restaurar();
  }
});
