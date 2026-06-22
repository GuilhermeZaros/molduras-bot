// resumo.js — produz a mensagem de resumo do atendimento a partir do histórico do Gemini.
// A mensagem é proativa (vai pro dono); NÃO entra no histórico de IA.
// genai/MODELO/MODELO_RESERVA: usados por gerarResumo (mesma feature) — não remover como "import morto".
import { genai, MODELO, MODELO_RESERVA } from './gemini.js';

// Transcrição legível do histórico do Gemini: só o texto humano (Cliente/Julia).
// Ignora partes de ferramenta (functionCall/functionResponse) e mídia. PURA.
export function extrairDialogo(historico) {
  const linhas = [];
  for (const turno of historico || []) {
    if (!turno || !Array.isArray(turno.parts)) continue;
    const textos = turno.parts
      .filter((p) => p && typeof p.text === 'string')
      .map((p) => p.text.trim())
      .filter(Boolean);
    if (!textos.length) continue;
    const quem = turno.role === 'model' ? 'Julia' : 'Cliente';
    linhas.push(`${quem}: ${textos.join(' ')}`);
  }
  return linhas.join('\n');
}

// jid -> número legível "DD NNNNN-NNNN" (tira o DDI 55). @lid/desconhecido degrada. PURA.
export function formatarNumero(jid) {
  const cru = String(jid || '').split('@')[0].replace(/\D/g, '');
  let d = cru;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11) return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return cru || String(jid || '');
}

// Mensagem final pro dono. resumo nulo/vazio -> fallback. PURA.
export function montarMensagemResumo(jid, resumo) {
  const num = formatarNumero(jid);
  const r = (resumo || '').trim();
  if (!r) {
    return `📝 Atendimento encerrado com o cliente ${num}.\n` +
      `(Não consegui gerar o resumo automático desta vez.)`;
  }
  return `📝 Cliente ${num}:\n\n${r}`;
}
