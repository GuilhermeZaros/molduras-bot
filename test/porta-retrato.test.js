import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy-para-teste';

const {
  PRECOS_PORTA_RETRATO, RESPOSTA_PORTA_RETRATO, RAJADA_CAMPANHA_MS,
  ehCampanhaPortaRetrato, respondeACampanha, pedePortaRetrato, envioDaCampanha,
  comFalaDaEquipe, semSilencioDaRajada, falaDePortaRetrato, jaMandouRespostaPortaRetrato
} = await import('../lib/portaRetrato.js');
const { MENSAGENS_PORTA_DESENHOS, TOOL_PORTA_DESENHOS } = await import('../lib/portaDesenhos.js');
const { TOOLS } = await import('../lib/tools.js');
const { genai } = await import('../lib/gemini.js');
const { processarMensagem, SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM } = await import('../lib/bot.js');
const { equipeFalouRecente, atendimentoSoDaEquipe, CONFIG_PADRAO } = await import('../lib/atendimento.js');

const CAMPANHA = '📸 COMEÇOU A SEMANA DO PORTA-RETRATO! ❤️\n\nTemos modelos à pronta entrega e preços especiais:\n✨ 10x15 — R$ 21,90\n✨ 15x21 — R$ 29,90\n✨ 20x25 — R$ 35,90\n\nAquela foto especial merece sair do celular e ir para um porta-retrato! 🥰\n\n📲 Me chama e eu te mostro as opções disponíveis!';

const RESPOSTA_DO_DONO = 'Olá! 😊 Seja bem-vindo(a) à Vera Molduras! 🖼️✨\n\nNosso atendimento pelo WhatsApp começa a partir das 13h30. Já já vamos te atender! \n\nEnquanto isso, para agilizar seu atendimento, me conta:\n\n📐 Qual tamanho de porta-retrato você procura?\n\n🎨 Tem alguma cor que você prefere?\n\nVou te enviar algumas fotos dos modelos que temos disponíveis. Mas, se puder, fica também o nosso convite para vir até a loja e conferir pessoalmente as opções — assim você consegue ver de pertinho os modelos e acabamentos. 🥰';

const MIN = 60 * 1000;
const T0 = new Date('2026-09-28T10:00:00-03:00').getTime();
const JANELA = CONFIG_PADRAO.EQUIPE_RECENTE_MS;

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

test('a resposta é a mensagem do dono, só com o travessão trocado por vírgula', () => {
  const esperado = RESPOSTA_DO_DONO
    .replace('opções — assim', 'opções, assim')
    .replace('atender! \n', 'atender!\n');
  assert.equal(RESPOSTA_PORTA_RETRATO, esperado);
});

test('reconhece a campanha que a equipe manda', () => {
  for (const texto of [
    CAMPANHA,
    CAMPANHA.replace(/ — /g, ': '),
    'Começou a Semana do Porta Retrato!',
    'SEMANA DO PORTARETRATO na Vera Molduras',
    'Porta-retratos à pronta entrega: 10 x 15 R$ 21,90 e 15 x 21 R$ 29,90'
  ]) {
    assert.equal(ehCampanhaPortaRetrato(texto), true, texto);
  }
});

test('não confunde a campanha com mensagem comum da equipe', () => {
  for (const texto of [
    'Oi! \nSeu quadro ficou pronto! ✨\nPode vir retirar na Vera Molduras',
    'Olá! Seja bem-vinda à Vera Molduras.\nMeu nome é Bruna, vou te atender',
    'Temos porta-retrato sim, de vários tamanhos',
    'o 15x21 fica R$ 29,90',
    '',
    undefined
  ]) {
    assert.equal(ehCampanhaPortaRetrato(texto), false, String(texto));
  }
});

test('o que o cliente responde à campanha recebe a mensagem do dono', () => {
  for (const texto of [
    'Oi',
    'Olá, boa tarde!',
    'Quero',
    'Tenho interesse',
    'quero ver as opções',
    'Quais cores vocês têm?',
    'quero 2 de 15x21',
    'é pronta entrega?',
    'tá pronta entrega?',
    'pode me mandar as fotos?',
    'quem é?',
    '😍',
    'Quanto fica o de 20x25?',
    'quero um porta retrato pra foto do meu casamento'
  ]) {
    assert.equal(respondeACampanha(texto), true, texto);
  }
});

