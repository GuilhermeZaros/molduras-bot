// pausa.js — pausa a Julia numa conversa etiquetada no WhatsApp Business.
// Estado derivado de dois eventos do Baileys: labels.edit (id->nome) e labels.association
// (conversa->etiqueta). "Pausado" = a conversa tem alguma etiqueta cujo nome casa com a config.
// Persistido em dados/pausados.json (gitignored; dado de conversa de cliente).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'pausados.json');

const _norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
const _vazio = () => ({ labels: {}, assocs: {} });

// labels.edit -> upsert/remoção do nome da etiqueta por id. PURA.
export function aoEditarLabel(estado, label) {
  if (!label || !label.id) return estado;
  const labels = { ...estado.labels };
  if (label.deleted) delete labels[label.id];
  else labels[label.id] = label.name || '';
  return { labels, assocs: estado.assocs };
}

// labels.association -> add/remove de etiqueta numa conversa. Só associações de CONVERSA
// (sem messageId); associações de MENSAGEM são ignoradas. PURA.
export function aoAssociar(estado, evento) {
  const a = evento && evento.association;
  if (!a || !a.chatId || !a.labelId || a.messageId) return estado;
  const assocs = { ...estado.assocs };
  const doChat = { ...(assocs[a.chatId] || {}) };
  if (evento.type === 'add') doChat[a.labelId] = true;
  else if (evento.type === 'remove') delete doChat[a.labelId];
  else return estado; // evento mal formado (type ausente) — ignora pra não corromper o estado
  if (Object.keys(doChat).length) assocs[a.chatId] = doChat;
  else delete assocs[a.chatId];
  return { labels: estado.labels, assocs };
}

// A conversa está pausada? cfg = { nome, id }. Casa por id (se cfg.id setado) OU por nome. PURA.
export function estaPausado(estado, jid, cfg) {
  const doChat = estado && estado.assocs ? estado.assocs[jid] : null;
  if (!doChat) return false;
  const idAlvo = cfg && cfg.id ? String(cfg.id) : '';
  const nomeAlvo = _norm(cfg && cfg.nome);
  for (const labelId of Object.keys(doChat)) {
    if (idAlvo && labelId === idAlvo) return true;
    if (nomeAlvo && _norm(estado.labels[labelId]) === nomeAlvo) return true;
  }
  return false;
}

// ---- persistência (escrita atômica; arquivo ausente/corrompido -> estado vazio) ----
export function lerPausados(caminho = CAMINHO_PADRAO) {
  try {
    if (!existsSync(caminho)) return _vazio();
    const obj = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return _vazio();
    return {
      labels: obj.labels && typeof obj.labels === 'object' && !Array.isArray(obj.labels) ? obj.labels : {},
      assocs: obj.assocs && typeof obj.assocs === 'object' && !Array.isArray(obj.assocs) ? obj.assocs : {}
    };
  } catch (e) {
    console.error('⚠️  pausados ilegível, começando vazio:', e.message);
    return _vazio();
  }
}
export function gravarPausados(estado, caminho = CAMINHO_PADRAO) {
  const dir = path.dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = caminho + '.tmp';
  writeFileSync(tmp, JSON.stringify(estado), 'utf8');
  renameSync(tmp, caminho);
}
