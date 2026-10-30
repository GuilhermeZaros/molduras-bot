import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CONFIG_CONTEXTO, anotarMensagem, recentesDe, limparRecentes, montarBlocoContexto,
  marcarAvaliacaoEnviada, marcarConvite, aguardandoRespostaAvaliacao, limparVencidos,
  descreverMensagem, lerContexto, gravarContexto,
  marcarCampanha, marcarCampanhaRespondida, aguardandoRespostaCampanha
} from '../lib/contexto.js';

const H = 60 * 60 * 1000;
const D = 24 * H;
const T0 = new Date('2026-09-18T14:15:00-03:00').getTime();
const J = '265377657434365@lid';

// ---- anotar / ler ----

test('anotarMensagem: guarda quem falou, o texto e a hora, em ordem', () => {
  let e = anotarMensagem({}, J, 'equipe', 'Seu quadro ficou pronto!', T0);
  e = anotarMensagem(e, J, 'julia', 'Gostou do seu quadro?', T0 + 4 * D);
  const r = recentesDe(e, J, T0 + 4 * D);
  assert.deepEqual(r.map((x) => x.quem), ['equipe', 'julia']);
  assert.equal(r[0].texto, 'Seu quadro ficou pronto!');
  assert.equal(r[1].ts, T0 + 4 * D);
});

test('anotarMensagem: é pura e ignora texto vazio', () => {
  const antes = anotarMensagem({}, J, 'equipe', 'oi', T0);
  const depois = anotarMensagem(antes, J, 'equipe', '   ', T0 + 1);
  assert.equal(recentesDe(antes, J, T0).length, 1);
  assert.equal(recentesDe(depois, J, T0).length, 1);
  assert.deepEqual(anotarMensagem({}, J, 'equipe', null, T0), {});
});

test('anotarMensagem: guarda só as últimas N e corta texto gigante', () => {
  let e = {};
  for (let i = 0; i < CONFIG_CONTEXTO.MAX_RECENTES + 3; i++) e = anotarMensagem(e, J, 'equipe', 'msg ' + i, T0 + i);
  const r = recentesDe(e, J, T0 + 100);
  assert.equal(r.length, CONFIG_CONTEXTO.MAX_RECENTES);
  assert.equal(r.at(-1).texto, 'msg ' + (CONFIG_CONTEXTO.MAX_RECENTES + 2));
  const longo = anotarMensagem({}, J, 'equipe', 'x'.repeat(5000), T0);
  assert.equal(recentesDe(longo, J, T0)[0].texto.length, CONFIG_CONTEXTO.MAX_CHARS);
});

test('recentesDe: mensagem mais velha que a validade some', () => {
  let e = anotarMensagem({}, J, 'equipe', 'velha', T0);
  e = anotarMensagem(e, J, 'equipe', 'nova', T0 + 13 * D);
  const r = recentesDe(e, J, T0 + CONFIG_CONTEXTO.VALIDADE_MS + 1);
  assert.deepEqual(r.map((x) => x.texto), ['nova']);
  assert.deepEqual(recentesDe({}, J, T0), []);
});

test('limparRecentes: esvazia as mensagens mas mantém o estado da avaliação', () => {
  let e = anotarMensagem({}, J, 'julia', 'Gostou do seu quadro?', T0);
  e = marcarAvaliacaoEnviada(e, J, T0);
  e = limparRecentes(e, J);
  assert.deepEqual(recentesDe(e, J, T0), []);
  assert.equal(aguardandoRespostaAvaliacao(e, J, T0 + H), true);
  assert.deepEqual(limparRecentes({}, J), {});
});

// ---- bloco que vai pro modelo ----

