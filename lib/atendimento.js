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

// A última mensagem do cliente parece um fechamento? Conservadora: prefere FALSO NEGATIVO
// (cai no silêncio de 3h) a encerrar cedo demais. Por isso evitamos padrões curtos demais como
// 'era isso' (casaria "não era isso que eu pedi") ou 'agradec' (casaria "agradeceria"). PURA.
const _DESPEDIDAS = [
  'obrigad', 'brigad', 'agradecid', 'valeu', 'vlw', 'tchau', 'flw',
  'era so isso', 'era isso mesmo', 'so isso mesmo', 'ate mais', 'ate logo', 'falou'
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

// ---- orquestração (I/O injetado, no molde do verificarOficina) ----
//
// deps:
//   listarAtendimentos() -> { jid: meta }
//   lerConversa(jid)     -> historico[]
//   gerarResumo(historico) -> string|null   (I/O; pode lançar -> vira fallback)
//   onWhatsApp(numero)   -> jid destino | null
//   enviar(jid, texto)   -> envia
//   encerrar(jid, agora) -> grava fimAtendimento/resumoEnviado e persiste
//   esquecer(jid)        -> apaga conversa + meta e persiste
//   agora, cfg, numeroResumo, log
// Devolve { encerrados, esquecidos }.
export async function verificarAtendimentos(deps) {
  const { listarAtendimentos, lerConversa, gerarResumo, onWhatsApp, enviar,
          encerrar, esquecer, agora, cfg, numeroResumo, log } = deps;
  const aviso = (m) => { if (log) log(m); };

  const metas = listarAtendimentos();
  let encerrados = 0, esquecidos = 0;
  let destino = null, destinoResolvido = false;

  for (const jid of Object.keys(metas)) {
    const acao = avaliarAtendimento(metas[jid], agora, cfg);

    if (acao.esquecer) { esquecer(jid); esquecidos++; continue; }
    if (!acao.encerrar) continue;

    if (!destinoResolvido) {
      destino = await onWhatsApp(numeroResumo);
      destinoResolvido = true;
      if (!destino) aviso('número de resumo não está no WhatsApp; pulando resumos deste ciclo');
    }
    if (!destino) continue; // segue o loop pra ainda processar os 'esquecer' dos demais

    let resumo = null;
    try { resumo = await gerarResumo(lerConversa(jid)); } catch (e) { resumo = null; }

    try {
      await enviar(destino, montarMensagemResumo(jid, resumo));
      encerrar(jid, agora);
      encerrados++;
    } catch (e) {
      aviso(`falha ao enviar resumo de ${jid}: ${e.message}`); // NÃO encerra: tenta no próximo ciclo
    }
  }
  return { encerrados, esquecidos };
}
