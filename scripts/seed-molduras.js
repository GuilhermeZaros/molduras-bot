import { supabase } from '../lib/supabase.js';
 
// =========================================
// CATÁLOGO FAKE — 15 molduras
// Você vai substituir esses dados pelos reais depois.
// =========================================
const MOLDURAS = [
  // ---------- CLÁSSICAS ----------
  {
    sku: 'MOL-001',
    nome: 'Veneza Dourada',
    estilo: 'classica',
    cor: 'dourado',
    acabamento: 'ornamental',
    largura_perfil_cm: 5.0,
    preco_metro: 95.00,
    preco_minimo: 80.00,
    descricao: 'Moldura clássica dourada com detalhes ornamentais em relevo. Ideal para retratos e quadros decorativos sofisticados.',
    tags: ['luxo', 'retrato', 'casamento', 'sofisticado']
  },
  {
    sku: 'MOL-002',
    nome: 'Florença Dourada Envelhecida',
    estilo: 'classica',
    cor: 'dourado',
    acabamento: 'envelhecido',
    largura_perfil_cm: 6.5,
    preco_metro: 120.00,
    preco_minimo: 100.00,
    descricao: 'Moldura dourada com acabamento envelhecido que remete a obras renascentistas. Perfeita para quadros grandes.',
    tags: ['luxo', 'rustico', 'grande', 'classico']
  },
  {
    sku: 'MOL-003',
    nome: 'Império Prata',
    estilo: 'classica',
    cor: 'prata',
    acabamento: 'ornamental',
    largura_perfil_cm: 4.5,
    preco_metro: 88.00,
    preco_minimo: 75.00,
    descricao: 'Moldura prateada com ornamentos clássicos. Ótima opção para fotos em preto e branco e ambientes elegantes.',
    tags: ['elegante', 'retrato', 'preto-e-branco']
  },
 
  // ---------- MODERNAS ----------
  {
    sku: 'MOL-004',
    nome: 'Linhas Preta Fosca',
    estilo: 'moderna',
    cor: 'preto',
    acabamento: 'liso',
    largura_perfil_cm: 2.0,
    preco_metro: 45.00,
    preco_minimo: 50.00,
    descricao: 'Moldura preta fosca de perfil fino e reto. Combina com qualquer decoração contemporânea.',
    tags: ['minimalista', 'moderno', 'versatil', 'fino']
  },
  {
    sku: 'MOL-005',
    nome: 'Linhas Branca',
    estilo: 'moderna',
    cor: 'branco',
    acabamento: 'liso',
    largura_perfil_cm: 2.0,
    preco_metro: 45.00,
    preco_minimo: 50.00,
    descricao: 'Moldura branca de perfil fino, ideal para ambientes claros e estilo escandinavo.',
    tags: ['minimalista', 'escandinavo', 'claro', 'versatil']
  },
  {
    sku: 'MOL-006',
    nome: 'Bloco Preta Larga',
    estilo: 'moderna',
    cor: 'preto',
    acabamento: 'liso',
    largura_perfil_cm: 4.0,
    preco_metro: 68.00,
    preco_minimo: 60.00,
    descricao: 'Moldura preta lisa com perfil mais largo. Dá destaque e profundidade ao quadro.',
    tags: ['moderno', 'destaque', 'sala']
  },
  {
    sku: 'MOL-007',
    nome: 'Slim Prata Escovada',
    estilo: 'moderna',
    cor: 'prata',
    acabamento: 'escovado',
    largura_perfil_cm: 1.8,
    preco_metro: 52.00,
    preco_minimo: 55.00,
    descricao: 'Moldura fina em prata escovada. Acabamento sofisticado e contemporâneo.',
    tags: ['moderno', 'fino', 'sofisticado', 'escritorio']
  },
 
  // ---------- RÚSTICAS ----------
  {
    sku: 'MOL-008',
    nome: 'Madeira Natural Pinus',
    estilo: 'rustica',
    cor: 'madeira',
    acabamento: 'natural',
    largura_perfil_cm: 3.5,
    preco_metro: 58.00,
    preco_minimo: 50.00,
    descricao: 'Moldura em madeira pinus com acabamento natural. Quentinha e aconchegante.',
    tags: ['rustico', 'natural', 'aconchegante', 'madeira']
  },
  {
    sku: 'MOL-009',
    nome: 'Madeira Demolição',
    estilo: 'rustica',
    cor: 'madeira',
    acabamento: 'envelhecido',
    largura_perfil_cm: 4.5,
    preco_metro: 78.00,
    preco_minimo: 65.00,
    descricao: 'Moldura em madeira de demolição com marcas naturais do tempo. Cada peça é única.',
    tags: ['rustico', 'unico', 'industrial', 'vintage']
  },
  {
    sku: 'MOL-010',
    nome: 'Carvalho Escuro',
    estilo: 'rustica',
    cor: 'madeira',
    acabamento: 'liso',
    largura_perfil_cm: 3.0,
    preco_metro: 62.00,
    preco_minimo: 55.00,
    descricao: 'Moldura em tom de carvalho escuro. Elegante e atemporal.',
    tags: ['classico', 'escritorio', 'biblioteca']
  },
 
  // ---------- MINIMALISTAS ----------
  {
    sku: 'MOL-011',
    nome: 'Caixa Branca Profunda',
    estilo: 'minimalista',
    cor: 'branco',
    acabamento: 'liso',
    largura_perfil_cm: 3.0,
    preco_metro: 72.00,
    preco_minimo: 65.00,
    descricao: 'Moldura tipo caixa em branco, com profundidade. Ideal para artes em técnica mista e telas.',
    tags: ['minimalista', 'galeria', 'tela', 'arte']
  },
  {
    sku: 'MOL-012',
    nome: 'Caixa Preta Profunda',
    estilo: 'minimalista',
    cor: 'preto',
    acabamento: 'liso',
    largura_perfil_cm: 3.0,
    preco_metro: 72.00,
    preco_minimo: 65.00,
    descricao: 'Moldura tipo caixa em preto, com profundidade. Realça obras vibrantes.',
    tags: ['minimalista', 'galeria', 'tela', 'arte']
  },
 
  // ---------- COLORIDAS / DIFERENCIADAS ----------
  {
    sku: 'MOL-013',
    nome: 'Veneza Branca Ornamental',
    estilo: 'classica',
    cor: 'branco',
    acabamento: 'ornamental',
    largura_perfil_cm: 5.0,
    preco_metro: 95.00,
    preco_minimo: 80.00,
    descricao: 'Versão branca da Veneza, com detalhes ornamentais. Perfeita para decoração provençal.',
    tags: ['provencal', 'claro', 'romantico', 'casamento']
  },
  {
    sku: 'MOL-014',
    nome: 'Rosé Gold Moderna',
    estilo: 'moderna',
    cor: 'rose',
    acabamento: 'escovado',
    largura_perfil_cm: 2.5,
    preco_metro: 82.00,
    preco_minimo: 70.00,
    descricao: 'Moldura em tom rosé gold escovado. Tendência em decoração feminina e moderna.',
    tags: ['moderno', 'tendencia', 'feminino', 'quarto']
  },
  {
    sku: 'MOL-015',
    nome: 'Off-White Larga',
    estilo: 'classica',
    cor: 'branco',
    acabamento: 'liso',
    largura_perfil_cm: 6.0,
    preco_metro: 98.00,
    preco_minimo: 85.00,
    descricao: 'Moldura off-white de perfil largo. Sofisticação sem chamar muita atenção da obra.',
    tags: ['classico', 'sofisticado', 'galeria', 'sala']
  }
];
 
