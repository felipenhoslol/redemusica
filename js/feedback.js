// Feedback box: any signed-in user sends a message that lands in the admin panel.
import { catLogoHtml, setCatMood } from './logo.js';
import * as sb from './supabase.js';
import { auth } from './auth.js';

const MIN_CHARS = 10;
const MAX_CHARS = 2000;
const COOLDOWN_MS = 30 * 1000;
const LAST_SENT_KEY = 'rmsn_feedback_last_sent';

const CATEGORIES = [
  { id: 'bug', label: 'Problema' },
  { id: 'sugestao', label: 'Sugestão' },
  { id: 'elogio', label: 'Elogio' },
  { id: 'outro', label: 'Outro' }
];

function lastSentAt() {
  try { return Number(localStorage.getItem(LAST_SENT_KEY)) || 0; } catch { return 0; }
}

/**
 * Open the feedback modal.
 * @param {string} page tab the user was on (sent along to give the admin context)
 */
export function openFeedbackModal(page = '') {
  const body = document.getElementById('feedback-modal-body');
  if (!body) return;

  const canSend = auth.mode === 'signed-in';
  body.innerHTML = `
    <form class="feedback-form" novalidate>
      <p style="margin:0;color:var(--muted);font-size:var(--fs-detail);line-height:1.5;">
        Encontrou um problema ou teve uma ideia? Sua mensagem vai direto para a equipe.
      </p>
      <fieldset class="feedback-cats">
        <legend>Sobre o quê?</legend>
        ${CATEGORIES.map((c, i) => `
          <label><input type="radio" name="feedback-cat" value="${c.id}" ${i === 1 ? 'checked' : ''}>${c.label}</label>`).join('')}
      </fieldset>
      <div>
        <label class="form-label" for="feedback-message">Mensagem</label>
        <textarea id="feedback-message" class="doodle-input" maxlength="${MAX_CHARS}" placeholder="Conte o que aconteceu ou o que você gostaria de ver."></textarea>
      </div>
      <div class="feedback-count" id="feedback-count">0 / ${MAX_CHARS}</div>
      ${canSend ? '' : `<div class="form-error">No modo local o feedback não é enviado. Configure o Supabase e entre com sua conta para enviar.</div>`}
      <div class="form-error" id="feedback-error" role="alert" hidden></div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button type="button" class="doodle-btn doodle-btn-ghost" onclick="closeDoodleModal('feedback-modal')">Cancelar</button>
        <button type="submit" class="doodle-btn doodle-btn-primary" id="feedback-submit" ${canSend ? '' : 'disabled'}>Enviar</button>
      </div>
    </form>`;

  const form = body.querySelector('form');
  const textarea = body.querySelector('#feedback-message');
  const counter = body.querySelector('#feedback-count');
  const errorEl = body.querySelector('#feedback-error');
  const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = !msg; };

  textarea.addEventListener('input', () => {
    const n = textarea.value.trim().length;
    counter.textContent = `${n} / ${MAX_CHARS}`;
    counter.dataset.over = String(n > MAX_CHARS);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const message = textarea.value.trim();
    if (message.length < MIN_CHARS) { showError(`Escreva pelo menos ${MIN_CHARS} caracteres.`); textarea.focus(); return; }
    const wait = COOLDOWN_MS - (Date.now() - lastSentAt());
    if (wait > 0) { showError(`Você acabou de enviar um feedback. Tente de novo em ${Math.ceil(wait / 1000)} s.`); return; }

    const submit = body.querySelector('#feedback-submit');
    submit.disabled = true;
    submit.textContent = 'Enviando…';
    try {
      await sb.sendFeedback({
        category: form.querySelector('input[name="feedback-cat"]:checked')?.value || 'outro',
        message,
        page: String(page).slice(0, 40)
      });
      try { localStorage.setItem(LAST_SENT_KEY, String(Date.now())); } catch { /* optional */ }
      setCatMood('happy', 1600);
      body.innerHTML = `
        <div class="feedback-done">
          ${catLogoHtml({ mood: 'happy' })}
          <h4>Recebido, obrigado!</h4>
          <p>A equipe lê todas as mensagens.</p>
          <button type="button" class="doodle-btn doodle-btn-primary" onclick="closeDoodleModal('feedback-modal')">Fechar</button>
        </div>`;
    } catch (err) {
      showError(err.message || 'Não foi possível enviar agora. Tente de novo.');
      submit.disabled = false;
      submit.textContent = 'Enviar';
    }
  });

  window.openDoodleModal('feedback-modal');
  setTimeout(() => textarea.focus(), 50);
}
