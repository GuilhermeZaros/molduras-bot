import { supabase } from '../lib/supabase.js';

// =========================================
// MATERIAIS DA LOJA — catálogo real (confirmado pelo dono):
// 2 vidros, 1 chapa e 1 espelho, com os preços reais por m²
// passados pelo dono. Preço mínimo ainda não foi definido.
// =========================================
const MATERIAIS = [
  // ---------- VIDROS ----------
  {
    sku: 'VID-001',
    tipo: 'vidro',
    nome: 'Vidro Simples 2mm',
    espessura_mm: 2,
    preco_m2: 180.00,
    preco_minimo: null,
    descricao: 'Vidro transparente simples, o padrão usado em quadros.'
  },
  {
    sku: 'VID-002',
    tipo: 'vidro',
    nome: 'Vidro Antirreflexo',
    espessura_mm: 2,
    preco_m2: 300.00,
    preco_minimo: null,
    descricao: 'Vidro fosco que elimina reflexos. Ideal pra ambientes com muita luz.'
  },

  // ---------- CHAPA (FUNDO) ----------
  {
    sku: 'CHA-001',
    tipo: 'chapa',
    nome: 'Chapa Eucatex',
    espessura_mm: 3,
    preco_m2: 90.00,
    preco_minimo: null,
    descricao: 'Chapa de eucatex pro fundo do quadro. É a única opção de fundo da loja.'
  },

  // ---------- ESPELHO ----------
  {
    sku: 'ESP-001',
    tipo: 'espelho',
    nome: 'Espelho Normal 3mm',
    espessura_mm: 3,
    preco_m2: 330.00,
    preco_minimo: null,
    descricao: 'Espelho normal de 3mm (não bisotado). É o único tipo de espelho da loja.'
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
