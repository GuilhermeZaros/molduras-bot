// avaliacao.js — pedido de avaliação no Google 96h (4 dias) depois do aviso de "quadro pronto".
//
// Fluxo: a funcionária manda o aviso-modelo pelo WhatsApp da loja (resposta rápida salva). O bot
// enxerga essa mensagem como fromMe, reconhece o texto e agenda o contato. Passadas as 96h, na
// primeira varredura dentro do horário comercial, a Julia manda o pedido de avaliação e o contato
// sai da fila.
//
// O gatilho é o texto EXATO do modelo (a menos de maiúscula, acento, emoji e espaço) — de
// propósito: uma mensagem parecida da equipe não pode virar pedido de avaliação sem querer.
//
// Estado em dados/avaliacoes.json (gitignored; dado privado de cliente).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { horaDaLoja } from './hora.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'avaliacoes.json');

export const CONFIG_AVALIACAO = {
  ESPERA_MS: 96 * 60 * 60 * 1000, // 4 dias depois do aviso de quadro pronto
  HORA_INICIO: 8,                 // nunca manda de madrugada: janela 8h...
  HORA_FIM: 18,                   // ...até 18h, no fuso da loja
  VARREDURA_MS: 5 * 60 * 1000     // intervalo da varredura no index.js
};

export const LINK_AVALIACAO = 'https://g.page/r/CbnIF7ufnJ3MEBM/review';

// Mensagem-modelo que a FUNCIONÁRIA manda quando o quadro fica pronto. É o gatilho do relógio —
// mudar este texto aqui exige mudar a resposta rápida salva no WhatsApp da loja (e vice-versa).
export const AVISO_PRONTO_MODELO =
  'Oi!\n' +
  'Seu quadro ficou pronto! ✨\n' +
  'Pode vir retirar na Vera Molduras — depois me conta o que achou, vou adorar saber!';

// Normaliza: minúsculas, sem acento, pontuação/emoji viram espaço, espaços colapsados.
// Mesmo molde do detectarDespedida em atendimento.js.
function _normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const _MODELO = _normalizar(AVISO_PRONTO_MODELO);

// A mensagem que saiu do número da loja é o aviso-modelo de quadro pronto? PURA.
export function ehAvisoDePronto(texto) {
  const t = _normalizar(texto);
  return !!t && t === _MODELO;
}

// Mensagem fixa do pedido de avaliação (não é IA; não entra no histórico da conversa). PURA.
export function montarMensagemAvaliacao() {
  return (
    '🥰 Gostou do seu quadro? Então conta pra gente!\n\n' +
    'Sua avaliação ajuda MUITO a Vera Molduras a crescer e chegar a mais pessoas! ❤️\n\n' +
    'É rapidinho: é só clicar aqui e contar como foi sua experiência com a gente ⭐⭐⭐⭐⭐\n\n' +
    LINK_AVALIACAO + '\n\n' +
    'Muito obrigada pela confiança! 🫶🏻✨'
  );
}

// Resposta curta que é SÓ elogio ("Sim gostei", "Amei! 💖", "Ficou lindoooo")? PURA.
// Usada logo depois do pedido de avaliação, pra Julia convidar com o link sem passar pelo modelo.
// Conservadora de propósito (prefere FALSO NEGATIVO — o modelo, com o contexto, cobre o resto):
// qualquer sinal de reclamação, pergunta, pedido novo ou recado de retirada tira do caminho fixo.
const _ELOGIOS = [
  /\bamei\b/, /\badorei\b/, /\bgostei\b/, /\bamo\b/,
  /\blind[oa]s?\b/, /\blindez/, /\bmaravilh/, /\bperfeit[oa]s?\b/, /\bcaprich/,
  /\bincrive(l|is)\b/, /\bexcelente\b/, /\bespetacular\b/, /\bsensacional\b/,
  /\bencantad[oa]s?\b/, /\bapaixonad[oa]s?\b/, /\bsucesso\b/,
  /\bmuito bo[am]\b/, /\bficou (otim[oa]|bo[am]|show|top|demais)\b/, /\bshow\b/, /\btop\b/
];
const _BLOQUEIOS = new RegExp('\\b(' + [
  'nao', 'nem', 'mas', 'porem', 'so que', 'infelizmente', 'pena',
  'problema\\w*', 'defeito\\w*', 'quebr\\w*', 'risc\\w*', 'trinc\\w*', 'tort[oa]', 'errad\\w*',
  'manch\\w*', 'suj[oa]', 'arranh\\w*', 'solt\\w*', 'descol\\w*', 'car[oa]', 'reclam\\w*',
  'troc\\w*', 'devolv\\w*', 'falt\\w*',
  'quero', 'queria', 'querer', 'gostaria', 'quanto', 'valor', 'preco', 'orcamento',
  'outro', 'outra', 'mais um', 'mais uma', 'tem como', 'pode', 'poderia', 'posso', 'consegue',
  'horario', 'hora', 'amanha', 'hoje', 'buscar', 'busco', 'retirar', 'retiro', 'pegar', 'passo', 'passar', 'vou'
].join('|') + ')\\b');
const _MAX_PALAVRAS = 15;

