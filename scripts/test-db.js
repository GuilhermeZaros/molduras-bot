import { supabase } from '../lib/supabase.js';

console.log('🔌 Testando conexão com Supabase...\n');

// Teste 1: inserir uma moldura de teste
console.log('1️⃣  Inserindo moldura de teste...');
const { data: novaMoldura, error: erroInsert } = await supabase
  .from('molduras')
  .insert({
    sku: 'TESTE-001',
    nome: 'Moldura de Teste',
    estilo: 'classica',
    cor: 'dourado',
    acabamento: 'ornamental',
    largura_perfil_cm: 4.5,
    preco_metro: 89.90,
    descricao: 'Moldura inserida pelo script de teste',
    tags: ['teste']
  })
  .select()
  .single();

if (erroInsert) {
  console.error('❌ Erro ao inserir:', erroInsert.message);
  process.exit(1);
}

console.log('✅ Moldura inserida:', novaMoldura.nome, '| ID:', novaMoldura.id);

// Teste 2: ler de volta
console.log('\n2️⃣  Lendo a moldura de volta...');
const { data: leitura, error: erroLeitura } = await supabase
  .from('molduras')
  .select('*')
  .eq('sku', 'TESTE-001')
  .single();

if (erroLeitura) {
  console.error('❌ Erro ao ler:', erroLeitura.message);
  process.exit(1);
}

console.log('✅ Leitura OK:', leitura.nome, '| R$', leitura.preco_metro, '/m');

// Teste 3: deletar (limpeza)
console.log('\n3️⃣  Deletando moldura de teste...');
const { error: erroDelete } = await supabase
  .from('molduras')
  .delete()
  .eq('sku', 'TESTE-001');

if (erroDelete) {
  console.error('❌ Erro ao deletar:', erroDelete.message);
  process.exit(1);
}

console.log('✅ Limpeza concluída.');
console.log('\n🎉 Banco de dados configurado e funcionando!');