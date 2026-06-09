import { supabase } from '../lib/supabase.js';

// =========================================
// MATERIAIS FAKE — vidros, chapas e espelhos
// Preços de exemplo! Substituir pelos valores reais
// quando o catálogo da loja chegar.
// =========================================
const MATERIAIS = [
  // ---------- VIDROS ----------
  {
    sku: 'VID-001',
    tipo: 'vidro',
    nome: 'Vidro Comum 2mm',
    espessura_mm: 2,
    preco_m2: 90.00,
    preco_minimo: 25.00,
    descricao: 'Vidro transparente comum, o mais usado em quadros.'
  },
  {
    sku: 'VID-002',
    tipo: 'vidro',
    nome: 'Vidro Antirreflexo 2mm',
    espessura_mm: 2,
    preco_m2: 180.00,
    preco_minimo: 45.00,
    descricao: 'Vidro fosco que elimina reflexos. Ideal pra ambientes com muita luz.'
  },
  {
    sku: 'VID-003',
    tipo: 'vidro',
    nome: 'Vidro Comum 3mm',
    espessura_mm: 3,
    preco_m2: 120.00,
    preco_minimo: 30.00,
    descricao: 'Vidro transparente mais espesso, pra quadros grandes.'
  },

  // ---------- CHAPAS (FUNDO) ----------
  {
    sku: 'CHA-001',
    tipo: 'chapa',
    nome: 'Chapa Eucatex 3mm',
    espessura_mm: 3,
    preco_m2: 35.00,
    preco_minimo: 12.00,
    descricao: 'Chapa de eucatex pro fundo do quadro. Opção econômica e padrão.'
  },
  {
    sku: 'CHA-002',
    tipo: 'chapa',
    nome: 'Chapa MDF 3mm',
    espessura_mm: 3,
    preco_m2: 48.00,
    preco_minimo: 15.00,
    descricao: 'Chapa de MDF, mais rígida e durável que o eucatex.'
  },

  // ---------- ESPELHOS ----------
  {
    sku: 'ESP-001',
    tipo: 'espelho',
    nome: 'Espelho Prata 3mm',
    espessura_mm: 3,
    preco_m2: 250.00,
    preco_minimo: 60.00,
    descricao: 'Espelho prata de 3mm, pra espelhos decorativos pequenos e médios.'
  },
  {
    sku: 'ESP-002',
    tipo: 'espelho',
    nome: 'Espelho Prata 4mm',
    espessura_mm: 4,
    preco_m2: 320.00,
    preco_minimo: 80.00,
    descricao: 'Espelho prata de 4mm, mais resistente. Recomendado pra espelhos grandes.'
  }
];

console.log('🌱 Iniciando seed de materiais...\n');

console.log('🧹 Limpando materiais anteriores...');
const { error: erroDelete } = await supabase
  .from('materiais')
  .delete()
  .neq('sku', 'IMPOSSIVEL_NAO_EXISTE');

if (erroDelete) {
  console.error('❌ Erro ao limpar:', erroDelete.message);
  process.exit(1);
}
console.log('✅ Limpo.\n');

let inseridos = 0;
let erros = 0;

for (const material of MATERIAIS) {
  const { error } = await supabase
    .from('materiais')
    .insert({ ...material, disponivel: true });

  if (error) {
    console.error(`❌ ${material.sku} (${material.nome}):`, error.message);
    erros++;
  } else {
    console.log(`✅ ${material.sku} — ${material.nome} — R$ ${material.preco_m2}/m²`);
    inseridos++;
  }
}

console.log(`\n📊 Resumo: ${inseridos} inseridos, ${erros} erros.`);
