// midia.js — transforma áudio/imagem do cliente em TEXTO, pra entrar no fluxo de texto da Julia.
// O Gemini (gemini-3.5-flash) é multimodal: transcreve áudio e descreve imagem.
import { genai, MODELO, MODELO_RESERVA } from './gemini.js';

// Desembrulha "envelopes" do WhatsApp e devolve o conteúdo real. PURO. Idempotente.
// Sem isso, mensagens efêmeras (que somem) e "ver uma vez" chegam com o texto/mídia
// escondido em .message.message e a Julia trata como { tipo: 'outro' } → não responde.
// (Também cobre documentWithCaptionMessage por segurança — mesmo padrão de wrapper.)
export function mensagemInterna(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.ephemeralMessage && m.ephemeralMessage.message) return mensagemInterna(m.ephemeralMessage.message);
  if (m.viewOnceMessage && m.viewOnceMessage.message) return mensagemInterna(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2 && m.viewOnceMessageV2.message) return mensagemInterna(m.viewOnceMessageV2.message);
  if (m.viewOnceMessageV2Extension && m.viewOnceMessageV2Extension.message) return mensagemInterna(m.viewOnceMessageV2Extension.message);
  if (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message) return mensagemInterna(m.documentWithCaptionMessage.message);
  return m;
}

// Classifica a mensagem do WhatsApp por tipo. PURO (sem API). Usado pelo index.js.
// Além do texto simples/estendido, cobre respostas a botões/listas/quick-replies do
// WhatsApp Business — que chegam num campo próprio e antes viravam { tipo: 'outro' }.
export function classificarMensagem(msg) {
  const m = mensagemInterna(msg && msg.message);
  if (!m) return { tipo: 'vazio' };
  // Texto puro (inclui mensagens vindas de anúncio do Facebook/Instagram — CTWA — que
  // chegam como extendedTextMessage com contextInfo.externalAdReply).
  const texto = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text);
  if (texto) return { tipo: 'texto', texto };
  // Cliente clicou num botão / template button / lista. Usa o rótulo visível como texto
  // (fallback pro id) — pra Julia responder ao que a cliente "disse" apertando o botão.
  const btn = m.buttonsResponseMessage && (m.buttonsResponseMessage.selectedDisplayText || m.buttonsResponseMessage.selectedButtonId);
  if (btn) return { tipo: 'texto', texto: String(btn) };
  const tpl = m.templateButtonReplyMessage && (m.templateButtonReplyMessage.selectedDisplayText || m.templateButtonReplyMessage.selectedId);
  if (tpl) return { tipo: 'texto', texto: String(tpl) };
  const lst = m.listResponseMessage && (m.listResponseMessage.title || (m.listResponseMessage.singleSelectReply && m.listResponseMessage.singleSelectReply.selectedRowId));
  if (lst) return { tipo: 'texto', texto: String(lst) };
  if (m.imageMessage) return { tipo: 'imagem', legenda: m.imageMessage.caption || '' };
  if (m.audioMessage) return { tipo: 'audio' };
  if (m.documentMessage) {
    const d = m.documentMessage;
    return { tipo: 'documento', nome: d.fileName || '', mime: d.mimetype || '', legenda: d.caption || '' };
  }
  return { tipo: 'outro' };
}

// Arquivo mandado pela opção Documento (pra impressão, costuma ser a foto na qualidade original).
// A Julia não baixa nem vê o conteúdo: só fica sabendo que chegou, pra confirmar e seguir. PURO.
export function descreverArquivo(c) {
  const nome = String((c && c.nome) || '').trim().slice(0, 80);
  const mime = String((c && c.mime) || '').toLowerCase();
  const tipo = mime.startsWith('image/') ? 'imagem' : mime === 'application/pdf' ? 'PDF' : '';
  let txt = '[Cliente enviou um arquivo' + (nome ? ': ' + nome : '') + (tipo ? ' (' + tipo + ')' : '') + ']';
  const leg = String((c && c.legenda) || '').trim();
  if (leg) txt += ' Legenda do cliente: "' + leg + '"';
  return txt;
}

export function textoCitado(msg) {
  const m = mensagemInterna(msg && msg.message);
  if (!m) return '';
  const alvo = Object.values(m).find((v) => v && typeof v === 'object' && v.contextInfo && v.contextInfo.quotedMessage);
  const q = alvo ? mensagemInterna(alvo.contextInfo.quotedMessage) : null;
  if (!q) return '';
  return q.conversation || (q.extendedTextMessage && q.extendedTextMessage.text) || (q.imageMessage && q.imageMessage.caption) || '';
}

// Monta a "part" inline do Gemini a partir de um buffer + mime. PURO.
export function parteInline(buffer, mime) {
  return { inlineData: { mimeType: mime, data: Buffer.from(buffer).toString('base64') } };
}

// Chamada multimodal best-effort: tenta o principal; se falhar, tenta o reserva uma vez.
// thinkingBudget 0: transcrever/descrever não precisa de raciocínio interno — com o default
// (thinking dinâmico) cada áudio/foto queimaria tokens de cota à toa.
async function gerarMidia(parts) {
  const req = {
    contents: [{ role: 'user', parts: parts }],
    config: { thinkingConfig: { thinkingBudget: 0 } }
  };
  try {
    return (await genai.models.generateContent({ ...req, model: MODELO })).text;
  } catch (e) {
    return (await genai.models.generateContent({ ...req, model: MODELO_RESERVA })).text;
  }
}

// Transcreve o áudio do cliente → texto (só o que foi dito).
export async function transcreverAudio(buffer, mime) {
  const parts = [
    parteInline(buffer, mime),
    { text: 'Transcreva este áudio em português. Devolva só o que foi dito, sem comentar nem rotular.' }
  ];
  return ((await gerarMidia(parts)) || '').trim();
}

// Entende a foto do cliente (contexto molduraria) → texto pra Julia conduzir.
export async function entenderImagem(buffer, mime, legenda) {
  const parts = [
    parteInline(buffer, mime),
    { text: 'Você ajuda uma molduraria. Em 1-2 frases, diga o que o cliente enviou nesta foto ' +
            '(tipo de imagem/objeto pra emoldurar; cor/tema se der pra notar). Não invente medidas nem preços.' }
  ];
  const desc = ((await gerarMidia(parts)) || '').trim();
  let txt = desc ? ('[Cliente enviou uma foto: ' + desc + ']') : '[Cliente enviou uma foto]';
  const leg = (legenda || '').trim();
  if (leg) txt += ' Legenda do cliente: "' + leg + '"';
  return txt;
}
