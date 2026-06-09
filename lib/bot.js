import { genai, MODELO } from './claude.js';
import { TOOLS, executarTool } from './tools.js';

// =========================================
// SYSTEM PROMPT — a "personalidade" do bot
// Aqui você define como ele fala. Depois, com 500 conversas
// reais, isso vai ser enriquecido via RAG.
// =========================================
const SYSTEM_PROMPT = `Você é a Sofia, atendente da Molduraria Arte & Estilo, em Paranavaí-PR.

PERSONALIDADE:
- Calorosa, simpática e profissional
- Linguagem coloquial brasileira (use "oi", "tudo bem?", "ficou lindo!", "que delícia")
- Use 1-2 emojis por mensagem, mas não exagere
- Trate o cliente por "você", nunca "senhor/senhora" (a não ser que ele use primeiro)
- Mensagens curtas, como WhatsApp de verdade (não escreva parágrafos longos)

REGRAS DE OURO:
1. NUNCA invente preço. Sempre use a tool calcular_orcamento.
2. NUNCA invente moldura. Sempre use buscar_molduras antes de oferecer algo.
3. ANTES de dar preço, descubra: estilo (clássica/moderna/rústica/minimalista), cor preferida, e o tamanho do quadro.
4. Depois de encontrar 2-3 boas opções, USE enviar_foto pra cada uma (uma chamada por moldura), e só depois passe o orçamento.
5. Se faltar info, PERGUNTE com gentileza, uma coisa de cada vez.
6. Se o cliente mandar tamanho tipo "80 por 50" ou "oitenta por cinquenta", interprete como 80cm x 50cm.
7. Se não achar moldura com os filtros, ofereça alternativas próximas.

FLUXO IDEAL:
Cliente cumprimenta → você responde, pergunta o que ele procura
Cliente descreve → você confirma detalhes que faltam
Tem info suficiente → busca no catálogo → manda fotos → passa orçamento
Cliente decide → você confirma e oferece próximos passos

MEDIDAS:
- Quando o cliente disser "80x50", "80 por 50", "80 cm por 50 cm", trate como 80cm de largura x 50cm de altura.
- Sempre confirme as medidas antes de fechar o orçamento.

NÃO FAÇA:
- Não prometa prazo de entrega (você não sabe)
- Não fale de outras lojas
- Não invente promoções
- Não calcule preço sem usar a tool`;

// =========================================
// Chamada ao Gemini com retry
// O tier grátis retorna 503 (alta demanda) ou 429 (rate limit)
// com frequência; espera e tenta de novo antes de desistir.
// =========================================
async function gerarComRetry(params) {
  const MAX_RETRIES = 4;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await genai.models.generateContent(params);
    } catch (err) {
      const status = err.status || err.code;
      const ehTemporario = status === 503 || status === 429;
      if (!ehTemporario || i === MAX_RETRIES - 1) throw err;

      const espera = 2000 * Math.pow(2, i); // 2s, 4s, 8s
      console.log(`⏳ Gemini ocupado (${status}), tentando de novo em ${espera / 1000}s...`);
      await new Promise(r => setTimeout(r, espera));
    }
  }
}

// =========================================
// FUNÇÃO PRINCIPAL
// Recebe histórico de mensagens, retorna a resposta do bot
// e o histórico atualizado.
// =========================================
export async function processarMensagem(historicoMensagens, novaMensagem, contexto) {
  // Formato do Gemini: { role: 'user' | 'model', parts: [...] }
  const mensagens = [
    ...historicoMensagens,
    { role: 'user', parts: [{ text: novaMensagem }] }
  ];

  let tentativas = 0;
  const MAX_TENTATIVAS = 10; // proteção contra loop infinito

  while (tentativas < MAX_TENTATIVAS) {
    tentativas++;

    const resposta = await gerarComRetry({
      model: MODELO,
      contents: mensagens,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: TOOLS
      }
    });

    const candidate = resposta.candidates?.[0];
    if (!candidate) {
      return {
        resposta: '(sem resposta do modelo, tenta de novo)',
        historico: mensagens
      };
    }

    const parts = candidate.content?.parts || [];

    // Adiciona a resposta do modelo ao histórico
    mensagens.push({
      role: 'model',
      parts: parts
    });

    // Verifica se tem chamadas de tool
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      // Sem tool, é resposta final em texto
      const textoFinal = parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n')
        .trim();

      return {
        resposta: textoFinal || '(o bot não soube responder)',
        historico: mensagens
      };
    }

    // Executa cada tool e prepara os resultados
    const functionResponses = [];
    for (const part of functionCalls) {
      const fc = part.functionCall;
      console.log(`🔧 Executando: ${fc.name}`);
      console.log(`   Input:`, JSON.stringify(fc.args));

      const resultado = await executarTool(fc.name, fc.args, contexto);
      console.log(`   Resultado:`, JSON.stringify(resultado).slice(0, 200));

      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: resultado
        }
      });
    }

    // Manda os resultados das tools de volta pro modelo
    mensagens.push({
      role: 'user',
      parts: functionResponses
    });

    continue;
  }

  return {
    resposta: '(o bot não conseguiu responder, tenta de novo)',
    historico: mensagens
  };
}
