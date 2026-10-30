import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from 'baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { processarMensagem } from './lib/bot.js';
import { dividirEmMensagens, semTravessao } from './lib/mensagens.js';
import { classificarMensagem, transcreverAudio, entenderImagem, mensagemInterna, textoCitado, descreverArquivo } from './lib/midia.js';
import { lerHistorico, gravarHistorico, apararHistorico } from './lib/historico.js';
import { deveEsperarDigitando } from './lib/espera.js';
import { verificarOficina, buscarPendentesHTTP, confirmarAvisoHTTP, normalizarTelefone } from './lib/oficina.js';
import {
  ehAvisoDePronto, agendarAvaliacao, verificarAvaliacoes,
  lerAvaliacoes, gravarAvaliacoes, CONFIG_AVALIACAO, LINK_AVALIACAO
} from './lib/avaliacao.js';
import {
  anotarMensagem, recentesDe, limparRecentes, montarBlocoContexto, descreverMensagem,
  marcarAvaliacaoEnviada, marcarConvite, aguardandoRespostaAvaliacao, limparVencidos,
  lerContexto, gravarContexto, marcarCampanha, marcarCampanhaRespondida, aguardandoRespostaCampanha
} from './lib/contexto.js';
import {
  detectarDespedida, equipeFalouRecente, atendimentoSoDaEquipe,
  lerAtendimentos, gravarAtendimentos, verificarAtendimentos, CONFIG_PADRAO
} from './lib/atendimento.js';
import { ehCampanhaPortaRetrato, envioDaCampanha, comFalaDaEquipe, semSilencioDaRajada } from './lib/portaRetrato.js';
import { gerarResumo, gerarRelatorioTriagem, montarMensagemRelatorio, extrairDialogo } from './lib/resumo.js';
import { MODO_TRIAGEM } from './lib/modo.js';
import { lerPausados, gravarPausados, aoEditarLabel, aoAssociar, estaPausado } from './lib/pausa.js';
import { criarDeduplicador } from './lib/dedupe.js';
import { registrarAprendizado } from './lib/aprendizado.js';

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

// Descarta reentregas do WhatsApp: o Baileys reentrega a mesma mensagem (mesmo id)
// após reconexão/retry, o que fazia a Julia responder duas vezes. Ver lib/dedupe.js.
const jaVisto = criarDeduplicador();

// IDs das mensagens que a PRÓPRIA Julia enviou (via sendMessage). Usado no messages.upsert:
// quando chega uma msg fromMe cujo id NÃO está aqui, é porque a equipe humana falou de outro
// aparelho — Julia registra isso pra calar na próxima despedida/aceite do cliente.
// Efêmero (não persiste): no boot, cai numa janela em que qualquer fromMe recente vai ser
// tratada como equipe. É tolerável — pior caso, Julia cala UM turno a mais.
const juliaIds = new Set();
const JULIA_IDS_MAX = 500; // teto: derruba metade quando estoura (bounded set)
async function enviarComoJulia(sock, jid, payload) {
  const limpo = { ...payload };
  if (typeof limpo.text === 'string') limpo.text = semTravessao(limpo.text);
  if (typeof limpo.caption === 'string') limpo.caption = semTravessao(limpo.caption);
  const r = await sock.sendMessage(jid, limpo);
  const id = r && r.key && r.key.id;
  if (id) {
    juliaIds.add(id);
    if (juliaIds.size > JULIA_IDS_MAX) {
      const antigos = Array.from(juliaIds).slice(0, JULIA_IDS_MAX / 2);
      for (const x of antigos) juliaIds.delete(x);
    }
  }
  return r;
}

// Estado do atendimento por contato (última atividade, despedida, fim, resumo enviado).
// Carregado do disco no boot; salvo a cada mudança. Base do resumo + expiração de 72h.
const atendimentos = lerAtendimentos();
const NUMERO_RESUMO = process.env.NUMERO_RESUMO || '44999999999';

// Pausa por etiqueta: conversas etiquetadas no WhatsApp Business em que a Julia não responde.
let pausa = lerPausados();
const ETIQUETA_PAUSA = process.env.ETIQUETA_PAUSA || 'Pausar Julia';
const ETIQUETA_PAUSA_ID = process.env.ETIQUETA_PAUSA_ID || ''; // plano B: casar por id em vez de nome
const PAUSA_CFG = { nome: ETIQUETA_PAUSA, id: ETIQUETA_PAUSA_ID };

