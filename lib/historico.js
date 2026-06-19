// historico.js — persiste o histórico de conversa por contato em disco, pra o contexto
// sobreviver a reinício/crash/reconexão do bot (antes ficava só em memória e zerava).
// Formato: { "<jid>": [ {role, parts}, ... ] } — o mesmo array que o Gemini recebe.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Dados privados de clientes: ficam em dados/ (gitignored), nunca vão pro GitHub.
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'conversas.json');

// Lê as conversas salvas. Arquivo ausente ou corrompido NÃO derruba o bot — devolve {}.
export function lerHistorico(caminho = CAMINHO_PADRAO) {
  try {
    if (!existsSync(caminho)) return {};
    const obj = JSON.parse(readFileSync(caminho, 'utf8'));
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch (e) {
    console.error('⚠️  histórico ilegível, começando vazio:', e.message);
    return {};
  }
}

// Grava as conversas (escrita atômica: tmp + rename, pra não corromper se cair no meio).
export function gravarHistorico(conversasObj, caminho = CAMINHO_PADRAO) {
  const dir = path.dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = caminho + '.tmp';
  writeFileSync(tmp, JSON.stringify(conversasObj), 'utf8');
  renameSync(tmp, caminho);
}