test('recusa e outro assunto ficam com o modelo', () => {
  for (const texto of [
    'Não tenho interesse',
    'não, obrigada',
    'Pare de me mandar mensagem',
    'não me mandem mais isso',
    'me tira dessa lista',
    'Meu quadro já ficou pronto?',
    'quero emoldurar um quebra-cabeça',
    'vocês fazem espelho?',
    'quero fazer um quadro 40x60'
  ]) {
    assert.equal(respondeACampanha(texto), false, texto);
  }
});

test('porta-retrato numa conversa nova também recebe a mensagem do dono', () => {
  assert.equal(pedePortaRetrato([], 'vocês têm porta-retrato?'), true);
  assert.equal(pedePortaRetrato([], 'quanto fica um porta retrato 15x21?'), true);
  assert.equal(pedePortaRetrato([], 'oi'), false);
  assert.equal(pedePortaRetrato([], 'quero o porta retrato de desenho'), false);
  assert.equal(pedePortaRetrato([], 'não quero'), false);
  const emAndamento = [
    { role: 'user', parts: [{ text: 'quero emoldurar uma foto' }] },
    { role: 'model', parts: [{ text: 'Qual a medida?' }] }
  ];
  assert.equal(pedePortaRetrato(emAndamento, 'e porta-retrato, vocês têm?'), false);
});

test('envio da equipe: campanha, complemento ou conversa normal', () => {
  const texto = { tipo: 'texto', texto: CAMPANHA };
  const foto = { tipo: 'imagem', legenda: '' };
  assert.equal(envioDaCampanha(texto, undefined, null, T0, JANELA), 'campanha');
  assert.equal(envioDaCampanha({ tipo: 'imagem', legenda: CAMPANHA }, undefined, null, T0, JANELA), 'campanha');
  assert.equal(envioDaCampanha(texto, { ultimaAtividade: T0 - 3 * 60 * MIN }, null, T0, JANELA), 'campanha');
  assert.equal(envioDaCampanha(texto, { ultimaAtividade: T0 - 20 * MIN }, null, T0, JANELA), null);
  assert.equal(envioDaCampanha(texto, { ultimaMensagemEquipe: T0 - 30 * MIN }, null, T0, JANELA), null);
  assert.equal(envioDaCampanha({ tipo: 'texto', texto: 'Seu quadro ficou pronto!' }, undefined, null, T0, JANELA), null);
  assert.equal(envioDaCampanha(foto, undefined, T0 - MIN, T0, JANELA), 'complemento');
  assert.equal(envioDaCampanha(foto, undefined, T0 - 10 * MIN, T0, JANELA), null);
  assert.equal(envioDaCampanha(foto, undefined, null, T0, JANELA), null);
});

test('foto mandada antes do texto da campanha não deixa a Julia muda', () => {
  const texto = { tipo: 'texto', texto: CAMPANHA };
  let meta = comFalaDaEquipe(atendimentoSoDaEquipe(T0), T0);
  assert.equal(equipeFalouRecente(meta, T0 + MIN, CONFIG_PADRAO), true);
  assert.equal(envioDaCampanha(texto, meta, null, T0 + MIN, JANELA), 'campanha');
  meta = semSilencioDaRajada(meta, T0 + MIN);
  assert.equal(equipeFalouRecente(meta, T0 + 2 * MIN, CONFIG_PADRAO), false);
});

test('rajada no meio de uma conversa da equipe não vira campanha', () => {
  const texto = { tipo: 'texto', texto: CAMPANHA };
  let meta = comFalaDaEquipe({ ultimaAtividade: 0 }, T0 - 20 * MIN);
  meta = comFalaDaEquipe(meta, T0);
  assert.equal(meta.equipeAntesDaRajada, T0 - 20 * MIN);
  assert.equal(envioDaCampanha(texto, meta, null, T0 + MIN, JANELA), null);
  assert.equal(semSilencioDaRajada(meta, T0 + MIN).ultimaMensagemEquipe, T0 - 20 * MIN);
  assert.equal(semSilencioDaRajada(meta, T0 + RAJADA_CAMPANHA_MS + 1), meta);
});