// Buffer de digitação: junta as mensagens que o cliente manda quebradas e só responde quando ele
// PARA de digitar (usa o status "digitando" do WhatsApp), com um teto pra nunca travar.
const buffers = new Map();
const digitando = new Map();        // jid -> timestamp do último "digitando" (composing) do cliente
const ESPERA_BASE_MS = 3000;        // espera base depois da última mensagem antes de responder
const RECHECAGEM_MS = 2000;         // se ainda está digitando, checa de novo nesse intervalo
const COMPONDO_VALIDADE_MS = 6000;  // um "digitando" vale por até 6s (o WhatsApp reenvia enquanto digita)
const ESPERA_MAX_MS = 15000;        // teto absoluto: nunca segura a resposta mais que isso

const FALLBACK_MIDIA = 'Recebi sua mensagem 😊 mas não consegui abrir o áudio/foto aqui. Pode mandar de novo ou me escrever em texto?';

// Oficina: a cada ciclo a Julia checa a planilha por quadros marcados como prontos e avisa o cliente.
let oficinaTimer = null;
const OFICINA_POLL_MS = 60000;

// Varredura de atendimentos: encerra (resume + avisa o dono) e esquece os de >72h.
let varreduraTimer = null;

// Avaliação no Google: quando a equipe manda o aviso-MODELO de "quadro pronto" pelo WhatsApp da
// loja, o contato entra nesta fila e a Julia pede a avaliação 96h depois (só em horário útil).
let avaliacoes = lerAvaliacoes();
let avaliacaoTimer = null;

// Chamado nas mensagens que SAEM do número da loja escritas pela equipe humana.
function checarAvisoPronto(jid, texto) {
  if (!ehAvisoDePronto(texto)) return;
  avaliacoes = agendarAvaliacao(avaliacoes, jid, Date.now());
  gravarAvaliacoes(avaliacoes);
  console.log(`⭐ ${jid.split('@')[0]}: aviso de quadro pronto — avaliação agendada p/ daqui 96h`);
}

// Contexto do que NÃO passou pela Julia (equipe, mensagens automáticas, cliente enquanto a equipe
// cuidava). Entra antes da próxima mensagem que ela processar nesta conversa — ver lib/contexto.js.
let contexto = lerContexto();

function anotarContexto(jid, quem, texto) {
  const novo = anotarMensagem(contexto, jid, quem, texto, Date.now());
  if (novo === contexto) return;
  contexto = novo;
  gravarContexto(contexto);
}

function rodarVarreduraAvaliacoes(sock) {
  contexto = limparVencidos(contexto, Date.now());
  gravarContexto(contexto);
  verificarAvaliacoes({
    listar: () => avaliacoes,
    enviar: async (jid, texto) => {
      await enviarComoJulia(sock, jid, { text: texto });
      anotarContexto(jid, 'julia', texto);
      contexto = marcarAvaliacaoEnviada(contexto, jid, Date.now());
      gravarContexto(contexto);
    },
    concluir: (jid) => { delete avaliacoes[jid]; gravarAvaliacoes(avaliacoes); },
    agora: Date.now(),
    log: (m) => console.log('⭐ ' + m)
  })
    .then((n) => { if (n) console.log(`⭐ avaliação: ${n} pedido(s) enviado(s)`); })
    .catch((e) => console.error('⭐ avaliação erro:', e.message));
}

function rodarPollOficina(sock) {
  if (!process.env.OFICINA_TOKEN) return; // sem token configurado: oficina desligada
  verificarOficina({
    buscarPendentes: buscarPendentesHTTP,
    onWhatsApp: async (tel) => {
      const r = await sock.onWhatsApp(tel);
      const hit = Array.isArray(r) && r.find((x) => x && x.exists);
      return hit ? hit.jid : null;
    },
    enviar: async (jid, texto) => {
      await enviarComoJulia(sock, jid, { text: texto });
      anotarContexto(jid, 'julia', texto);
    },
    confirmar: confirmarAvisoHTTP,
    log: (m) => console.log('🏭 ' + m)
  })
    .then((n) => { if (n) console.log(`🏭 oficina: ${n} cliente(s) avisado(s)`); })
    .catch((e) => console.error('🏭 oficina poll erro:', e.message));
}

