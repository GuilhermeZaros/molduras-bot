import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from 'baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { processarMensagem } from './lib/bot.js';
import { dividirEmMensagens } from './lib/mensagens.js';
import { classificarMensagem, transcreverAudio, entenderImagem } from './lib/midia.js';
import { lerHistorico, gravarHistorico, apararHistorico } from './lib/historico.js';
import { deveEsperarDigitando } from './lib/espera.js';
import { verificarOficina, buscarPendentesHTTP, confirmarAvisoHTTP } from './lib/oficina.js';

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================
// BOT DO WHATSAPP (via Baileys)
//
// Como conectar:
//   npm start          → mostra QR code pra escanear
//                        (WhatsApp > Aparelhos conectados > Conectar aparelho)
//
// A sessão fica salva na pasta auth_info_baileys/ — só precisa
// escanear na primeira vez.
// =========================================

// Histórico de conversa por contato. Carregado do disco no boot e salvo a cada turno
// (lib/historico.js) — sobrevive a reinício/crash/reconexão (antes ficava só em memória e zerava).
const conversas = new Map(Object.entries(lerHistorico()));
const MAX_HISTORICO = 40; // limita tokens enviados ao Gemini

// Fila por contato: garante que mensagens do mesmo cliente
// sejam processadas uma de cada vez, na ordem.
const filas = new Map();

// Buffer de digitação: junta as mensagens que o cliente manda quebradas e só responde quando ele
// PARA de digitar (usa o status "digitando" do WhatsApp), com um teto pra nunca travar.
const buffers = new Map();
const digitando = new Map();        // jid -> timestamp do último "digitando" (composing) do cliente
const ESPERA_BASE_MS = 3000;        // espera base depois da última mensagem antes de responder
const RECHECAGEM_MS = 2000;         // se ainda está digitando, checa de novo nesse intervalo
const COMPONDO_VALIDADE_MS = 6000;  // um "digitando" vale por até 6s (o WhatsApp reenvia enquanto digita)
const ESPERA_MAX_MS = 15000;        // teto absoluto: nunca segura a resposta mais que isso

const FALLBACK_MIDIA = 'Recebi sua mensagem 😊 mas não consegui abrir o áudio/foto aqui — pode mandar de novo, ou me escrever em texto?';

// Oficina: a cada ciclo a Julia checa a planilha por quadros marcados como prontos e avisa o cliente.
let oficinaTimer = null;
const OFICINA_POLL_MS = 60000;

function rodarPollOficina(sock) {
  if (!process.env.OFICINA_TOKEN) return; // sem token configurado: oficina desligada
  verificarOficina({
    buscarPendentes: buscarPendentesHTTP,
    onWhatsApp: async (tel) => {
      const r = await sock.onWhatsApp(tel);
      const hit = Array.isArray(r) && r.find((x) => x && x.exists);
      return hit ? hit.jid : null;
    },
    enviar: (jid, texto) => sock.sendMessage(jid, { text: texto }),
    confirmar: confirmarAvisoHTTP,
    log: (m) => console.log('🏭 ' + m)
  })
    .then((n) => { if (n) console.log(`🏭 oficina: ${n} cliente(s) avisado(s)`); })
    .catch((e) => console.error('🏭 oficina poll erro:', e.message));
}

// Extrai o texto da mensagem. Texto vem direto; áudio é transcrito; foto é "entendida".
// Áudio/foto que falharem viram uma mensagem de fallback (em vez de silêncio). Outros tipos → null.
async function extrairConteudo(sock, msg) {
  const c = classificarMensagem(msg);
  if (c.tipo === 'texto') return c.texto;
  if (c.tipo !== 'imagem' && c.tipo !== 'audio') return null; // figurinha/vídeo/doc/vazio → ignora

  await sock.sendPresenceUpdate('composing', msg.key.remoteJid).catch(() => {});
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      logger: pino({ level: 'silent' }),
      reuploadRequest: sock.updateMediaMessage
    });
    if (c.tipo === 'audio') {
      const mime = msg.message.audioMessage.mimetype || 'audio/ogg';
      const texto = await transcreverAudio(buffer, mime);
      console.log(`🎤 áudio transcrito: ${texto}`);
      return texto || FALLBACK_MIDIA;
    }
    const mime = msg.message.imageMessage.mimetype || 'image/jpeg';
    const texto = await entenderImagem(buffer, mime, c.legenda);
    console.log(`🖼️  foto entendida: ${texto}`);
    return texto;
  } catch (err) {
    console.error('❌ erro processando mídia:', err.message);
    return FALLBACK_MIDIA;
  }
}

async function responderCliente(sock, jid, texto) {
  const contexto = {
    enviarFoto: async (url, legenda) => {
      await sock.sendMessage(jid, { image: { url }, caption: legenda });
    }
  };

  // Apara já na leitura: limita o tamanho e cura um histórico salvo com par quebrado
  // (functionResponse órfão) que o Gemini recusaria. Mantém os resultados das tools no histórico
  // (o modelo precisa dos CÓDIGOS reais das molduras pra mandar foto/cotar no turno seguinte).
  const historico = apararHistorico(conversas.get(jid) || [], MAX_HISTORICO);

  await sock.sendPresenceUpdate('composing', jid);

  const { resposta, historico: novoHistorico } = await processarMensagem(
    historico,
    texto,
    contexto
  );

  // Guarda as últimas N entradas (com os resultados das tools, pros códigos sobreviverem ao
  // próximo turno); apararHistorico limita e nunca deixa começar num par quebrado.
  conversas.set(jid, apararHistorico(novoHistorico, MAX_HISTORICO));
  gravarHistorico(Object.fromEntries(conversas)); // persiste pro contexto sobreviver a restart

  // Envia em "rajada": vários balões curtos, como a Julia real digita.
  // O bot separa cada balão por linha em branco (ver SYSTEM_PROMPT).
  const baloes = dividirEmMensagens(resposta);
  const mensagens = baloes.length ? baloes : [resposta];

  for (const parte of mensagens) {
    await sock.sendPresenceUpdate('composing', jid);
    // delay proporcional ao tamanho, pra parecer digitação (mín 600ms, máx 2.5s)
    const espera = Math.min(2500, Math.max(600, parte.length * 35));
    await dormir(espera);
    await sock.sendPresenceUpdate('paused', jid);
    await sock.sendMessage(jid, { text: parte });
  }
}

