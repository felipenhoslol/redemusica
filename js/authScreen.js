// Login / sign-up / password recovery screen shown before the app boots.
import { creditHtml } from './credit.js';
import { catLogoHtml } from './logo.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';
import * as sb from './supabase.js';
import { loginWithPassword, enterLocalMode, logout } from './auth.js';

const HANDLE_RE = /^[a-z0-9_.]{2,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let root = null;
let onDone = null;
let handleCheckTimer = null;
let handleCheckSeq = 0;
let lastMode = null;

/**
 * Show the auth screen. `done` runs once the user is signed in (or chose local mode).
 * @param {'login'|'signup'|'forgot'|'recovery'|'banned'} mode
 * @param {() => void} done
 */
export function showAuthScreen(mode, done) {
  onDone = done;
  root = document.getElementById('auth-screen');
  root.hidden = false;
  document.body.classList.add('auth-open');
  render(mode);
}

function hideAuthScreen() {
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('auth-open');
}

function setCat(mood) {
  root.querySelector('.auth-cat .cat')?.setAttribute('data-mood', mood);
}

// ──────────────────────────────────────────
// RENDER
// ──────────────────────────────────────────

function render(mode) {
  const configured = sb.isSupabaseConfigured();
  root.innerHTML = `
    <div class="auth-shell">
      <section class="auth-brand" aria-hidden="true">
        <div class="auth-cat">${catLogoHtml({ mood: mode === 'banned' ? 'alert' : (mode === 'welcome' || mode === 'confirm-sent') ? 'happy' : 'idle' })}</div>
        <h1 class="auth-title">rede de música <span>sem nome</span></h1>
        <p class="auth-tagline">Compartilhe o que está tocando, responda desafios e descubra o que seus amigos ouvem.</p>
      </section>

      <section class="auth-card sketch" aria-live="polite">
        ${!configured && mode !== 'banned' ? localNoticeHtml() : ''}
        ${formHtml(mode, configured)}
      </section>
      ${creditHtml('auth-credit')}
    </div>`;

  bindForm(mode);
  root.querySelector('input')?.focus();

  // Entrar ⇄ Criar conta: indicator slides and the form enters from that side
  const tabModes = ['login', 'signup'];
  if (tabModes.includes(mode)) {
    mountTabIndicator(root.querySelector('.auth-tabs'), { key: 'auth' });
    if (tabModes.includes(lastMode) && lastMode !== mode) {
      animatePanel(root.querySelector('.auth-form'), tabDirection(tabModes.indexOf(lastMode), tabModes.indexOf(mode)));
    }
  }
  lastMode = mode;
}

function localNoticeHtml() {
  return `
    <div class="auth-notice" role="note">
      <b>Servidor ainda não configurado.</b>
      Preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> em <code>js/config.js</code> para ativar contas de verdade.
      <button type="button" class="auth-link" data-action="local">Entrar no modo local (demonstração)</button>
    </div>`;
}

const field = ({ id, label, type = 'text', autocomplete, hint = '', extra = '' }) => `
  <div class="auth-field">
    <label for="${id}">${label}</label>
    <div class="auth-input-wrap">
      <input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" ${extra} aria-describedby="${id}-msg">
      ${type === 'password' ? `<button type="button" class="auth-eye" data-toggle="${id}" aria-label="Mostrar senha">mostrar</button>` : ''}
    </div>
    <div class="auth-msg" id="${id}-msg">${hint}</div>
  </div>`;

function formHtml(mode, configured) {
  const disabled = configured ? '' : 'disabled';

  if (mode === 'banned') {
    return `
      <h2 class="auth-heading">Conta suspensa</h2>
      <p class="auth-sub">Sua conta foi suspensa por um administrador. Se acha que foi um engano, responda ao e-mail de cadastro.</p>
      <button type="button" class="auth-submit" data-action="logout">Sair</button>`;
  }

  if (mode === 'confirm-sent') {
    return `
      <h2 class="auth-heading">Conta criada! Confira seu e-mail</h2>
      <p class="auth-sub">Obrigado por entrar na rede. Enviamos um link de confirmação: depois de confirmar, volte aqui e entre com seu e-mail e senha.</p>
      <button type="button" class="auth-submit" data-go="login">Ir para o login</button>`;
  }

  // Thank-you screen right after creating the account
  if (mode === 'welcome') {
    return `
      <h2 class="auth-heading">Conta criada. Obrigado por entrar!</h2>
      <p class="auth-sub">Para começar: siga quem você conhece, poste o que está ouvindo e responda um desafio para ver com quem você tem mais sintonia.</p>
      <button type="button" class="auth-submit" data-action="start">Começar</button>`;
  }

  if (mode === 'forgot') {
    return `
      <h2 class="auth-heading">Recuperar senha</h2>
      <p class="auth-sub">Mandamos um link para você criar uma senha nova.</p>
      <form class="auth-form" novalidate>
        ${field({ id: 'auth-email', label: 'E-mail', type: 'email', autocomplete: 'email' })}
        <div class="auth-alert" role="alert" hidden></div>
        <button type="submit" class="auth-submit" ${disabled}>Enviar link</button>
      </form>
      <p class="auth-switch"><button type="button" class="auth-link" data-go="login">Voltar para o login</button></p>`;
  }

  if (mode === 'recovery') {
    return `
      <h2 class="auth-heading">Criar senha nova</h2>
      <form class="auth-form" novalidate>
        ${field({ id: 'auth-password', label: 'Senha nova', type: 'password', autocomplete: 'new-password', hint: 'Pelo menos 8 caracteres, com letras e números.' })}
        ${field({ id: 'auth-password2', label: 'Repita a senha', type: 'password', autocomplete: 'new-password' })}
        <div class="auth-alert" role="alert" hidden></div>
        <button type="submit" class="auth-submit" ${disabled}>Salvar senha</button>
      </form>`;
  }

  const isSignup = mode === 'signup';
  return `
    <div class="auth-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${!isSignup}" data-go="login">Entrar</button>
      <button type="button" role="tab" aria-selected="${isSignup}" data-go="signup">Criar conta</button>
    </div>
    <form class="auth-form" novalidate>
      ${isSignup ? `
        ${field({ id: 'auth-name', label: 'Nome', autocomplete: 'name', extra: 'maxlength="60"' })}
        <div class="auth-field">
          <label for="auth-handle">Nome de usuário</label>
          <div class="auth-input-wrap auth-handle-wrap">
            <span class="auth-at" aria-hidden="true">@</span>
            <input id="auth-handle" name="auth-handle" type="text" autocomplete="username" maxlength="24" spellcheck="false" aria-describedby="auth-handle-msg">
          </div>
          <div class="auth-msg" id="auth-handle-msg">Letras minúsculas, números, "_" ou ".". É como os outros te encontram.</div>
        </div>` : ''}
      ${field({ id: 'auth-email', label: 'E-mail', type: 'email', autocomplete: 'email' })}
      ${field({ id: 'auth-password', label: 'Senha', type: 'password', autocomplete: isSignup ? 'new-password' : 'current-password', hint: isSignup ? 'Pelo menos 8 caracteres, com letras e números.' : '' })}
      ${isSignup ? `<div class="auth-strength" aria-hidden="true"><i></i><i></i><i></i></div>` : ''}
      ${isSignup ? field({ id: 'auth-password2', label: 'Repita a senha', type: 'password', autocomplete: 'new-password' }) : ''}
      ${!isSignup ? `<div class="auth-row-end"><button type="button" class="auth-link" data-go="forgot">Esqueci a senha</button></div>` : ''}
      ${isSignup ? `<p class="auth-legal">Ao criar a conta, você concorda com os <a href="termos.html" target="_blank" rel="noopener">Termos de uso</a> e a <a href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>.</p>` : ''}
      <div class="auth-alert" role="alert" hidden></div>
      <button type="submit" class="auth-submit" ${disabled}>${isSignup ? 'Criar conta grátis' : 'Entrar'}</button>
    </form>
    <p class="auth-switch">${isSignup
      ? 'Já tem conta? <button type="button" class="auth-link" data-go="login">Entrar</button>'
      : 'Ainda não tem conta? <button type="button" class="auth-link" data-go="signup">Criar conta grátis</button>'}</p>`;
}

// ──────────────────────────────────────────
// VALIDATION
// ──────────────────────────────────────────

function setMsg(id, text, kind = 'error') {
  const el = root.querySelector(`#${id}-msg`);
  const input = root.querySelector(`#${id}`);
  if (el) { el.textContent = text; el.dataset.kind = text ? kind : ''; }
  if (input) input.setAttribute('aria-invalid', kind === 'error' && text ? 'true' : 'false');
}

function setAlert(text) {
  const el = root.querySelector('.auth-alert');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
  if (text) setCat('alert');
}

function passwordScore(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (pw.length >= 12 || /[^a-zA-Z0-9]/.test(pw)) score++;
  return score;
}

function validate(mode) {
  const v = (id) => root.querySelector(`#${id}`)?.value ?? '';
  let ok = true;
  const fail = (id, msg) => { setMsg(id, msg); ok = false; };

  if (mode === 'signup') {
    const name = v('auth-name').trim();
    if (!name) fail('auth-name', 'Digite seu nome.');
    else setMsg('auth-name', '');
    const handle = v('auth-handle').trim().toLowerCase();
    if (!HANDLE_RE.test(handle)) fail('auth-handle', 'Use de 2 a 24 caracteres: letras minúsculas, números, "_" ou ".".');
  }
  if (mode !== 'recovery') {
    const email = v('auth-email').trim();
    if (!EMAIL_RE.test(email)) fail('auth-email', 'Digite um e-mail válido.');
    else setMsg('auth-email', '');
  }
  if (mode === 'login') {
    if (!v('auth-password')) fail('auth-password', 'Digite sua senha.');
    else setMsg('auth-password', '');
  }
  if (mode === 'signup' || mode === 'recovery') {
    const pw = v('auth-password');
    if (passwordScore(pw) < 2) fail('auth-password', 'Use pelo menos 8 caracteres, com letras e números.');
    else setMsg('auth-password', '');
    if (v('auth-password2') !== pw) fail('auth-password2', 'As senhas não são iguais.');
    else setMsg('auth-password2', '');
  }
  return ok;
}

// ──────────────────────────────────────────
// EVENTS
// ──────────────────────────────────────────

function bindForm(mode) {
  root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => render(b.dataset.go)));
  root.querySelector('[data-action="local"]')?.addEventListener('click', () => {
    enterLocalMode();
    hideAuthScreen();
    onDone?.();
  });
  root.querySelector('[data-action="logout"]')?.addEventListener('click', () => logout());
  root.querySelector('[data-action="start"]')?.addEventListener('click', () => { hideAuthScreen(); onDone?.(); });

  root.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const input = root.querySelector(`#${btn.dataset.toggle}`);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'ocultar' : 'mostrar';
    btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  }));

  // The cat politely closes its eyes while you type a password
  root.querySelectorAll('input[type="password"]').forEach(input => {
    input.addEventListener('focus', () => setCat('paused'));
    input.addEventListener('blur', () => setCat('idle'));
  });

  const pw = root.querySelector('#auth-password');
  const meter = root.querySelector('.auth-strength');
  if (pw && meter) {
    pw.addEventListener('input', () => { meter.dataset.score = String(passwordScore(pw.value)); });
  }

  const handle = root.querySelector('#auth-handle');
  if (handle) {
    handle.addEventListener('input', () => {
      handle.value = handle.value.toLowerCase().replace(/^@/, '').replace(/\s/g, '');
      clearTimeout(handleCheckTimer);
      const value = handle.value;
      if (!HANDLE_RE.test(value)) {
        setMsg('auth-handle', value ? 'Use de 2 a 24 caracteres: letras minúsculas, números, "_" ou ".".' : 'Letras minúsculas, números, "_" ou ".". É como os outros te encontram.', value ? 'error' : 'hint');
        return;
      }
      if (!sb.isSupabaseConfigured()) { setMsg('auth-handle', `@${value}`, 'ok'); return; }
      const seq = ++handleCheckSeq;
      setMsg('auth-handle', 'Verificando…', 'hint');
      handleCheckTimer = setTimeout(async () => {
        try {
          const free = await sb.isHandleAvailable(value);
          if (seq !== handleCheckSeq) return;
          setMsg('auth-handle', free ? `@${value} está livre` : `@${value} já está em uso`, free ? 'ok' : 'error');
        } catch {
          if (seq === handleCheckSeq) setMsg('auth-handle', '', 'hint');
        }
      }, 400);
    });
  }

  const form = root.querySelector('.auth-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setAlert('');
    if (!validate(mode)) { setCat('alert'); return; }

    const submit = form.querySelector('.auth-submit');
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Aguarde…';
    const v = (id) => root.querySelector(`#${id}`)?.value ?? '';

    try {
      if (mode === 'login') {
        const state = await loginWithPassword(v('auth-email').trim(), v('auth-password'));
        if (state.mode === 'banned') { render('banned'); return; }
        setCat('happy');
        setTimeout(() => { hideAuthScreen(); onDone?.(); }, 450);
      } else if (mode === 'signup') {
        const handleValue = v('auth-handle').trim().toLowerCase();
        if (!(await sb.isHandleAvailable(handleValue))) {
          setMsg('auth-handle', `@${handleValue} já está em uso`);
          throw new sb.AppError('duplicate', 'Escolha outro nome de usuário.');
        }
        const { needsConfirmation } = await sb.signUp({
          name: v('auth-name').trim(),
          handle: handleValue,
          email: v('auth-email').trim(),
          password: v('auth-password')
        });
        if (needsConfirmation) { render('confirm-sent'); return; }
        const state = await loginWithPassword(v('auth-email').trim(), v('auth-password'));
        if (state.mode === 'signed-in') render('welcome');
        else hideAuthScreen();
      } else if (mode === 'forgot') {
        await sb.sendPasswordReset(v('auth-email').trim());
        form.outerHTML = `<p class="auth-sub">Se existir uma conta com esse e-mail, o link chega em alguns minutos. Confira também o spam.</p>`;
        setCat('happy');
      } else if (mode === 'recovery') {
        await sb.updatePassword(v('auth-password'));
        history.replaceState(null, '', window.location.pathname);
        setCat('happy');
        setTimeout(() => window.location.reload(), 600);
      }
    } catch (err) {
      setAlert(err.message || 'Algo deu errado. Tente de novo.');
    } finally {
      if (submit.isConnected) { submit.disabled = false; submit.textContent = label; }
    }
  });
}