function rodarVarreduraAtendimentos(sock) {
  verificarAtendimentos({
    listarAtendimentos: () => {
      // Conversa pausada por etiqueta (humano cuidando) não gera resumo nem expira.
      const ativos = {};
      for (const [j, m] of Object.entries(atendimentos)) {
        if (!estaPausado(pausa, j, PAUSA_CFG)) ativos[j] = m;
      }
      return ativos;
    },
    lerConversa: (jid) => conversas.get(jid) || [],
    // No triagem o relatório sai em tópicos (gerarRelatorioTriagem) e a mensagem leva o nome
    // do WhatsApp + a conversa como fallback; no modo normal, o resumo/formato de sempre.
    gerarResumo: MODO_TRIAGEM ? gerarRelatorioTriagem : gerarResumo,
    montarMensagem: MODO_TRIAGEM
      ? (jid, rel) => montarMensagemRelatorio(jid, atendimentos[jid]?.nome, rel, extrairDialogo(conversas.get(jid) || []))
      : undefined,
    onWhatsApp: async (numero) => {
      const tel = normalizarTelefone(numero);
      if (!tel) return null;
      const r = await sock.onWhatsApp(tel);
      const hit = Array.isArray(r) && r.find((x) => x && x.exists);
      return hit ? hit.jid : null;
    },
    enviar: (jid, texto) => enviarComoJulia(sock, jid, { text: texto }),
    encerrar: (jid, agora) => {
      const m = atendimentos[jid];
      if (!m) return;
      m.fimAtendimento = agora;
      m.resumoEnviado = true;
      gravarAtendimentos(atendimentos);
    },
    esquecer: (jid) => {
      delete atendimentos[jid];
      conversas.delete(jid);
      gravarAtendimentos(atendimentos);
      gravarHistorico(Object.fromEntries(conversas));
    },
    // Sem marcarToque: o "toque" automático no cliente sumido fica DESLIGADO de propósito —
    // a equipe prefere fazer esse follow-up manualmente. O lib só toca se este dep existir.
    agora: Date.now(),
    cfg: CONFIG_PADRAO,
    numeroResumo: NUMERO_RESUMO,
    log: (m) => console.log('📝 ' + m)
  })
    .then((r) => {
      if (r.encerrados || r.esquecidos || r.toques)
        console.log(`📝 atendimentos: ${r.encerrados} resumido(s), ${r.esquecidos} esquecido(s), ${r.toques} toque(s)`);
    })
    .catch((e) => console.error('📝 varredura erro:', e.message));
}

// Extrai o texto da mensagem. Texto vem direto; áudio é transcrito; foto é "entendida"; arquivo
// (documento) vira um aviso de que chegou. Áudio/foto que falharem viram uma mensagem de fallback
// (em vez de silêncio). Outros tipos → null.
//
// Para ephemeral/viewOnce, o download precisa da mídia "não embrulhada" no msg.message —
// senão o Baileys não acha o mediaKey. Reconstroi msg com a versão interna quando aplicável.
async function extrairConteudo(sock, msg) {
  const c = classificarMensagem(msg);
  if (c.tipo === 'texto') return c.texto;
  if (c.tipo === 'documento') return descreverArquivo(c); // não baixa: a Julia só fica sabendo que chegou
  if (c.tipo !== 'imagem' && c.tipo !== 'audio') return null; // figurinha/vídeo/vazio → ignora

  const mInner = mensagemInterna(msg.message);
  const msgEfetiva = mInner === msg.message ? msg : { ...msg, message: mInner };

  await sock.sendPresenceUpdate('composing', msg.key.remoteJid).catch(() => {});
  try {
    const buffer = await downloadMediaMessage(msgEfetiva, 'buffer', {}, {
      logger: pino({ level: 'silent' }),
      reuploadRequest: sock.updateMediaMessage
    });
    if (c.tipo === 'audio') {
      const mime = msgEfetiva.message.audioMessage.mimetype || 'audio/ogg';
      const texto = await transcreverAudio(buffer, mime);
      console.log(`🎤 áudio transcrito: ${texto}`);
      return texto || FALLBACK_MIDIA;
    }
    const mime = msgEfetiva.message.imageMessage.mimetype || 'image/jpeg';
    const texto = await entenderImagem(buffer, mime, c.legenda);
    console.log(`🖼️  foto entendida: ${texto}`);
    return texto;
  } catch (err) {
    console.error('❌ erro processando mídia:', err.message);
    return FALLBACK_MIDIA;
  }
}

