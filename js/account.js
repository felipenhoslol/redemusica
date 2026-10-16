// Account settings: shows the sign-in e-mail and lets the person change their e-mail or password.
// The current password is checked first, so an unattended open session can't be used to take over the account.
import { esc } from './dom.js';
import { ICONS } from './icons.js';
import * as sb from './supabase.js';
import { auth } from './auth.js';

const MIN_LENGTH = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function openAccountSettings() {
  document.getElementById('account-dialog')?.remove();
  const email = auth.user?.email || '';
  const pendingEmail = auth.user?.new_email || '';
  const root = document.createElement('div');
  root.id = 'account-dialog';
  root.className = 'app-dialog';
  root.innerHTML = `
    <div class="app-dialog-scrim" data-close></div>
    <div class="app-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div class="app-dialog-head">
        <button type="button" class="photo-editor-icon" data-close aria-label="Fechar">${ICONS.close}</button>
        <h2 id="account-title">Conta</h2>
      </div>
      <div class="app-dialog-body">
        <div class="account-email">
          <span>E-mail de acesso</span>
          <strong>${esc(email || 'Modo local, sem conta')}</strong>
          ${pendingEmail ? `<p class="account-hint">Troca para <strong>${esc(pendingEmail)}</strong> aguardando confirmação no e-mail.</p>` : ''}
        </div>
        ${email ? `
        <form id="acc-email-form" novalidate>
          <fieldset class="account-fieldset">
            <legend>Mudar e-mail</legend>
            <label class="form-label" for="acc-new-email">Novo e-mail</label>
            <input id="acc-new-email" class="doodle-input" type="email" autocomplete="email" inputmode="email" required>
            <label class="form-label" for="acc-email-pass">Senha atual</label>
            <input id="acc-email-pass" class="doodle-input" type="password" autocomplete="current-password" required>
            <p class="account-hint">Mandamos um link de confirmação; o e-mail só muda depois que você abrir o link.</p>
            <p class="account-error" role="alert" hidden></p>
            <button type="submit" class="doodle-btn doodle-btn-primary account-submit">Mudar e-mail</button>
          </fieldset>
        </form>
        <form id="acc-pass-form" novalidate>
          <fieldset class="account-fieldset">
            <legend>Mudar senha</legend>
            <label class="form-label" for="acc-current">Senha atual</label>
            <input id="acc-current" class="doodle-input" type="password" autocomplete="current-password" required>
            <label class="form-label" for="acc-new">Nova senha</label>
            <input id="acc-new" class="doodle-input" type="password" autocomplete="new-password" minlength="${MIN_LENGTH}" required aria-describedby="acc-hint">
            <p id="acc-hint" class="account-hint">Pelo menos ${MIN_LENGTH} caracteres.</p>
            <label class="form-label" for="acc-confirm">Repita a nova senha</label>
            <input id="acc-confirm" class="doodle-input" type="password" autocomplete="new-password" required>
            <p class="account-error" role="alert" hidden></p>
            <button type="submit" class="doodle-btn doodle-btn-primary account-submit">Mudar senha</button>
          </fieldset>
        </form>` : ''}
      </div>
    </div>`;
  document.body.appendChild(root);

  const errorIn = (form) => (msg, field) => {
    const el = form.querySelector('.account-error');
    el.textContent = msg;
    el.hidden = !msg;
    if (field) root.querySelector(field)?.focus();
  };

  const close = () => {
    document.removeEventListener('keydown', onKey);
    root.classList.remove('open');
    setTimeout(() => root.remove(), 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });

  // Runs a form action with its button busy; the current password is checked first
  const withBusy = async (form, busyText, task) => {
    const btn = form.querySelector('.account-submit');
    const idle = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText;
    try { await task(); }
    finally { btn.disabled = false; btn.textContent = idle; }
  };

  const emailForm = root.querySelector('#acc-email-form');
  emailForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const showError = errorIn(emailForm);
    const next = root.querySelector('#acc-new-email').value.trim().toLowerCase();
    const current = root.querySelector('#acc-email-pass').value;
    if (!EMAIL_RE.test(next)) return showError('Digite um e-mail válido.', '#acc-new-email');
    if (next === email.toLowerCase()) return showError('Esse já é o seu e-mail.', '#acc-new-email');
    if (!current) return showError('Digite sua senha atual.', '#acc-email-pass');
    showError('');
    await withBusy(emailForm, 'Enviando…', async () => {
      try { await sb.signIn({ email, password: current }); }
      catch { showError('Senha atual incorreta.', '#acc-email-pass'); return; }
      try {
        await sb.updateEmail(next);
        close();
        window.showDoodleToast?.(`Enviamos um link de confirmação para ${next}. Confira também o e-mail atual.`);
      } catch (err) {
        showError(err?.message || 'Não foi possível mudar o e-mail. Tente de novo.');
      }
    });
  });

  const passForm = root.querySelector('#acc-pass-form');
  passForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const showError = errorIn(passForm);
    const current = root.querySelector('#acc-current').value;
    const next = root.querySelector('#acc-new').value;
    const confirm = root.querySelector('#acc-confirm').value;
    if (!current) return showError('Digite sua senha atual.', '#acc-current');
    if (next.length < MIN_LENGTH) return showError(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`, '#acc-new');
    if (next !== confirm) return showError('As duas senhas novas não são iguais.', '#acc-confirm');
    if (next === current) return showError('A nova senha é igual à atual. Escolha outra.', '#acc-new');
    showError('');
    await withBusy(passForm, 'Mudando…', async () => {
      try { await sb.signIn({ email, password: current }); }
      catch { showError('Senha atual incorreta.', '#acc-current'); return; }
      try {
        await sb.updatePassword(next);
        close();
        window.showDoodleToast?.('Senha alterada.');
      } catch (err) {
        showError(err?.message || 'Não foi possível mudar a senha. Tente de novo.');
      }
    });
  });

  requestAnimationFrame(() => {
    root.classList.add('open');
    (root.querySelector('#acc-new-email') || root.querySelector('[data-close]'))?.focus({ preventScroll: true });
  });
}
