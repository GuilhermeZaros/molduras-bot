// atendimento.js — estado do atendimento por contato + decisão de encerrar/esquecer.
// Estado persiste em dados/atendimentos.json (gitignored; dado privado de cliente).
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarMensagemResumo } from './resumo.js';
import { horaDaLoja } from './hora.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_PADRAO = path.join(DIR, '..', 'dados', 'atendimentos.json');

// Tempos ajustáveis (ms).
export const CONFIG_PADRAO = {
  SILENCIO_MS: 3 * 60 * 60 * 1000,   // 3h sem mensagem = atendimento encerrado
  FOLGA_DESPEDIDA_MS: 5 * 60 * 1000, // folga após despedida antes de resumir
  ESQUECER_MS: 72 * 60 * 60 * 1000,  // 72h após o fim -> apaga o contexto
  VARREDURA_MS: 5 * 60 * 1000,       // intervalo da varredura no index.js
  TOQUE_MS: 36 * 60 * 60 * 1000,     // 36h sem o cliente responder -> dá um "toque"
  TOQUE_HORA_INICIO: 8,              // toque só em horário útil: 8h...
  TOQUE_HORA_FIM: 18,                // ...até 18h (nunca de madrugada)
  EQUIPE_RECENTE_MS: 90 * 60 * 1000  // 1h30 após a equipe falar numa conversa, a Julia fica muda nela
};

// Normaliza texto do cliente: lowercase, sem acentos/pontuação/emoji, espaços colapsados.
// Compartilhado pelos detectores — deixa 'Ok! 👍', 'ok', 'OK.' virarem todos 'ok'.
function _normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')     // tira acentos (combining marks)
    .replace(/[^a-z0-9\s]/g, ' ') // pontuação e emoji viram espaço
    .replace(/\s+/g, ' ')       // colapsa espaços
    .trim();
}

// A última mensagem do cliente parece um fechamento? Conservadora: prefere FALSO NEGATIVO
// (cai no silêncio de 3h) a encerrar cedo demais. PURA.
//
// Duas camadas, com sensibilidade calibrada:
// - SUBSTRING: casa em qualquer lugar do texto. Só padrões inequívocos — 'obrigad', 'tchau',
//   'estarei no aguardo'. Evita coisas ambíguas como 'era isso' (casaria "não era isso que eu
//   pedi") ou 'agradec' (casaria "agradeceria").
// - EXATO: casa só quando a mensagem INTEIRA (depois de tirar pontuação/emoji) é a palavra.
//   Serve pras respostas curtas de fechamento — 'ok', 'blz', 'beleza', 'esta bom'. Sem isso,
//   'ok' pegaria "ok isso é caro?" e viraria falso positivo.
const _DESPEDIDAS_SUBSTR = [
  'obrigad', 'brigad', 'agradecid', 'valeu', 'vlw', 'tchau', 'flw',
  'era so isso', 'era isso mesmo', 'so isso mesmo', 'ate mais', 'ate logo', 'falou',
  'estarei no aguardo', 'fico no aguardo', 'aguardo entao', 'aguardo o retorno'
];
const _DESPEDIDAS_EXATAS = new Set([
  'ok', 'okay',
  'blz', 'beleza',
  'esta bom', 'ta bom', 'ta bem', 'tudo bem', 'tudo certo', 'esta certo', 'ta certo',
  'aguardo', 'aguardarei', 'vou aguardar',
  'combinado', 'fechado', 'entao ta'
]);
export function detectarDespedida(texto) {
  const t = _normalizar(texto);
  if (!t) return false;
  if (_DESPEDIDAS_EXATAS.has(t)) return true;
  return _DESPEDIDAS_SUBSTR.some((p) => t.includes(p));
}

// A resposta do cliente é um ACEITE de aviso da equipe? Broader que detectarDespedida —
// inclui "vou passar", "estou indo", "que ótimo", "perfeito". SÓ USE quando a equipe falou
// recentemente; usar em qualquer mensagem pega falso positivo (ex.: "vou passar amanhã pra
// olhar as opções" no meio da coleta viraria fim de atendimento). PURA.
const _ACEITE_SUBSTR = [
  'vou passar', 'vou pegar', 'vou buscar', 'vou retirar', 'vou aparecer', 'vou la', 'vou ai',
  'ja vou', 'ja to indo', 'ja to a caminho', 'ja to chegando', 'ja to na rua',
  'estou indo', 'estou a caminho', 'estou chegando', 'estou ai', 'estou la',
  'to indo', 'to a caminho', 'to chegando',
  'chegando ai', 'chegando la',
  'passo ai', 'passo la', 'passo mais tarde', 'passo depois', 'passo amanha',
  'apareco', 'aparecerei',
  'que bom', 'que otimo', 'que legal', 'que boa noticia', 'boa noticia',
  'perfeito', 'otimo saber'
];
const _ACEITE_EXATAS = new Set([
  'certinho', 'certo', 'joia', 'tranquilo', 'demais', 'otimo', 'otima'
]);
export function detectarAceiteDeAviso(texto) {
  if (detectarDespedida(texto)) return true; // toda despedida (obrigada, ok, blz…) é aceite
  const t = _normalizar(texto);
  if (!t) return false;
  if (_ACEITE_EXATAS.has(t)) return true;
  return _ACEITE_SUBSTR.some((p) => t.includes(p));
}

