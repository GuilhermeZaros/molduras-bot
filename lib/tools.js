import { apiGet } from './sheetsApi.js';

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
        description: 'Calcula o orçamento de um quadro ou espelho. Moldura é cobrada pelo PERÍMETRO (metro linear); vidro, chapa e espelho são cobrados pela ÁREA (m²). Informe os códigos dos itens que o cliente quer (todos opcionais, mas pelo menos um). Use SEMPRE que o cliente pedir preço. Nunca calcule de cabeça.',
        parameters: {
          type: 'object',
          properties: {
            moldura_id: {
              type: 'string',
              description: 'Código da moldura (obtido via buscar_molduras), se o cliente quer moldura'
            },
            vidro_id: {
              type: 'string',
              description: 'Código do vidro (obtido via listar_materiais), se o quadro leva vidro'
            },
            chapa_id: {
              type: 'string',
              description: 'Código da chapa de fundo (obtido via listar_materiais), se o quadro leva fundo'
            },
            espelho_id: {
              type: 'string',
              description: 'Código do espelho (obtido via listar_materiais), se for um espelho emoldurado'
            },
            largura_cm: {
              type: 'number',
              description: 'Largura em centímetros'
            },
            altura_cm: {
              type: 'number',
              description: 'Altura em centímetros'
            },
            objeto_alto: {
              type: 'boolean',
              description: 'true SÓ quando for emoldurar um OBJETO em relevo/volumoso preso na chapa (camiseta, uniforme/manto, medalha). A loja pinta a chapa e cobra uma taxa fixa que já entra no total. NÃO use pra coisas planas (quadro comum, foto, pôster, quebra-cabeça).'
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
              description: 'Código da moldura a enviar'
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
// Agora chamam a API do Apps Script (fonte única). A normalização de cor e o
// preço mínimo vivem no servidor (Catalogo/Calculo); aqui só repassamos.
// =========================================

// Tira a foto_url de cada moldura ANTES de devolver pro modelo. O modelo não precisa da URL
// (a foto é enviada pela tool enviar_foto, que pega a URL no servidor por código) — e, se ele
// tiver a URL, acaba colando o link no texto pro cliente. PURO.
export function semFotoUrl(molduras) {
  return (molduras || []).map(function (m) {
    const copia = Object.assign({}, m);
    delete copia.foto_url;
    return copia;
  });
}

// Rede de segurança: às vezes o modelo, em vez de CHAMAR a tool enviar_foto, ESCREVE a chamada
// como texto (com ou sem colchetes), ex: [enviar_foto(moldura_id="X", legenda="Y")]. Aqui a gente
// detecta essas chamadas escritas, devolve pra serem executadas de verdade e LIMPA o texto que vai
// pro cliente (que não pode ver "enviar_foto(...)" nem colchetes de anotação). PURO.
export function extrairChamadasFotoTexto(texto) {
  const fotos = [];
  // colchetes opcionais em volta; aspas simples ou duplas nos valores; ordem dos args livre.
  const re = /\[?\s*enviar_foto\s*\(([^)]*)\)\s*\]?/gi;
  let limpo = (texto || '').replace(re, function (_todo, args) {
    const idMatch = args.match(/moldura_id\s*=\s*['"]([^'"]*)['"]/i);
    const legMatch = args.match(/legenda\s*=\s*['"]([^'"]*)['"]/i);
    if (idMatch) {
      fotos.push({ moldura_id: idMatch[1], legenda: legMatch ? legMatch[1] : '' });
    }
    return '';
  });
  // Limpa o que sobrou: espaços antes de quebra de linha e linhas em branco extras.
  limpo = limpo.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { fotos, texto: limpo };
}

async function buscar_molduras({ estilo, cor, acabamento, limite }) {
  try {
    const molduras = await apiGet('buscarMolduras', { estilo, cor, acabamento, limite });
    if (!molduras || molduras.length === 0) {
      return {
        resultado: 'nenhuma moldura encontrada com esses filtros (ou sem estoque)',
        sugestao: 'tente afrouxar os filtros (ex: só estilo, ou só cor)'
      };
    }
    return { encontradas: molduras.length, molduras: semFotoUrl(molduras) };
  } catch (e) {
    return { erro: e.message };
  }
}

async function listar_materiais({ tipo }) {
  try {
    const materiais = await apiGet('listarMateriais', { tipo });
    if (!materiais || materiais.length === 0) return { resultado: 'nenhum material encontrado' };
    return { encontrados: materiais.length, materiais };
  } catch (e) {
    return { erro: e.message };
  }
}

async function calcular_orcamento({ moldura_id, vidro_id, chapa_id, espelho_id, largura_cm, altura_cm, objeto_alto }) {
  try {
    return await apiGet('calcularOrcamento', {
      moldura: moldura_id, vidro: vidro_id, chapa: chapa_id, espelho: espelho_id,
      largura: largura_cm, altura: altura_cm, objetoAlto: objeto_alto
    });
  } catch (e) {
    return { erro: e.message };
  }
}

async function enviar_foto({ moldura_id, legenda }, contexto) {
  let moldura;
  try {
    moldura = await apiGet('consultarProduto', { codigo: moldura_id });
  } catch (e) {
    return { erro: e.message };
  }
  if (!moldura || !moldura.foto_url) {
    return { erro: 'moldura não encontrada ou sem foto' };
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

  return { sucesso: true, moldura: moldura.nome, enviado: true };
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
