// =====================================================================
// CIMED · Ritmo · BPs de Pouso Alegre
// Site estático (GitHub Pages) + banco e login no Supabase.
// Toda a proteção dos dados está na RLS do banco, não aqui.
// =====================================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CONFIG } from './config.js?v=9';

/* ------------------------------------------------------------ constantes */
const NIVEIS = ['Operacional', 'Tático', 'Estratégico'];
const STATUS = ['Concluída', 'Em andamento', 'Pendente'];
const COR_NIVEL = { 'Operacional': 'var(--s1)', 'Tático': 'var(--s2)', 'Estratégico': 'var(--s3)' };
const CLS_NIVEL = { 'Operacional': 't-op', 'Tático': 't-ta', 'Estratégico': 't-es' };
const CHAVE_TEMA = 'cimed_bp_tema';

/* ------------------------------------------------------------- estado */
let sb = null;
let perfil = null;          // perfil de quem está logado
let catalogo = [];          // 152 atividades vindas do banco
let processos = [];         // lista de processos distintos
let registros = [];         // registros visíveis (próprios, ou todos se admin)
let perfis = [];            // só preenche para o admin
let aba = 'registrar';
let modoCadastro = false;
let abrindo = false;        // trava contra abrir o app duas vezes ao mesmo tempo

const el = id => document.getElementById(id);
const esc = t => String(t == null ? '' : t)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* =====================================================================
   1. Arranque
   ===================================================================== */
(function tema() {
  try { const t = localStorage.getItem(CHAVE_TEMA); if (t) document.documentElement.setAttribute('data-tema', t); } catch (e) { }
})();

if (SUPABASE_URL.startsWith('COLE_AQUI') || SUPABASE_ANON_KEY.startsWith('COLE_AQUI')) {
  mostrarMsg('login-msg', 'erro',
    'O arquivo config.js ainda está com os valores de exemplo. Preencha a Project URL e a chave publishable do Supabase.');
  el('form-login').hidden = true;
} else {
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  iniciar();
}

async function iniciar() {
  el('form-login').addEventListener('submit', enviarLogin);
  el('btn-alternar').onclick = alternarModo;
  el('btn-sair').onclick = () => sb.auth.signOut();
  el('btn-tema').onclick = alternarTema;

  const { data: { session } } = await sb.auth.getSession();
  if (session) await abrirApp();

  sb.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') fecharApp();
    if (evento === 'SIGNED_IN' && !perfil && !abrindo) abrirApp();
  });
}

/* =====================================================================
   2. Login e cadastro
   ===================================================================== */
function alternarModo() {
  modoCadastro = !modoCadastro;
  el('campo-nome').hidden = !modoCadastro;
  el('login-nome').required = modoCadastro;
  el('login-titulo').textContent = modoCadastro ? 'Criar meu acesso' : 'Ritmo';
  el('login-sub').textContent = modoCadastro
    ? 'Use seu e-mail corporativo. Só ' + CONFIG.dominio + ' é aceito.'
    : 'Ritmo, Rotina e Ritual · BPs de Pouso Alegre';
  el('btn-entrar').textContent = modoCadastro ? 'Criar acesso' : 'Entrar';
  el('login-senha').autocomplete = modoCadastro ? 'new-password' : 'current-password';
  el('alternar-texto').textContent = modoCadastro ? 'Já tem acesso?' : 'Primeira vez aqui?';
  el('btn-alternar').textContent = modoCadastro ? 'Entrar' : 'Criar meu acesso';
  el('login-msg').innerHTML = '';
}

async function enviarLogin(ev) {
  ev.preventDefault();
  const email = el('login-email').value.trim().toLowerCase();
  const senha = el('login-senha').value;
  const nome = el('login-nome').value.trim();
  const botao = el('btn-entrar');

  if (modoCadastro) {
    if (nome.length < 3) return mostrarMsg('login-msg', 'erro', 'Escreva seu nome completo.');
    if (!email.endsWith(CONFIG.dominio)) return mostrarMsg('login-msg', 'erro', 'Use seu e-mail ' + CONFIG.dominio + '.');
    if (senha.length < 6) return mostrarMsg('login-msg', 'erro', 'A senha precisa ter pelo menos 6 caracteres.');
  }

  botao.disabled = true;
  botao.textContent = modoCadastro ? 'Criando…' : 'Entrando…';
  try {
    if (modoCadastro) {
      const { data, error } = await sb.auth.signUp({
        email, password: senha,
        options: { data: { nome, cargo: 'Business Partner', unidade: CONFIG.unidade } }
      });
      if (error) throw error;
      if (data.session) { await abrirApp(); return; }
      mostrarMsg('login-msg', 'ok', 'Acesso criado. Confirme o e-mail que o Supabase enviou e depois entre por aqui.');
      alternarModo();
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
      await abrirApp();
    }
  } catch (e) {
    mostrarMsg('login-msg', 'erro', traduzErro(e));
  } finally {
    botao.disabled = false;
    botao.textContent = modoCadastro ? 'Criar acesso' : 'Entrar';
  }
}

function traduzErro(e) {
  const m = (e && e.message ? e.message : String(e)).toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Seu e-mail ainda não foi confirmado. Procure a mensagem do Supabase na caixa de entrada.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem acesso. Clique em "Entrar".';
  if (m.includes('grupocimed') || m.includes('database error saving')) return 'Só e-mails ' + CONFIG.dominio + ' podem criar acesso neste sistema.';
  if (m.includes('rate limit')) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  if (m.includes('failed to fetch')) return 'Não consegui falar com o banco. Confira a internet e os valores do config.js.';
  return e && e.message ? e.message : 'Não consegui completar a ação.';
}

function mostrarMsg(onde, tipo, texto) {
  el(onde).innerHTML = `<div class="msg ${tipo}">${esc(texto)}</div>`;
}

/* =====================================================================
   3. Abrir e fechar o app
   ===================================================================== */
async function abrirApp() {
  if (abrindo) return;
  abrindo = true;
  el('tela-login').hidden = true;
  el('app').hidden = false;
  try {
    await carregarPerfil();
    if (!perfil) return;
    if (!perfil.ativo) {
      el('conteudo').innerHTML = '<div class="card"><h3>Acesso pausado</h3><p class="sub">Seu acesso está desativado. Fale com quem administra o sistema para reativar.</p></div>';
      el('abas').innerHTML = '';
      return;
    }
    el('avatar').textContent = iniciais(perfil.nome);
    const curto = papelDe(perfil.papel).curto;
    el('nome-usuario').textContent = perfil.nome.split(' ')[0] + (curto ? ' · ' + curto : '');
    el('topo-sub').textContent = 'Ritmo, Rotina e Ritual · BPs ' + perfil.unidade;
    await Promise.all([carregarCatalogo(), carregarRegistros(), carregarPerfis()]);
    montarAbas();
    ir('registrar');
  } catch (e) {
    el('conteudo').innerHTML = `<div class="card"><h3>Não consegui carregar os dados</h3>
      <p class="sub">${esc(traduzErro(e))}</p>
      <p class="mini">Se o erro fala em tabela inexistente, rode os arquivos de <b>supabase/</b> no SQL Editor.</p></div>`;
  } finally {
    abrindo = false;
  }
}
function fecharApp() {
  perfil = null; registros = []; perfis = []; catalogo = []; historico = []; convites = [];
  el('app').hidden = true;
  el('tela-login').hidden = false;
  el('login-senha').value = '';
  el('login-msg').innerHTML = '';
}

async function carregarPerfil() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data, error } = await sb.from('bp_perfis').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Seu perfil não foi criado no banco. Rode o arquivo 01-schema.sql e crie o acesso de novo.');
  perfil = data;
}
async function carregarCatalogo() {
  const { data, error } = await sb.from('bp_catalogo').select('*').eq('ativo', true).order('id');
  if (error) throw error;
  catalogo = data || [];
  processos = [...new Set(catalogo.map(a => a.processo))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
async function carregarRegistros() {
  const { data, error } = await sb.from('bp_registros').select('*')
    .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(5000);
  if (error) throw error;
  registros = data || [];
}
async function carregarPerfis() {
  // Todas enxergam a lista da equipe (necessário para marcar com @).
  // Antes do arquivo 04, a RLS devolve só o próprio perfil, e o app segue funcionando.
  const { data, error } = await sb.from('bp_perfis').select('*').order('nome');
  if (error || !data || !data.length) { perfis = [perfil]; return; }
  perfis = data;
}

/* =====================================================================
   4. Navegação
   ===================================================================== */
function montarAbas() {
  const lista = [
    ['registrar', 'Registrar'],
    ['quadro', 'Quadro'],
    ['meus', 'Meus registros'],
    ['painel', 'Painel'],
    ['catalogo', 'Catálogo de atividades'],
    ['historico', 'Histórico']
  ];
  if (ehAdmin()) lista.push(['gestao', 'Gestão']);
  el('abas').innerHTML = lista.map(([k, r]) =>
    `<button class="aba" role="tab" data-aba="${k}" aria-selected="${k === aba}">${r}</button>`).join('');
  el('abas').querySelectorAll('.aba').forEach(b => b.onclick = () => ir(b.dataset.aba));
}
function ir(nova) {
  aba = nova;
  el('abas').querySelectorAll('.aba').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === aba));
  const c = el('conteudo');
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (aba === 'registrar') telaRegistrar(c);
  else if (aba === 'quadro') telaQuadro(c);
  else if (aba === 'meus') telaMeus(c);
  else if (aba === 'painel') telaPainel(c);
  else if (aba === 'catalogo') telaCatalogo(c);
  else if (aba === 'historico') telaHistorico(c);
  else telaGestao(c);
}

/* =====================================================================
   5. Tela: registrar
   ===================================================================== */