// A equipe humana falou nesta conversa nos últimos EQUIPE_RECENTE_MS? PURA.
// Se falou, ela ASSUMIU o atendimento: a Julia fica muda na conversa (pra tudo, não só
// aceites) até a janela vencer — cada mensagem da equipe renova o prazo.
export function equipeFalouRecente(meta, agora, cfg) {
  if (!meta || !meta.ultimaMensagemEquipe) return false;
  return (agora - meta.ultimaMensagemEquipe) < cfg.EQUIPE_RECENTE_MS;
}

export function atendimentoSoDaEquipe(agora) {
  return { ultimaAtividade: 0, despedida: false, fimAtendimento: agora, resumoEnviado: true, toqueEnviado: true };
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

// Deve dar um "toque" no cliente que sumiu? PURA. Só o tempo/estado — o horário útil
// é checado à parte (horaUtil), porque depende do fuso da máquina.
// Não toca se: já tocou, ou a última mensagem foi uma despedida (aí não é "sumiço").
export function avaliarToque(meta, agora, cfg) {
  if (meta.toqueEnviado) return false;
  if (meta.despedida) return false;
  const idle = agora - (meta.ultimaAtividade || 0);
  return idle >= cfg.TOQUE_MS;
}

// A hora (0-23) está na janela [ini, fim)? PURA. Evita mandar toque de madrugada.
export function horaUtil(hora, ini, fim) {
  return hora >= ini && hora < fim;
}

// Mensagem fixa do toque (não é IA; não entra no histórico). PURA. Sem emoji de coração.
// Texto neutro de propósito: serve tanto quando houve orçamento (modo normal) quanto quando
// a coleta foi passada pra equipe (modo triagem, sem orçamento).
export function montarMensagemToque() {
  return 'Oi! Passando pra saber se você ainda tem interesse ou se ficou alguma dúvida 😊 Qualquer coisa é só me chamar por aqui!';
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
//   marcarToque(jid)     -> grava toqueEnviado=true e persiste
//   agora, cfg, numeroResumo, log
// Devolve { encerrados, esquecidos, toques }.
export async function verificarAtendimentos(deps) {
  const { listarAtendimentos, lerConversa, gerarResumo, onWhatsApp, enviar,
          encerrar, esquecer, marcarToque, agora, cfg, numeroResumo, log } = deps;
  const aviso = (m) => { if (log) log(m); };
  // Formato da mensagem pro dono: injetável (o modo triagem manda um relatório em tópicos);
  // sem injeção, cai no resumo padrão — mantém o comportamento normal e os testes atuais.
  const montarMensagem = deps.montarMensagem || montarMensagemResumo;

  const metas = listarAtendimentos();
  let encerrados = 0, esquecidos = 0, toques = 0;
  let destino = null, destinoResolvido = false;
  // Hora no fuso da LOJA (o VPS roda em UTC — ver lib/hora.js).
  const horaAgora = horaDaLoja(agora);

  for (const jid of Object.keys(metas)) {
    const acao = avaliarAtendimento(metas[jid], agora, cfg);

    if (acao.esquecer) { esquecer(jid); esquecidos++; continue; }

    // Toque no cliente que sumiu (36h), só em horário útil. Vale mesmo com o
    // atendimento já encerrado (o resumo saiu em 3h; o toque vem depois).
    if (marcarToque && avaliarToque(metas[jid], agora, cfg) &&
        horaUtil(horaAgora, cfg.TOQUE_HORA_INICIO, cfg.TOQUE_HORA_FIM)) {
      try {
        await enviar(jid, montarMensagemToque());
        marcarToque(jid);
        toques++;
      } catch (e) {
        aviso(`falha ao enviar toque de ${jid}: ${e.message}`); // tenta no próximo ciclo
      }
    }

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
      await enviar(destino, montarMensagem(jid, resumo));
      encerrar(jid, agora);
      encerrados++;
    } catch (e) {
      aviso(`falha ao enviar resumo de ${jid}: ${e.message}`); // NÃO encerra: tenta no próximo ciclo
    }
  }
  return { encerrados, esquecidos, toques };
}