test('cliente responde à campanha: sai a mensagem do dono num balão só, sem chamar o modelo', async () => {
  const mock = mockModelo([]);
  try {
    const antes = '[CONTEXTO DO SISTEMA: teste]\n[segunda, 28/09/2026, 10:00] equipe da loja: 📸 COMEÇOU A SEMANA DO PORTA-RETRATO!\n[FIM DO CONTEXTO: teste]';
    const r = await processarMensagem([], 'Oi, boa tarde', { campanhaPendente: true, antes });
    assert.equal(mock.chamadas.length, 0);
    assert.deepEqual(r.baloes, [RESPOSTA_PORTA_RETRATO]);
    assert.equal(r.resposta, RESPOSTA_PORTA_RETRATO);
    assert.equal(r.historico.at(-1).role, 'model');
    assert.match(r.historico.at(-2).parts[0].text, /SEMANA DO PORTA-RETRATO/);
  } finally {
    mock.restaurar();
  }
});

test('cliente recusa a campanha: o modelo responde', async () => {
  const mock = mockModelo([[{ text: 'Desculpa o incômodo! Vou avisar a equipe.' }]]);
  try {
    const r = await processarMensagem([], 'Não tenho interesse', { campanhaPendente: true });
    assert.equal(mock.chamadas.length, 1);
    assert.equal(r.baloes, undefined);
    assert.equal(r.resposta, 'Desculpa o incômodo! Vou avisar a equipe.');
  } finally {
    mock.restaurar();
  }
});

test('sem campanha: porta-retrato numa conversa nova tem resposta fixa, no meio da conversa vai pro modelo', async () => {
  const mock = mockModelo([[{ text: 'Temos sim! Qual tamanho você procura?' }], [{ text: 'Oi! Aqui é a Julia, da Vera Molduras 😊' }]]);
  try {
    const nova = await processarMensagem([], 'vocês têm porta-retrato?', {});
    assert.deepEqual(nova.baloes, [RESPOSTA_PORTA_RETRATO]);
    assert.equal(mock.chamadas.length, 0);
    const emAndamento = [
      { role: 'user', parts: [{ text: 'quero emoldurar uma foto' }] },
      { role: 'model', parts: [{ text: 'Qual a medida?' }] }
    ];
    const meio = await processarMensagem(emAndamento, 'e porta-retrato, vocês têm?', {});
    assert.equal(meio.baloes, undefined);
    assert.equal(mock.chamadas.length, 1);
    const oi = await processarMensagem([], 'Oi', {});
    assert.equal(oi.baloes, undefined);
    assert.equal(mock.chamadas.length, 2);
  } finally {
    mock.restaurar();
  }
});

test('mensagem do anúncio do Porta Desenhos continua ganhando a apresentação dele', async () => {
  const mock = mockModelo([]);
  try {
    const r = await processarMensagem([], 'Olá! Me interessei pela caixinha para desenhos.', { campanhaPendente: true });
    assert.deepEqual(r.baloes, MENSAGENS_PORTA_DESENHOS);
  } finally {
    mock.restaurar();
  }
});

const MENSAGEM_PRONTA = 'Olá, quero escolher meu porta retrato da promoção!';
const JA_CONVERSOU = [
  { role: 'user', parts: [{ text: '[terça, 29/09/2026, 10:00] Oi, bom dia' }] },
  { role: 'model', parts: [{ text: 'Bom dia! Aqui é a Julia, da Vera Molduras 😊 Como posso te ajudar?' }] }
];

test('reconhece quando a pessoa fala de porta-retrato e não de desenho', () => {
  for (const texto of [MENSAGEM_PRONTA, 'quero porta-retrato', 'PORTA RETRATOS', 'tem portaretrato 10x15?']) {
    assert.equal(falaDePortaRetrato(texto), true, texto);
  }
  for (const texto of ['quero um porta retrato pros desenhos do meu filho', 'Olá! Me interessei pela caixinha para desenhos.', 'oi', 'quero emoldurar um retrato', '', undefined]) {
    assert.equal(falaDePortaRetrato(texto), false, String(texto));
  }
});