export function ehElogioSimples(texto) {
  const bruto = String(texto == null ? '' : texto);
  if (bruto.includes('?')) return false;
  const t = _normalizar(bruto).replace(/([aeiou])\1+/g, '$1'); // "lindoooo" -> "lindo"
  if (!t) return false;
  if (t.split(' ').length > _MAX_PALAVRAS) return false;
  if (_BLOQUEIOS.test(t)) return false;
  return _ELOGIOS.some((re) => re.test(t));
}

// Convite fixo da Julia quando o cliente elogia depois do pedido de avaliação. PURA.
// Uma mensagem só (quebra simples, sem linha em branco, pra não virar dois balões).
export function montarConviteAvaliacao() {
  return (
    'Que bom que você gostou! 🥰 Já que gostou, avalia a gente no Google? ' +
    'É rapidinho, coisa de 5 minutinhos, e ajuda muita gente a conhecer a Vera Molduras.\n' +
    LINK_AVALIACAO + '\n' +
    'Muito obrigada! ✨'
  );
}

// Põe (ou repõe) o contato na fila. PURA: devolve um estado novo.
// Aviso repetido pro mesmo contato REINICIA o relógio em vez de empilhar um segundo pedido.
export function agendarAvaliacao(estado, jid, agora, cfg = CONFIG_AVALIACAO) {
  return { ...(estado || {}), [jid]: { avisoEm: agora, enviarApos: agora + cfg.ESPERA_MS } };
}

// Passaram as 96h desse contato? PURA (só o tempo; a janela do dia é checada à parte).
export function avaliacaoVencida(item, agora) {
  if (!item || !item.enviarApos) return false;
  return agora >= item.enviarApos;
}

// A hora (0-23) está na janela de envio? PURA.
export function dentroDaJanela(hora, cfg = CONFIG_AVALIACAO) {
  return hora >= cfg.HORA_INICIO && hora < cfg.HORA_FIM;
}

// ---- persistência (escrita atômica; arquivo ausente/corrompido -> {}) ----
export function lerAvaliacoes(caminho = CAMINHO_PADRAO) {
  try {
    if (!existsSync(caminho)) return {};
    const obj = JSON.parse(readFileSync(caminho, 'utf8'));
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch (e) {
    console.error('⚠️  avaliacoes ilegível, começando vazio:', e.message);
    return {};
  }
}
export function gravarAvaliacoes(obj, caminho = CAMINHO_PADRAO) {
  const dir = path.dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = caminho + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  renameSync(tmp, caminho);
}

// ---- orquestração (I/O injetado, no molde do verificarOficina) ----
//
// deps:
//   listar()           -> { jid: item }
//   enviar(jid, texto) -> envia
//   concluir(jid)      -> tira o contato da fila e persiste
//   agora, cfg, log
// Devolve quantos pedidos de avaliação saíram.
export async function verificarAvaliacoes(deps) {
  const { listar, enviar, concluir, agora, log } = deps;
  const cfg = deps.cfg || CONFIG_AVALIACAO;
  const aviso = (m) => { if (log) log(m); };

  // Fora da janela útil ninguém recebe nada — o vencido espera o dia abrir.
  if (!dentroDaJanela(horaDaLoja(agora), cfg)) return 0;

  const fila = listar() || {};
  let enviados = 0;

  for (const jid of Object.keys(fila)) {
    if (!avaliacaoVencida(fila[jid], agora)) continue;
    try {
      await enviar(jid, montarMensagemAvaliacao());
      concluir(jid);
      enviados++;
    } catch (e) {
      aviso(`falha ao pedir avaliação de ${jid}: ${e.message}`); // NÃO conclui: tenta de novo
    }
  }
  return enviados;
}
