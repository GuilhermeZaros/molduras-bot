import readline from 'readline';
import { processarMensagem } from '../lib/bot.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const pergunta = (q) => new Promise(r => rl.question(q, r));

console.log('💬 Chat com a Bruna (atendente IA)');
console.log('   Digite suas mensagens como se fosse cliente no WhatsApp.');
console.log('   Comandos: "sair" pra encerrar, "limpar" pra reiniciar a conversa.\n');

let historico = [];

while (true) {
  const msg = await pergunta('👤 Você: ');

  if (msg.trim().toLowerCase() === 'sair') {
    console.log('👋 Tchau!');
    rl.close();
    process.exit(0);
  }

  if (msg.trim().toLowerCase() === 'limpar') {
    historico = [];
    console.log('🧹 Conversa reiniciada.\n');
    continue;
  }

  if (!msg.trim()) continue;

  try {
    process.stdout.write('🤔 Bruna tá digitando...\n');
    const inicio = Date.now();

    const { resposta, historico: novoHistorico } = await processarMensagem(historico, msg);
    historico = novoHistorico;

    const tempo = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\n🤖 Bruna (${tempo}s): ${resposta}\n`);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err);
  }
}