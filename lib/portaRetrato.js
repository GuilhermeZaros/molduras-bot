export const PRECOS_PORTA_RETRATO = {
  '10x15': 'R$ 21,90',
  '15x21': 'R$ 29,90',
  '20x25': 'R$ 35,90'
};

export const RESPOSTA_PORTA_RETRATO = [
  'Olá! 😊 Seja bem-vindo(a) à Vera Molduras! 🖼️✨',
  '',
  'Nosso atendimento pelo WhatsApp começa a partir das 13h30. Já já vamos te atender!',
  '',
  'Enquanto isso, para agilizar seu atendimento, me conta:',
  '',
  '📐 Qual tamanho de porta-retrato você procura?',
  '',
  '🎨 Tem alguma cor que você prefere?',
  '',
  'Vou te enviar algumas fotos dos modelos que temos disponíveis. Mas, se puder, fica também o nosso convite para vir até a loja e conferir pessoalmente as opções, assim você consegue ver de pertinho os modelos e acabamentos. 🥰'
].join('\n');

export const RAJADA_CAMPANHA_MS = 3 * 60 * 1000;

const PORTA_RETRATO = /\bporta ?retratos?\b/;

const RECUSA = [
  /\bnao (?:tenho |temos )?(?:mais )?interess/,
  /\bsem interess/,
  /\b(?:pare|para|parem|parar) de (?:me )?(?:mandar|enviar)/,
  /\bnao (?:me )?(?:mande|mandem|envie|enviem)\b/,
  /\bdescadastr/,
  /\bbloque/,
  /\b(?:tira|tire|tirem|remov\w*|exclu\w*|sair)\b.*\blista\b/,
  /^(?:nao|n)(?: (?:quero|preciso|obrigad[oa]|agradeco|valeu))*$/
];

const OUTRO_ASSUNTO = [
  /\b(?:meu|minha|meus|minhas) (?:quadros?|pedidos?|encomendas?|orcamentos?|servicos?)\b/,
  /\b(?:ficou|ficaram|fica|esta|estao|ta|tao) pront(?!a entrega)/,
  /\b(?:fazer|faz|fazem|montar) (?:um |uma |uns |umas |o |a )?(?:quadros?|molduras?)\b/,
  /\borcamento de (?:um |uma )?(?:quadros?|molduras?)\b/,
  /\bemoldur/,
  /\bquebra ?cabeca/,
  /\bcertificad/,
  /\bdiploma/,
  /\bcamis/,
  /\bespelho/,
  /\bimpress|\bimprimi/,
  /\btela\b/
];

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/(\d+)\s*x\s*(\d+)/g, '$1x$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function ehCampanhaPortaRetrato(texto) {
  const t = normalizar(texto);
  if (/\bsemana do porta ?retratos?\b/.test(t)) return true;
  const palavras = t.split(' ');
  const tamanhos = Object.keys(PRECOS_PORTA_RETRATO).filter((m) => palavras.includes(m)).length;
  return PORTA_RETRATO.test(t) && tamanhos >= 2;
}

export function respondeACampanha(texto) {
  const t = normalizar(texto);
  if (RECUSA.some((r) => r.test(t))) return false;
  if (PORTA_RETRATO.test(t)) return true;
  return !OUTRO_ASSUNTO.some((r) => r.test(t));
}

const PEDIDO_DA_CAMPANHA = /\b(?:promo|escolh|semana do porta)/;

export function falaDePortaRetrato(texto) {
  const t = normalizar(texto);
  return PORTA_RETRATO.test(t) && !/\bdesenh/.test(t);
}

export function jaMandouRespostaPortaRetrato(historico) {
  return (historico || []).some((turno) => turno && turno.role === 'model'
    && (turno.parts || []).some((p) => typeof p.text === 'string' && p.text.includes(RESPOSTA_PORTA_RETRATO)));
}

export function pedePortaRetrato(historico, texto) {
  const t = normalizar(texto);
  if (!falaDePortaRetrato(texto) || RECUSA.some((r) => r.test(t))) return false;
  if (jaMandouRespostaPortaRetrato(historico)) return false;
  return PEDIDO_DA_CAMPANHA.test(t) || !(historico || []).some((turno) => turno && turno.role === 'model');
}

export function respostaPortaRetrato(mensagens) {
  mensagens.push({ role: 'model', parts: [{ text: RESPOSTA_PORTA_RETRATO }] });
  return { resposta: RESPOSTA_PORTA_RETRATO, baloes: [RESPOSTA_PORTA_RETRATO], historico: mensagens };
}

export function envioDaCampanha(c, meta, campanhaEm, agora, janelaMs) {
  if (meta && meta.ultimaAtividade && agora - meta.ultimaAtividade < janelaMs) return null;
  const texto = c ? (c.tipo === 'texto' ? c.texto : c.tipo === 'imagem' ? c.legenda : '') : '';
  if (texto) {
    if (!ehCampanhaPortaRetrato(texto)) return null;
    const ultima = meta && meta.ultimaMensagemEquipe;
    const referencia = ultima && agora - ultima <= RAJADA_CAMPANHA_MS ? meta.equipeAntesDaRajada : ultima;
    const equipeConversando = !!referencia && agora - referencia < janelaMs;
    return equipeConversando ? null : 'campanha';
  }
  return campanhaEm && agora - campanhaEm <= RAJADA_CAMPANHA_MS ? 'complemento' : null;
}

export function comFalaDaEquipe(meta, agora) {
  const ultima = meta.ultimaMensagemEquipe;
  const novaRajada = !ultima || agora - ultima > RAJADA_CAMPANHA_MS;
  return {
    ...meta,
    ultimaMensagemEquipe: agora,
    equipeAntesDaRajada: novaRajada ? (ultima || null) : (meta.equipeAntesDaRajada || null)
  };
}

export function semSilencioDaRajada(meta, agora) {
  const ultima = meta && meta.ultimaMensagemEquipe;
  if (!ultima || agora - ultima > RAJADA_CAMPANHA_MS) return meta;
  return { ...meta, ultimaMensagemEquipe: meta.equipeAntesDaRajada || null };
}
