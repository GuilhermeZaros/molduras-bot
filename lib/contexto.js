// contexto.js — o que aconteceu na conversa FORA do atendimento da Julia.
//
// Por que existe: o histórico da Julia (dados/conversas.json) só guarda o que ELA processou. O que a
// equipe escreve pelo WhatsApp da loja, as mensagens automáticas (pedido de avaliação, aviso da
// oficina) e o que o cliente respondeu enquanto a equipe cuidava da conversa ficavam invisíveis pra
// ela — e a Julia respondia "Sim gostei" (resposta ao pedido de avaliação) com "Qual o serviço que
// você gostaria de fazer com a gente hoje?", como se fosse cliente novo (caso real, 2026-09-22).
//
// Aqui essas mensagens ficam guardadas por contato e entram como um bloco ANTES da próxima mensagem
// que a Julia processa. Depois disso passam a viver no histórico normal e saem daqui.
//
// Estado em dados/contexto.json (gitignored; dado privado de cliente):
//   { "<jid>": { recentes: [{ ts, quem, texto }], avaliacaoEm, conviteEm } }
//   quem = 'equipe' | 'julia' (mensagem automática) | 'cliente'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carimboHora } from './hora.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'contexto.json');

export const CONFIG_CONTEXTO = {
  MAX_RECENTES: 8,                 // só as últimas mensagens — o bastante pra Julia se situar
  MAX_CHARS: 500,                  // mensagem longa da equipe entra cortada
  VALIDADE_MS: 14 * 24 * 60 * 60 * 1000, // mensagem de mais de 14 dias não é mais "contexto"
  CAMPANHA_MS: 7 * 24 * 60 * 60 * 1000
};

const ROTULOS = {
  equipe: 'equipe da loja',
  julia: 'você (mensagem automática)',
  cliente: 'cliente'
};

function _vazio() {
  return { recentes: [], avaliacaoEm: null, conviteEm: null };
}

function _validos(recentes, agora, cfg) {
  return (recentes || []).filter((r) => r && agora - r.ts < cfg.VALIDADE_MS);
}

// Anota uma mensagem que não passou pelo atendimento da Julia. PURA: devolve um estado novo.
export function anotarMensagem(estado, jid, quem, texto, agora, cfg = CONFIG_CONTEXTO) {
  const t = String(texto == null ? '' : texto).trim();
  if (!jid || !t) return estado || {};
  const atual = (estado && estado[jid]) || _vazio();
  const recentes = [
    ..._validos(atual.recentes, agora, cfg),
    { ts: agora, quem, texto: t.slice(0, cfg.MAX_CHARS) }
  ].slice(-cfg.MAX_RECENTES);
  return { ...(estado || {}), [jid]: { ...atual, recentes } };
}

// Mensagens ainda válidas do contato, da mais velha pra mais nova. PURA.
export function recentesDe(estado, jid, agora, cfg = CONFIG_CONTEXTO) {
  const atual = estado && estado[jid];
  return atual ? _validos(atual.recentes, agora, cfg) : [];
}

// Depois que a Julia processou a mensagem (o bloco foi pro histórico), tira o que entrou no bloco.
// `ate` = hora em que o bloco foi montado: o que chegou depois (a equipe falou enquanto o modelo
// pensava) fica pra próxima. PURA.
export function limparRecentes(estado, jid, ate = Infinity) {
  const atual = estado && estado[jid];
  if (!atual) return estado || {};
  return { ...estado, [jid]: { ...atual, recentes: (atual.recentes || []).filter((r) => r.ts > ate) } };
}

// Bloco que vai antes da mensagem do cliente. Os carimbos são no fuso da loja. PURA.
export function montarBlocoContexto(recentes) {
  if (!recentes || !recentes.length) return '';
  const linhas = recentes.map((r) =>
    `${carimboHora(new Date(r.ts))} ${ROTULOS[r.quem] || r.quem}: ${String(r.texto).replace(/\s*\n\s*/g, ' / ')}`
  );
  return [
    '[CONTEXTO DO SISTEMA: mensagens desta conversa que aconteceram fora do seu atendimento; o cliente viu todas]',
    ...linhas,
    '[FIM DO CONTEXTO: a mensagem do cliente vem a seguir]'
  ].join('\n');
}

