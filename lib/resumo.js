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

// Pede ao Gemini UM parágrafo de resumo do atendimento (pro dono ler). Best-effort:
// principal -> reserva; qualquer falha (ou diálogo vazio) -> null (o chamador usa o fallback).
export async function gerarResumo(historico) {
  const dialogo = extrairDialogo(historico);
  if (!dialogo) return null;

  const prompt =
    'Você resume atendimentos da Vera Molduras e Decoração para o dono da loja ler.\n' +
    'Escreva UM parágrafo curto, em português, com o essencial: o que o cliente queria, ' +
    'medidas/molduras citadas, orçamento passado e o que ficou pendente. ' +
    'Não invente nada que não esteja na conversa. Não cumprimente, vá direto ao resumo.\n\n' +
    '--- conversa ---\n' + dialogo;

  // thinkingBudget 0: resumir é tarefa simples — sem isso o thinking dinâmico gastaria cota à toa.
  const req = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { thinkingConfig: { thinkingBudget: 0 } }
  };
  try {
    const r = await genai.models.generateContent({ ...req, model: MODELO });
    return (r.text || '').trim() || null;
  } catch (e) {
    try {
      const r = await genai.models.generateContent({ ...req, model: MODELO_RESERVA });
      return (r.text || '').trim() || null;
    } catch (e2) {
      console.error('⚠️  resumo: Gemini falhou (principal e reserva):', e2.message);
      return null; // best-effort esgotado: o chamador usa a mensagem de fallback
    }
  }
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

// ---- MODO TRIAGEM ----
// Relatório de TRIAGEM pro dono: em vez de um parágrafo solto, uma lista de tópicos com o
// que o cliente quer (o quê, tamanho, moldura/cor, vidro, chapa, prazo, observações).
// Best-effort principal->reserva; diálogo vazio ou falha nos dois -> null (o chamador usa a
// transcrição da conversa como fallback, pra o dono nunca ficar sem a informação).
export async function gerarRelatorioTriagem(historico) {
  const dialogo = extrairDialogo(historico);
  if (!dialogo) return null;

  const prompt =
    'Você organiza, para o dono da Vera Molduras e Decoração, um resumo do que o cliente ' +
    'quer, a partir da conversa com a atendente. Responda SÓ com estes tópicos, um por ' +
    'linha, exatamente nestes rótulos, preenchendo com o que estiver na conversa. Se a ' +
    'informação não aparecer, escreva "não informado" (NUNCA invente):\n' +
    '• O que quer:\n• Tamanho:\n• Moldura:\n• Vidro:\n• Chapa/fundo:\n• Prazo/desejo:\n' +
    '• Observações:\n\n' +
    'Seja curto e direto. Não cumprimente e não escreva nada além desses tópicos.\n\n' +
    '--- conversa ---\n' + dialogo;

  // thinkingBudget 0: resumir é tarefa simples — sem isso o thinking dinâmico gastaria cota à toa.
  const req = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { thinkingConfig: { thinkingBudget: 0 } }
  };
  try {
    const r = await genai.models.generateContent({ ...req, model: MODELO });
    return (r.text || '').trim() || null;
  } catch (e) {
    try {
      const r = await genai.models.generateContent({ ...req, model: MODELO_RESERVA });
      return (r.text || '').trim() || null;
    } catch (e2) {
      console.error('⚠️  relatório triagem: Gemini falhou (principal e reserva):', e2.message);
      return null; // best-effort esgotado: o chamador manda a transcrição de fallback
    }
  }
}

// Mensagem de triagem pro dono. Usa o relatório organizado; se veio null (IA fora do ar),
// cai pra transcrição da conversa (dialogoFallback) — o dono nunca fica sem a informação. PURA.
export function montarMensagemRelatorio(jid, nome, relatorio, dialogoFallback) {
  const num = formatarNumero(jid);
  const limpo = (nome || '').trim();
  const quem = limpo ? `${limpo} · ${num}` : num;
  const cab = `📋 Novo pedido (triagem): Cliente ${quem}`;

  const rel = (relatorio || '').trim();
  if (rel) return `${cab}\n\n${rel}`;

  const conversa = (dialogoFallback || '').trim();
  if (conversa) {
    return `${cab}\n\n(Não consegui organizar automaticamente; segue a conversa)\n\n${conversa}`;
  }
  return `${cab}\n(Sem conteúdo para resumir.)`;
}
