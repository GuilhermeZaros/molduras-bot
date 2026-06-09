import { supabase } from './supabase.js';

// =========================================
// DEFINIÇÃO DAS TOOLS pro Gemini
// É isso que ele "vê" e decide quando usar.
// =========================================
export const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'buscar_molduras',
        description: 'Busca molduras no catálogo da loja com base em estilo, cor e/ou acabamento. Use SEMPRE que o cliente descrever o tipo de moldura que quer (ex: "clássica dourada", "moderna preta"). Retorna até 5 molduras que combinam com os filtros.',
        parameters: {
          type: 'object',
          properties: {
            estilo: {
              type: 'string',
              enum: ['classica', 'moderna', 'rustica', 'minimalista'],
              description: 'Estilo da moldura (opcional)'
            },
            cor: {
              type: 'string',
              description: 'Cor da moldura: dourado, prata, preto, branco, madeira, rose (opcional)'
            },
            acabamento: {
              type: 'string',
              description: 'Acabamento: ornamental, liso, envelhecido, escovado, natural (opcional)'
            },
            limite: {
              type: 'number',
              description: 'Quantidade máxima de molduras a retornar (padrão 3, máximo 5)'
            }
          }
        }
      },
      {
        name: 'calcular_orcamento',
        description: 'Calcula o preço total de uma moldura para um tamanho específico de quadro. Use SEMPRE que o cliente pedir orçamento ou perguntar preço de um tamanho. Nunca calcule de cabeça.',
        parameters: {
          type: 'object',
          properties: {
            moldura_id: {
              type: 'string',
              description: 'ID da moldura (obtido via buscar_molduras)'
            },
            largura_cm: {
              type: 'number',
              description: 'Largura do quadro em centímetros'
            },
            altura_cm: {
              type: 'number',
              description: 'Altura do quadro em centímetros'
            }
          },
          required: ['moldura_id', 'largura_cm', 'altura_cm']
        }
      },
      {
        name: 'enviar_foto',
        description: 'Envia uma foto da moldura para o cliente no WhatsApp. Use depois de ter identificado 2-3 molduras boas, antes de passar o preço. Mande uma chamada por moldura.',
        parameters: {
          type: 'object',
          properties: {
            moldura_id: {
              type: 'string',
              description: 'ID da moldura a enviar'
            },
            legenda: {
              type: 'string',
              description: 'Legenda curta e amigável que vai junto com a foto'
            }
          },
          required: ['moldura_id', 'legenda']
        }
      }
    ]
  }
];

// =========================================
// IMPLEMENTAÇÃO das tools
// O Gemini decide quando chamar; a gente executa.
// =========================================

async function buscar_molduras({ estilo, cor, acabamento, limite = 3 }) {
  let query = supabase
    .from('molduras')
    .select('id, sku, nome, estilo, cor, acabamento, preco_metro, descricao, tags')
    .eq('disponivel', true)
    .limit(Math.min(limite, 5));

  if (estilo) query = query.eq('estilo', estilo);
  if (cor) query = query.eq('cor', cor);
  if (acabamento) query = query.eq('acabamento', acabamento);

  const { data, error } = await query;

  if (error) {
    return { erro: error.message };
  }

  if (!data || data.length === 0) {
    return {
      resultado: 'nenhuma moldura encontrada com esses filtros',
      sugestao: 'tente afrouxar os filtros (ex: só estilo, ou só cor)'
    };
  }

  return {
    encontradas: data.length,
    molduras: data
  };
}

async function calcular_orcamento({ moldura_id, largura_cm, altura_cm }) {
  // Busca a moldura
  const { data: moldura, error } = await supabase
    .from('molduras')
    .select('*')
    .eq('id', moldura_id)
    .single();

  if (error || !moldura) {
    return { erro: 'moldura não encontrada com esse ID' };
  }

  // Calcula perímetro em metros
  const perimetro_cm = 2 * (largura_cm + altura_cm);
  const perimetro_m = perimetro_cm / 100;

  // Calcula valor total
  let valor = perimetro_m * moldura.preco_metro;

  // Aplica preço mínimo se houver
  if (moldura.preco_minimo && valor < moldura.preco_minimo) {
    valor = moldura.preco_minimo;
  }

  return {
    moldura: moldura.nome,
    tamanho: `${largura_cm}cm x ${altura_cm}cm`,
    perimetro_m: perimetro_m.toFixed(3),
    preco_metro: moldura.preco_metro,
    valor_total: valor.toFixed(2),
    observacao: 'valor calculado pelo perímetro do quadro x preço por metro'
  };
}

async function enviar_foto({ moldura_id, legenda }, contexto) {
  // Busca a foto
  const { data: moldura, error } = await supabase
    .from('molduras')
    .select('nome, foto_url')
    .eq('id', moldura_id)
    .single();

  if (error || !moldura) {
    return { erro: 'moldura não encontrada' };
  }

  // No WhatsApp o contexto traz um enviarFoto de verdade;
  // no chat de terminal a gente só loga.
  if (contexto?.enviarFoto) {
    try {
      await contexto.enviarFoto(moldura.foto_url, legenda);
    } catch (err) {
      return { erro: `falha ao enviar a foto: ${err.message}` };
    }
  } else {
    console.log('\n📸 [FOTO ENVIADA AO CLIENTE]');
    console.log(`   Moldura: ${moldura.nome}`);
    console.log(`   URL: ${moldura.foto_url}`);
    console.log(`   Legenda: "${legenda}"\n`);
  }

  return {
    sucesso: true,
    moldura: moldura.nome,
    enviado: true
  };
}

// =========================================
// DISPATCHER — recebe nome + input e executa
// =========================================
export async function executarTool(nome, input, contexto) {
  switch (nome) {
    case 'buscar_molduras':
      return await buscar_molduras(input);
    case 'calcular_orcamento':
      return await calcular_orcamento(input);
    case 'enviar_foto':
      return await enviar_foto(input, contexto);
    default:
      return { erro: `tool desconhecida: ${nome}` };
  }
}
