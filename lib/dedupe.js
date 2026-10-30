// Deduplicador de mensagens por id.
//
// Por que existe: o Baileys (WhatsApp) REENTREGA mensagens em algumas situações —
// principalmente depois de uma reconexão ou retry de entrega — disparando o mesmo
// evento `messages.upsert` (type 'notify') com o MESMO `msg.key.id`. Sem deduplicar,
// o bot reprocessa a mensagem do cliente e RESPONDE DE NOVO; como o histórico é o
// mesmo, a Julia acaba mandando a mesma mensagem duas vezes.
//
// Guarda os últimos `max` ids vistos (janela deslizante, pra não vazar memória).
export function criarDeduplicador(max = 500) {
  const vistos = new Set();
  const ordem = []; // ids em ordem de chegada, pra saber quem descartar primeiro

  return {
    // true = já processamos essa mensagem antes (é reentrega, descarte).
    // Mensagem sem id nunca deduplica (não dá pra saber se é repetida) — deixa passar.
    jaProcessou(id) {
      if (id == null || id === '') return false;
      if (vistos.has(id)) return true;
      vistos.add(id);
      ordem.push(id);
      if (ordem.length > max) {
        vistos.delete(ordem.shift());
      }
      return false;
    }
  };
}