function agendarResposta(sock, jid) {
  // (Re)inicia o timer base: a cada mensagem nova, espera de novo antes de checar se responde.
  const buffer = buffers.get(jid);
  if (!buffer) return;
  clearTimeout(buffer.timer);
  buffer.timer = setTimeout(() => verificarEResponder(sock, jid), ESPERA_BASE_MS);
}

// Só responde quando o cliente PAROU de digitar (ou bateu o teto). Enquanto ele estiver digitando,
// segura e checa de novo — assim "ola" + "boa noite" viram uma resposta só.
function verificarEResponder(sock, jid) {
  const buffer = buffers.get(jid);
  if (!buffer) return;

  if (deveEsperarDigitando(digitando.get(jid), buffer.ultimaMsg, Date.now(), COMPONDO_VALIDADE_MS, ESPERA_MAX_MS)) {
    buffer.timer = setTimeout(() => verificarEResponder(sock, jid), RECHECAGEM_MS);
    return;
  }

  const textoCompleto = buffer.textos.join('\n');
  buffers.delete(jid);

  // Encadeia na fila do contato pra processar em ordem
  const filaAnterior = filas.get(jid) || Promise.resolve();
  const novaFila = filaAnterior
    .then(() => responderCliente(sock, jid, textoCompleto))
    .catch(async (err) => {
      console.error(`❌ Erro respondendo ${jid}:`, err.message);
      await sock.sendMessage(jid, {
        text: 'Opa, deu um probleminha aqui no sistema 😅 Pode mandar de novo?'
      }).catch(() => {});
    });
  filas.set(jid, novaFila);
}

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) // sem ruído do Baileys no console
  });

  sock.ev.on('creds.update', saveCreds);

  // Status "digitando" do cliente: marca o timestamp enquanto ele está compondo; ao parar, zera.
  // É o que deixa a Julia esperar o cliente terminar antes de responder.
  sock.ev.on('presence.update', ({ id, presences }) => {
    if (!id || !presences) return;
    const info = presences[id] || Object.values(presences)[0];
    const p = info && info.lastKnownPresence;
    if (!p) return;
    digitando.set(id, p === 'composing' ? Date.now() : 0);
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escaneie o QR code abaixo com o WhatsApp:');
      console.log('   (WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho)\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp! A Julia está atendendo. 💬\n');
      // (Re)inicia o poll da oficina ligado a ESTE sock (reconexão cria um sock novo).
      if (oficinaTimer) clearInterval(oficinaTimer);
      if (process.env.OFICINA_TOKEN) {
        rodarPollOficina(sock); // uma vez já no boot
        oficinaTimer = setInterval(() => rodarPollOficina(sock), OFICINA_POLL_MS);
        console.log('🏭 Aviso automático da oficina ligado (checando a cada 60s).');
      }
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;

      if (codigo === DisconnectReason.loggedOut) {
        console.log('🚪 Sessão deslogada. Apague a pasta auth_info_baileys/ e rode de novo pra reconectar.');
        process.exit(1);
      }

      // 440 = outra instância do bot conectou com a mesma sessão.
      // Reconectar aqui causaria uma guerra infinita entre as duas.
      if (codigo === DisconnectReason.connectionReplaced) {
        console.log('⚠️  Outra instância do bot está rodando com esta sessão.');
        console.log('   Feche a outra (ou esta) — não rode npm start duas vezes.');
        process.exit(1);
      }

      console.log(`🔄 Conexão caiu (código ${codigo ?? '?'}), reconectando...`);
      iniciar();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;

      // Ignora: minhas próprias mensagens, grupos, status e newsletters.
      // Conversa individual chega como @s.whatsapp.net (formato antigo)
      // ou @lid (formato novo do WhatsApp) — aceita os dois.
      if (msg.key.fromMe) continue;
      const ehConversaIndividual =
        jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
      if (!ehConversaIndividual) {
        console.log(`🙈 Ignorando mensagem de ${jid} (grupo/status/canal)`);
        continue;
      }

      const texto = await extrairConteudo(sock, msg);
      if (!texto) continue; // figurinha/vídeo/documento — ignorados por enquanto

      console.log(`📩 ${jid.split('@')[0]}: ${texto}`);

      if (!buffers.has(jid)) {
        buffers.set(jid, { textos: [], timer: null });
      }
      const buf = buffers.get(jid);
      buf.textos.push(texto);
      buf.ultimaMsg = Date.now();
      sock.presenceSubscribe(jid).catch(() => {}); // pra receber o "digitando" do cliente
      agendarResposta(sock, jid);
    }
  });
}

console.log('🚀 Iniciando bot da Vera Molduras e Decoração...');
iniciar();
