import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planejarRetry } from '../lib/retry.js';

const PRINCIPAL = 'gemini-3.5-flash';
const RESERVA = 'gemini-3.1-flash-lite';

test('503 no modelo principal → cai pro reserva (sobrecarga)', () => {
  assert.deepEqual(
    planejarRetry({ status: 503, mensagem: 'high demand', modeloDaVez: PRINCIPAL, modeloReserva: RESERVA }),
    { acao: 'trocar_reserva', motivo: 'sobrecarga' }
  );
});

test('503 já no reserva → espera e tenta de novo', () => {
  assert.deepEqual(
    planejarRetry({ status: 503, mensagem: 'high demand', modeloDaVez: RESERVA, modeloReserva: RESERVA }),
    { acao: 'esperar_retry' }
  );
});

test('429 de cota DIÁRIA (PerDay) no principal → cai pro reserva', () => {
  assert.deepEqual(
    planejarRetry({ status: 429, mensagem: 'quota ...PerDay...', modeloDaVez: PRINCIPAL, modeloReserva: RESERVA }),
    { acao: 'trocar_reserva', motivo: 'cota_diaria' }
  );
});

test('429 por minuto (sem PerDay) → espera e tenta de novo, NÃO troca', () => {
  assert.deepEqual(
    planejarRetry({ status: 429, mensagem: 'rate limit per minute', modeloDaVez: PRINCIPAL, modeloReserva: RESERVA }),
    { acao: 'esperar_retry' }
  );
});

test('429 PerDay já no reserva → espera (não há pra onde trocar)', () => {
  assert.deepEqual(
    planejarRetry({ status: 429, mensagem: '...PerDay...', modeloDaVez: RESERVA, modeloReserva: RESERVA }),
    { acao: 'esperar_retry' }
  );
});

test('erro não-temporário (400/404/NaN) → lança', () => {
  for (const status of [400, 404, 500, NaN]) {
    assert.deepEqual(
      planejarRetry({ status, mensagem: 'erro', modeloDaVez: PRINCIPAL, modeloReserva: RESERVA }),
      { acao: 'lancar' }
    );
  }
});
