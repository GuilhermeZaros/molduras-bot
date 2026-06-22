// atendimento.js — estado do atendimento por contato + decisão de encerrar/esquecer.
// Estado persiste em dados/atendimentos.json (gitignored; dado privado de cliente).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarMensagemResumo } from './resumo.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'atendimentos.json');

// Tempos ajustáveis (ms).
export const CONFIG_PADRAO = {
  SILENCIO_MS: 3 * 60 * 60 * 1000,   // 3h sem mensagem = atendimento encerrado
  FOLGA_DESPEDIDA_MS: 5 * 60 * 1000, // folga após despedida antes de resumir
  ESQUECER_MS: 72 * 60 * 60 * 1000,  // 72h após o fim -> apaga o contexto
  VARREDURA_MS: 5 * 60 * 1000        // intervalo da varredura no index.js
};

// A última mensagem do cliente parece um fechamento? Conservadora (a folga de 5min cobre falsos
// positivos). PURA.
const _DESPEDIDAS = [
  'obrigad', 'brigad', 'agradec', 'valeu', 'vlw', 'tchau', 'flw',
  'era so isso', 'era isso', 'so isso mesmo', 'ate mais', 'ate logo', 'falou'
];
export function detectarDespedida(texto) {
  const t = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // tira acentos (combining marks)
  return _DESPEDIDAS.some((p) => t.includes(p));
}

// Decide o que fazer com um atendimento, dado o estado, o agora e a config. PURA.
// encerrar e esquecer são mutuamente exclusivos (esquecer só vale depois de encerrado).
export function avaliarAtendimento(meta, agora, cfg) {
  const idle = agora - (meta.ultimaAtividade || 0);
  if (meta.fimAtendimento == null) {
    const porDespedida = !!meta.despedida && idle >= cfg.FOLGA_DESPEDIDA_MS;
    const porSilencio = idle >= cfg.SILENCIO_MS;
    return { encerrar: porDespedida || porSilencio, esquecer: false };
  }
  const desdeFim = agora - meta.fimAtendimento;
  return { encerrar: false, esquecer: desdeFim >= cfg.ESQUECER_MS };
}

// ---- persistência (escrita atômica; arquivo ausente/corrompido -> {}) ----
export function lerAtendimentos(caminho = CAMINHO_PADRAO) {
  try {
    if (!existsSync(caminho)) return {};
    const obj = JSON.parse(readFileSync(caminho, 'utf8'));
    return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
  } catch (e) {
    console.error('⚠️  atendimentos ilegível, começando vazio:', e.message);
    return {};
  }
}
export function gravarAtendimentos(obj, caminho = CAMINHO_PADRAO) {
  const dir = path.dirname(caminho);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = caminho + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  renameSync(tmp, caminho);
}