test('montarBlocoContexto: lista quem falou com dia e hora da loja, e fecha o bloco', () => {
  let e = anotarMensagem({}, J, 'equipe', 'Oi!\nSeu quadro ficou pronto! ✨', T0);
  e = anotarMensagem(e, J, 'julia', 'Gostou do seu quadro?', new Date('2026-09-22T17:20:00-03:00').getTime());
  e = anotarMensagem(e, J, 'cliente', 'posso ir agora?', new Date('2026-09-22T17:25:00-03:00').getTime());
  const b = montarBlocoContexto(recentesDe(e, J, T0 + 5 * D));
  const linhas = b.split('\n');
  assert.match(linhas[0], /^\[CONTEXTO DO SISTEMA/);
  assert.equal(linhas[1], '[sexta, 18/09/2026, 14:15] equipe da loja: Oi! / Seu quadro ficou pronto! ✨');
  assert.equal(linhas[2], '[terça, 22/09/2026, 17:20] você (mensagem automática): Gostou do seu quadro?');
  assert.equal(linhas[3], '[terça, 22/09/2026, 17:25] cliente: posso ir agora?');
  assert.match(linhas.at(-1), /^\[FIM DO CONTEXTO/);
});

test('montarBlocoContexto: sem mensagens, bloco vazio', () => {
  assert.equal(montarBlocoContexto([]), '');
  assert.equal(montarBlocoContexto(null), '');
});

// ---- estado da avaliação ----

test('aguardandoRespostaAvaliacao: liga quando a avaliação sai e desliga com o convite', () => {
  let e = marcarAvaliacaoEnviada({}, J, T0);
  assert.equal(aguardandoRespostaAvaliacao(e, J, T0 + H), true);
  e = marcarConvite(e, J, T0 + 2 * H);
  assert.equal(aguardandoRespostaAvaliacao(e, J, T0 + 3 * H), false);
});

test('aguardandoRespostaAvaliacao: nova avaliação depois de um convite antigo liga de novo', () => {
  let e = marcarConvite({}, J, T0);
  e = marcarAvaliacaoEnviada(e, J, T0 + 30 * D);
  assert.equal(aguardandoRespostaAvaliacao(e, J, T0 + 30 * D + H), true);
});

test('aguardandoRespostaAvaliacao: vence depois da validade e é falso sem avaliação', () => {
  const e = marcarAvaliacaoEnviada({}, J, T0);
  assert.equal(aguardandoRespostaAvaliacao(e, J, T0 + CONFIG_CONTEXTO.VALIDADE_MS + 1), false);
  assert.equal(aguardandoRespostaAvaliacao({}, J, T0), false);
  assert.equal(aguardandoRespostaAvaliacao(anotarMensagem({}, J, 'equipe', 'oi', T0), J, T0), false);
});

// ---- faxina ----

test('limparVencidos: apaga contato sem nada válido e preserva quem ainda tem contexto', () => {
  let e = anotarMensagem({}, 'velho@lid', 'equipe', 'oi', T0);
  e = anotarMensagem(e, 'novo@lid', 'equipe', 'oi', T0 + 10 * D);
  e = marcarAvaliacaoEnviada(e, 'aval@lid', T0 + 10 * D);
  const limpo = limparVencidos(e, T0 + 15 * D);
  assert.deepEqual(Object.keys(limpo).sort(), ['aval@lid', 'novo@lid']);
});

// ---- descrever mensagem da equipe/cliente ----

test('descreverMensagem: texto, foto com e sem legenda, áudio, resto vazio', () => {
  assert.equal(descreverMensagem({ tipo: 'texto', texto: 'oi' }), 'oi');
  assert.equal(descreverMensagem({ tipo: 'imagem', legenda: 'ficou assim' }), '(enviou uma foto) ficou assim');
  assert.equal(descreverMensagem({ tipo: 'imagem', legenda: '' }), '(enviou uma foto)');
  assert.equal(descreverMensagem({ tipo: 'audio' }), '(enviou um áudio)');
  assert.equal(descreverMensagem({ tipo: 'documento', nome: 'foto.jpg', mime: 'image/jpeg', legenda: '' }), '(enviou um arquivo)');
  assert.equal(descreverMensagem({ tipo: 'documento', nome: 'foto.jpg', mime: 'image/jpeg', legenda: 'imprime essa' }), '(enviou um arquivo) imprime essa');
  assert.equal(descreverMensagem({ tipo: 'outro' }), '');
  assert.equal(descreverMensagem(null), '');
});

// ---- persistência ----

test('ler/gravarContexto: ida e volta; arquivo ausente vira {}', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ctx-'));
  const arq = path.join(dir, 'contexto.json');
  try {
    assert.deepEqual(lerContexto(arq), {});
    const e = marcarAvaliacaoEnviada(anotarMensagem({}, J, 'julia', 'oi', T0), J, T0);
    gravarContexto(e, arq);
    assert.deepEqual(lerContexto(arq), e);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('aguardandoRespostaCampanha: liga quando a campanha sai e desliga na primeira resposta', () => {
  let e = marcarCampanha({}, J, T0);
  assert.equal(aguardandoRespostaCampanha(e, J, T0 + H), true);
  e = marcarCampanhaRespondida(e, J, T0 + 2 * H);
  assert.equal(aguardandoRespostaCampanha(e, J, T0 + 3 * H), false);
  e = marcarCampanha(e, J, T0 + 2 * D);
  assert.equal(aguardandoRespostaCampanha(e, J, T0 + 2 * D + H), true);
});

test('aguardandoRespostaCampanha: vence depois de 7 dias e é falso sem campanha', () => {
  const e = marcarCampanha({}, J, T0);
  assert.equal(aguardandoRespostaCampanha(e, J, T0 + CONFIG_CONTEXTO.CAMPANHA_MS - 1), true);
  assert.equal(aguardandoRespostaCampanha(e, J, T0 + CONFIG_CONTEXTO.CAMPANHA_MS), false);
  assert.equal(aguardandoRespostaCampanha({}, J, T0), false);
  assert.equal(aguardandoRespostaCampanha(anotarMensagem({}, J, 'equipe', 'oi', T0), J, T0), false);
});

test('limparVencidos: mantém quem ainda está com a campanha valendo', () => {
  let e = marcarCampanha({}, 'campanha@lid', T0 + 10 * D);
  e = marcarCampanha(e, 'vencida@lid', T0);
  const limpo = limparVencidos(e, T0 + 15 * D);
  assert.deepEqual(Object.keys(limpo), ['campanha@lid']);
});

test('limparRecentes: com "até", mantém o que chegou depois (ex.: equipe falou enquanto a Julia pensava)', () => {
  let e = anotarMensagem({}, J, 'equipe', 'antes', T0);
  e = anotarMensagem(e, J, 'equipe', 'durante', T0 + 5000);
  e = limparRecentes(e, J, T0 + 1000);
  assert.deepEqual(recentesDe(e, J, T0 + 6000).map((x) => x.texto), ['durante']);
});
