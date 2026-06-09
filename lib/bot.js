import { genai, MODELO, MODELO_RESERVA } from './claude.js';
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

O QUE A LOJA VENDE:
- Quadro completo = moldura + vidro + chapa de fundo (o cliente pode dispensar vidro e/ou fundo)
- Espelho emoldurado = moldura + espelho (não leva vidro nem chapa)
- Também vendemos os itens avulsos (ex: só o vidro, pra trocar um quebrado)

COMO A LOJA COBRA (as tools já calculam, mas entenda a lógica):
- MOLDURA: pelo PERÍMETRO do quadro → (largura×2 + altura×2), em metros lineares
- VIDRO, CHAPA e ESPELHO: pela ÁREA → largura × altura, em m²

REGRAS DE OURO:
1. NUNCA invente preço. Sempre use a tool calcular_orcamento.
2. NUNCA invente moldura nem material. Use buscar_molduras e listar_materiais antes de oferecer algo.
3. ANTES de dar preço, descubra: estilo (clássica/moderna/rústica/minimalista), cor preferida, e o tamanho.
4. Pergunte se o quadro vai levar vidro e fundo (a maioria leva). De vidro existem só dois: o simples e o antirreflexo — sugira o simples se o cliente não tiver preferência. De fundo só existe a chapa eucatex, e de espelho só o normal 3mm (não bisotado) — não pergunte "qual", só confirme se vai querer.
5. Depois de encontrar 2-3 boas opções de moldura, USE enviar_foto pra cada uma (uma chamada por moldura), e só depois passe o orçamento.
6. No orçamento, monte UMA chamada de calcular_orcamento com tudo que o cliente quer (moldura + vidro + chapa juntos), e apresente o detalhamento item por item.
7. Se faltar info, PERGUNTE com gentileza, uma coisa de cada vez.
8. Se o cliente mandar tamanho tipo "80 por 50" ou "oitenta por cinquenta", interprete como 80cm x 50cm.
9. Se não achar moldura com os filtros, ofereça alternativas próximas.

FLUXO IDEAL:
Cliente cumprimenta → você responde, pergunta o que ele procura
Cliente descreve → você confirma detalhes que faltam (tamanho, estilo, vidro/fundo)
Tem info suficiente → busca no catálogo → manda fotos → passa orçamento completo detalhado
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
// Chamada ao Gemini com retry e modelo reserva
// - 503 (alta demanda) e 429 por minuto: espera e tenta de novo
// - 429 de cota DIÁRIA esgotada: troca pro modelo reserva e segue
// =========================================
let modeloEmUso = MODELO;

async function gerarComRetry(params) {
  const MAX_RETRIES = 4;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      return await genai.models.generateContent({ ...params, model: modeloEmUso });
    } catch (err) {
      // O SDK nem sempre expõe err.status (ClientError de 4xx não tem);
      // nesse caso extrai o código do texto "got status: 429 ..."
      const status = err.status ?? err.code ??
        Number(err.message?.match(/got status: (\d+)/)?.[1] ?? NaN);

      // Cota diária do modelo esgotou → troca pro reserva (até reiniciar)
      const cotaDiaria = status === 429 && /PerDay/i.test(err.message || '');
      if (cotaDiaria && modeloEmUso !== MODELO_RESERVA) {
        console.log(`⚠️  Cota diária do ${modeloEmUso} esgotou — trocando pro ${MODELO_RESERVA}`);
        modeloEmUso = MODELO_RESERVA;
        continue;
      }

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
