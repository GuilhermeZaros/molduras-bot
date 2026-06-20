// midia.js — transforma áudio/imagem do cliente em TEXTO, pra entrar no fluxo de texto da Julia.
// O Gemini (gemini-3.5-flash) é multimodal: transcreve áudio e descreve imagem.
import { genai, MODELO, MODELO_RESERVA } from './gemini.js';

// Classifica a mensagem do WhatsApp por tipo. PURO (sem API). Usado pelo index.js.
export function classificarMensagem(msg) {
  const m = msg && msg.message ? msg.message : null;
  if (!m) return { tipo: 'vazio' };
  const texto = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text);
  if (texto) return { tipo: 'texto', texto: texto };
  if (m.imageMessage) return { tipo: 'imagem', legenda: m.imageMessage.caption || '' };
  if (m.audioMessage) return { tipo: 'audio' };
  return { tipo: 'outro' };
}

// Monta a "part" inline do Gemini a partir de um buffer + mime. PURO.
export function parteInline(buffer, mime) {
  return { inlineData: { mimeType: mime, data: Buffer.from(buffer).toString('base64') } };
}

// Chamada multimodal best-effort: tenta o principal; se falhar, tenta o reserva uma vez.
async function gerarMidia(parts) {
  const req = { contents: [{ role: 'user', parts: parts }] };
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
