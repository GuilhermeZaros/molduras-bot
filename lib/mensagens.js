export const MENSAGEM_FOTO_QUADRO_PRONTO = 'Oi! 😊 Nós temos o costume de não enviar fotos dos quadros antes da retirada, porque gostamos que o cliente veja o resultado pessoalmente, já finalizado e preparado com todo carinho.';

export function respostaParaPedidoFotoQuadroPronto(texto) {
  const normalizado = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const clienteEnviaFoto = /\b(vou|quero)\s+(?:te\s+)?(?:mandar|enviar)\s+(?:uma\s+)?foto\b/.test(normalizado)
    || /\bfoto\b.{0,24}\b(?:para|pra)\b.{0,24}\b(?:fazer|montar|emoldurar)\b/.test(normalizado);
  if (clienteEnviaFoto) return null;

  const pedeFoto = /\b(foto|imagem)\b/.test(normalizado)
    && /\b(pode|poderia|consegue|manda|mandar|envia|enviar|mostra|mostrar|ver|tem|tirar)\b/.test(normalizado);
  const pedeComoFicou = /\bcomo ficou\b/.test(normalizado)
    && /\b(ver|mostrar|mostra|manda|mandar|envia|enviar|tem)\b/.test(normalizado);

  if ((pedeFoto || pedeComoFicou) && /\bquadro\b/.test(normalizado)) return MENSAGEM_FOTO_QUADRO_PRONTO;
  return null;
}

// Decide o texto final que vai pro cliente quando o modelo termina.
// Bug que isto conserta: às vezes o modelo MANDA as fotos (via tool) e NÃO escreve
// texto nenhum — aí o cliente recebia as imagens seguidas de "(o bot não soube
// responder)". Se houve envio de foto/modelo neste turno, emenda a pergunta de escolha
// em vez da mensagem-lixo. Sem mídia e sem texto = caso degenerado, pede pra repetir.
export function resolverRespostaFinal(texto, enviouMidia) {
  const t = (texto || '').trim();
  if (t) return t;
  if (enviouMidia) return 'Qual você prefere? Me diz o número.';
  return 'Desculpa, pode repetir?';
}

// Divide a resposta do bot em "balões" curtos, como uma pessoa digitando
// várias mensagens seguidas no WhatsApp. O bot separa cada balão por uma
// linha em branco; aqui transformamos isso numa lista de mensagens.
// Se passar do `max`, o excedente é juntado no último balão (sem virar spam).
export function dividirEmMensagens(texto, max = 4) {
  if (!texto || !texto.trim()) return [];

  const bruto = texto
    .split(/\n\s*\n/)   // quebra em linhas em branco (com ou sem espaços)
    .map(p => p.trim())
    .filter(Boolean);

  // Remove balões idênticos: se o modelo repetir a mesma frase, não mandamos ela
  // duas vezes pro cliente. Dentro de uma única resposta, balão repetido nunca é
  // intencional. Mantém a primeira ocorrência e a ordem.
  const partes = [];
  for (const p of bruto) {
    if (!partes.includes(p)) partes.push(p);
  }

  if (partes.length <= max) return partes;

  const inicio = partes.slice(0, max - 1);
  const resto = partes.slice(max - 1).join('\n\n');
  return [...inicio, resto];
}

export function semTravessao(texto) {
  if (typeof texto !== 'string') return texto;
  const temTravessao = /[\u2013\u2014]/.test(texto);
  const temHifenSolto = /\S[ \t]+-[ \t]+\S/.test(texto) || /^[ \t]*\d+[ \t]+-[ \t]+\S/m.test(texto);
  if (!temTravessao && !temHifenSolto) return texto;
  return texto
    .replace(/^([ \t]*\d+)(?:[ \t]*[\u2013\u2014][ \t]+|[ \t]+-[ \t]+)(?=\D)/gm, '$1. ')
    .replace(/^[ \t]*[\u2013\u2014][ \t]*/gm, '')
    .replace(/(\d)[ \t]*\u2013[ \t]*(?=\d)/g, '$1 a ')
    .replace(/(\d)\u2014(?=\d)/g, '$1 a ')
    .replace(/(\d)[ \t]+-[ \t]+(?=\d)/g, '$1 a ')
    .replace(/([\p{L}\p{N}])\u2013(?=[\p{L}\p{N}])/gu, '$1 a ')
    .replace(/[ \t]*[\u2013\u2014][ \t]*/g, '\uE000')
    .replace(/(\S)[ \t]+-[ \t]+(?=\S)/g, '$1\uE000')
    .replace(/\uE000+/g, '\uE000')
    .replace(/^\uE000|\uE000$/gm, '')
    .replace(/\uE000(?=[,.;:!?)\]])/g, '')
    .replace(/([.!?;:])\uE000/g, '$1 ')
    .replace(/([(\[])\uE000/g, '$1')
    .replace(/\uE000/g, ', ');
}