test('a mensagem pronta da campanha ganha a resposta oficial mesmo com conversa anterior, uma vez só', () => {
  assert.equal(pedePortaRetrato(JA_CONVERSOU, MENSAGEM_PRONTA), true);
  assert.equal(pedePortaRetrato(JA_CONVERSOU, 'sobre a promo de porta retrato'), true);
  assert.equal(pedePortaRetrato(JA_CONVERSOU, 'quero escolher meu porta-retrato'), true);
  assert.equal(pedePortaRetrato(JA_CONVERSOU, 'quero porta retrato'), false);
  const jaRespondida = [...JA_CONVERSOU,
    { role: 'user', parts: [{ text: MENSAGEM_PRONTA }] },
    { role: 'model', parts: [{ text: RESPOSTA_PORTA_RETRATO }] }];
  assert.equal(jaMandouRespostaPortaRetrato(JA_CONVERSOU), false);
  assert.equal(jaMandouRespostaPortaRetrato(jaRespondida), true);
  assert.equal(pedePortaRetrato(jaRespondida, MENSAGEM_PRONTA), false);
  assert.equal(pedePortaRetrato([], MENSAGEM_PRONTA), true);
});

test('mensagem pronta da campanha numa conversa que já tinha fala da Julia: resposta oficial sem chamar o modelo', async () => {
  const mock = mockModelo([]);
  try {
    const r = await processarMensagem(structuredClone(JA_CONVERSOU), MENSAGEM_PRONTA, {});
    assert.equal(mock.chamadas.length, 0);
    assert.deepEqual(r.baloes, [RESPOSTA_PORTA_RETRATO]);
  } finally {
    mock.restaurar();
  }
});

test('o modelo não consegue mandar o Porta Desenhos pra quem falou de porta-retrato', async () => {
  const mock = mockModelo([
    [{ functionCall: { name: TOOL_PORTA_DESENHOS, args: {} } }],
    [{ text: 'Qual tamanho você quer: 10x15, 15x21 ou 20x25? E tem alguma cor de preferência?' }]
  ]);
  try {
    const r = await processarMensagem(structuredClone(JA_CONVERSOU), 'quero porta retrato', {});
    assert.equal(mock.chamadas.length, 2);
    assert.equal(r.baloes, undefined);
    assert.equal(r.resposta, 'Qual tamanho você quer: 10x15, 15x21 ou 20x25? E tem alguma cor de preferência?');
    const resposta = mock.chamadas[1].at(-1).parts[0].functionResponse.response;
    assert.match(resposta.erro, /PORTA-RETRATO/);
    assert.ok(!r.historico.some((t) => t.role === 'model' && (t.parts || []).some((p) => (p.text || '').includes(MENSAGENS_PORTA_DESENHOS[0]))));
  } finally {
    mock.restaurar();
  }
});

test('quem fala de desenho de criança continua ganhando o Porta Desenhos pela ferramenta', async () => {
  const mock = mockModelo([[{ functionCall: { name: TOOL_PORTA_DESENHOS, args: {} } }]]);
  try {
    const r = await processarMensagem(structuredClone(JA_CONVERSOU), 'quero um porta retrato pros desenhos do meu filho', {});
    assert.deepEqual(r.baloes, MENSAGENS_PORTA_DESENHOS);
  } finally {
    mock.restaurar();
  }
});

test('os dois prompts explicam que porta-retrato e Porta Desenhos são produtos diferentes', () => {
  for (const prompt of [SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM]) {
    assert.match(prompt, /PORTA-RETRATO E PORTA DESENHOS SÃO DOIS PRODUTOS DIFERENTES/);
    assert.match(prompt, /pezinho/);
    assert.match(prompt, /VÁRIAS cores/);
    assert.ok(prompt.includes(MENSAGEM_PRONTA), 'a mensagem pronta da campanha');
    assert.ok(prompt.includes(`NUNCA chame ${TOOL_PORTA_DESENHOS}`));
  }
  assert.match(SYSTEM_PROMPT, /as únicas que existem são a SEMANA DO PORTA-RETRATO e o PORTA DESENHOS/);
  const ferramenta = TOOLS[0].functionDeclarations.find((d) => d.name === TOOL_PORTA_DESENHOS);
  assert.match(ferramenta.description, /NÃO use pra PORTA-RETRATO/);
});

test('os dois prompts conhecem a campanha, os preços e a resposta oficial', () => {
  for (const prompt of [SYSTEM_PROMPT, SYSTEM_PROMPT_TRIAGEM]) {
    assert.match(prompt, /SEMANA DO PORTA-RETRATO/);
    assert.ok(prompt.includes(RESPOSTA_PORTA_RETRATO));
    for (const [tamanho, preco] of Object.entries(PRECOS_PORTA_RETRATO)) {
      assert.ok(prompt.includes(`${tamanho} por ${preco}`), tamanho);
    }
  }
});
