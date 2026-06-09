import makeWASocket, { useMultiFileAuthState, DisconnectReason } from 'baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { processarMensagem } from './lib/bot.js';

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

// Histórico de conversa por contato (em memória).
// Se o bot reiniciar, as conversas zeram — persistir no
// Supabase é a próxima fase.
const conversas = new Map();
const MAX_HISTORICO = 40; // limita tokens enviados ao Gemini

// Fila por contato: garante que mensagens do mesmo cliente
// sejam processadas uma de cada vez, na ordem.
const filas = new Map();

// Buffer de digitação: cliente de WhatsApp manda várias
// mensagens curtas seguidas; espera 4s e junta tudo numa só.
const buffers = new Map();
const ESPERA_BUFFER_MS = 4000;

function extrairTexto(msg) {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    null
  );
}

async function responderCliente(sock, jid, texto) {
  const contexto = {
    enviarFoto: async (url, legenda) => {
      await sock.sendMessage(jid, { image: { url }, caption: legenda });
    }
  };

  const historico = conversas.get(jid) || [];

  await sock.sendPresenceUpdate('composing', jid);

  const { resposta, historico: novoHistorico } = await processarMensagem(
    historico,
    texto,
    contexto
  );

  // Guarda só as últimas N mensagens pra não estourar tokens
  conversas.set(jid, novoHistorico.slice(-MAX_HISTORICO));

  await sock.sendPresenceUpdate('paused', jid);
  await sock.sendMessage(jid, { text: resposta });
}

function agendarResposta(sock, jid) {
  // (Re)inicia o timer: se chegar outra mensagem em até 4s,
  // espera mais um pouco antes de responder tudo junto.
  const buffer = buffers.get(jid);
  clearTimeout(buffer.timer);

  buffer.timer = setTimeout(() => {
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
  }, ESPERA_BUFFER_MS);
}

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }) // sem ruído do Baileys no console
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escaneie o QR code abaixo com o WhatsApp:');
      console.log('   (WhatsApp > Configurações > Aparelhos conectados > Conectar aparelho)\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ Conectado ao WhatsApp! A Sofia está atendendo. 💬\n');
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

      // Ignora: minhas próprias mensagens, grupos, status e newsletters
      if (msg.key.fromMe) continue;
      if (!jid || !jid.endsWith('@s.whatsapp.net')) continue;

      const texto = extrairTexto(msg);
      if (!texto) continue; // áudio, figurinha etc. — por enquanto só texto

      console.log(`📩 ${jid.split('@')[0]}: ${texto}`);

      if (!buffers.has(jid)) {
        buffers.set(jid, { textos: [], timer: null });
      }
      buffers.get(jid).textos.push(texto);
      agendarResposta(sock, jid);
    }
  });
}

console.log('🚀 Iniciando bot da Molduraria Arte & Estilo...');
iniciar();
