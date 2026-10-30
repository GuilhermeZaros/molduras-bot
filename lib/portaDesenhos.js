export const TOOL_PORTA_DESENHOS = 'apresentar_porta_desenhos';

export const MENSAGENS_PORTA_DESENHOS = [
  [
    '🎨 SEU PEQUENO ARTISTA VAI AMAR! 🖍️',
    '',
    'Chega de desenhos espalhados pela casa! 😍',
    '',
    'Nosso Porta Desenhos 20x30 cm comporta aproximadamente 100 folhas sulfite, perfeito para guardar e organizar todas aquelas obras de arte que você não quer perder. ❤️',
    '',
    '✨ À pronta entrega',
    '⚪ Branco',
    '⚫ Preto',
    '',
    '💳 R$ 120,00 em até 3x no cartão',
    '💰 R$ 105,00 à vista'
  ].join('\n'),
  'Qual cor você vai querer: branco ou preto? 🤍🖤'
];

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function ehPedidoPortaDesenhos(texto) {
  const t = normalizar(texto);
  return /\bcaix(?:a|inha)s?\b(?:\s+\w+){0,3}\s+desenh/.test(t)
    || /\bdesenh\w*(?:\s+\w+){0,3}\s+caix(?:a|inha)s?\b/.test(t)
    || /\b(?:porta|guarda)\s?desenh/.test(t)
    || /\b(?:porta|guarda)\s?quadros?\b/.test(t);
}

export function jaApresentouPortaDesenhos(historico) {
  return (historico || []).some((turno) => turno && turno.role === 'model'
    && (turno.parts || []).some((p) => typeof p.text === 'string' && p.text.includes(MENSAGENS_PORTA_DESENHOS[0])));
}

export function apresentacaoPortaDesenhos(mensagens) {
  const texto = MENSAGENS_PORTA_DESENHOS.join('\n\n');
  mensagens.push({ role: 'model', parts: [{ text: texto }] });
  return { resposta: texto, baloes: [...MENSAGENS_PORTA_DESENHOS], historico: mensagens };
}
