// Account settings: shows the sign-in e-mail and lets the person change their password.
// The current password is checked first, so an unattended open session can't be used to take over the account.
import { esc } from './dom.js';
import { ICONS } from './icons.js';
import * as sb from './supabase.js';
import { auth } from './auth.js';

const MIN_LENGTH = 8;

export function openAccountSettings() {
  document.getElementById('account-dialog')?.remove();
  const email = auth.user?.email || '';
  const root = document.createElement('div');
  root.id = 'account-dialog';
  root.className = 'app-dialog';
  root.innerHTML = `
    <div class="app-dialog-scrim" data-close></div>
    <form class="app-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="account-title" novalidate>
      <div class="app-dialog-head">
        <button type="button" class="photo-editor-icon" data-close aria-label="Fechar">${ICONS.close}</button>
        <h2 id="account-title">Conta</h2>
      </div>
      <div class="app-dialog-body">
        <div class="account-email">
          <span>E-mail de acesso</span>
          <strong>${esc(email || 'Modo local, sem conta')}</strong>
        </div>
        ${email ? `
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
        </fieldset>` : ''}
      </div>
    </form>`;
  document.body.appendChild(root);

  const form = root.querySelector('form');
  const errorEl = root.querySelector('.account-error');
  const showError = (msg, field) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.hidden = !msg;
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!email) return;
    const current = root.querySelector('#acc-current').value;
    const next = root.querySelector('#acc-new').value;
    const confirm = root.querySelector('#acc-confirm').value;
    if (!current) return showError('Digite sua senha atual.', '#acc-current');
    if (next.length < MIN_LENGTH) return showError(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`, '#acc-new');
    if (next !== confirm) return showError('As duas senhas novas não são iguais.', '#acc-confirm');
    if (next === current) return showError('A nova senha é igual à atual. Escolha outra.', '#acc-new');

    const btn = root.querySelector('.account-submit');
    btn.disabled = true;
    btn.textContent = 'Mudando…';
    showError('');
    try {
      try { await sb.signIn({ email, password: current }); }
      catch { showError('Senha atual incorreta.', '#acc-current'); return; }
      await sb.updatePassword(next);
      close();
      window.showDoodleToast?.('Senha alterada.');
    } catch (err) {
      showError(err?.message || 'Não foi possível mudar a senha. Tente de novo.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mudar senha';
    }
  });

  requestAnimationFrame(() => {
    root.classList.add('open');
    (root.querySelector('#acc-current') || root.querySelector('[data-close]'))?.focus({ preventScroll: true });
  });
}