async function responderCliente(sock, jid, texto) {
  // Corrida com a etiqueta: se a conversa foi pausada DEPOIS que esta resposta entrou na fila,
  // não responde (o humano assumiu). Fecha o caso de uma resposta em voo no momento da pausa.
  if (estaPausado(pausa, jid, PAUSA_CFG)) {
    console.log(`⏸️  ${jid.split('@')[0]}: pausada durante o processamento — descartando resposta`);
    return;
  }

  const agora = Date.now();
  const campanhaPendente = aguardandoRespostaCampanha(contexto, jid, agora);
  const contextoTurno = {
    enviarFoto: async (url, legenda) => {
      await enviarComoJulia(sock, jid, { image: { url }, caption: legenda });
    },
    antes: montarBlocoContexto(recentesDe(contexto, jid, agora)),
    aguardandoAvaliacao: aguardandoRespostaAvaliacao(contexto, jid, agora),
    campanhaPendente
  };

  // Apara já na leitura: limita o tamanho e cura um histórico salvo com par quebrado
  // (functionResponse órfão) que o Gemini recusaria. Mantém os resultados das tools no histórico
  // (o modelo precisa dos CÓDIGOS reais das molduras pra mandar foto/cotar no turno seguinte).
  const historico = apararHistorico(conversas.get(jid) || [], MAX_HISTORICO);

  await sock.sendPresenceUpdate('composing', jid);

  const { resposta, baloes: baloesProntos, historico: novoHistorico } = await processarMensagem(
    historico,
    texto,
    contextoTurno
  );

  // Guarda as últimas N entradas (com os resultados das tools, pros códigos sobreviverem ao
  // próximo turno); apararHistorico limita e nunca deixa começar num par quebrado.
  conversas.set(jid, apararHistorico(novoHistorico, MAX_HISTORICO));
  gravarHistorico(Object.fromEntries(conversas)); // persiste pro contexto sobreviver a restart

  // O bloco de contexto já foi pro histórico: sai da fila. Só depois do modelo responder — se o
  // Gemini falhar, o contexto fica pra próxima tentativa.
  contexto = limparRecentes(contexto, jid, agora);
  if (campanhaPendente) contexto = marcarCampanhaRespondida(contexto, jid, Date.now());
  // Julia mandou o link de avaliação (convite fixo ou pelo modelo): não convida de novo e cancela
  // o pedido automático de 96h desse cliente, se ainda estava na fila (senão ele recebe dois).
  if (resposta && resposta.includes(LINK_AVALIACAO)) {
    contexto = marcarConvite(contexto, jid, Date.now());
    if (avaliacoes[jid]) {
      delete avaliacoes[jid];
      gravarAvaliacoes(avaliacoes);
    }
    console.log(`⭐ ${jid.split('@')[0]}: Julia convidou pra avaliação no Google`);
  }
  gravarContexto(contexto);

  // Envia em no máximo 2 balões (o cliente estava recebendo mensagem demais). O modelo já é
  // instruído a responder curto e em 1 mensagem; aqui é o teto físico — o excedente é juntado
  // no último balão em vez de virar rajada. O separador é a linha em branco (ver SYSTEM_PROMPT).
  const baloes = baloesProntos || dividirEmMensagens(resposta, 2);
  const mensagens = baloes.length ? baloes : [resposta];

  for (const parte of mensagens) {
    await sock.sendPresenceUpdate('composing', jid);
    // delay proporcional ao tamanho, pra parecer digitação (mín 600ms, máx 2.5s)
    const espera = Math.min(2500, Math.max(600, parte.length * 35));
    await dormir(espera);
    await sock.sendPresenceUpdate('paused', jid);
    await enviarComoJulia(sock, jid, { text: parte });
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
      await enviarComoJulia(sock, jid, {
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

  // Etiquetas do WhatsApp Business: mantém o mapa nome↔id e as associações conversa↔etiqueta,
  // pra pausar a Julia nas conversas etiquetadas com ETIQUETA_PAUSA.
  sock.ev.on('labels.edit', (label) => {
    const novo = aoEditarLabel(pausa, label);
    if (novo !== pausa) { pausa = novo; gravarPausados(pausa); } // só grava se mudou
    if (label && label.id) {
      console.log(`🏷️  etiqueta ${label.id} = "${label.name}"${label.deleted ? ' (apagada)' : ''}`);
    }
  });
  sock.ev.on('labels.association', (ev) => {
    const a = ev && ev.association;
    const jid = a && a.chatId;
    const antes = jid ? estaPausado(pausa, jid, PAUSA_CFG) : false;
    const novo = aoAssociar(pausa, ev);
    if (novo !== pausa) { pausa = novo; gravarPausados(pausa); } // ignora no-op/assoc de mensagem
    if (jid && !a.messageId) {
      const agora = estaPausado(pausa, jid, PAUSA_CFG);
      if (agora && !antes) {
        // Ao pausar, descarta mensagem em voo daquele chat (não responde atrasado ao religar).
        const buf = buffers.get(jid);
        if (buf) { clearTimeout(buf.timer); buffers.delete(jid); }
        console.log(`⏸️  ${jid.split('@')[0]}: pausada por etiqueta`);
      } else if (!agora && antes) {
        console.log(`▶️  ${jid.split('@')[0]}: etiqueta removida — Julia volta a responder`);
      }
    }
  });

  // Pareamento por CÓDIGO (alternativa ao QR): com PAREAMENTO_NUMERO no .env, o bot pede ao
  // WhatsApp um código de 8 caracteres pra digitar em Aparelhos conectados → "Conectar com
  // número de telefone". Serve quando não dá pra mostrar/escanear o QR (ex.: acesso remoto).
  let pareamentoPedido = false;

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      if (process.env.PAREAMENTO_NUMERO && !sock.authState.creds.registered && !pareamentoPedido) {
        pareamentoPedido = true; // 1 pedido por conexão
        let num = process.env.PAREAMENTO_NUMERO.replace(/\D/g, '');
        if (num.length === 10 || num.length === 11) num = '55' + num; // DDD+número sem DDI
        sock.requestPairingCode(num)
          .then((c) => console.log('🔑 CODIGO_PAREAMENTO=' + c))
          .catch((e) => console.error('❌ pareamento falhou:', e.message));
      }
      // String crua do QR: permite gerar o QR como IMAGEM fora do terminal
      // (ex.: `qrcode -o qr.png "<string>"`) quando o desenho ASCII fica cortado/ilegível.
      console.log('QR_STRING=' + qr);
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
      // Varredura de atendimentos (resumo + expiração) ligada a ESTE sock.
      if (varreduraTimer) clearInterval(varreduraTimer);
      rodarVarreduraAtendimentos(sock); // uma vez já no boot
      varreduraTimer = setInterval(() => rodarVarreduraAtendimentos(sock), CONFIG_PADRAO.VARREDURA_MS);
      console.log('📝 Resumo de atendimento + expiração de 72h ligados (checando a cada 5 min).');
      // Pedido de avaliação no Google (96h após o aviso de quadro pronto) ligado a ESTE sock.
      if (avaliacaoTimer) clearInterval(avaliacaoTimer);
      rodarVarreduraAvaliacoes(sock); // uma vez já no boot: pega o que venceu com o bot desligado
      avaliacaoTimer = setInterval(() => rodarVarreduraAvaliacoes(sock), CONFIG_AVALIACAO.VARREDURA_MS);
      console.log('⭐ Pedido de avaliação 96h depois do aviso de quadro pronto ligado (checando a cada 5 min).');
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

      console.log(`🔄 Conexão caiu (código ${codigo ?? '?'}), reconectando em 3s...`);
      // Respiro entre tentativas: sem ele, rede/TLS ruim vira um loop agressivo de reconexão
      // (o loop 500 já visto nesta máquina) que spamma o console e o WhatsApp.
      setTimeout(iniciar, 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // 'notify' = mensagem nova. Outros tipos ('append', 'replace', 'prepend') vêm em batch de
    // sincronização (reconexão, sync inicial) e não devem disparar resposta. MAS logamos pra
    // diagnóstico: já perdemos uma cliente vinda de anúncio do Facebook durante uma janela
    // de reconexão, e sem log não dava pra saber o motivo (ver postmortem no README).
    if (type !== 'notify') {
      for (const msg of messages) {
        if (msg.key?.fromMe) continue;
        const jid = msg.key?.remoteJid || '(sem jid)';
        const keys = msg.message ? Object.keys(msg.message).join(',') : '(sem message)';
        console.log(`⏭️  ${jid.split('@')[0]}: msg type=${type} descartada (formato=${keys})`);
      }
      return;
    }

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      // Conversa individual chega como @s.whatsapp.net (formato antigo)
      // ou @lid (formato novo do WhatsApp) — aceita os dois.
      const ehConversaIndividual =
        jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));

      if (jid && jid.endsWith('@broadcast') && jid !== 'status@broadcast') {
        const c = classificarMensagem(msg);
        if (ehCampanhaPortaRetrato(c.texto || c.legenda)) {
          console.log(`📣 Semana do Porta-Retrato saiu por lista de transmissão (${jid}): a Julia só reconhece quem responder citando a mensagem ou falando de porta-retrato`);
        }
      }

      // Conversa que a EQUIPE assumiu (pausada por etiqueta): a Julia NÃO responde, mas GRAVA o
      // diálogo (cliente + equipe) como material de estudo pra depois refinar o jeito dela.
      // Em conversa pausada, fromMe = equipe humana (a Julia está pausada, não manda nada). Só texto.
      if (ehConversaIndividual && estaPausado(pausa, jid, PAUSA_CFG)) {
        // Reentrega do WhatsApp também acontece aqui: sem este check, a mesma mensagem
        // entraria 2x no material de estudo (o check geral de dedup fica mais abaixo).
        if (jaVisto.jaProcessou(msg.key.id)) continue;
        const c = classificarMensagem(msg);
        // Mensagem automática da Julia já foi anotada no envio; aqui entra só equipe e cliente.
        const daJulia = msg.key.fromMe && juliaIds.has(msg.key.id);
        if (!daJulia) anotarContexto(jid, msg.key.fromMe ? 'equipe' : 'cliente', descreverMensagem(c));
        if (c.tipo === 'texto' && c.texto) {
          const quem = msg.key.fromMe ? 'equipe' : 'cliente';
          registrarAprendizado(jid, quem, c.texto);
          console.log(`📚 ${jid.split('@')[0]}: pausada (equipe) — ${quem} registrado p/ estudo`);
          // O aviso de quadro pronto vale mesmo com a conversa pausada (a equipe está cuidando
          // dela, e é justamente a equipe que manda o aviso). Ignora o que a própria Julia enviou.
          if (msg.key.fromMe && !daJulia) checarAvisoPronto(jid, c.texto);
        }
        continue;
      }

      // A partir daqui a Julia processa. Trata fromMe (Julia própria vs equipe humana), grupos, status.
      if (msg.key.fromMe) {
        // Se o id casa com uma msg que a JULIA enviou → é ela mesma, ignora silenciosamente.
        // Se NÃO casa → a equipe falou desse número (outro aparelho / WhatsApp Web). Registra
        // no atendimento: a Julia fica MUDA nesta conversa por 1h30 (cada mensagem da equipe
        // renova o prazo). O dedupe evita que reentrega renove a janela ou duplique o estudo.
        const id = msg.key.id;
        if (id && juliaIds.has(id)) {
          juliaIds.delete(id);
          continue;
        }
        if (ehConversaIndividual && !jaVisto.jaProcessou(id)) {
          const agora = Date.now();
          const c = classificarMensagem(msg);
          const envio = envioDaCampanha(c, atendimentos[jid], contexto[jid] && contexto[jid].campanhaEm, agora, CONFIG_PADRAO.EQUIPE_RECENTE_MS);
          if (envio) {
            anotarContexto(jid, 'equipe', descreverMensagem(c));
            if (envio === 'campanha') {
              contexto = marcarCampanha(contexto, jid, agora);
              gravarContexto(contexto);
              if (atendimentos[jid]) {
                atendimentos[jid] = semSilencioDaRajada(atendimentos[jid], agora);
                gravarAtendimentos(atendimentos);
              }
              console.log(`📣 ${jid.split('@')[0]}: equipe mandou a Semana do Porta-Retrato, a Julia responde quando o cliente falar`);
            }
            continue;
          }
          atendimentos[jid] = comFalaDaEquipe(atendimentos[jid] || atendimentoSoDaEquipe(agora), agora);
          gravarAtendimentos(atendimentos);
          if (aguardandoRespostaCampanha(contexto, jid, agora)) {
            contexto = marcarCampanhaRespondida(contexto, jid, agora);
            gravarContexto(contexto);
          }
          anotarContexto(jid, 'equipe', descreverMensagem(c)); // a Julia vai ler isso na próxima
          if (c.tipo === 'texto' && c.texto) {
            registrarAprendizado(jid, 'equipe', c.texto);
            checarAvisoPronto(jid, c.texto); // aviso-modelo de quadro pronto -> agenda a avaliação
          }
          console.log(`👥 ${jid.split('@')[0]}: equipe humana falou — Julia muda nesta conversa por 1h30`);
        }
        continue;
      }
      if (!ehConversaIndividual) {
        console.log(`🙈 Ignorando mensagem de ${jid} (grupo/status/canal)`);
        continue;
      }

      // Reentrega do WhatsApp (mesma mensagem chegando 2×, comum após reconexão): descarta,
      // senão a Julia responde de novo a mesma coisa. Antes de baixar/transcrever mídia à toa.
      if (jaVisto.jaProcessou(msg.key.id)) {
        console.log(`♻️  ${jid.split('@')[0]}: mensagem repetida (reentrega) — ignorando`);
        continue;
      }

      const texto = await extrairConteudo(sock, msg);
      if (!texto) {
        // Log de diagnóstico: mostra o formato do payload pra sabermos o que estamos ignorando
        // (figurinha, vídeo, protocolMessage de edição, ou formato novo do WhatsApp).
        const keys = msg.message ? Object.keys(msg.message).join(',') : '(vazio)';
        console.log(`❓ ${jid.split('@')[0]}: sem texto extraível (formato=${keys})`);
        continue;
      }

      console.log(`📩 ${jid.split('@')[0]}: ${texto}`);

      // Atualiza o estado do atendimento: marca atividade/despedida; se o cliente voltou
      // depois de um ciclo já resumido, reabre um novo ciclo (zera fim/resumoEnviado).
      const meta = atendimentos[jid] ||
        { ultimaAtividade: 0, despedida: false, fimAtendimento: null, resumoEnviado: false, toqueEnviado: false };
      meta.ultimaAtividade = Date.now();
      meta.despedida = detectarDespedida(texto);
      if (msg.pushName) meta.nome = msg.pushName; // nome do WhatsApp, p/ o relatório de triagem
      if (meta.resumoEnviado) { meta.resumoEnviado = false; meta.fimAtendimento = null; }
      meta.toqueEnviado = false; // cliente ativo agora -> um próximo sumiço merece um novo toque
      atendimentos[jid] = meta;
      gravarAtendimentos(atendimentos);

      // Equipe falou nesta conversa há <1h30: ela ASSUMIU o atendimento — a Julia fica muda pra
      // TUDO (não só aceites, como era antes) até a janela vencer, senão bot e equipe respondem
      // juntos em cima do mesmo cliente. Meta já foi atualizada acima (resumo/expiração seguem
      // o fluxo normal); o diálogo vai pro material de estudo, como na pausa por etiqueta.
      if (equipeFalouRecente(meta, Date.now(), CONFIG_PADRAO)) {
        registrarAprendizado(jid, 'cliente', texto);
        if (aguardandoRespostaCampanha(contexto, jid, Date.now())) contexto = marcarCampanhaRespondida(contexto, jid, Date.now());
        anotarContexto(jid, 'cliente', texto);
        console.log(`🤝 ${jid.split('@')[0]}: equipe assumiu (falou há <1h30) — Julia não responde`);
        continue;
      }

      const citado = textoCitado(msg);
      if (citado && !(contexto[jid] && contexto[jid].campanhaEm) && ehCampanhaPortaRetrato(citado)) {
        anotarContexto(jid, 'equipe', citado);
        contexto = marcarCampanha(contexto, jid, Date.now());
        gravarContexto(contexto);
        console.log(`📣 ${jid.split('@')[0]}: respondeu citando a Semana do Porta-Retrato`);
      }

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
if (MODO_TRIAGEM) console.log('🧪 Modo TRIAGEM ligado — só coleta + relatório pro dono (sem foto/orçamento).');
iniciar();
