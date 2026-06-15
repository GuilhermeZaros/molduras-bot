// =========================================
// Política de retry do Gemini (pura, testável)
// Decide o que fazer quando uma chamada ao modelo falha:
// - 503 (sobrecarga) com o modelo principal  → cai pro reserva
// - 429 de cota DIÁRIA (PerDay) no principal  → cai pro reserva
// - 503/429 já no reserva, ou 429 por minuto  → espera e tenta de novo
// - erro não-temporário (4xx/5xx fora disso)  → lança
// =========================================
export function planejarRetry({ status, mensagem, modeloDaVez, modeloReserva }) {
  const ehTemporario = status === 503 || status === 429;
  if (!ehTemporario) return { acao: 'lancar' };

  const podeTrocar = modeloDaVez !== modeloReserva;
  const cotaDiaria = status === 429 && /PerDay/i.test(mensagem || '');

  if (podeTrocar && cotaDiaria) return { acao: 'trocar_reserva', motivo: 'cota_diaria' };
  if (podeTrocar && status === 503) return { acao: 'trocar_reserva', motivo: 'sobrecarga' };

  return { acao: 'esperar_retry' };
}
