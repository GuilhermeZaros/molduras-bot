// aprendizado.js — grava os atendimentos que a EQUIPE HUMANA assume (conversa pausada por
// etiqueta) como material de estudo, pra depois refinar o jeito da Julia. Uma linha JSONL por
// mensagem. Privado: fica em dados/aprendizado.jsonl (a pasta dados/ é gitignored — não vai
// pro GitHub). Best-effort: se falhar, loga e segue (nunca derruba o bot).
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'aprendizado.jsonl');

// Monta a linha JSONL de uma mensagem do atendimento humano. PURA (testável).
// quem = 'cliente' (mensagem do cliente) | 'equipe' (mensagem da equipe humana).
export function montarLinhaAprendizado(jid, quem, texto, ts) {
  return JSON.stringify({
    ts: ts || Date.now(), jid: String(jid || ''), quem, texto: String(texto || '')
  }) + '\n';
}

// Anexa a mensagem ao log de aprendizado (append). Best-effort.
export function registrarAprendizado(jid, quem, texto, caminho = CAMINHO_PADRAO) {
  try {
    const dir = path.dirname(caminho);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(caminho, montarLinhaAprendizado(jid, quem, texto), 'utf8');
  } catch (e) {
    console.error('⚠️  não deu pra registrar aprendizado:', e.message);
  }
}
