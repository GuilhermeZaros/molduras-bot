// espera.js — decide se o bot deve ESPERAR mais antes de responder (o cliente ainda está
// digitando) ou já pode responder. Pra juntar mensagens quebradas ("ola" + "boa noite") numa
// resposta só. PURO (sem timers/IO) — a orquestração dos timers fica no index.js.
//
//  - ultimoCompondoTs: quando chegou o último "digitando" (composing) do cliente (0 = parou/nunca)
//  - ultimaMsgTs: quando chegou a última mensagem do cliente
//  - agora: Date.now()
//  - validadeMs: por quanto tempo um "digitando" continua valendo (o WhatsApp reenvia a cada ~5s)
//  - maxMs: teto absoluto de espera desde a última mensagem (nunca segura mais que isso)
export function deveEsperarDigitando(ultimoCompondoTs, ultimaMsgTs, agora, validadeMs, maxMs) {
  const compondoAgora = (agora - (ultimoCompondoTs || 0)) < validadeMs;
  const desdeUltimaMsg = agora - (ultimaMsgTs || 0);
  return compondoAgora && desdeUltimaMsg < maxMs;
}