// =========================================
// Gera URL de placeholder a partir do estilo e cor
// Usa placehold.co (grátis, sem cadastro)
// =========================================
function gerarFotoPlaceholder(moldura) {
  const cores = {
    dourado: 'D4A574',
    prata: 'C0C0C0',
    preto: '2C2C2C',
    branco: 'F5F5F5',
    madeira: '8B5A2B',
    rose: 'E8B4B8'
  };
 
  const bg = cores[moldura.cor] || '888888';
  const texto = encodeURIComponent(moldura.nome);
 
  return `https://placehold.co/600x600/${bg}/FFFFFF/png?text=${texto}`;
}
 
// =========================================
// EXECUÇÃO
// =========================================
console.log('🌱 Iniciando seed do catálogo...\n');
 
// Limpa o catálogo antes (cuidado: zera tudo!)
console.log('🧹 Limpando catálogo anterior...');
const { error: erroDelete } = await supabase
  .from('molduras')
  .delete()
  .neq('sku', 'IMPOSSIVEL_NAO_EXISTE'); // truque pra deletar tudo
 
if (erroDelete) {
  console.error('❌ Erro ao limpar:', erroDelete.message);
  process.exit(1);
}
console.log('✅ Catálogo limpo.\n');
 
// Insere cada moldura com sua foto placeholder
console.log('📦 Inserindo molduras...\n');
let inseridas = 0;
let erros = 0;
 
for (const moldura of MOLDURAS) {
  const fotoUrl = gerarFotoPlaceholder(moldura);
 
  const { error } = await supabase
    .from('molduras')
    .insert({
      ...moldura,
      foto_url: fotoUrl,
      foto_ambientada_url: fotoUrl,
      disponivel: true
    });
 
  if (error) {
    console.error(`❌ ${moldura.sku} (${moldura.nome}):`, error.message);
    erros++;
  } else {
    console.log(`✅ ${moldura.sku} — ${moldura.nome} — R$ ${moldura.preco_metro}/m`);
    inseridas++;
  }
}
 
console.log(`\n📊 Resumo: ${inseridas} inseridas, ${erros} erros.`);
 
// Confere o total
const { count } = await supabase
  .from('molduras')
  .select('*', { count: 'exact', head: true });
 
console.log(`📚 Total no banco agora: ${count} molduras.`);
 
if (inseridas === MOLDURAS.length) {
  console.log('\n🎉 Seed concluído com sucesso!');
} else {
  console.log('\n⚠️  Seed terminou com erros. Confere acima.');
}