// Smoke test: exercita as tools contra a API real do Apps Script.
// Rodar: node scripts/smoke-tools.js
import { executarTool } from '../lib/tools.js';

const casos = [
  ['buscar_molduras', { cor: 'preto' }],
  ['listar_materiais', { tipo: 'vidro' }],
  ['calcular_orcamento', { moldura_id: 'MOL-001', vidro_id: 'VID-001', chapa_id: 'CHA-001', largura_cm: 80, altura_cm: 50 }],
  ['enviar_foto', { moldura_id: 'MOL-001', legenda: 'olha que linda' }]
];

for (const [nome, input] of casos) {
  const r = await executarTool(nome, input, null);
  console.log(`\n=== ${nome} ===`);
  console.log(JSON.stringify(r, null, 2).slice(0, 600));
}
