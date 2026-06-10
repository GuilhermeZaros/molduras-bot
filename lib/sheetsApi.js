import 'dotenv/config';

// Wrapper de leitura da API do Apps Script (somente GET).
// Cache curto em memória pra não bater no Apps Script a cada mensagem do bot.

const TTL_MS = 60_000;
const cache = new Map(); // chave -> { dados, expira }

function base() {
  const b = process.env.APPS_SCRIPT_URL;
  if (!b) throw new Error('APPS_SCRIPT_URL é obrigatória no .env');
  return b;
}

function limparParams(params) {
  const out = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
}

// Para testes: zera o cache entre casos.
export function _limparCache() {
  cache.clear();
}

// Chama GET ?action=... e devolve `dados` (ou lança com a mensagem de erro da API).
export async function apiGet(action, params = {}) {
  const chave = action + '?' + JSON.stringify(limparParams(params));
  const agora = Date.now();
  const hit = cache.get(chave);
  if (hit && hit.expira > agora) return hit.dados;

  const qs = new URLSearchParams({ action, ...limparParams(params) }).toString();
  const resp = await fetch(`${base()}?${qs}`, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`API HTTP ${resp.status}`);

  const json = await resp.json();
  if (!json.ok) throw new Error(json.erro || 'erro desconhecido da API');

  cache.set(chave, { dados: json.dados, expira: agora + TTL_MS });
  return json.dados;
}
