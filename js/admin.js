// Admin panel: feedback inbox, daily lyrics schedule, users and admins.
// Access is enforced by Supabase RLS (is_admin()); this UI only hides what the server would refuse.
import { esc } from './dom.js';
import * as sb from './supabase.js';
import { auth } from './auth.js';
import { showToast } from './profile.js';
import { toISODate, validateExcerpt, clearLyricCache, MAX_EXCERPT_CHARS } from './dailyLyric.js';
import { mountTabIndicator, tabDirection, animatePanel } from './tabs.js';

const STATUS_LABEL = { novo: 'Novo', lido: 'Lido', resolvido: 'Resolvido' };
const CATEGORY_LABEL = { bug: 'Problema', sugestao: 'Sugestão', elogio: 'Elogio', outro: 'Outro' };

const state = {
  section: 'feedback',
  feedback: [],
  feedbackFilter: { status: 'todos', category: 'todas' },
  lyrics: [],
  editingLyric: null,
  profiles: [],
  admins: [],
  userQuery: '',
  editingUserId: null
};

let root = null;
let bound = false;

const fmtDateTime = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Render the admin tab.
 * @param {HTMLElement} container
 */
export async function renderAdminTab(container) {
  if (!container) return;
  root = container;
  if (!bound) { bindEvents(); bound = true; }

  if (!sb.isSupabaseConfigured() || !auth.isAdmin) {
    root.innerHTML = `<div class="admin-wrap"><div class="admin-empty">O painel de admin precisa do Supabase configurado e de uma conta admin.</div></div>`;
    return;
  }
  renderShell();
  await loadSection(state.section);
}

function renderShell() {
  const tabs = [
    ['feedback', 'Feedback'],
    ['lyrics', 'Letras do dia'],
    ['users', 'Usuários']
  ];
  root.innerHTML = `
    <div class="admin-wrap">
      <div class="page-header">
        <div>
          <div class="page-title">Painel de admin</div>
          <div class="page-sub">Logado como ${esc(auth.user?.email || '')}</div>
        </div>
      </div>
      <div class="admin-tabs" role="tablist">
        ${tabs.map(([id, label]) => `<button type="button" role="tab" data-action="section" data-section="${id}" aria-selected="${state.section === id}">${label}${id === 'feedback' ? '<span class="admin-tab-count" id="admin-new-count"></span>' : ''}</button>`).join('')}
      </div>
      <div id="admin-section" aria-live="polite"></div>
    </div>`;
  mountTabIndicator(root.querySelector('.admin-tabs'), { key: 'admin' });
}

const SECTION_ORDER = ['feedback', 'lyrics', 'users'];

