// hora.js — carimbo de dia/hora que vai junto de cada mensagem do cliente pro modelo.
//
// Por que existe: a Julia não tem relógio — dizia "a equipe retorna a partir das 13:30"
// mesmo às 15h de um dia útil, com a equipe na loja. O carimbo entra no COMEÇO da mensagem
// de usuário (não no system prompt, de propósito: o prefixo estático prompt+tools continua
// idêntico e o cache implícito do Gemini segue valendo). O carimbo fica gravado no histórico,
// então o modelo também "vê" quanto tempo passou entre as mensagens.
//
// FUSO FIXO da loja (2026-08-06): antes usava a hora LOCAL da máquina, mas o VPS roda em
// UTC (3h à frente de Paranavaí) — às 15h30 da tarde o carimbo dizia 18h30 e a Julia
// respondia "já fechamos". Agora o fuso é sempre o da loja, não importa onde ela rode.

const FUSO_LOJA = 'America/Sao_Paulo';

const DIAS = {
  Sun: 'domingo', Mon: 'segunda', Tue: 'terça', Wed: 'quarta',
  Thu: 'quinta', Fri: 'sexta', Sat: 'sábado',
};

// Formata "[quarta, 01/07/2026, 15:04]" no fuso da loja. PURA (recebe a data; default = agora).
export function carimboHora(d = new Date(), fuso = FUSO_LOJA) {
  const dt = d instanceof Date ? d : new Date(d);
  const formato = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // meia-noite = 00, não 24
  });
  const p = {};
  for (const { type, value } of formato.formatToParts(dt)) p[type] = value;
  return `[${DIAS[p.weekday]}, ${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}]`;
}

// Hora (0-23) no fuso da loja — pra quem decide por horário (ex.: o toque em
// atendimento.js) não depender do fuso do servidor. PURA.
export function horaDaLoja(quando = Date.now(), fuso = FUSO_LOJA) {
  const dt = quando instanceof Date ? quando : new Date(quando);
  const hh = new Intl.DateTimeFormat('en-GB', {
    timeZone: fuso, hour: '2-digit', hourCycle: 'h23',
  }).format(dt);
  return Number(hh);
}
