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
              enum: ['dourado', 'prata', 'preto', 'branco', 'madeira', 'rose'],
              description: 'Cor da moldura (opcional)'
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
        name: 'listar_materiais',
        description: 'Lista os vidros, chapas (fundo) e espelhos disponíveis na loja, com preço por m². Use quando precisar saber as opções e preços de vidro, fundo ou espelho pra montar um orçamento.',
        parameters: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['vidro', 'chapa', 'espelho'],
              description: 'Filtra por tipo de material (opcional; sem filtro retorna todos)'
            }
          }
        }
      },
      {
        name: 'calcular_orcamento',
        description: 'Calcula o orçamento de um quadro ou espelho. Moldura é cobrada pelo PERÍMETRO (metro linear); vidro, chapa e espelho são cobrados pela ÁREA (m²). Informe os IDs dos itens que o cliente quer (todos opcionais, mas pelo menos um). Use SEMPRE que o cliente pedir preço. Nunca calcule de cabeça.',
        parameters: {
          type: 'object',
          properties: {
            moldura_id: {
              type: 'string',
              description: 'ID da moldura (obtido via buscar_molduras), se o cliente quer moldura'
            },
            vidro_id: {
              type: 'string',
              description: 'ID do vidro (obtido via listar_materiais), se o quadro leva vidro'
            },
            chapa_id: {
              type: 'string',
              description: 'ID da chapa de fundo (obtido via listar_materiais), se o quadro leva fundo'
            },
            espelho_id: {
              type: 'string',
              description: 'ID do espelho (obtido via listar_materiais), se for um espelho emoldurado'
            },
            largura_cm: {
              type: 'number',
              description: 'Largura em centímetros'
            },
            altura_cm: {
              type: 'number',
              description: 'Altura em centímetros'
            }
          },
          required: ['largura_cm', 'altura_cm']
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

// O modelo às vezes manda a cor flexionada ("preta", "dourada");
// o banco guarda sempre no masculino.
const CORES_EQUIVALENTES = {
  preta: 'preto',
  branca: 'branco',
  dourada: 'dourado',
  prateada: 'prata',
  rosa: 'rose',
  'rose gold': 'rose',
  'rosé': 'rose'
};

function normalizarCor(cor) {
  if (!cor) return cor;
  const limpa = cor.toLowerCase().trim();
  return CORES_EQUIVALENTES[limpa] || limpa;
}

async function buscar_molduras({ estilo, cor, acabamento, limite = 3 }) {
  cor = normalizarCor(cor);
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

async function listar_materiais({ tipo }) {
  let query = supabase
    .from('materiais')
    .select('id, sku, tipo, nome, espessura_mm, preco_m2, descricao')
    .eq('disponivel', true)
    .order('tipo')
    .order('preco_m2');

  if (tipo) query = query.eq('tipo', tipo);

  const { data, error } = await query;

  if (error) {
    return { erro: error.message };
  }

  if (!data || data.length === 0) {
    return { resultado: 'nenhum material encontrado' };
  }

  return { encontrados: data.length, materiais: data };
}

// Aplica o preço mínimo do item, se houver
function comPrecoMinimo(valor, preco_minimo) {
  return preco_minimo && valor < preco_minimo ? preco_minimo : valor;
}

async function calcular_orcamento({ moldura_id, vidro_id, chapa_id, espelho_id, largura_cm, altura_cm }) {
  if (!moldura_id && !vidro_id && !chapa_id && !espelho_id) {
    return { erro: 'informe pelo menos um item: moldura, vidro, chapa ou espelho' };
  }

  // REGRAS DA LOJA:
  // - Moldura: cobrada pelo PERÍMETRO → (largura×2 + altura×2), em metros lineares
  // - Vidro, chapa e espelho: cobrados pela ÁREA → largura × altura, em m²
  const perimetro_m = (2 * (largura_cm + altura_cm)) / 100;
  const area_m2 = (largura_cm / 100) * (altura_cm / 100);

  const itens = [];
  let total = 0;

  if (moldura_id) {
    const { data: moldura, error } = await supabase
      .from('molduras')
      .select('nome, preco_metro, preco_minimo')
      .eq('id', moldura_id)
      .single();

    if (error || !moldura) {
      return { erro: 'moldura não encontrada com esse ID' };
    }

    const valor = comPrecoMinimo(perimetro_m * moldura.preco_metro, moldura.preco_minimo);
    itens.push({
      item: moldura.nome,
      calculo: `perímetro ${perimetro_m.toFixed(2)}m x R$ ${moldura.preco_metro}/m`,
      valor: valor.toFixed(2)
    });
    total += valor;
  }

  // Vidro, chapa e espelho seguem a mesma lógica de área
  const materiaisPedidos = [
    { id: vidro_id, tipoEsperado: 'vidro' },
    { id: chapa_id, tipoEsperado: 'chapa' },
    { id: espelho_id, tipoEsperado: 'espelho' }
  ].filter(m => m.id);

  for (const pedido of materiaisPedidos) {
    const { data: material, error } = await supabase
      .from('materiais')
      .select('nome, tipo, preco_m2, preco_minimo')
      .eq('id', pedido.id)
      .single();

    if (error || !material) {
      return { erro: `${pedido.tipoEsperado} não encontrado com esse ID` };
    }

    if (material.tipo !== pedido.tipoEsperado) {
      return { erro: `o ID informado em ${pedido.tipoEsperado}_id é de um ${material.tipo}` };
    }

    const valor = comPrecoMinimo(area_m2 * material.preco_m2, material.preco_minimo);
    itens.push({
      item: material.nome,
      calculo: `área ${area_m2.toFixed(3)}m² x R$ ${material.preco_m2}/m²`,
      valor: valor.toFixed(2)
    });
    total += valor;
  }

  return {
    tamanho: `${largura_cm}cm x ${altura_cm}cm`,
    perimetro_m: perimetro_m.toFixed(2),
    area_m2: area_m2.toFixed(3),
    itens,
    valor_total: total.toFixed(2),
    observacao: 'moldura cobrada pelo perímetro (metro linear); vidro/chapa/espelho pela área (m²)'
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
    case 'listar_materiais':
      return await listar_materiais(input);
    case 'calcular_orcamento':
      return await calcular_orcamento(input);
    case 'enviar_foto':
      return await enviar_foto(input, contexto);
    default:
      return { erro: `tool desconhecida: ${nome}` };
  }
}