async function loadSection(section) {
  const direction = tabDirection(SECTION_ORDER.indexOf(state.section), SECTION_ORDER.indexOf(section));
  state.section = section;
  root.querySelectorAll('[data-action="section"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.section === section)));
  const el = root.querySelector('#admin-section');
  el.innerHTML = `<div class="admin-empty">Carregando…</div>`;
  try {
    if (section === 'feedback') {
      state.feedback = await sb.adminListFeedback(state.feedbackFilter);
      renderFeedback();
    } else if (section === 'lyrics') {
      state.lyrics = await sb.adminListLyrics();
      renderLyrics();
    } else {
      [state.profiles, state.admins] = await Promise.all([sb.adminListProfiles(), sb.adminListAdmins()]);
      renderUsers();
    }
    if (direction) animatePanel(el, direction);
  } catch (err) {
    el.innerHTML = `<div class="admin-empty admin-error">Não foi possível carregar: ${esc(err.message)}</div>`;
  }
}

// ──────────────────────────────────────────
// FEEDBACK
// ──────────────────────────────────────────

function renderFeedback() {
  const el = root.querySelector('#admin-section');
  const { status, category } = state.feedbackFilter;
  const newCount = state.feedback.filter(f => f.status === 'novo').length;
  const countEl = root.querySelector('#admin-new-count');
  if (countEl) countEl.textContent = status === 'todos' && newCount ? String(newCount) : '';

  el.innerHTML = `
    <div class="admin-toolbar">
      <label>Status
        <select class="doodle-input" data-action="feedback-filter" data-key="status">
          ${['todos', 'novo', 'lido', 'resolvido'].map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s === 'todos' ? 'Todos' : STATUS_LABEL[s]}</option>`).join('')}
        </select>
      </label>
      <label>Tipo
        <select class="doodle-input" data-action="feedback-filter" data-key="category">
          ${['todas', ...Object.keys(CATEGORY_LABEL)].map(c => `<option value="${c}" ${c === category ? 'selected' : ''}>${c === 'todas' ? 'Todos' : CATEGORY_LABEL[c]}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" data-action="reload">Atualizar</button>
    </div>
    ${state.feedback.length ? `<div class="admin-list">${state.feedback.map(feedbackCard).join('')}</div>`
      : `<div class="admin-empty">Nenhum feedback ${status !== 'todos' || category !== 'todas' ? 'com esses filtros' : 'ainda'}.</div>`}`;
}

function feedbackCard(f) {
  return `
    <article class="admin-card sketch" data-id="${f.id}" data-status="${f.status}">
      <header class="admin-card-head">
        <span class="admin-chip admin-chip-${f.category}">${CATEGORY_LABEL[f.category] || f.category}</span>
        <span class="admin-meta">${esc(f.user?.name || 'Usuário removido')} <span>${esc(f.user?.handle || '')}</span></span>
        <time class="admin-meta" datetime="${f.created_at}">${fmtDateTime(f.created_at)}</time>
      </header>
      <p class="admin-message">${esc(f.message)}</p>
      ${f.page ? `<div class="admin-meta">Enviado da tela: ${esc(f.page)}</div>` : ''}
      <div class="admin-card-actions">
        <label>Status
          <select class="doodle-input" data-action="feedback-status" data-id="${f.id}">
            ${Object.entries(STATUS_LABEL).map(([v, l]) => `<option value="${v}" ${v === f.status ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="admin-note">Nota interna
          <input class="doodle-input" data-note-for="${f.id}" maxlength="1000" value="${esc(f.admin_note || '')}" placeholder="Visível só para admins">
        </label>
        <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" data-action="feedback-note" data-id="${f.id}">Salvar nota</button>
        <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm admin-danger" data-action="delete" data-kind="feedback" data-id="${f.id}">Excluir</button>
      </div>
    </article>`;
}

// ──────────────────────────────────────────
// DAILY LYRICS
// ──────────────────────────────────────────

function nextFreeDate() {
  const taken = new Set(state.lyrics.map(l => l.show_on));
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const iso = toISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
    if (!taken.has(iso)) return iso;
  }
  return toISODate();
}

function renderLyrics() {
  const el = root.querySelector('#admin-section');
  const today = toISODate();
  const editing = state.editingLyric;
  const form = editing || { show_on: nextFreeDate(), excerpt: '', song: '', artist: '', note: '' };
  const upcoming = state.lyrics.filter(l => l.show_on >= today).sort((a, b) => a.show_on.localeCompare(b.show_on));
  const past = state.lyrics.filter(l => l.show_on < today);

  el.innerHTML = `
    <div class="admin-grid">
      <form class="admin-card sketch admin-form" data-form="lyric" novalidate>
        <h3>${editing ? 'Editar letra' : 'Agendar letra'}</h3>
        <p class="admin-help">Só um trecho curto (até ${MAX_EXCERPT_CHARS} caracteres e 4 linhas), sempre com música e artista. Dias sem letra agendada usam a rotação automática.</p>
        <input type="hidden" name="id" value="${esc(form.id || '')}">
        <label>Dia <input class="doodle-input" type="date" name="show_on" value="${esc(form.show_on)}" required></label>
        <label>Trecho <textarea class="doodle-input" name="excerpt" rows="4" maxlength="${MAX_EXCERPT_CHARS + 20}" required>${esc(form.excerpt)}</textarea></label>
        <div class="feedback-count" data-counter="excerpt">${form.excerpt.length} / ${MAX_EXCERPT_CHARS}</div>
        <div class="admin-row">
          <label>Música <input class="doodle-input" name="song" maxlength="120" value="${esc(form.song)}" required></label>
          <label>Artista <input class="doodle-input" name="artist" maxlength="120" value="${esc(form.artist)}" required></label>
        </div>
        <label>Comentário (opcional) <input class="doodle-input" name="note" maxlength="280" value="${esc(form.note || '')}" placeholder="Por que essa letra hoje?"></label>
        <div class="form-error" data-form-error hidden></div>
        <div class="admin-card-actions">
          ${editing ? `<button type="button" class="doodle-btn doodle-btn-ghost" data-action="lyric-cancel">Cancelar</button>` : ''}
          <button type="submit" class="doodle-btn doodle-btn-primary">${editing ? 'Salvar alterações' : 'Agendar'}</button>
        </div>
      </form>

      <div class="admin-col">
        <h3 class="admin-subtitle">Próximas (${upcoming.length})</h3>
        ${upcoming.length ? upcoming.map(lyricRow).join('') : `<div class="admin-empty">Nenhuma letra agendada.</div>`}
        ${past.length ? `<h3 class="admin-subtitle">Anteriores</h3>${past.slice(0, 30).map(lyricRow).join('')}` : ''}
      </div>
    </div>`;
}

function lyricRow(l) {
  const isToday = l.show_on === toISODate();
  return `
    <div class="admin-lyric ${isToday ? 'is-today' : ''}">
      <div class="admin-lyric-date">${isToday ? 'Hoje' : esc(fmtDay(l.show_on))}</div>
      <blockquote>${esc(l.excerpt)}</blockquote>
      <div class="admin-meta">${esc(l.song)} · ${esc(l.artist)}</div>
      <div class="admin-card-actions">
        <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" data-action="lyric-edit" data-id="${l.id}">Editar</button>
        <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm admin-danger" data-action="delete" data-kind="lyric" data-id="${l.id}">Excluir</button>
      </div>
    </div>`;
}

// ──────────────────────────────────────────
// USERS & ADMINS
// ──────────────────────────────────────────

function renderUsers() {
  const el = root.querySelector('#admin-section');
  const q = state.userQuery.trim().toLowerCase();
  const list = q ? state.profiles.filter(p => p.name.toLowerCase().includes(q) || p.handle.toLowerCase().includes(q)) : state.profiles;

  el.innerHTML = `
    <div class="admin-grid">
      <div class="admin-col">
        <div class="admin-toolbar">
          <label class="admin-grow">Buscar
            <input class="doodle-input" data-action="user-search" value="${esc(state.userQuery)}" placeholder="Nome ou @usuário">
          </label>
          <span class="admin-meta">${list.length} de ${state.profiles.length}</span>
        </div>
        ${list.length ? list.map(userRow).join('') : `<div class="admin-empty">Nenhum usuário encontrado.</div>`}
      </div>

      <div class="admin-card sketch admin-form">
        <h3>Admins</h3>
        <p class="admin-help">Quem está nesta lista acessa este painel ao entrar com esse e-mail.</p>
        <ul class="admin-admins">
          ${state.admins.map(a => `
            <li><span>${esc(a.email)}</span>
              ${a.email === (auth.user?.email || '').toLowerCase() ? '<span class="admin-meta">você</span>'
                : `<button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm admin-danger" data-action="delete" data-kind="admin" data-id="${esc(a.email)}">Remover</button>`}
            </li>`).join('')}
        </ul>
        <form data-form="admin" class="admin-row" novalidate>
          <label class="admin-grow">E-mail <input class="doodle-input" type="email" name="email" placeholder="pessoa@exemplo.com" required></label>
          <button type="submit" class="doodle-btn doodle-btn-primary doodle-btn-sm">Adicionar</button>
        </form>
        <div class="form-error" data-form-error hidden></div>
      </div>
    </div>`;
}

function userRow(p) {
  const editing = state.editingUserId === p.id;
  if (editing) {
    return `
      <form class="admin-user editing" data-form="user" data-id="${p.id}" novalidate>
        <div class="admin-row">
          <label>Nome <input class="doodle-input" name="name" maxlength="60" value="${esc(p.name)}" required></label>
          <label>Usuário <input class="doodle-input" name="handle" maxlength="25" value="${esc(p.handle)}" required></label>
        </div>
        <div class="form-error" data-form-error hidden></div>
        <div class="admin-card-actions">
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" data-action="user-cancel">Cancelar</button>
          <button type="submit" class="doodle-btn doodle-btn-primary doodle-btn-sm">Salvar</button>
        </div>
      </form>`;
  }
  return `
    <div class="admin-user ${p.banned ? 'is-banned' : ''}">
      <div class="admin-user-main">
        <b>${esc(p.name)}</b> <span class="admin-meta">${esc(p.handle)}</span>
        ${p.banned ? '<span class="admin-chip admin-chip-bug">Suspenso</span>' : ''}
        <div class="admin-meta">Desde ${new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
      </div>
      <div class="admin-card-actions">
        <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" data-action="user-edit" data-id="${p.id}">Editar</button>
        ${p.id === auth.user?.id ? '' : `<button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm ${p.banned ? '' : 'admin-danger'}" data-action="user-ban" data-id="${p.id}" data-banned="${p.banned}">${p.banned ? 'Reativar' : 'Suspender'}</button>`}
      </div>
    </div>`;
}

// ──────────────────────────────────────────
// EVENTS (delegated on the tab container)
// ──────────────────────────────────────────

function formError(form, msg) {
  const el = form.querySelector('[data-form-error]') || form.parentElement.querySelector('[data-form-error]');
  if (el) { el.textContent = msg || ''; el.hidden = !msg; }
}

async function withBusy(button, fn) {
  const label = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Aguarde…'; }
  try { await fn(); }
  catch (err) { showToast(err.message || 'Não foi possível concluir.'); }
  finally { if (button?.isConnected) { button.disabled = false; button.textContent = label; } }
}

// Two-step delete: first click arms the button, second click (within 4 s) deletes
function armDelete(btn) {
  if (btn.dataset.armed === 'true') return true;
  btn.dataset.armed = 'true';
  const label = btn.textContent;
  btn.textContent = 'Confirmar?';
  setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = 'false'; btn.textContent = label; } }, 4000);
  return false;
}

function bindEvents() {
  const tab = document.getElementById('tab-admin');

  tab.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
    const { action, id } = btn.dataset;

    if (action === 'section') return loadSection(btn.dataset.section);
    if (action === 'reload') return loadSection(state.section);

    if (action === 'feedback-note') {
      const note = tab.querySelector(`[data-note-for="${id}"]`)?.value.trim() || null;
      return withBusy(btn, async () => {
        await sb.adminUpdateFeedback(id, { admin_note: note });
        const f = state.feedback.find(x => x.id === id); if (f) f.admin_note = note;
        showToast('Nota salva.');
      });
    }

    if (action === 'lyric-edit') {
      state.editingLyric = state.lyrics.find(l => l.id === id) || null;
      renderLyrics();
      tab.querySelector('[data-form="lyric"] textarea')?.focus();
      return;
    }
    if (action === 'lyric-cancel') { state.editingLyric = null; return renderLyrics(); }

    if (action === 'user-edit') { state.editingUserId = id; return renderUsers(); }
    if (action === 'user-cancel') { state.editingUserId = null; return renderUsers(); }
    if (action === 'user-ban') {
      const ban = btn.dataset.banned !== 'true';
      return withBusy(btn, async () => {
        await sb.adminUpdateProfile(id, { banned: ban });
        const p = state.profiles.find(x => x.id === id); if (p) p.banned = ban;
        renderUsers();
        showToast(ban ? 'Usuário suspenso.' : 'Usuário reativado.');
      });
    }

    if (action === 'delete') {
      if (!armDelete(btn)) return;
      const kind = btn.dataset.kind;
      return withBusy(btn, async () => {
        if (kind === 'feedback') {
          await sb.adminDeleteFeedback(id);
          state.feedback = state.feedback.filter(f => f.id !== id);
          renderFeedback();
        } else if (kind === 'lyric') {
          await sb.adminDeleteLyric(id);
          state.lyrics = state.lyrics.filter(l => l.id !== id);
          if (state.editingLyric?.id === id) state.editingLyric = null;
          clearLyricCache();
          renderLyrics();
        } else if (kind === 'admin') {
          await sb.adminRemoveAdmin(id);
          state.admins = state.admins.filter(a => a.email !== id);
          renderUsers();
        }
        showToast('Excluído.');
      });
    }
  });

  tab.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.dataset.action === 'feedback-filter') {
      state.feedbackFilter[el.dataset.key] = el.value;
      return loadSection('feedback');
    }
    if (el.dataset.action === 'feedback-status') {
      const id = el.dataset.id;
      try {
        await sb.adminUpdateFeedback(id, { status: el.value });
        const f = state.feedback.find(x => x.id === id); if (f) f.status = el.value;
        el.closest('.admin-card')?.setAttribute('data-status', el.value);
        showToast(`Marcado como ${STATUS_LABEL[el.value].toLowerCase()}.`);
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  tab.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.action === 'user-search') {
      state.userQuery = el.value;
      const pos = el.selectionStart;
      renderUsers();
      const again = tab.querySelector('[data-action="user-search"]');
      again?.focus(); again?.setSelectionRange(pos, pos);
    }
    if (el.name === 'excerpt') {
      const counter = tab.querySelector('[data-counter="excerpt"]');
      if (counter) {
        counter.textContent = `${el.value.trim().length} / ${MAX_EXCERPT_CHARS}`;
        counter.dataset.over = String(el.value.trim().length > MAX_EXCERPT_CHARS);
      }
    }
  });

  tab.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    formError(form, '');
    const data = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');

    if (form.dataset.form === 'lyric') {
      const excerpt = (data.excerpt || '').trim();
      const problem = !data.show_on ? 'Escolha o dia.'
        : validateExcerpt(excerpt)
        || (!data.song?.trim() ? 'Informe a música.' : '')
        || (!data.artist?.trim() ? 'Informe o artista.' : '');
      if (problem) return formError(form, problem);
      const clash = state.lyrics.find(l => l.show_on === data.show_on && l.id !== data.id);
      if (clash) return formError(form, `Já existe uma letra agendada para ${fmtDay(data.show_on)}. Edite a existente.`);
      return withBusy(submit, async () => {
        await sb.adminSaveLyric({ id: data.id || null, show_on: data.show_on, excerpt, song: data.song.trim(), artist: data.artist.trim(), note: data.note?.trim() });
        state.editingLyric = null;
        clearLyricCache();
        state.lyrics = await sb.adminListLyrics();
        renderLyrics();
        showToast('Letra salva.');
      });
    }

    if (form.dataset.form === 'user') {
      const name = (data.name || '').trim();
      const handle = '@' + (data.handle || '').trim().replace(/^@/, '').toLowerCase();
      if (!name) return formError(form, 'Informe o nome.');
      if (!/^@[a-z0-9_.]{2,24}$/.test(handle)) return formError(form, 'Usuário: 2 a 24 letras minúsculas, números, "_" ou ".".');
      return withBusy(submit, async () => {
        await sb.adminUpdateProfile(form.dataset.id, { name, handle });
        const p = state.profiles.find(x => x.id === form.dataset.id); if (p) Object.assign(p, { name, handle });
        state.editingUserId = null;
        renderUsers();
        showToast('Usuário atualizado.');
      });
    }

    if (form.dataset.form === 'admin') {
      const email = (data.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return formError(form, 'Digite um e-mail válido.');
      if (state.admins.some(a => a.email === email)) return formError(form, 'Esse e-mail já é admin.');
      return withBusy(submit, async () => {
        await sb.adminAddAdmin(email);
        state.admins = await sb.adminListAdmins();
        renderUsers();
        showToast('Admin adicionado.');
      });
    }
  });
}
