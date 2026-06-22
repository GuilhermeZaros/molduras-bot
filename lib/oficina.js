import 'dotenv/config';

// Oficina: a Julia avisa o cliente quando o quadro fica pronto.
// O bot CONSULTA a planilha (endpoint protegido por token) de tempos em tempos; quando a oficina
// marca um serviço como pronto, a Julia manda a mensagem e confirma o aviso de volta na planilha.

// ---- Lógica pura (testável) ----

// Mensagem-modelo fixa (não gerada por IA). Recebe só o nome do cliente.
export function montarMensagemPronto(cliente) {
  const nome = String(cliente || '').trim();
  const ola = nome ? `Oi ${nome}!` : 'Oi!';
  return (
    `${ola} 😊 Aqui é a Julia, da Vera Molduras e Decoração.\n` +
    `Seu quadro já está pronto e pode ser retirado na loja! 🎉\n` +
    `Estamos na Av. Parigot de Souza, 2475 — seg a sex 8h-18h, sáb 8h-12h.\n` +
    `Qualquer dúvida é só chamar. 💛`
  );
}

// Normaliza um telefone digitado pra "55DDDNUMERO" (só dígitos, com DDI 55). Sem DDD -> null.
// O onWhatsApp do Baileys resolve depois o detalhe do 9º dígito brasileiro.
export function normalizarTelefone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d; // DDD + número, sem DDI
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

// ---- Orquestração (I/O injetado, pra testar com fakes) ----
//
// deps:
//   buscarPendentes() -> [{ id, cliente, telefone }]
//   onWhatsApp(tel)   -> jid | null   (telefone já normalizado)
//   enviar(jid, texto)-> envia a mensagem
//   confirmar(id, ok, motivo) -> grava 'enviado'/'falha' na planilha
//   log(msg)          -> opcional
// Devolve quantos avisos foram enviados com sucesso.
export async function verificarOficina(deps) {
  const { buscarPendentes, onWhatsApp, enviar, confirmar, log } = deps;
  const aviso = (m) => { if (log) log(m); };

  const pendentes = await buscarPendentes();
  let enviados = 0;

  for (const o of pendentes || []) {
    const tel = normalizarTelefone(o.telefone);
    if (!tel) { await confirmar(o.id, false, 'telefone inválido'); continue; }

    let jid;
    try {
      jid = await onWhatsApp(tel);
    } catch (e) {
      aviso(`erro consultando WhatsApp da OS ${o.id}: ${e.message}`); // tenta no próximo ciclo
      continue;
    }
    if (!jid) { await confirmar(o.id, false, 'número não está no WhatsApp'); continue; }

    try {
      await enviar(jid, montarMensagemPronto(o.cliente));
      await confirmar(o.id, true);
      enviados++;
    } catch (e) {
      aviso(`falha ao enviar aviso da OS ${o.id}: ${e.message}`); // NÃO confirma: tenta de novo
    }
  }
  return enviados;
}

// ---- HTTP (ponte real com o Apps Script; usado pelo index.js) ----

function base() {
  const b = process.env.APPS_SCRIPT_URL;
  if (!b) throw new Error('APPS_SCRIPT_URL é obrigatória no .env');
  return b;
}
function token() {
  return process.env.OFICINA_TOKEN || '';
}

export async function buscarPendentesHTTP() {
  const qs = new URLSearchParams({ action: 'oficinaPendentes', token: token() }).toString();
  const resp = await fetch(`${base()}?${qs}`, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const j = await resp.json();
  if (!j.ok) throw new Error(j.erro || 'erro desconhecido');
  return j.dados || [];
}

export async function confirmarAvisoHTTP(id, ok, motivo) {
  const qs = new URLSearchParams({
    action: 'oficinaConfirmarAviso', token: token(),
    id: String(id), ok: ok ? 'true' : 'false', motivo: motivo || ''
  }).toString();
  const resp = await fetch(`${base()}?${qs}`, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const j = await resp.json();
  if (!j.ok) throw new Error(j.erro || 'erro desconhecido');
  return j.dados;
}
