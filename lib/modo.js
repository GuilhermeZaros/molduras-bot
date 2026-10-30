// modo.js — botão liga/desliga do "modo triagem".
//
// Ligado (MODO_TRIAGEM=true no .env): a Julia só ATENDE e COLETA — não manda foto, não
// manda modelos e não calcula/passa orçamento. No fim do atendimento, um relatório do que o
// cliente quer vai pro dono (mesmo pipeline do resumo). Desligado (padrão): comportamento
// normal (foto + orçamento). Reverter é trocar a env e reiniciar — por isso é um flag, não
// uma remoção de código (a mudança é temporária, "até estudar melhor o cálculo").

// Carrega o .env aqui também (idempotente): garante que MODO_TRIAGEM seja lido corretamente
// independente da ordem de import — sem depender de outro módulo ter carregado o dotenv antes.
import 'dotenv/config';

// PURA: liga pra "1/true/sim/on/ligado" (ignora caixa e espaços em volta). Vazio/lixo -> false.
export function parseFlag(v) {
  return /^(1|true|sim|on|ligado)$/i.test(String(v ?? '').trim());
}

export const MODO_TRIAGEM = parseFlag(process.env.MODO_TRIAGEM);
