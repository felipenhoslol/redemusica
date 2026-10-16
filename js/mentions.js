// @mentions: autocomplete while writing, ids saved with the post (for notifications) and @handles
// turned into profile links when the text is shown.
import { esc, avatarInner } from './dom.js';
import * as Storage from './storage.js';

const HANDLE_RE = /(^|[^\w@.])@([a-z0-9_.]{2,24})/gi;

function userByHandle(handle) {
  const h = '@' + handle.toLowerCase().replace(/\.+$/, '');
  return Storage.getAllUsers().find(u => (u.handle || '').toLowerCase() === h) || null;
}

/** Ids of the people @mentioned in a text (only accounts that exist, never yourself). */
export function mentionedIds(text) {
  const me = Storage.getActiveUserId();
  const ids = new Set();
  for (const m of String(text || '').matchAll(HANDLE_RE)) {
    const u = userByHandle(m[2]);
    if (u && u.id !== me) ids.add(u.id);
  }
  return [...ids].slice(0, 20);
}

/** Turn @handles of known people into profile links. Takes text that is already HTML-escaped. */
export function linkMentions(escapedHtml) {
  return escapedHtml.replace(HANDLE_RE, (all, before, handle) => {
    const u = userByHandle(handle);
    if (!u) return all;
    return `${before}<button type="button" class="mention-link" onclick="event.stopPropagation();window._goToProfile('${esc(u.id)}')">@${esc(handle)}</button>`;
  });
}

/**
 * Suggest people while typing "@nam…" in a textarea/input; picking one completes "@handle ".
 * @param {HTMLTextAreaElement|HTMLInputElement} field
 */
export function attachMentionAutocomplete(field) {
  if (!field || field.dataset.mentions) return;
  field.dataset.mentions = '1';
  const box = document.createElement('div');
  box.className = 'mention-suggest';
  box.setAttribute('role', 'listbox');
  box.hidden = true;
  field.insertAdjacentElement('afterend', box);
  let matches = [];
  let active = 0;

  const currentQuery = () => {
    const upto = field.value.slice(0, field.selectionStart ?? field.value.length);
    const m = upto.match(/(^|[^\w@.])@([a-z0-9_.]{0,24})$/i);
    return m ? { q: m[2].toLowerCase(), start: upto.length - m[2].length - 1 } : null;
  };

  const close = () => { box.hidden = true; matches = []; };

  const paint = () => {
    box.innerHTML = matches.map((u, i) => `
      <button type="button" role="option" class="mention-option${i === active ? ' active' : ''}" data-i="${i}" aria-selected="${i === active}">
        <span class="post-author-avatar mention-avatar">${avatarInner(u.avatar, u.name)}</span>
        <span class="mention-text"><strong>${esc(u.name)}</strong><span>${esc(u.handle || '')}</span></span>
      </button>`).join('');
    box.hidden = !matches.length;
  };

  const update = () => {
    const cur = currentQuery();
    if (!cur) return close();
    const me = Storage.getActiveUserId();
    const following = new Set(Storage.getFollowing(me));
    matches = Storage.getAllUsers()
      .filter(u => u.id !== me && u.id !== 'user_me' && u.handle &&
        ((u.handle || '').toLowerCase().includes(cur.q) || (u.name || '').toLowerCase().includes(cur.q)))
      .sort((a, b) => (following.has(b.id) - following.has(a.id)) || (a.name || '').localeCompare(b.name || '', 'pt-BR'))
      .slice(0, 6);
    active = 0;
    paint();
  };

  const pick = (u) => {
    const cur = currentQuery();
    if (!cur || !u) return close();
    const handle = (u.handle || '').replace(/^@/, '');
    const before = field.value.slice(0, cur.start);
    const after = field.value.slice(field.selectionStart ?? field.value.length);
    field.value = `${before}@${handle} ${after.replace(/^\s+/, '')}`;
    const pos = before.length + handle.length + 2;
    field.setSelectionRange(pos, pos);
    field.focus();
    close();
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  field.addEventListener('input', update);
  field.addEventListener('click', update);
  field.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % matches.length; paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + matches.length) % matches.length; paint(); }
    else if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); pick(matches[active]); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  field.addEventListener('blur', () => setTimeout(close, 150));
  // pointerdown keeps the field focused (and the caret where it was) while picking
  box.addEventListener('pointerdown', (e) => {
    const opt = e.target.closest('[data-i]');
    if (!opt) return;
    e.preventDefault();
    pick(matches[Number(opt.dataset.i)]);
  });
}