function telaRegistrar(c) {
  c.innerHTML = `
  <div class="card">
    <h3>Registrar atividade</h3>
    <p class="sub">Lance o que foi feito no dia. Leva menos de um minuto por registro.</p>
    <div id="reg-msg"></div>
    ${blocoDitado()}
    <div class="linha-campos lc3">
      <div><label class="lab" for="f-data">Data</label>
        <input type="date" id="f-data" value="${hojeIso()}" max="${hojeIso()}"></div>
      <div>
        <div class="lab-linha"><label class="lab" for="f-area">Área ou setor atendido</label>
          ${botaoMic('f-area', 'a área')}</div>
        <input type="text" id="f-area" placeholder="Ex.: Produção Sólidos" list="lista-areas">
        <datalist id="lista-areas"></datalist></div>
      <div><label class="lab" for="f-status">Situação</label>
        <select id="f-status">${STATUS.map(s => `<option ${s === 'Concluída' ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>
    <div class="linha-campos lc2" style="margin-top:14px">
      <div><label class="lab" for="f-processo">Processo</label>
        <select id="f-processo"><option value="">Selecione o processo</option>
          ${processos.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
          <option value="__livre__">Outra atividade (fora do catálogo)</option>
        </select></div>
      <div id="box-atividade"><label class="lab" for="f-atividade">Atividade</label>
        <select id="f-atividade" disabled><option>Escolha o processo primeiro</option></select></div>
    </div>
    <div id="box-livre" hidden style="margin-top:14px">
      <div class="linha-campos lc2">
        <div>
          <div class="lab-linha"><label class="lab" for="f-livre-nome">Descreva a atividade</label>
            ${botaoMic('f-livre-nome', 'a atividade')}</div>
          <input type="text" id="f-livre-nome" placeholder="O que você fez"></div>
        <div><label class="lab" for="f-livre-nivel">Nível</label>
          <select id="f-livre-nivel">${NIVEIS.map(n => `<option>${n}</option>`).join('')}</select></div>
      </div>
    </div>
    <div id="detalhe-atividade"></div>
    <div class="linha-campos lc2" style="margin-top:14px">
      <div><label class="lab" for="f-minutos">Tempo dedicado (minutos)</label>
        <input type="number" id="f-minutos" min="5" max="1440" step="5" value="60">
        <div class="rapidos" id="rapidos"></div></div>
      <div>
        <div class="lab-linha"><label class="lab" for="f-obs">Observações (opcional)</label>
          ${botaoMic('f-obs', 'as observações')}</div>
        <textarea id="f-obs" placeholder="Encaminhamentos, combinados, pendências. Digite @ para marcar uma colega"></textarea>
        <div id="obs-mencoes" class="mencoes-caixa" hidden></div>
        <div class="mini" id="obs-dica-mencao" style="margin-top:6px">Digite <b>@</b> para marcar uma colega. Ela passa a ver esse registro.</div>
      </div>
    </div>
    <div class="acoes" style="margin-top:18px">
      <button class="bt" id="btn-salvar">Salvar registro</button>
      <button class="bt sec" id="btn-limpar">Limpar</button>
    </div>
  </div>
  <div class="card">
    <h3>Seus últimos lançamentos</h3>
    <p class="sub">Os 8 registros mais recentes na sua conta.</p>
    <div id="ultimos"></div>
  </div>`;

  atualizarAreas();
  el('rapidos').innerHTML = CONFIG.atalhosTempo.map(m => `<button type="button" data-min="${m}">${horas(m)}</button>`).join('');
  el('rapidos').querySelectorAll('button').forEach(b => b.onclick = () => { el('f-minutos').value = b.dataset.min; });

  el('f-processo').onchange = () => {
    const p = el('f-processo').value;
    const livre = p === '__livre__';
    el('box-livre').hidden = !livre;
    el('box-atividade').hidden = livre;
    el('detalhe-atividade').innerHTML = '';
    if (livre) return;
    const sel = el('f-atividade');
    if (!p) { sel.disabled = true; sel.innerHTML = '<option>Escolha o processo primeiro</option>'; return; }
    const lista = catalogo.filter(a => a.processo === p);
    sel.disabled = false;
    sel.innerHTML = '<option value="">Selecione a atividade</option>' +
      lista.map(a => `<option value="${a.id}">${esc(a.atividade)}</option>`).join('');
    sel.onchange = mostrarDetalhe;
  };
  el('btn-salvar').onclick = salvarRegistro;
  el('btn-limpar').onclick = () => ir('registrar');
  ligarVoz();
  ligarMencoes('f-obs', 'obs-mencoes');
  renderUltimos();
}

/* =====================================================================
   5c. Marcar colegas com @
   O texto é a fonte da verdade: na hora de salvar, a lista de marcadas
   é lida do próprio texto. Se a pessoa apagar o "@Fulana", a marcação
   some junto, sem sobrar estado escondido.
   ===================================================================== */
function equipeParaMarcar() {
  return perfis.filter(p => p.id !== perfil.id && p.ativo);
}

function ligarMencoes(campoId, caixaId) {
  const campo = el(campoId), caixa = el(caixaId);
  if (!campo || !caixa) return;
  const dica = el('obs-dica-mencao');
  if (dica && !equipeParaMarcar().length) dica.hidden = true;

  const fechar = () => { caixa.hidden = true; caixa.innerHTML = ''; };

  campo.addEventListener('input', () => {
    const antes = campo.value.slice(0, campo.selectionStart);
    const gatilho = antes.match(/@([\p{L}]*)$/u);
    if (!gatilho) return fechar();
    const termo = semAcento(gatilho[1]);
    const achados = equipeParaMarcar()
      .filter(p => !termo || semAcento(p.nome).includes(termo)).slice(0, 6);
    if (!achados.length) return fechar();
    caixa.hidden = false;
    caixa.innerHTML = achados.map(p =>
      `<button type="button" data-marcar="${p.id}">
        <span class="av">${iniciais(p.nome)}</span>
        <span><b>${esc(p.nome)}</b><span class="mini">${esc(p.cargo)}</span></span>
      </button>`).join('');
    caixa.querySelectorAll('[data-marcar]').forEach(b => b.onclick = () => {
      const p = perfis.find(x => x.id === b.dataset.marcar);
      const pos = campo.selectionStart;
      const inicio = campo.value.slice(0, pos).replace(/@[\p{L}]*$/u, '');
      const fim = campo.value.slice(pos);
      campo.value = inicio + '@' + p.nome + ' ' + fim.replace(/^\s+/, '');
      fechar();
      campo.focus();
      const novoCursor = (inicio + '@' + p.nome + ' ').length;
      campo.setSelectionRange(novoCursor, novoCursor);
    });
  });
  campo.addEventListener('blur', () => setTimeout(fechar, 200));
  campo.addEventListener('keydown', ev => { if (ev.key === 'Escape') fechar(); });
}

function extrairMencoes(texto) {
  if (!texto) return [];
  const t = semAcento(texto);
  return equipeParaMarcar().filter(p => t.includes('@' + semAcento(p.nome))).map(p => p.id);
}

function realcarMencoes(texto) {
  let h = esc(texto);
  perfis.forEach(p => {
    const alvo = '@' + esc(p.nome);
    if (h.includes(alvo)) h = h.split(alvo).join('<span class="mencao">' + alvo + '</span>');
  });
  return h;
}

const meMarcaram = r => Array.isArray(r.mencionados) && r.mencionados.includes(perfil.id);
const meuRegistro = r => r.usuario_id === perfil.id;

/* Três níveis de acesso. A palavra final é sempre da RLS do banco:
   aqui a gente só decide o que mostrar na tela. */
const ehAdmin = () => perfil.papel === 'admin';                                  // cadastra, convida, troca nível
const veTudo  = () => perfil.papel === 'admin' || perfil.papel === 'completo';   // enxerga e edita a base inteira
const PAPEIS = {
  bp:       { rotulo: 'BP',            curto: '',                 cor: 't-neu' },
  completo: { rotulo: 'Visão completa', curto: 'Visão completa',  cor: 't-es'  },
  admin:    { rotulo: 'Administrador',  curto: 'Admin',           cor: 't-am'  }
};
const papelDe = p => PAPEIS[p] || PAPEIS.bp;
const equipeLancadora = () => perfis.filter(u => u.ativo);

/* =====================================================================
   5b. Ditado por voz (Web Speech API, em português)
   Funciona no Chrome do Android e do computador, e no Safari do iPhone.
   Precisa de HTTPS, que o GitHub Pages já dá. Sem suporte, os botões
   simplesmente não aparecem.
   ===================================================================== */
const MotorVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
const TEM_VOZ = !!MotorVoz;
let vozAtiva = null;
let ultimoDitado = '';

const SVG_MIC = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>`;

function ouvir({ onParcial, onFim, onErro }) {
  const r = new MotorVoz();
  r.lang = 'pt-BR';
  r.continuous = true;
  r.interimResults = true;
  let fechado = '';
  r.onresult = ev => {
    let aberto = '';
    fechado = '';
    for (let i = 0; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) fechado += t; else aberto += t;
    }
    if (onParcial) onParcial((fechado + ' ' + aberto).replace(/\s+/g, ' ').trim());
  };
  r.onerror = ev => { if (onErro) onErro(ev.error); };
  r.onend = () => { vozAtiva = null; if (onFim) onFim(fechado.trim()); };
  r.start();
  vozAtiva = r;
}
function pararVoz() { if (vozAtiva) vozAtiva.stop(); }

function recadoVoz(erro) {
  if (erro === 'not-allowed' || erro === 'service-not-allowed')
    return 'O navegador bloqueou o microfone. Toque no ícone de cadeado na barra de endereço e permita o microfone para este site.';
  if (erro === 'no-speech') return 'Não ouvi nada. Toque de novo e fale mais perto.';
  if (erro === 'network') return 'O ditado precisa de internet e ela falhou agora.';
  return 'O microfone não funcionou desta vez.';
}

function botaoMic(idCampo, oQue) {
  if (!TEM_VOZ) return '';
  return `<button type="button" class="mic" data-mic="${idCampo}"
    aria-label="Ditar ${oQue}" title="Ditar ${oQue}">${SVG_MIC}<span>Ditar</span></button>`;
}

function blocoDitado() {
  if (!TEM_VOZ) return `<div class="aviso"><span>ℹ</span><div>O ditado por voz não funciona
    neste navegador. No celular, use o Chrome (Android) ou o Safari (iPhone).</div></div>`;
  return `<div class="ditado">
    <div class="topo-d">
      <button type="button" class="bt bt-voz" id="btn-ditar">${SVG_MIC}<span>Ditar a demanda</span></button>
      <span class="mini" style="flex:1 1 180px">Fale o que você fez. Eu procuro a atividade
        no catálogo e preencho os campos.</span>
    </div>
    <div id="ditado-texto" hidden></div>
    <div id="ditado-sug"></div>
  </div>`;
}

/* Liga os microfones de campo dentro de um pedaço da tela.
   `idMsg` é onde o recado de erro aparece: no formulário de registro é
   reg-msg, na ficha da atividade é ficha-msg. */
function ligarMics(raiz, idMsg) {
  if (!TEM_VOZ) return;
  (raiz || document).querySelectorAll('[data-mic]').forEach(b => b.onclick = () => {
    if (b.classList.contains('gravando')) { pararVoz(); return; }
    pararVoz();
    const campo = el(b.dataset.mic);
    const base = campo.value.trim() ? campo.value.trim() + ' ' : '';
    b.classList.add('gravando');
    b.querySelector('span').textContent = 'Ouvindo';
    const encerra = () => { b.classList.remove('gravando'); b.querySelector('span').textContent = 'Ditar'; };
    const falhou = e => {
      encerra();
      if (el(idMsg)) mostrarMsg(idMsg, 'erro', recadoVoz(e));
    };
    try {
      ouvir({
        onParcial: t => { campo.value = base + t; },
        onFim: encerra,
        onErro: falhou
      });
    } catch (e) { falhou(); }
  });
}

function ligarVoz() {
  if (!TEM_VOZ) return;
  ligarMics(document, 'reg-msg');

  const bt = el('btn-ditar');
  if (!bt) return;
  bt.onclick = () => {
    if (bt.classList.contains('gravando')) { pararVoz(); return; }
    pararVoz();
    bt.classList.add('gravando');
    bt.querySelector('span').textContent = 'Ouvindo, toque para parar';
    el('ditado-texto').hidden = false;
    el('ditado-texto').textContent = 'Fale agora…';
    const encerra = () => {
      bt.classList.remove('gravando');
      bt.querySelector('span').textContent = 'Ditar a demanda';
    };
    try {
      ouvir({
        onParcial: t => {
          ultimoDitado = t;
          el('ditado-texto').textContent = t;
          mostrarSugestoes(t);
        },
        onFim: t => { encerra(); if (t) { ultimoDitado = t; mostrarSugestoes(t); } },
        onErro: e => { encerra(); el('ditado-texto').textContent = recadoVoz(e); }
      });
    } catch (e) { encerra(); el('ditado-texto').textContent = recadoVoz(); }
  };
}

function semAcento(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const PALAVRAS_VAZIAS = new Set(['para', 'com', 'uma', 'dos', 'das', 'que', 'sobre', 'pelo',
  'pela', 'fiz', 'feito', 'hoje', 'ontem', 'fui', 'foi', 'sobre', 'pelos', 'pelas', 'este',
  'esta', 'isso', 'aqui', 'mais', 'muito', 'depois', 'antes', 'ainda', 'tambem', 'entao']);

function acharNoCatalogo(texto) {
  const p = [...new Set(semAcento(texto).split(/[^a-z0-9]+/)
    .filter(w => w.length > 3 && !PALAVRAS_VAZIAS.has(w)))];
  if (!p.length) return [];
  return catalogo.map(a => {
    const titulo = semAcento(a.atividade + ' ' + a.processo);
    const tudo = titulo + ' ' + semAcento(a.descricao);
    let pontos = 0;
    p.forEach(w => { if (titulo.includes(w)) pontos += 2; else if (tudo.includes(w)) pontos += 1; });
    return { a, pontos };
  }).filter(x => x.pontos > 0).sort((x, y) => y.pontos - x.pontos).slice(0, 6).map(x => x.a);
}

function mostrarSugestoes(texto) {
  const achados = acharNoCatalogo(texto);
  el('ditado-sug').innerHTML = achados.length
    ? `<div class="mini" style="margin-top:10px">Toque na atividade certa:</div>
       ${achados.map(a => `<button type="button" class="chip-sug" data-sug="${a.id}">
         <b>${esc(a.atividade)}</b><span>${esc(a.processo)} · ${esc(a.nivel)}</span></button>`).join('')}`
    : `<div class="mini" style="margin-top:10px">Ainda não achei atividade parecida.
       Continue falando, escolha na lista abaixo, ou use "Outra atividade".</div>`;
  el('ditado-sug').querySelectorAll('[data-sug]').forEach(b =>
    b.onclick = () => usarSugestao(Number(b.dataset.sug)));
}

function usarSugestao(id) {
  const a = catalogo.find(x => x.id === id);
  if (!a) return;
  pararVoz();
  el('f-processo').value = a.processo;
  el('f-processo').onchange();
  el('f-atividade').value = String(a.id);
  mostrarDetalhe();
  const obs = el('f-obs');
  if (!obs.value.trim() && ultimoDitado) obs.value = ultimoDitado;
  el('ditado-sug').innerHTML = `<div class="msg ok" style="margin-top:10px">
    Preenchi com "${esc(a.atividade)}". Confira o tempo e salve.</div>`;
  el('f-minutos').focus();
}

function atualizarAreas() {
  const areas = [...new Set(registros.map(r => r.area).filter(Boolean))].sort();
  const dl = el('lista-areas');
  if (dl) dl.innerHTML = areas.map(a => `<option value="${esc(a)}">`).join('');
}

function mostrarDetalhe() {
  const a = catalogo.find(x => x.id === Number(el('f-atividade').value));
  const box = el('detalhe-atividade');
  if (!a) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="pill-sel">
    <div class="mini">${esc(a.descricao || 'Sem descrição na planilha.')}</div>
    <div class="tags">
      <span class="tag ${CLS_NIVEL[a.nivel]}"><i class="pt" style="background:${COR_NIVEL[a.nivel]}"></i>${esc(a.nivel)}</span>
      <span class="tag ${a.gera_valor === 'Sim' ? 't-es' : 't-neu'}">${a.gera_valor === 'Sim' ? 'Gera valor' : 'Não gera valor'}</span>
      <span class="tag ${a.permanencia === 'Fica' ? 't-am' : 't-sai'}">${a.permanencia === 'Fica' ? 'Permanece na BP' : 'Sai para ' + esc(a.destino)}</span>
    </div></div>`;
}

async function salvarRegistro() {
  const livre = el('f-processo').value === '__livre__';
  const minutos = Number(el('f-minutos').value);
  const data = el('f-data').value;
  if (!data) return mostrarMsg('reg-msg', 'erro', 'Informe a data.');
  if (!minutos || minutos < 5) return mostrarMsg('reg-msg', 'erro', 'Informe o tempo dedicado, no mínimo 5 minutos.');

  const obs = el('f-obs').value.trim();
  const reg = {
    usuario_id: perfil.id, data, minutos,
    area: el('f-area').value.trim() || null,
    status: el('f-status').value,
    obs: obs || null,
    mencionados: extrairMencoes(obs)
  };
  if (livre) {
    const nome = el('f-livre-nome').value.trim();
    if (!nome) return mostrarMsg('reg-msg', 'erro', 'Descreva a atividade.');
    Object.assign(reg, {
      atividade_id: null, processo: 'Fora do catálogo', atividade: nome,
      nivel: el('f-livre-nivel').value, gera_valor: 'Não informado'
    });
  } else {
    const a = catalogo.find(x => x.id === Number(el('f-atividade').value));
    if (!a) return mostrarMsg('reg-msg', 'erro', 'Escolha o processo e a atividade.');
    Object.assign(reg, {
      atividade_id: a.id, processo: a.processo, atividade: a.atividade,
      nivel: a.nivel, gera_valor: a.gera_valor
    });
  }

  const botao = el('btn-salvar');
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    let { data: criado, error } = await sb.from('bp_registros').insert(reg).select().single();
    let semColuna = false;
    if (error && /mencionados/i.test(error.message || '')) {
      // Banco ainda sem o arquivo 04: salva o registro do mesmo jeito.
      semColuna = true;
      const semMarcacoes = Object.assign({}, reg); delete semMarcacoes.mencionados;
      ({ data: criado, error } = await sb.from('bp_registros').insert(semMarcacoes).select().single());
    }
    if (error) throw error;
    registros.unshift(criado);
    mostrarMsg('reg-msg', semColuna ? 'erro' : 'ok', semColuna
      ? 'Registro salvo, mas as marcações com @ ainda não funcionam. Falta rodar o arquivo 04-mencoes.sql no Supabase.'
      : 'Registro salvo.');
    el('f-obs').value = ''; el('f-atividade').value = ''; el('detalhe-atividade').innerHTML = '';
    if (el('f-livre-nome')) el('f-livre-nome').value = '';
    renderUltimos(); atualizarAreas();
  } catch (e) {
    mostrarMsg('reg-msg', 'erro', traduzErro(e));
  } finally {
    botao.disabled = false; botao.textContent = 'Salvar registro';
  }
}

function renderUltimos() {
  const meus = registros.filter(r => r.usuario_id === perfil.id).slice(0, 8);
  el('ultimos').innerHTML = meus.length ? tabelaRegistros(meus, false)
    : '<div class="vazio">Nenhum registro ainda. Preencha o formulário acima para começar.</div>';
}

/* =====================================================================
   6. Tabela de registros
   ===================================================================== */
function nomeDe(id) {
  if (!id) return 'sistema';
  if (perfil && id === perfil.id) return perfil.nome;
  const p = perfis.find(x => x.id === id);
  return p ? p.nome : 'Outra BP';
}
function tabelaRegistros(lista, comAcoes) {
  const mostraBp = veTudo() || lista.some(r => !meuRegistro(r));
  return `<div class="tabela-wrap"><table>
  <thead><tr>
    <th style="width:88px">Data</th>${mostraBp ? '<th style="width:130px">BP</th>' : ''}
    <th>Atividade</th><th style="width:118px">Nível</th>
    <th style="width:120px">Área</th><th style="width:78px">Tempo</th>
    <th style="width:120px">Situação</th>${comAcoes ? '<th style="width:78px"></th>' : ''}
  </tr></thead><tbody>
  ${lista.map(r => `<tr>
    <td class="num" data-r="Data">${dataBr(r.data)}</td>
    ${mostraBp ? `<td class="mini" data-r="BP">${esc(nomeDe(r.usuario_id))}</td>` : ''}
    <td data-r="Atividade"><div><div class="b-proc">${esc(r.atividade)}
      ${meMarcaram(r) && !meuRegistro(r) ? '<span class="tag t-am">marcou você</span>' : ''}</div>
      <div class="mini">${esc(r.processo)}</div>
      ${r.obs ? `<div class="mini" style="margin-top:3px;font-style:italic">${realcarMencoes(r.obs)}</div>` : ''}</div></td>
    <td data-r="Nível"><span class="tag ${CLS_NIVEL[r.nivel] || 't-neu'}"><i class="pt" style="background:${COR_NIVEL[r.nivel] || 'var(--parado)'}"></i>${esc(r.nivel)}</span></td>
    <td class="mini" data-r="Área">${esc(r.area || '')}</td>
    <td class="num" data-r="Tempo">${horas(r.minutos)}</td>
    <td data-r="Situação"><span class="tag ${r.status === 'Concluída' ? 't-es' : (r.status === 'Em andamento' ? 't-am' : 't-neu')}">${esc(r.status)}</span></td>
    ${comAcoes ? `<td>${meuRegistro(r) || veTudo()
      ? `<button class="bt sec peq" data-apagar="${r.id}">Apagar</button>`
      : '<span class="mini">só leitura</span>'}</td>` : ''}
  </tr>`).join('')}
  </tbody></table></div>`;
}
function ligarApagar() {
  document.querySelectorAll('[data-apagar]').forEach(b => b.onclick = () => {
    confirmar('Apagar este registro?', 'Essa ação não pode ser desfeita.', async () => {
      const { error } = await sb.from('bp_registros').delete().eq('id', b.dataset.apagar);
      if (error) return aviso(traduzErro(error));
      registros = registros.filter(r => r.id !== b.dataset.apagar);
      ir(aba);
    });
  });
}

/* =====================================================================
   6b. Tela: quadro (kanban)
   ===================================================================== */
const COR_STATUS = { 'Pendente': 'var(--parado)', 'Em andamento': 'var(--s4)', 'Concluída': 'var(--s3)' };

function telaQuadro(c) {
  const seletorBp = veTudo()
    ? `<div><label class="lab" for="q-bp">Business Partner</label>
        <select id="q-bp"><option value="">Todas as BPs</option>
        ${equipeLancadora().map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}
        </select></div>` : '';
  c.innerHTML = `
  <div class="card">
    <h3>Quadro de atividades</h3>
    <p class="sub">Arraste o cartão de uma coluna para outra para mudar a situação.
      No celular, use os botões dentro do cartão.</p>
    <div id="q-msg"></div>
    <div class="filtros" style="margin-bottom:0">
      <div><label class="lab" for="q-periodo">Período</label>
        <select id="q-periodo"><option value="mes">Mês atual</option><option value="30">Últimos 30 dias</option>
        <option value="90" selected>Últimos 90 dias</option><option value="tudo">Tudo</option></select></div>
      ${seletorBp}
      <div><label class="lab" for="q-processo">Processo</label>
        <select id="q-processo"><option value="">Todos</option>${processos.map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
      <div><label class="lab" for="q-escopo">Mostrar</label>
        <select id="q-escopo">
          <option value="tudo">Tudo que eu vejo</option>
          <option value="meus">Só os meus</option>
          <option value="marcada">Onde me marcaram</option>
        </select></div>
    </div>
  </div>
  <div class="quadro" id="quadro" style="margin-top:16px"></div>`;
  ['q-periodo', 'q-processo', 'q-bp', 'q-escopo'].forEach(id => { const e = el(id); if (e) e.onchange = renderQuadro; });
  renderQuadro();
}

function porEscopo(lista, escopo) {
  if (escopo === 'meus') return lista.filter(meuRegistro);
  if (escopo === 'marcada') return lista.filter(r => meMarcaram(r) && !meuRegistro(r));
  return lista;
}

function dadosQuadro() {
  const per = el('q-periodo').value, proc = el('q-processo').value;
  const bp = el('q-bp') ? el('q-bp').value : '';
  return porEscopo(registros, el('q-escopo').value)
    .filter(r => !bp || r.usuario_id === bp)
    .filter(r => noPeriodo(r.data, per))
    .filter(r => !proc || r.processo === proc);
}

function renderQuadro() {
  const l = dadosQuadro();
  el('quadro').innerHTML = STATUS.slice().reverse().map(st => {
    const cards = l.filter(r => r.status === st);
    return `<section class="coluna" data-coluna="${esc(st)}" aria-label="${esc(st)}">
      <div class="coluna-topo">
        <span class="pt" style="background:${COR_STATUS[st]}"></span>
        <b>${esc(st)}</b>
        <span class="cont num">${cards.length}</span>
      </div>
      <div class="coluna-corpo">
        ${cards.length ? cards.map(cartao).join('')
        : '<div class="coluna-vazia">Nada por aqui</div>'}
      </div>
    </section>`;
  }).join('');
  ligarQuadro();
}

function cartao(r) {
  const outros = STATUS.filter(s => s !== r.status);
  const posso = meuRegistro(r) || veTudo();
  const deOutra = !meuRegistro(r);
  return `<article class="cartao${posso ? '' : ' so-leitura'}" ${posso ? 'draggable="true"' : ''} data-reg="${r.id}">
    <div class="ct-tit">${esc(r.atividade)}</div>
    <div class="ct-proc">${esc(r.processo)}</div>
    <div class="ct-meta">
      <span class="tag ${CLS_NIVEL[r.nivel] || 't-neu'}"><i class="pt" style="background:${COR_NIVEL[r.nivel] || 'var(--parado)'}"></i>${esc(r.nivel)}</span>
      <span class="mini num">${dataBr(r.data)}</span>
      <span class="mini num">${horas(r.minutos)}</span>
      ${r.area ? `<span class="mini">${esc(r.area)}</span>` : ''}
      ${deOutra ? `<span class="mini">${esc(nomeDe(r.usuario_id))}</span>` : ''}
      ${meMarcaram(r) && deOutra ? '<span class="tag t-am">marcou você</span>' : ''}
    </div>
    ${r.obs ? `<div class="ct-obs">${realcarMencoes(r.obs)}</div>` : ''}
    ${posso ? `<div class="ct-mover">
      ${outros.map(s => `<button type="button" data-mover="${r.id}" data-para="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>` : '<div class="mini" style="margin-top:9px">Registro da colega, só leitura</div>'}
  </article>`;
}

function ligarQuadro() {
  document.querySelectorAll('.cartao[draggable="true"]').forEach(ct => {
    ct.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', ct.dataset.reg);
      ev.dataTransfer.effectAllowed = 'move';
      ct.classList.add('arrastando');
    });
    ct.addEventListener('dragend', () => ct.classList.remove('arrastando'));
  });
  document.querySelectorAll('.coluna').forEach(col => {
    col.addEventListener('dragover', ev => { ev.preventDefault(); col.classList.add('alvo'); });
    col.addEventListener('dragleave', () => col.classList.remove('alvo'));
    col.addEventListener('drop', ev => {
      ev.preventDefault();
      col.classList.remove('alvo');
      moverRegistro(ev.dataTransfer.getData('text/plain'), col.dataset.coluna);
    });
  });
  document.querySelectorAll('[data-mover]').forEach(b =>
    b.onclick = () => moverRegistro(b.dataset.mover, b.dataset.para));
}

async function moverRegistro(id, novoStatus) {
  const r = registros.find(x => x.id === id);
  if (!r || r.status === novoStatus) return;
  const anterior = r.status;
  r.status = novoStatus;           // move na tela na hora
  renderQuadro();
  const { error } = await sb.from('bp_registros').update({ status: novoStatus }).eq('id', id);
  if (error) {
    r.status = anterior;           // desfaz se o banco recusar
    renderQuadro();
    mostrarMsg('q-msg', 'erro', traduzErro(error));
  }
}

/* =====================================================================
   7. Tela: meus registros
   ===================================================================== */
function telaMeus(c) {
  c.innerHTML = `
  <div class="card">
    <h3>${veTudo() ? 'Registros da equipe' : 'Meus registros'}</h3>
    <p class="sub">${veTudo()
      ? 'Tudo que as BPs lançaram, com filtros e exportação.'
      : 'Tudo que você lançou, com filtros e exportação.'}</p>
    <div class="filtros">
      <div><label class="lab" for="m-periodo">Período</label>
        <select id="m-periodo"><option value="mes">Mês atual</option><option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option><option value="tudo">Tudo</option></select></div>
      <div><label class="lab" for="m-processo">Processo</label>
        <select id="m-processo"><option value="">Todos</option>${processos.map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
      <div><label class="lab" for="m-nivel">Nível</label>
        <select id="m-nivel"><option value="">Todos</option>${NIVEIS.map(n => `<option>${n}</option>`).join('')}</select></div>
      <div><label class="lab" for="m-status">Situação</label>
        <select id="m-status"><option value="">Todas</option>${STATUS.map(s => `<option>${s}</option>`).join('')}</select></div>
      <div><label class="lab" for="m-escopo">Mostrar</label>
        <select id="m-escopo">
          <option value="tudo">Tudo que eu vejo</option>
          <option value="meus">Só os meus</option>
          <option value="marcada">Onde me marcaram</option>
        </select></div>
      <div style="flex:0 0 auto"><button class="bt sec" id="btn-csv-meus">Exportar CSV</button></div>
    </div>
    <div id="resumo-meus" class="kpis" style="margin-bottom:16px"></div>
    <div id="lista-meus"></div>
  </div>`;
  ['m-periodo', 'm-processo', 'm-nivel', 'm-status', 'm-escopo'].forEach(id => el(id).onchange = renderMeus);
  el('btn-csv-meus').onclick = () => exportarCsv(filtrarMeus(), 'registros-bp');
  renderMeus();
}
function filtrarMeus() {
  const p = el('m-periodo').value, proc = el('m-processo').value,
    niv = el('m-nivel').value, st = el('m-status').value;
  return porEscopo(registros, el('m-escopo').value)
    .filter(r => noPeriodo(r.data, p))
    .filter(r => !proc || r.processo === proc)
    .filter(r => !niv || r.nivel === niv)
    .filter(r => !st || r.status === st);
}
function renderMeus() {
  const l = filtrarMeus();
  const min = l.reduce((s, r) => s + r.minutos, 0);
  const est = l.filter(r => r.nivel === 'Estratégico').reduce((s, r) => s + r.minutos, 0);
  el('resumo-meus').innerHTML =
    kpi('Registros', nfmt(l.length), 'no período escolhido') +
    kpi('Horas lançadas', horas(min), l.length ? 'média de ' + horas(Math.round(min / l.length)) + ' por registro' : '') +
    kpi('Tempo estratégico', min ? Math.round(est / min * 100) + '%' : '0%', horas(est) + ' de ' + horas(min)) +
    kpi('Processos tocados', nfmt(new Set(l.map(r => r.processo)).size), 'de ' + processos.length + ' no catálogo');
  el('lista-meus').innerHTML = l.length ? tabelaRegistros(l, true)
    : '<div class="vazio">Nenhum registro nesse filtro.</div>';
  ligarApagar();
}

/* =====================================================================
   8. Tela: painel
   ===================================================================== */
function telaPainel(c) {
  const seletorBp = veTudo()
    ? `<div><label class="lab" for="p-bp">Business Partner</label>
        <select id="p-bp"><option value="">Todas as BPs</option>
        ${equipeLancadora().map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join('')}
        </select></div>` : '';
  c.innerHTML = `
  <div class="card">
    <div class="filtros" style="margin-bottom:18px">
      <div><label class="lab" for="p-periodo">Período</label>
        <select id="p-periodo"><option value="mes">Mês atual</option><option value="30" selected>Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option><option value="tudo">Tudo</option></select></div>
      ${seletorBp}
      <div><label class="lab" for="p-processo">Processo</label>
        <select id="p-processo"><option value="">Todos</option>${processos.map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
    </div>
    <div id="p-kpis" class="kpis"></div>
  </div>
  <div class="grade g2">
    <div class="card"><h3>Para onde vai o tempo</h3>
      <p class="sub">Horas por nível da atividade, conforme a classificação da planilha.</p>
      <div id="ch-nivel"></div></div>
    <div class="card"><h3>Tempo em atividades que geram valor</h3>
      <p class="sub">Coluna "Gera valor?" do mapeamento das BPs.</p>
      <div id="ch-valor"></div></div>
  </div>
  <div class="card"><h3>Onde a rotina se concentra</h3>
    <p class="sub">Dez processos com mais horas no período.</p>
    <div id="ch-proc"></div></div>
  <div class="card"><h3>Evolução semanal</h3>
    <p class="sub">Horas lançadas por semana, das mais antigas às mais recentes.</p>
    <div id="ch-sem"></div></div>
  ${veTudo() ? `<div class="card"><h3>Comparativo entre as BPs</h3>
    <p class="sub">Horas e perfil de atuação de cada Business Partner no período.</p>
    <div id="ch-bps"></div></div>` : ''}`;
  ['p-periodo', 'p-processo', 'p-bp'].forEach(id => { const e = el(id); if (e) e.onchange = renderPainel; });
  renderPainel();
}
function dadosPainel() {
  const per = el('p-periodo').value, proc = el('p-processo').value;
  const bp = el('p-bp') ? el('p-bp').value : '';
  return registros
    .filter(r => !bp || r.usuario_id === bp)
    .filter(r => noPeriodo(r.data, per))
    .filter(r => !proc || r.processo === proc);
}
function renderPainel() {
  const l = dadosPainel();
  const min = l.reduce((s, r) => s + r.minutos, 0);
  const somaNivel = n => l.filter(r => r.nivel === n).reduce((s, r) => s + r.minutos, 0);
  const estTat = somaNivel('Estratégico') + somaNivel('Tático');
  const valorSim = l.filter(r => r.gera_valor === 'Sim').reduce((s, r) => s + r.minutos, 0);
  const pend = l.filter(r => r.status !== 'Concluída').length;

  el('p-kpis').innerHTML =
    kpi('Horas acompanhadas', horas(min), nfmt(l.length) + ' registros', true) +
    kpi('Estratégico + tático', min ? Math.round(estTat / min * 100) + '%' : '0%', horas(estTat)) +
    kpi('Gera valor', min ? Math.round(valorSim / min * 100) + '%' : '0%', horas(valorSim)) +
    kpi('Em aberto', nfmt(pend), 'registros não concluídos') +
    kpi('Áreas atendidas', nfmt(new Set(l.map(r => r.area).filter(Boolean)).size), 'setores diferentes');

  const dadosNivel = NIVEIS.map(n => ({ rot: n, val: somaNivel(n), cor: COR_NIVEL[n] }));
  el('ch-nivel').innerHTML = barraEmpilhada(dadosNivel, min) + tabelaMini(dadosNivel, min);

  const dv = [
    { rot: 'Gera valor', val: valorSim, cor: 'var(--s3)' },
    { rot: 'Não gera valor', val: l.filter(r => r.gera_valor === 'Não').reduce((s, r) => s + r.minutos, 0), cor: 'var(--parado)' },
    { rot: 'Fora do catálogo', val: l.filter(r => r.gera_valor !== 'Sim' && r.gera_valor !== 'Não').reduce((s, r) => s + r.minutos, 0), cor: 'var(--s4)' }
  ].filter(d => d.val > 0 || d.rot !== 'Fora do catálogo');
  el('ch-valor').innerHTML = barraEmpilhada(dv, min) + tabelaMini(dv, min);

  const porProc = {};
  l.forEach(r => porProc[r.processo] = (porProc[r.processo] || 0) + r.minutos);
  const top = Object.entries(porProc).sort((a, b) => b[1] - a[1]).slice(0, 10);
  el('ch-proc').innerHTML = top.length ? barrasH(top) : '<div class="vazio">Sem registros no período.</div>';
  el('ch-sem').innerHTML = barrasV(porSemana(l));

  if (el('ch-bps')) {
    const linhas = equipeLancadora().map(u => {
      const rs = l.filter(r => r.usuario_id === u.id);
      const m = rs.reduce((s, r) => s + r.minutos, 0);
      return {
        nome: u.nome, min: m, qtd: rs.length,
        niveis: NIVEIS.map(n => rs.filter(r => r.nivel === n).reduce((s, r) => s + r.minutos, 0))
      };
    }).sort((a, b) => b.min - a.min);
    el('ch-bps').innerHTML = comparativoBps(linhas);
  }
}
function porSemana(l) {
  const mapa = {};
  l.forEach(r => {
    const d = new Date(r.data + 'T12:00:00');
    const seg = new Date(d); seg.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = isoLocal(seg);
    mapa[k] = (mapa[k] || 0) + r.minutos;
  });
  return Object.entries(mapa).sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
}

/* =====================================================================
   9. Gráficos (SVG na mão, sem biblioteca)
   ===================================================================== */
function barraEmpilhada(dados, total) {
  if (!total) return '<div class="vazio">Sem registros no período.</div>';
  const segs = dados.filter(d => d.val > 0);
  return `<div class="barra-total" style="height:34px;border-radius:10px;gap:2px;overflow:visible">
    ${segs.map(d => `<i style="background:${d.cor};width:${d.val / total * 100}%;border-radius:4px"
      data-tip="<b>${esc(d.rot)}</b><br>${horas(d.val)} · ${Math.round(d.val / total * 100)}%"></i>`).join('')}
  </div>
  <div class="leg">${segs.map(d => `<span><i style="background:${d.cor}"></i>${esc(d.rot)} <b class="num">${Math.round(d.val / total * 100)}%</b></span>`).join('')}</div>`;
}
function tabelaMini(dados, total) {
  if (!total) return '';
  return `<div class="tabela-wrap" style="margin-top:14px"><table style="min-width:0">
    <thead><tr><th>Classificação</th><th style="width:96px">Horas</th><th style="width:80px">Parte</th></tr></thead>
    <tbody>${dados.map(d => `<tr><td data-r="Classificação">${esc(d.rot)}</td>
      <td class="num" data-r="Horas">${horas(d.val)}</td>
      <td class="num" data-r="Parte">${Math.round(d.val / total * 100)}%</td></tr>`).join('')}</tbody></table></div>`;
}

/* Barras horizontais em HTML puro: no celular o texto de um SVG largo
   encolhe junto com o desenho e fica ilegível. Aqui o rótulo quebra
   linha e a barra ocupa a largura disponível. */
function barrasH(pares) {
  const max = Math.max(...pares.map(p => p[1]));
  return `<div class="barras">
    ${pares.map(p => `<div class="barra-linha">
      <div class="bl-rot">${esc(p[0])}</div>
      <div class="bl-pista">
        <span class="bl-barra" style="width:${Math.max(3, p[1] / max * 100)}%"
          data-tip="<b>${esc(p[0])}</b><br>${horas(p[1])}"></span>
        <span class="bl-val">${horas(p[1])}</span>
      </div>
    </div>`).join('')}
  </div>`;
}

const estreito = () => window.innerWidth < 720;

function barrasV(todosPares) {
  if (!todosPares.length) return '<div class="vazio">Sem registros no período.</div>';
  // No celular mostramos menos semanas e uma área de desenho mais estreita,
  // senão os rótulos ficam microscópicos.
  const pares = estreito() ? todosPares.slice(-6) : todosPares;
  const max = Math.max(...pares.map(p => p[1]));
  const L = estreito() ? 360 : 700, H = estreito() ? 170 : 190, base = H - 30;
  const passo = (L - 20) / pares.length, larg = Math.min(56, passo - 10);
  return `<svg viewBox="0 0 ${L} ${H}" width="100%" height="${H}" role="img"
    aria-label="Horas lançadas por semana" style="max-width:100%">
    <line x1="10" y1="${base}" x2="${L - 10}" y2="${base}" stroke="var(--linha-forte)" stroke-width="1"/>
    ${pares.map((p, i) => {
      const x = 10 + i * passo + (passo - larg) / 2;
      const alt = Math.max(3, p[1] / max * (base - 34));
      return `<g>
        <rect x="${x}" y="${base - alt}" width="${larg}" height="${alt}" rx="4" fill="var(--s4)"
          data-tip="<b>Semana de ${dataBr(p[0])}</b><br>${horas(p[1])}"></rect>
        <text x="${x + larg / 2}" y="${base - alt - 7}" class="rotulo" text-anchor="middle">${Math.round(p[1] / 60)}h</text>
        <text x="${x + larg / 2}" y="${base + 17}" class="eixo" text-anchor="middle">${p[0].slice(8, 10)}/${p[0].slice(5, 7)}</text>
      </g>`;
    }).join('')}
  </svg>`;
}
function comparativoBps(linhas) {
  if (!linhas.length) return '<div class="vazio">Nenhuma BP cadastrada ainda.</div>';
  const max = Math.max(1, ...linhas.map(l => l.min));
  return `<div style="display:grid;gap:14px">
  ${linhas.map(l => `<div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:6px">
      <b style="font-family:var(--ff-d);font-size:14.5px">${esc(l.nome)}</b>
      <span class="mini num">${horas(l.min)} · ${l.qtd} registros</span>
    </div>
    <div class="barra-total" style="gap:2px;height:14px;width:${Math.max(4, l.min / max * 100)}%;min-width:40px">
      ${l.niveis.map((v, i) => v > 0 ? `<i style="background:${COR_NIVEL[NIVEIS[i]]};width:${v / l.min * 100}%;border-radius:3px"
        data-tip="<b>${NIVEIS[i]}</b><br>${horas(v)}"></i>` : '').join('')}
    </div></div>`).join('')}
  <div class="leg">${NIVEIS.map(n => `<span><i style="background:${COR_NIVEL[n]}"></i>${n}</span>`).join('')}</div>
  </div>`;
}

/* =====================================================================
   10. Tela: catálogo
   ===================================================================== */
function telaCatalogo(c) {
  const destinos = [...new Set(catalogo.map(a => a.destino).filter(Boolean))].sort();
  const fica = catalogo.filter(a => a.permanencia === 'Fica').length;
  c.innerHTML = `
  <div class="card">
    <h3>Catálogo de atividades das BPs</h3>
    <p class="sub">As ${catalogo.length} atividades mapeadas na planilha, com nível, geração de valor e destino definido no redesenho do papel.</p>
    <div class="kpis" style="margin-bottom:18px">
      ${kpi('Atividades mapeadas', catalogo.length, processos.length + ' processos', true)}
      ${kpi('Permanecem na BP', nfmt(fica), catalogo.length ? Math.round(fica / catalogo.length * 100) + '% do total' : '')}
      ${kpi('Saem para outras áreas', nfmt(catalogo.length - fica), 'redistribuídas no redesenho')}
      ${kpi('Geram valor', nfmt(catalogo.filter(a => a.gera_valor === 'Sim').length), 'classificadas como "Sim"')}
      ${kpi('Estratégicas', nfmt(catalogo.filter(a => a.nivel === 'Estratégico').length), 'nível mais alto')}
    </div>
    <div class="filtros">
      <div style="flex:2 1 240px"><label class="lab" for="c-busca">Buscar</label>
        <input type="text" id="c-busca" placeholder="Atividade, processo ou descrição"></div>
      <div><label class="lab" for="c-proc">Processo</label>
        <select id="c-proc"><option value="">Todos</option>${processos.map(p => `<option>${esc(p)}</option>`).join('')}</select></div>
      <div><label class="lab" for="c-nivel">Nível</label>
        <select id="c-nivel"><option value="">Todos</option>${NIVEIS.map(n => `<option>${n}</option>`).join('')}</select></div>
      <div><label class="lab" for="c-perm">Permanência</label>
        <select id="c-perm"><option value="">Todas</option><option>Fica</option><option>Sai</option></select></div>
      <div><label class="lab" for="c-dest">Destino</label>
        <select id="c-dest"><option value="">Todos</option>${destinos.map(d => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div style="flex:0 0 auto"><button class="bt" id="btn-nova-ativ">Nova atividade</button></div>
    </div>
    <div id="cat-msg"></div>
    <p class="dica-editar">Clique em qualquer linha para abrir a ficha e editar.
      O sistema guarda quem alterou e quando.</p>
    <div id="cat-lista"></div>
  </div>`;
  ['c-busca', 'c-proc', 'c-nivel', 'c-perm', 'c-dest'].forEach(id => {
    el(id).oninput = renderCatalogo; el(id).onchange = renderCatalogo;
  });
  el('btn-nova-ativ').onclick = () => abrirFicha(null);
  renderCatalogo();
}
function renderCatalogo() {
  const b = el('c-busca').value.toLowerCase().trim();
  const l = catalogo
    .filter(a => !el('c-proc').value || a.processo === el('c-proc').value)
    .filter(a => !el('c-nivel').value || a.nivel === el('c-nivel').value)
    .filter(a => !el('c-perm').value || a.permanencia === el('c-perm').value)
    .filter(a => !el('c-dest').value || a.destino === el('c-dest').value)
    .filter(a => !b || (a.atividade + ' ' + a.processo + ' ' + (a.descricao || '')).toLowerCase().includes(b));
  el('cat-lista').innerHTML = l.length ? `
    <div class="mini" style="margin-bottom:8px">${l.length} atividade${l.length > 1 ? 's' : ''} no filtro</div>
    <div class="tabela-wrap"><table>
    <thead><tr><th style="width:44px">ID</th><th style="width:180px">Processo</th><th>Atividade</th>
      <th style="width:118px">Nível</th><th style="width:96px">Gera valor</th><th style="width:180px">Destino</th></tr></thead>
    <tbody>${l.map(a => `<tr class="clicavel" tabindex="0" data-ficha="${a.id}">
      <td class="num mini" data-r="ID">${a.id}</td>
      <td class="mini" data-r="Processo">${esc(a.processo)}</td>
      <td data-r="Atividade"><div><div class="b-proc">${esc(a.atividade)}</div><div class="desc-cat">${esc(a.descricao || '')}</div></div></td>
      <td data-r="Nível"><span class="tag ${CLS_NIVEL[a.nivel]}"><i class="pt" style="background:${COR_NIVEL[a.nivel]}"></i>${esc(a.nivel)}</span></td>
      <td data-r="Gera valor"><span class="tag ${a.gera_valor === 'Sim' ? 't-es' : 't-neu'}">${esc(a.gera_valor)}</span></td>
      <td data-r="Destino"><span class="tag ${a.permanencia === 'Fica' ? 't-am' : 't-sai'}">${esc(a.destino)}</span></td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="vazio">Nada encontrado com esses filtros.</div>';

  document.querySelectorAll('[data-ficha]').forEach(tr => {
    const abrir = () => abrirFicha(catalogo.find(x => x.id === Number(tr.dataset.ficha)));
    tr.onclick = abrir;
    tr.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } };
  });
}

/* ---------------------------------------------------------------------
   Ficha da atividade: abre ao clicar na linha. `a` null cria uma nova.
   --------------------------------------------------------------------- */
function abrirFicha(a) {
  const nova = !a;
  const d = a || { processo: '', atividade: '', descricao: '', nivel: 'Tático',
                   gera_valor: 'Sim', permanencia: 'Fica', destino: 'Permanece na BP' };
  const destinos = [...new Set(catalogo.map(x => x.destino).filter(Boolean))].sort();
  const quem = d.alterado_por ? nomeDe(d.alterado_por) : null;

  abrirDlg(`
    <h3>${nova ? 'Nova atividade' : 'Atividade ' + d.id}</h3>
    <div id="ficha-msg"></div>
    <div class="linha-campos lc2">
      <div><label class="lab" for="fi-processo">Processo</label>
        <input type="text" id="fi-processo" list="fi-lista-proc" value="${esc(d.processo)}">
        <datalist id="fi-lista-proc">${processos.map(p => `<option value="${esc(p)}">`).join('')}</datalist></div>
      <div><label class="lab" for="fi-nivel">Nível</label>
        <select id="fi-nivel">${NIVEIS.map(n => `<option ${n === d.nivel ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    </div>
    <div style="margin-top:14px">
      <div class="lab-linha"><label class="lab" for="fi-atividade">Atividade</label>
        ${botaoMic('fi-atividade', 'o nome da atividade')}</div>
      <input type="text" id="fi-atividade" value="${esc(d.atividade)}">
    </div>
    <div style="margin-top:14px">
      <div class="lab-linha"><label class="lab" for="fi-descricao">Descrição</label>
        ${botaoMic('fi-descricao', 'a descrição')}</div>
      <textarea id="fi-descricao" style="min-height:120px">${esc(d.descricao || '')}</textarea>
      ${TEM_VOZ ? '<div class="mini" style="margin-top:6px">Descrição longa? Toque em Ditar e fale. O texto vai sendo escrito e você ajusta depois.</div>' : ''}
    </div>
    <div class="linha-campos lc3" style="margin-top:14px">
      <div><label class="lab" for="fi-valor">Gera valor?</label>
        <select id="fi-valor">
          <option ${d.gera_valor === 'Sim' ? 'selected' : ''}>Sim</option>
          <option ${d.gera_valor === 'Não' ? 'selected' : ''}>Não</option>
        </select></div>
      <div><label class="lab" for="fi-perm">Permanência</label>
        <select id="fi-perm">
          <option ${d.permanencia === 'Fica' ? 'selected' : ''}>Fica</option>
          <option ${d.permanencia === 'Sai' ? 'selected' : ''}>Sai</option>
        </select></div>
      <div><label class="lab" for="fi-destino">Destino</label>
        <input type="text" id="fi-destino" list="fi-lista-dest" value="${esc(d.destino || '')}">
        <datalist id="fi-lista-dest">${destinos.map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    </div>
    ${quem || d.alterado_em ? `<p class="mini" style="margin-top:14px">Última alteração${quem ? ' por ' + esc(quem) : ''}${d.alterado_em ? ' em ' + new Date(d.alterado_em).toLocaleString('pt-BR') : ''}.</p>` : ''}
    <div class="rodape">
      <button class="bt" id="fi-salvar">${nova ? 'Criar atividade' : 'Salvar alterações'}</button>
      <button class="bt sec" id="fi-cancelar">Cancelar</button>
      ${!nova && veTudo()
        ? '<button class="bt sec direita" id="fi-desativar">Tirar do catálogo</button>' : ''}
    </div>`);

  // Destino acompanha a permanência, para não sobrar combinação sem sentido
  el('fi-perm').onchange = () => {
    const dest = el('fi-destino');
    if (el('fi-perm').value === 'Fica') dest.value = 'Permanece na BP';
    else if (dest.value === 'Permanece na BP') dest.value = '';
  };
  el('fi-cancelar').onclick = () => { pararVoz(); el('dlg').close(); };
  el('fi-salvar').onclick = () => salvarFicha(nova ? null : d.id);
  if (el('fi-desativar')) el('fi-desativar').onclick = () => desativarAtividade(d);
  ligarMics(el('dlg-corpo'), 'ficha-msg');
}

async function salvarFicha(id) {
  pararVoz();
  const dados = {
    processo: el('fi-processo').value.trim(),
    atividade: el('fi-atividade').value.trim(),
    descricao: el('fi-descricao').value.trim() || null,
    nivel: el('fi-nivel').value,
    gera_valor: el('fi-valor').value,
    permanencia: el('fi-perm').value,
    destino: el('fi-destino').value.trim() || null
  };
  if (!dados.processo) return mostrarMsg('ficha-msg', 'erro', 'Informe o processo.');
  if (!dados.atividade) return mostrarMsg('ficha-msg', 'erro', 'Informe o nome da atividade.');

  const botao = el('fi-salvar');
  botao.disabled = true; botao.textContent = 'Salvando…';
  try {
    let salvo;
    if (id) {
      const { data, error } = await sb.from('bp_catalogo').update(dados).eq('id', id).select().single();
      if (error) throw error;
      salvo = data;
      Object.assign(catalogo.find(x => x.id === id), salvo);
    } else {
      const { data, error } = await sb.from('bp_catalogo').insert(dados).select().single();
      if (error) throw error;
      salvo = data;
      catalogo.push(salvo);
      catalogo.sort((x, y) => x.id - y.id);
    }
    processos = [...new Set(catalogo.map(x => x.processo))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
    el('dlg').close();
    ir('catalogo');
    mostrarMsg('cat-msg', 'ok', id ? 'Atividade atualizada.' : 'Atividade ' + salvo.id + ' criada.');
  } catch (e) {
    mostrarMsg('ficha-msg', 'erro', traduzErroCatalogo(e));
    botao.disabled = false;
    botao.textContent = id ? 'Salvar alterações' : 'Criar atividade';
  }
}

function desativarAtividade(d) {
  el('dlg').close();
  confirmar('Tirar "' + d.atividade + '" do catálogo?',
    'Ela some da lista e do formulário de registro, mas os lançamentos já feitos continuam intactos. Dá para trazer de volta pelo SQL Editor.',
    async () => {
      const { error } = await sb.from('bp_catalogo').update({ ativo: false }).eq('id', d.id);
      if (error) return aviso(traduzErroCatalogo(error));
      catalogo = catalogo.filter(x => x.id !== d.id);
      processos = [...new Set(catalogo.map(x => x.processo))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
      ir('catalogo');
      mostrarMsg('cat-msg', 'ok', 'Atividade ' + d.id + ' tirada do catálogo.');
    });
}

function traduzErroCatalogo(e) {
  const m = (e && e.message ? e.message : String(e)).toLowerCase();
  if (m.includes('violates row-level security') || m.includes('invalid_argument') || m.includes('42501'))
    return 'Seu acesso não pode editar o catálogo. Peça a quem administra o sistema para rodar o arquivo 03-edicao-catalogo.sql no Supabase.';
  if (m.includes('bp_catalogo_nivel_check'))
    return 'Nível inválido. Use Operacional, Tático ou Estratégico.';
  if (m.includes('alterado_por') || m.includes('alterado_em'))
    return 'Falta rodar o arquivo 03-edicao-catalogo.sql no Supabase.';
  return traduzErro(e);
}


/* =====================================================================
   10b. Tela: histórico, com desfazer
   O banco anota sozinho cada criação, alteração e exclusão, guardando
   como o registro estava antes. É isso que permite voltar atrás.
   ===================================================================== */
const ACOES = {
  criou:   { rotulo: 'Criou',   cor: 't-es',  desfazer: 'Apagar de novo' },
  alterou: { rotulo: 'Alterou', cor: 't-am',  desfazer: 'Voltar como estava' },
  apagou:  { rotulo: 'Apagou',  cor: 't-sai', desfazer: 'Restaurar' }
};
let historico = [];

function telaHistorico(c) {
  c.innerHTML = `
  <div class="card">
    <h3>Histórico</h3>
    <p class="sub">Tudo o que foi lançado, alterado e apagado, do mais recente para o mais
      antigo. Errou alguma coisa? Dá para voltar atrás sem precisar refazer na mão.</p>
    <div id="h-msg"></div>
    <div class="filtros">
      <div><label class="lab" for="h-periodo">Período</label>
        <select id="h-periodo"><option value="30" selected>Últimos 30 dias</option>
        <option value="7">Últimos 7 dias</option><option value="90">Últimos 90 dias</option>
        <option value="tudo">Tudo</option></select></div>
      <div><label class="lab" for="h-acao">O que aconteceu</label>
        <select id="h-acao"><option value="">Tudo</option>
        <option value="criou">Criações</option><option value="alterou">Alterações</option>
        <option value="apagou">Exclusões</option></select></div>
      <div><label class="lab" for="h-entidade">Onde</label>
        <select id="h-entidade"><option value="">Tudo</option>
        <option value="registro">Registros do dia a dia</option>
        <option value="atividade">Catálogo de atividades</option></select></div>
      <div style="flex:0 0 auto"><button class="bt sec" id="h-recarregar">Atualizar</button></div>
    </div>
    <div id="h-lista"><div class="carregando">Carregando o histórico…</div></div>
  </div>`;
  ['h-periodo', 'h-acao', 'h-entidade'].forEach(id => el(id).onchange = renderHistorico);
  el('h-recarregar').onclick = () => carregarHistorico(true);
  carregarHistorico();
}

async function carregarHistorico(recarregar) {
  if (historico.length && !recarregar) { renderHistorico(); return; }
  const { data, error } = await sb.from('bp_historico').select('*')
    .order('quando', { ascending: false }).limit(500);
  if (error) {
    el('h-lista').innerHTML = /bp_historico/i.test(error.message || '')
      ? '<div class="aviso"><span>&#9888;</span><div>Falta rodar o arquivo <b>07-historico.sql</b> no Supabase para esta aba funcionar.</div></div>'
      : `<div class="vazio">${esc(traduzErro(error))}</div>`;
    return;
  }
  historico = data || [];
  renderHistorico();
}

function filtrarHistorico() {
  const per = el('h-periodo').value, ac = el('h-acao').value, ent = el('h-entidade').value;
  return historico
    .filter(h => noPeriodo(h.quando.slice(0, 10), per))
    .filter(h => !ac || h.acao === ac)
    .filter(h => !ent || h.entidade === ent);
}

function renderHistorico() {
  const l = filtrarHistorico();
  if (!l.length) {
    el('h-lista').innerHTML = '<div class="vazio">Nada no histórico com esses filtros.</div>';
    return;
  }
  el('h-lista').innerHTML = `
    <div class="mini" style="margin-bottom:10px">${l.length} ${l.length === 1 ? 'item' : 'itens'}</div>
    <div class="tabela-wrap"><table>
    <thead><tr><th style="width:120px">Quando</th><th style="width:104px">O quê</th>
      <th>Item</th><th style="width:130px">Quem</th><th style="width:152px"></th></tr></thead>
    <tbody>${l.map(h => {
      const a = ACOES[h.acao] || ACOES.alterou;
      const posso = !h.desfeito_em && (veTudo() || h.dono_id === perfil.id || h.entidade === 'atividade');
      return `<tr${h.desfeito_em ? ' class="desfeita"' : ''}>
        <td data-r="Quando" class="mini num">${dataHora(h.quando)}</td>
        <td data-r="O quê"><span class="tag ${a.cor}">${a.rotulo}</span></td>
        <td data-r="Item"><div><div class="b-proc">${esc(h.resumo)}</div>
          <div class="mini">${h.entidade === 'registro' ? 'registro do dia a dia' : 'catálogo de atividades'}${h.desfeito_em ? ' · desfeito em ' + dataHora(h.desfeito_em) : ''}</div></div></td>
        <td data-r="Quem" class="mini">${esc(nomeDe(h.quem))}</td>
        <td>${posso
          ? `<button class="bt sec peq" data-desfazer="${h.id}">${a.desfazer}</button>`
          : (h.desfeito_em ? '<span class="mini">desfeito</span>' : '<span class="mini">só leitura</span>')}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;

  document.querySelectorAll('[data-desfazer]').forEach(b => b.onclick = () => {
    const h = historico.find(x => String(x.id) === b.dataset.desfazer);
    const a = ACOES[h.acao] || ACOES.alterou;
    confirmar(a.desfazer + '?',
      h.acao === 'apagou' ? 'O item volta exatamente como estava antes de ser apagado.'
      : h.acao === 'criou' ? 'O item que foi criado nessa ação sai da lista.'
      : 'Os campos voltam aos valores anteriores a essa alteração.',
      () => desfazer(h, b));
  });
}

async function desfazer(h, botao) {
  botao.disabled = true;
  const rotuloOriginal = botao.textContent;
  botao.textContent = 'Desfazendo…';
  try {
    const { data, error } = await sb.rpc('bp_desfazer', { p_historico_id: h.id });
    if (error) throw error;
    if (data !== 'ok') { mostrarMsg('h-msg', 'erro', data); return; }
    await Promise.all([carregarRegistros(), carregarCatalogo()]);
    await carregarHistorico(true);
    mostrarMsg('h-msg', 'ok', 'Feito, voltei atrás nessa ação.');
  } catch (e) {
    mostrarMsg('h-msg', 'erro', /bp_desfazer|function/i.test(e.message || '')
      ? 'Falta rodar o arquivo 07-historico.sql no Supabase.' : traduzErro(e));
  } finally {
    botao.disabled = false;
    botao.textContent = rotuloOriginal;
  }
}

function dataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* =====================================================================
   11. Tela: gestão (só administrador)
   ===================================================================== */
function telaGestao(c) {
  c.innerHTML = `
  <div class="card">
    <h3>Convidar uma BP</h3>
    <p class="sub">Cadastre a pessoa e envie o e-mail de boas-vindas. Ela cria a própria senha
      no primeiro acesso, você nunca precisa saber a senha de ninguém.</p>
    <div id="convite-msg"></div>
    <div class="linha-campos lc3">
      <div><label class="lab" for="cv-nome">Nome</label>
        <input type="text" id="cv-nome" placeholder="Nome e sobrenome"></div>
      <div><label class="lab" for="cv-email">E-mail corporativo</label>
        <input type="email" id="cv-email" placeholder="nome${esc(CONFIG.dominio)}"></div>
      <div><label class="lab" for="cv-cargo">Cargo</label>
        <input type="text" id="cv-cargo" value="Business Partner"></div>
    </div>
    <div class="linha-campos lc2" style="margin-top:14px">
      <div><label class="lab" for="cv-papel">Nível de acesso</label>
        <select id="cv-papel">
          <option value="bp">BP · vê só os próprios lançamentos</option>
          <option value="completo">Visão completa · vê e edita os de todas</option>
        </select>
        <div class="mini" style="margin-top:6px">Ela já entra com esse nível, sem depender de você ajustar depois.</div>
      </div>
    </div>
    <div class="acoes" style="margin-top:14px">
      <button class="bt" id="btn-convidar">Cadastrar e preparar e-mail</button>
    </div>
    <div id="lista-convites" style="margin-top:20px"></div>
  </div>
  <div class="card">
    <h3>Quem tem acesso</h3>
    <p class="sub">Cada BP enxerga apenas os próprios registros. O perfil Administrador enxerga todas.</p>
    <div id="g-msg"></div>
    <div id="lista-perfis"></div>
  </div>
  <div class="card">
    <h3>Base consolidada</h3>
    <p class="sub">Todos os registros de todas as BPs, para levar para a reunião de gente e gestão.</p>
    <div class="acoes"><button class="bt sec" id="btn-csv-tudo">Exportar tudo em CSV</button></div>
    <div class="mini" style="margin-top:12px">
      ${nfmt(registros.length)} registros na base · ${nfmt(perfis.filter(p => p.ativo).length)} pessoas com acesso
    </div>
  </div>`;
  renderPerfis();
  el('btn-convidar').onclick = convidar;
  el('btn-csv-tudo').onclick = () => exportarCsv(registros, 'atividades-bp-consolidado');
  carregarConvites();
}

/* =====================================================================
   11b. Convites
   O site é estático, então ele não dispara e-mail sozinho: isso exigiria
   guardar uma chave de envio no navegador, o que ninguém deve fazer.
   Em vez disso o sistema monta a mensagem pronta e formatada, e você
   cola no Outlook em dois cliques.
   ===================================================================== */
let convites = [];

async function carregarConvites() {
  const { data, error } = await sb.from('bp_convites').select('*').order('convidada_em', { ascending: false });
  if (error) {
    el('lista-convites').innerHTML = /bp_convites/i.test(error.message || '')
      ? '<div class="aviso"><span>⚠</span><div>Falta rodar o arquivo <b>05-convites.sql</b> no Supabase para esta parte funcionar.</div></div>'
      : '';
    return;
  }
  convites = data || [];
  renderConvites();
}

function renderConvites() {
  if (!convites.length) {
    el('lista-convites').innerHTML = '<div class="vazio">Nenhuma BP cadastrada ainda.</div>';
    return;
  }
  el('lista-convites').innerHTML = `<div class="tabela-wrap"><table>
    <thead><tr><th>Pessoa</th><th style="width:210px">E-mail</th>
      <th style="width:150px">Situação</th><th style="width:200px"></th></tr></thead>
    <tbody>${convites.map(c => `<tr>
      <td data-r="Pessoa"><div><b>${esc(c.nome)}</b><div class="mini">${esc(c.cargo)}
        ${c.papel && c.papel !== 'bp' ? ' · ' + esc(papelDe(c.papel).rotulo) : ''}</div></div></td>
      <td class="mini" data-r="E-mail">${esc(c.email)}</td>
      <td data-r="Situação"><span class="tag ${c.entrou_em ? 't-es' : 't-am'}">
        ${c.entrou_em ? 'Entrou em ' + new Date(c.entrou_em).toLocaleDateString('pt-BR') : 'Aguardando'}</span></td>
      <td><div class="acoes">
        <button class="bt sec peq" data-email="${esc(c.email)}">Ver e-mail</button>
        ${c.entrou_em ? '' : `<button class="bt sec peq" data-tirar="${esc(c.email)}">Remover</button>`}
      </div></td>
    </tr>`).join('')}</tbody></table></div>`;

  document.querySelectorAll('[data-email]').forEach(b => b.onclick = () =>
    janelaEmail(convites.find(c => c.email === b.dataset.email)));
  document.querySelectorAll('[data-tirar]').forEach(b => b.onclick = () => {
    const c = convites.find(x => x.email === b.dataset.tirar);
    confirmar('Remover o convite de ' + c.nome + '?',
      'Ela sai desta lista. Se já tiver recebido o e-mail, ainda assim consegue criar o acesso.',
      async () => {
        const { error } = await sb.from('bp_convites').delete().eq('email', c.email);
        if (error) return mostrarMsg('convite-msg', 'erro', traduzErro(error));
        convites = convites.filter(x => x.email !== c.email);
        renderConvites();
      });
  });
}

async function convidar() {
  const nome = el('cv-nome').value.trim();
  const email = el('cv-email').value.trim().toLowerCase();
  const cargo = el('cv-cargo').value.trim() || 'Business Partner';
  if (nome.length < 3) return mostrarMsg('convite-msg', 'erro', 'Escreva o nome completo.');
  if (!email.endsWith(CONFIG.dominio))
    return mostrarMsg('convite-msg', 'erro', 'O e-mail precisa terminar em ' + CONFIG.dominio + '.');

  const botao = el('btn-convidar');
  botao.disabled = true; botao.textContent = 'Cadastrando…';
  try {
    const registro = { email, nome, cargo, unidade: CONFIG.unidade,
                       papel: el('cv-papel') ? el('cv-papel').value : 'bp',
                       convidada_por: perfil.id };
    const { data, error } = await sb.from('bp_convites')
      .upsert(registro, { onConflict: 'email' }).select().single();
    if (error) throw error;
    convites = [data, ...convites.filter(c => c.email !== email)];
    el('cv-nome').value = ''; el('cv-email').value = '';
    mostrarMsg('convite-msg', 'ok', nome + ' cadastrada. Agora é só enviar o e-mail.');
    renderConvites();
    janelaEmail(data);
  } catch (e) {
    mostrarMsg('convite-msg', 'erro', /bp_convites/i.test(e.message || '')
      ? 'Falta rodar o arquivo 05-convites.sql no Supabase.' : traduzErro(e));
  } finally {
    botao.disabled = false; botao.textContent = 'Cadastrar e preparar e-mail';
  }
}

const ASSUNTO_CONVITE = 'Ritmo: seu acesso, e o que ele resolve pra você';

/* O parágrafo sobre acesso precisa dizer a verdade para cada nível:
   prometer sigilo a quem tem visão completa seria escrever algo falso. */
function textoAcesso(papel) {
  return papel === 'completo' || papel === 'admin'
    ? '<b>Sobre o seu acesso:</b> ele é de visão completa. Você enxerga e edita os lançamentos de todas as BPs, para conseguir apoiar e dar continuidade quando precisar. As BPs enxergam apenas os próprios. E a senha é sua, ninguém mais tem acesso a ela.'
    : '<b>É um espaço seu:</b> você vê e edita apenas os seus próprios lançamentos. O registro de uma não aparece para a outra, a não ser quando é marcada nele. E a senha é sua, ninguém mais tem acesso a ela.';
}

/* Os cinco ganhos que o e-mail promete. Mexer aqui muda o e-mail inteiro,
   tanto a versão em HTML quanto a em texto puro. */
const GANHOS = [
  ['Seu planner da semana',
   'Um quadro com Pendente, Em andamento e Concluída. Você arrasta o cartão e pronto. ' +
   'Serve para chegar na segunda e saber na hora o que ficou em aberto.'],
  ['Registro por áudio',
   'Saindo da área, entre uma conversa e outra, você toca em "Ditar a demanda" e fala. ' +
   'O sistema entende, procura a atividade no catálogo e preenche os campos. ' +
   'Nada de guardar tudo na cabeça para lançar no fim do dia.'],
  ['Onde está a sua energia',
   'O painel mostra quanto do seu tempo foi estratégico, quanto foi operacional, ' +
   'quais processos consumiram mais horas e quais áreas você mais atendeu. ' +
   'É o seu argumento pronto quando a conversa for sobre prioridade, escopo e time.'],
  ['Marcar a colega no tema',
   'Escrevendo @ e o nome dela nas observações, ela passa a ver aquele registro. ' +
   'Bom para assunto que atravessa mais de uma BP e não pode morrer no WhatsApp.'],
  ['O catálogo é de vocês',
   'São as 152 atividades já mapeadas. Clicando na linha você edita a descrição, ' +
   'o nível, o que estiver diferente da sua realidade. Quem faz o trabalho é quem descreve melhor.']
];

/* E-mail em HTML com tabelas e estilo inline, que é o que o Outlook
   entende. O selo CIMED é feito em HTML puro de propósito: imagem em
   e-mail o Outlook bloqueia por padrão e o cabeçalho ficaria vazio. */
function emailHtml(c) {
  const primeiro = esc(String(c.nome).trim().split(/\s+/)[0]);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
  style="background:#f5f4ef;padding:24px 0;font-family:Segoe UI,Arial,sans-serif">
<tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
    style="width:560px;max-width:100%;background:#ffffff;border:1px solid #e5e2d8;border-radius:14px;overflow:hidden">
    <tr><td style="background:#FBC400;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr>
    <tr><td style="padding:26px 30px 6px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background:#FBC400;border-radius:999px;padding:4px 16px;
          font-family:Segoe UI,Arial,sans-serif;font-weight:bold;font-size:18px;
          letter-spacing:1px;color:#14130d">CIMED</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:18px 30px 0">
      <h1 style="margin:0 0 6px;font-size:22px;color:#16150f">Ritmo</h1>
      <p style="margin:0 0 22px;font-size:14px;color:#8b877b">Ritmo, Rotina e Ritual · BPs Pouso Alegre</p>

      <p style="margin:0 0 14px;font-size:15px;color:#16150f;line-height:1.6">Oi, ${primeiro}!</p>
      <p style="margin:0 0 14px;font-size:15px;color:#16150f;line-height:1.6">
        Seu acesso está liberado. Esse sistema existe para facilitar a rotina das BPs,
        então, em vez de um manual, deixa eu te contar direto o que ele resolve.</p>
      <p style="margin:0 0 14px;font-size:15px;color:#16150f;line-height:1.6">
        Estão mapeadas <b>152 atividades</b> da rotina das BPs, cada uma classificada entre
        operacional, tática e estratégica. O que faltava era enxergar, em número, para onde
        o tempo vai de verdade. É isso que ele mede, e ele é seu.</p>
      <p style="margin:0 0 22px;font-size:15px;color:#16150f;line-height:1.6">
        O nome não foi por acaso: <b>Ritmo, Rotina e Ritual</b> é o nosso valor sobre
        planejamento e disciplina. É disso que se trata aqui.</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="margin:0 0 6px"><tr><td
        style="border-left:3px solid #FBC400;padding:0 0 0 12px;font-size:15px;
        font-weight:bold;color:#16150f">O que muda no seu dia a dia</td></tr></table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="margin:14px 0 22px">
        ${GANHOS.map(([t, d]) => `<tr>
          <td valign="top" width="22" style="padding:0 0 16px;font-size:15px;color:#FBC400;
            font-weight:bold;line-height:1.6">&bull;</td>
          <td style="padding:0 0 16px;font-size:15px;color:#16150f;line-height:1.6">
            <b>${esc(t)}</b><br><span style="color:#56534a">${esc(d)}</span></td>
        </tr>`).join('')}
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="margin:0 0 24px;background:#FFF3CC;border-radius:10px">
        <tr><td style="padding:14px 16px;font-size:14px;color:#7a5600;line-height:1.6">
          ${textoAcesso(c.papel)}
        </td></tr>
      </table>

      <p style="margin:0 0 8px;font-size:15px;color:#16150f;line-height:1.6"><b>Para entrar:</b></p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
        style="margin:0 0 22px;font-size:15px;color:#16150f;line-height:1.6">
        <tr><td width="26" valign="top" style="padding:3px 0">1.</td>
            <td style="padding:3px 0">Abra o botão abaixo</td></tr>
        <tr><td width="26" valign="top" style="padding:3px 0">2.</td>
            <td style="padding:3px 0">Clique em <b>Criar meu acesso</b></td></tr>
        <tr><td width="26" valign="top" style="padding:3px 0">3.</td>
            <td style="padding:3px 0">Use o e-mail <b>${esc(c.email)}</b> e escolha uma senha sua,
              de no mínimo 6 caracteres</td></tr>
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">
        <tr><td style="background:#FBC400;border-radius:10px">
          <a href="${esc(CONFIG.urlSite)}" style="display:inline-block;padding:14px 28px;
            font-family:Segoe UI,Arial,sans-serif;font-weight:bold;font-size:15px;
            color:#14130d;text-decoration:none">Abrir o Ritmo</a>
        </td></tr>
      </table>
      <p style="margin:0 0 22px;font-size:13px;color:#8b877b;line-height:1.6">
        Se o botão não abrir, copie este endereço no navegador:<br>
        <span style="color:#7a5600">${esc(CONFIG.urlSite)}</span><br>
        Abra também no celular e adicione na tela inicial: é lá que o áudio ajuda mais.</p>

      <p style="margin:0 0 14px;font-size:15px;color:#16150f;line-height:1.6">
        <b>Minha sugestão de uso:</b> lance ao longo do dia, não no fim do mês.
        São menos de 30 segundos por atividade, e com o áudio dá para fazer no corredor.
        Em duas semanas você já tem o seu próprio retrato de onde o tempo está indo.</p>
      <p style="margin:0 0 0;font-size:15px;color:#16150f;line-height:1.6">
        Qualquer dúvida, é só me chamar.</p>
    </td></tr>
    <tr><td style="padding:22px 30px 26px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="border-top:1px solid #e5e2d8;padding-top:14px;font-size:13px;color:#8b877b">
          ${esc(CONFIG.assinatura)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</td></tr></table>`;
}

function emailTexto(c) {
  const primeiro = String(c.nome).trim().split(/\s+/)[0];
  return `Oi, ${primeiro}!

Seu acesso está liberado. Esse sistema existe para facilitar a rotina das BPs, então, em vez de um manual, deixa eu te contar direto o que ele resolve.

Estão mapeadas 152 atividades da rotina das BPs, cada uma classificada entre operacional, tática e estratégica. O que faltava era enxergar, em número, para onde o tempo vai de verdade. É isso que ele mede, e ele é seu.

O nome não foi por acaso: Ritmo, Rotina e Ritual é o nosso valor sobre planejamento e disciplina. É disso que se trata aqui.

O QUE MUDA NO SEU DIA A DIA

${GANHOS.map(([t, d]) => '- ' + t + ': ' + d).join('\n\n')}

SOBRE O SEU ACESSO
${textoAcesso(c.papel).replace(/<[^>]+>/g, '')}

PARA ENTRAR
1. Abra ${CONFIG.urlSite}
2. Clique em "Criar meu acesso"
3. Use o e-mail ${c.email} e escolha uma senha sua, de no mínimo 6 caracteres

Abra também no celular e adicione na tela inicial: é lá que o áudio ajuda mais.

MINHA SUGESTÃO DE USO
Lance ao longo do dia, não no fim do mês. São menos de 30 segundos por atividade, e com o áudio dá para fazer no corredor. Em duas semanas você já tem o seu próprio retrato de onde o tempo está indo.

Qualquer dúvida, é só me chamar.

${CONFIG.assinatura}`;
}

function janelaEmail(c) {
  if (!c) return;
  abrirDlg(`
    <h3>E-mail de convite para ${esc(c.nome)}</h3>
    <p class="mini" style="margin:-8px 0 14px">Copie a mensagem formatada e cole no Outlook.
      O botão abaixo já leva a formatação junto, não vira texto sem graça.</p>
    <div class="linha-campos" style="margin-bottom:14px">
      <div><label class="lab">Para</label>
        <input type="text" id="em-para" readonly value="${esc(c.email)}"></div>
      <div><label class="lab">Assunto</label>
        <input type="text" id="em-assunto" readonly value="${esc(ASSUNTO_CONVITE)}"></div>
    </div>
    <label class="lab">Prévia</label>
    <div class="previa-email" id="em-corpo">${emailHtml(c)}</div>
    <div class="rodape">
      <button class="bt" id="em-copiar">Copiar e-mail formatado</button>
      <button class="bt sec" id="em-outlook">Abrir no Outlook</button>
      <button class="bt sec direita" id="em-fechar">Fechar</button>
    </div>
    <div id="em-msg" style="margin-top:12px"></div>`);

  el('em-fechar').onclick = () => el('dlg').close();

  el('em-copiar').onclick = async () => {
    const html = emailHtml(c), texto = emailTexto(c);
    let ok = false;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([texto], { type: 'text/plain' })
      })]);
      ok = true;
    } catch (e) {
      // Plano B: seleciona a prévia na tela e copia com a formatação
      try {
        const faixa = document.createRange();
        faixa.selectNodeContents(el('em-corpo'));
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(faixa);
        ok = document.execCommand('copy');
        sel.removeAllRanges();
      } catch (e2) { ok = false; }
    }
    mostrarMsg('em-msg', ok ? 'ok' : 'erro', ok
      ? 'Copiado. Abra um e-mail novo no Outlook, cole com Ctrl+V e envie para ' + c.email + '.'
      : 'Não consegui copiar sozinha. Selecione a prévia acima com o mouse e use Ctrl+C.');
  };

  el('em-outlook').onclick = () => {
    const url = 'mailto:' + encodeURIComponent(c.email)
      + '?subject=' + encodeURIComponent(ASSUNTO_CONVITE)
      + '&body=' + encodeURIComponent(emailTexto(c));
    window.location.href = url;
    mostrarMsg('em-msg', 'ok', 'O Outlook abre com a versão em texto. Para a versão bonita, use "Copiar e-mail formatado".');
  };
}
function renderPerfis() {
  el('lista-perfis').innerHTML = `
  <div class="legenda-niveis">
    <div><b>BP</b><span>Vê e edita apenas os próprios lançamentos, mais os que marcam ela com @</span></div>
    <div><b>Visão completa</b><span>Vê e edita os lançamentos de todas. Não mexe em acessos</span></div>
    <div><b>Administrador</b><span>Tudo da visão completa, mais cadastrar, convidar e mudar nível</span></div>
  </div>
  <div class="tabela-wrap"><table>
    <thead><tr><th>Nome</th><th style="width:200px">E-mail</th><th style="width:168px">Nível de acesso</th>
      <th style="width:92px">Registros</th><th style="width:92px">Situação</th><th style="width:106px"></th></tr></thead>
    <tbody>${perfis.map(u => `<tr>
      <td data-r="Nome"><div><b>${esc(u.nome)}</b><div class="mini">${esc(u.cargo)} · ${esc(u.unidade)}</div></div></td>
      <td class="mini" data-r="E-mail">${esc(u.email)}</td>
      <td data-r="Nível">${u.id === perfil.id
        ? `<span class="tag ${papelDe(u.papel).cor}">${papelDe(u.papel).rotulo}</span>
           <div class="mini" style="margin-top:3px">é você</div>`
        : `<select data-nivel="${u.id}">${Object.keys(PAPEIS).map(k =>
            `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${PAPEIS[k].rotulo}</option>`).join('')}</select>`}</td>
      <td class="num" data-r="Registros">${registros.filter(r => r.usuario_id === u.id).length}</td>
      <td data-r="Situação"><span class="tag ${u.ativo ? 't-es' : 't-neu'}">${u.ativo ? 'Ativa' : 'Pausada'}</span></td>
      <td>${u.id === perfil.id ? '' :
        `<button class="bt sec peq" data-ativo="${u.id}">${u.ativo ? 'Pausar' : 'Reativar'}</button>`}</td>
    </tr>`).join('')}</tbody></table></div>`;

  document.querySelectorAll('[data-nivel]').forEach(s => s.onchange = async () => {
    const u = perfis.find(x => x.id === s.dataset.nivel);
    const anterior = u.papel;
    const novo = s.value;
    if (novo === 'admin') {
      confirmar('Tornar ' + u.nome + ' administradora?',
        'Ela passa a poder cadastrar pessoas, convidar e mudar o nível de acesso das outras, inclusive o seu.',
        () => atualizarPerfil(u, { papel: novo }),
        () => { s.value = anterior; });
      return;
    }
    await atualizarPerfil(u, { papel: novo });
  });
  document.querySelectorAll('[data-ativo]').forEach(b => b.onclick = async () => {
    const u = perfis.find(x => x.id === b.dataset.ativo);
    await atualizarPerfil(u, { ativo: !u.ativo });
  });
}
async function atualizarPerfil(u, mudanca) {
  const { error } = await sb.from('bp_perfis').update(mudanca).eq('id', u.id);
  if (error) return mostrarMsg('g-msg', 'erro', traduzErro(error));
  Object.assign(u, mudanca);
  mostrarMsg('g-msg', 'ok', u.nome + ' atualizada.');
  renderPerfis();
}

/* =====================================================================
   12. Exportação CSV
   ===================================================================== */
function csvEscape(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
function exportarCsv(lista, nome) {
  const cab = ['Data', 'BP', 'Processo', 'Atividade', 'Nível', 'Gera valor', 'Área', 'Minutos', 'Horas', 'Situação', 'Observações'];
  const linhas = lista.map(r => [
    dataBr(r.data), nomeDe(r.usuario_id), r.processo, r.atividade, r.nivel, r.gera_valor,
    r.area || '', r.minutos, horas(r.minutos), r.status, r.obs || ''
  ].map(csvEscape).join(';'));
  // BOM na frente para o Excel abrir os acentos certos
  const csv = '﻿' + cab.map(csvEscape).join(';') + '\r\n' + linhas.join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome + '-' + hojeIso() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* =====================================================================
   13. Peças de interface
   ===================================================================== */
function kpi(rot, val, pe, destaque) {
  return `<div class="kpi${destaque ? ' destaque' : ''}"><div class="rot">${rot}</div>
    <div class="val num">${val}</div><div class="pe">${pe || ''}</div></div>`;
}
function abrirDlg(html) { el('dlg-corpo').innerHTML = html; el('dlg').showModal(); }
function aviso(txt) {
  abrirDlg(`<h3>${esc(txt)}</h3><div class="acoes"><button class="bt" id="dlg-fechar">Entendi</button></div>`);
  el('dlg-fechar').onclick = () => el('dlg').close();
}
function confirmar(titulo, texto, ok, aoCancelar) {
  abrirDlg(`<h3>${esc(titulo)}</h3><p class="mini" style="margin:-8px 0 16px">${esc(texto)}</p>
    <div class="acoes"><button class="bt" id="dlg-ok">Confirmar</button>
    <button class="bt sec" id="dlg-fechar">Cancelar</button></div>`);
  el('dlg-fechar').onclick = () => { el('dlg').close(); if (aoCancelar) aoCancelar(); };
  el('dlg').onclose = () => { if (aoCancelar) aoCancelar(); };
  el('dlg-ok').onclick = () => { el('dlg').onclose = null; el('dlg').close(); ok(); };
}
function alternarTema() {
  const atual = document.documentElement.getAttribute('data-tema');
  const escuro = atual ? atual === 'escuro' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const novo = escuro ? 'claro' : 'escuro';
  document.documentElement.setAttribute('data-tema', novo);
  try { localStorage.setItem(CHAVE_TEMA, novo); } catch (e) { }
}

const tip = el('tip');
document.addEventListener('mouseover', e => {
  const alvo = e.target.closest('[data-tip]');
  if (!alvo) { tip.style.opacity = 0; return; }
  tip.innerHTML = alvo.getAttribute('data-tip');
  tip.style.opacity = 1;
});
document.addEventListener('mousemove', e => {
  if (tip.style.opacity == 0) return;
  tip.style.left = Math.max(8, Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 10)) + 'px';
  tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 12) + 'px';
});

// Girar o celular muda a escala dos gráficos. Redesenha só o Painel,
// para não apagar um formulário que a pessoa esteja preenchendo.
let eraEstreito = estreito();
let esperaResize = null;
window.addEventListener('resize', () => {
  clearTimeout(esperaResize);
  esperaResize = setTimeout(() => {
    if (estreito() === eraEstreito) return;
    eraEstreito = estreito();
    if (perfil && aba === 'painel') ir('painel');
  }, 250);
});

/* =====================================================================
   14. Utilidades
   ===================================================================== */
function isoLocal(d) { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); }
function hojeIso() { return isoLocal(new Date()); }
function dataBr(s) { if (!s) return ''; const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; }
function horas(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return m + 'min';
  return m === 0 ? h + 'h' : h + 'h' + String(m).padStart(2, '0');
}
function nfmt(n) { return Number(n).toLocaleString('pt-BR'); }
function cortar(t, n) { return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function iniciais(nome) {
  const p = String(nome).trim().split(/\s+/);
  return ((p[0] || '')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function noPeriodo(data, p) {
  if (p === 'tudo') return true;
  if (p === 'mes') return data.slice(0, 7) === hojeIso().slice(0, 7);
  const lim = new Date(hojeIso()); lim.setDate(lim.getDate() - Number(p));
  return new Date(data) >= lim;
}