// ---- estado do pedido de avaliação (PURAS) ----

export function marcarAvaliacaoEnviada(estado, jid, agora) {
  const atual = (estado && estado[jid]) || _vazio();
  return { ...(estado || {}), [jid]: { ...atual, avaliacaoEm: agora } };
}

// A Julia já mandou o convite com o link nesta conversa (fixo ou pelo modelo).
export function marcarConvite(estado, jid, agora) {
  const atual = (estado && estado[jid]) || _vazio();
  return { ...(estado || {}), [jid]: { ...atual, conviteEm: agora } };
}

// O pedido de avaliação saiu, ainda vale e a Julia ainda não convidou depois dele?
export function aguardandoRespostaAvaliacao(estado, jid, agora, cfg = CONFIG_CONTEXTO) {
  const atual = estado && estado[jid];
  if (!atual || !atual.avaliacaoEm) return false;
  if (agora - atual.avaliacaoEm >= cfg.VALIDADE_MS) return false;
  return !(atual.conviteEm && atual.conviteEm >= atual.avaliacaoEm);
}

export function marcarCampanha(estado, jid, agora) {
  const atual = (estado && estado[jid]) || _vazio();
  return { ...(estado || {}), [jid]: { ...atual, campanhaEm: agora } };
}

export function marcarCampanhaRespondida(estado, jid, agora) {
  const atual = (estado && estado[jid]) || _vazio();
  return { ...(estado || {}), [jid]: { ...atual, campanhaRespondidaEm: agora } };
}

export function aguardandoRespostaCampanha(estado, jid, agora, cfg = CONFIG_CONTEXTO) {
  const atual = estado && estado[jid];
  if (!atual || !atual.campanhaEm) return false;
  if (agora - atual.campanhaEm >= cfg.CAMPANHA_MS) return false;
  return !(atual.campanhaRespondidaEm && atual.campanhaRespondidaEm >= atual.campanhaEm);
}

// Faxina: tira contato sem mensagem válida e sem pedido de avaliação valendo. PURA.
export function limparVencidos(estado, agora, cfg = CONFIG_CONTEXTO) {
  const out = {};
  for (const [jid, atual] of Object.entries(estado || {})) {
    const recentes = _validos(atual.recentes, agora, cfg);
    const avaliacaoValendo = !!atual.avaliacaoEm && agora - atual.avaliacaoEm < cfg.VALIDADE_MS;
    const campanhaValendo = !!atual.campanhaEm && agora - atual.campanhaEm < cfg.CAMPANHA_MS;
    if (recentes.length || avaliacaoValendo || campanhaValendo) out[jid] = { ...atual, recentes };
  }
  return out;
}

// Texto que representa uma mensagem da equipe/cliente (saída do classificarMensagem). PURA.
export function descreverMensagem(c) {
  if (!c) return '';
  if (c.tipo === 'texto') return c.texto || '';
  if (c.tipo === 'imagem') return c.legenda ? `(enviou uma foto) ${c.legenda}` : '(enviou uma foto)';
  if (c.tipo === 'audio') return '(enviou um áudio)';
  if (c.tipo === 'documento') return c.legenda ? `(enviou um arquivo) ${c.legenda}` : '(enviou um arquivo)';
  return '';
}

// ---- persistência (escrita atômica; arquivo ausente/corrompido -> {}) ----
export function lerContexto(caminho = CAMINHO_PADRAO) {
  try {
    if (!existsSync(caminho)) return {};
    const obj = JSON.parse(readFileSync(caminho, 'utf8'));
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch (e) {
    console.error('⚠️  contexto ilegível, começando vazio:', e.message);
    return {};
  }
}
export function gravarContexto(obj, caminho = CAMINHO_PADRAO) {
  const dir = path.dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = caminho + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  renameSync(tmp, caminho);
}
