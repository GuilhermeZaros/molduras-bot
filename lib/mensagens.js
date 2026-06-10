// Divide a resposta do bot em "balões" curtos, como uma pessoa digitando
// várias mensagens seguidas no WhatsApp. O bot separa cada balão por uma
// linha em branco; aqui transformamos isso numa lista de mensagens.
// Se passar do `max`, o excedente é juntado no último balão (sem virar spam).
export function dividirEmMensagens(texto, max = 4) {
  if (!texto || !texto.trim()) return [];

  const partes = texto
    .split(/\n\s*\n/)   // quebra em linhas em branco (com ou sem espaços)
    .map(p => p.trim())
    .filter(Boolean);

  if (partes.length <= max) return partes;

  const inicio = partes.slice(0, max - 1);
  const resto = partes.slice(max - 1).join('\n\n');
  return [...inicio, resto];
}
