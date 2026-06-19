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

// Apara o histórico pras últimas `max` entradas SEM quebrar pares functionCall/functionResponse.
// O Gemini exige que um functionResponse venha logo após um functionCall — e rejeita um histórico
// que comece com um functionResponse "órfão" (cujo functionCall foi cortado). Por isso, depois de
// cortar, descartamos os turnos do começo até cair numa mensagem de USUÁRIO com TEXTO (início
// natural de conversa) — o que garante uma sequência válida dali pra frente. PURO.
function _ehUsuarioTexto(turno) {
  return !!turno && turno.role === 'user' &&
    Array.isArray(turno.parts) &&
    turno.parts.some(p => p && typeof p.text === 'string') &&
    !turno.parts.some(p => p && p.functionResponse);
}

export function apararHistorico(historico, max) {
  const h = (historico || []).slice(-max);
  let i = 0;
  while (i < h.length && !_ehUsuarioTexto(h[i])) i++;
  return h.slice(i);
}

// Enxuga o histórico GUARDADO entre turnos: mantém só a conversa em TEXTO (mensagens do cliente
// e respostas da Bruna) e descarta os turnos de ferramenta (functionCall/functionResponse) — o
// JSON cru das tools não precisa viajar de novo em toda requisição (economiza muito token). O
// contexto da conversa fica nas próprias mensagens de texto; as tools são re-chamadas quando
// preciso. Mantém só as partes de texto de cada turno. PURO.
export function enxugarHistorico(historico) {
  return (historico || [])
    .map(function (t) {
      if (!t || !Array.isArray(t.parts)) return null;
      const textos = t.parts.filter(function (p) { return p && typeof p.text === 'string'; });
      return textos.length ? { role: t.role, parts: textos } : null;
    })
    .filter(Boolean);
}

// Grava as conversas (escrita atômica: tmp + rename, pra não corromper se cair no meio).
export function gravarHistorico(conversasObj, caminho = CAMINHO_PADRAO) {
  const dir = path.dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = caminho + '.tmp';
  writeFileSync(tmp, JSON.stringify(conversasObj), 'utf8');
  renameSync(tmp, caminho);
}
