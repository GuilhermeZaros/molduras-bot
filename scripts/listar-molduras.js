import { supabase } from '../lib/supabase.js';

const { data, error } = await supabase
  .from('molduras')
  .select('sku, nome, estilo, cor, acabamento, preco_metro, disponivel')
  .order('sku');

if (error) {
  console.error('❌ Erro ao listar:', error.message);
  process.exit(1);
}

console.log(`📚 Catálogo: ${data.length} molduras\n`);

for (const m of data) {
  const status = m.disponivel ? '✅' : '🚫';
  console.log(`${status} ${m.sku} — ${m.nome}`);
  console.log(`   ${m.estilo} | ${m.cor} | ${m.acabamento} | R$ ${m.preco_metro}/m\n`);
}
