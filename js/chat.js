// Chat / DM module — Spacious full-page Chat view + Floating DM window
import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import * as Storage from './storage.js';
import { ICONS } from './icons.js';
import { globalAudio, playAttr, playIcon } from './audio.js';
import { fetchLinkMetadata, renderRichLinkCard, extractFirstUrl } from './api.js';
import { compressImage, openChatChannel, closeChatChannel, sendTyping, markConversationRead } from './sync.js';
import { adminBadge } from './badges.js';
import { animateSpring, reducedMotion } from './motion.js';

let activeContactId = null;
let attachedSong = null;
let attachedImage = null;
let attachedGif = null;
const mediaSizes = new Map(); // picked photo/GIF url -> { width, height }, read while the person writes
let contactsSearchTerm = '';
let replyingToMessage = null;

// ─── Dates: day separators, bubble times, contact list times (pt-BR) ───
const MIN = 60000;
const toDate = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d; };
const sameDay = (a, b) => a.toDateString() === b.toDateString();
function shortDate(d) {
  const opts = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat('pt-BR', opts).format(d).replace(/\./g, ''); // "3 de nov"
}
function dayLabel(d) {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, new Date())) return 'Hoje';
  if (sameDay(d, yesterday)) return 'Ontem';
  return shortDate(d);
}
/** "agora", "2 min", "3 h", "ontem", "3 de nov" */
function shortAgo(iso) {
  const d = toDate(iso);
  if (!d) return '';
  const diff = Date.now() - d;
  if (diff < MIN) return 'agora';
  if (diff < 60 * MIN) return `${Math.floor(diff / MIN)} min`;
  const label = dayLabel(d);
  if (label === 'Hoje') return `${Math.floor(diff / (60 * MIN))} h`;
  return label === 'Ontem' ? 'ontem' : label;
}
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const emptyState = (icon, title, line) => `
  <div class="chat-empty">
    <span class="chat-empty-icon" aria-hidden="true">${icon}</span>
    <p class="chat-empty-title">${title}</p>
    <p class="chat-empty-line">${line}</p>
  </div>`;

// New bubbles (not the first paint of a conversation) land with a spring; yours rise from the composer.
// Re-renders replace the DOM, so the last painted status per message tells a real status change apart.
const paintedIds = new Map(); // messages area id -> { contact, ids, statuses }
function animateNewBubbles(area, contactId) {
  if (!area) return;
  const bubbles = [...area.querySelectorAll('.dm-bubble')];
  const statuses = new Map([...area.querySelectorAll('.chat-seen[data-status]')].map(el => [el.closest('.dm-bubble').id, el]));
  const prev = paintedIds.get(area.id);
  if (prev && prev.contact === contactId) {
    statuses.forEach((el, id) => {
      const was = prev.statuses.get(id);
      if (!was || was === el.dataset.status) return;
      el.classList.add('is-changed'); // CSS swaps the icon (and draws the 2nd check); none under reduced motion
      if (was === 'sending' && !reducedMotion()) {
        el.closest('.dm-bubble').querySelectorAll('.dm-bubble-content, .chat-attached-song, .chat-msg-media, .rich-link-card')
          .forEach(c => animateSpring(c, [{ opacity: 0.7 }, { opacity: 1 }], 'smooth'));
      }
    });
    if (!reducedMotion()) {
      bubbles.filter(b => !prev.ids.has(b.id)).forEach(b => animateSpring(b, b.classList.contains('sent')
        ? [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'none' }]
        : [{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none' }], 'pop'));
    }
  }
  paintedIds.set(area.id, {
    contact: contactId,
    ids: new Set(bubbles.map(b => b.id)),
    statuses: new Map([...statuses].map(([id, el]) => [id, el.dataset.status]))
  });
}

// Send button: a quick press, and the paper plane flies off up-right and lands back
function flySendIcon() {
  const btn = document.getElementById('chat-tab-send-btn');
  const icon = btn?.querySelector('svg');
  if (!icon || reducedMotion()) return;
  animateSpring(btn, [{ transform: 'scale(.9)' }, { transform: 'none' }], 'press');
  const out = icon.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(10px, -10px)', opacity: 0 }], { duration: 140, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
  out.onfinish = () => {
    animateSpring(icon, [{ transform: 'translate(-6px, 6px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], 'pop');
    out.cancel();
  };
}

// Composer: grows up to ~5 lines (capped by CSS max-height); send dims when there is nothing to send
function syncComposer() {
  const input = document.getElementById('chat-tab-text-input');
  if (!input) return;
  input.style.height = 'auto';
  const full = input.scrollHeight + input.offsetHeight - input.clientHeight; // + borders (border-box)
  input.style.height = input.scrollHeight ? `${full}px` : ''; // 0 while the pane is still hidden: leave it to CSS min-height
  // Scrollbar only once it has reached its ~5-line max
  input.style.overflowY = input.scrollHeight && full > parseFloat(getComputedStyle(input).maxHeight) ? 'auto' : 'hidden';
  const btn = document.getElementById('chat-tab-send-btn');
  if (btn) btn.disabled = !input.value.trim() && !attachedSong && !attachedImage && !attachedGif;
}

const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
let chatGifSearchTimeout = null;
let chatGifCategory = 'all';

// Fallback music GIFs
const FALLBACK_GIFS = [
  { title: 'Dança Disco', url: 'https://media.giphy.com/media/blSTtZehjAZ8I/200.gif' },
  { title: 'Guitarra Rock', url: 'https://media.giphy.com/media/sBikoeGRyOrK0/200.gif' },
  { title: 'Gato Dançando', url: 'https://media.giphy.com/media/Q5Ra0QQUpPYdlFmFrj/200.gif' },
  { title: 'Rockstar Show', url: 'https://media.giphy.com/media/cJ5dS0h3dmpfCRCmD3/200.gif' },
  { title: 'Vibing Music', url: 'https://media.giphy.com/media/zU7nqukycyxBm/200.gif' },
  { title: 'DJ Mix', url: 'https://media.giphy.com/media/10IbZpjNja97DTq/200.gif' }
];

async function queryChatGifApi(term = '', category = 'all') {
  try {
    let url = '';
    const cleanTerm = (term || '').trim();
    if (cleanTerm) {
      url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(cleanTerm)}&limit=24&rating=g`;
    } else if (category && category !== 'all') {
      const catMap = {
        dance: 'dance music',
        rock: 'rock guitar concert',
        dj: 'dj headphones party',
        cat: 'cat music vibing',
        sing: 'singing concert',
        react: 'reaction applause'
      };
      const catQuery = catMap[category] || category;
      url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(catQuery)}&limit=24&rating=g`;
    } else {
      url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (Array.isArray(json.data) && json.data.length > 0) {
      return json.data.map(item => ({
        title: item.title || 'GIF',
        url: item.images?.fixed_height?.url || item.images?.original?.url || item.images?.downsized?.url
      })).filter(g => Boolean(g.url));
    }
  } catch (err) {
    console.warn('Chat GIF API query error, using fallbacks:', err);
  }
  return FALLBACK_GIFS;
}

// ──────────────────────────────────────────
// ATTACHMENT MANAGEMENT
// ──────────────────────────────────────────

export function attachSongToChat(track) {
  attachedSong = track;
  renderAttachedBars();
}

export function attachSongToDM(track) {
  attachSongToChat(track);
}

export function attachImageToChat(imgUrl) {
  attachedImage = imgUrl;
  readMediaSize(imgUrl).then(size => size && attachedImage === imgUrl && mediaSizes.set(imgUrl, size));
  renderAttachedBars();
}

export function attachGifToChat(gifUrl) {
  attachedGif = gifUrl;
  readMediaSize(gifUrl).then(size => size && attachedGif === gifUrl && mediaSizes.set(gifUrl, size));
  renderAttachedBars();
}

export function clearChatAttachment(type) {
  if (type === 'song') attachedSong = null;
  if (type === 'image') { mediaSizes.delete(attachedImage); attachedImage = null; }
  if (type === 'gif') { mediaSizes.delete(attachedGif); attachedGif = null; }
  renderAttachedBars();
}

function renderAttachedBars() {
  // Update floating DM attached bar
  const dmBar = document.getElementById('dm-attached-bar');
  if (dmBar) {
    if (attachedSong || attachedImage || attachedGif) {
      dmBar.style.display = 'flex';
      dmBar.innerHTML = renderAttachmentItemsHtml('dm');
    } else {
      dmBar.style.display = 'none';
      dmBar.innerHTML = '';
    }
  }

  // Update large chat tab attached preview
  const tabPreview = document.getElementById('chat-tab-attached-preview');
  if (tabPreview) {
    if (attachedSong || attachedImage || attachedGif) {
      tabPreview.style.display = 'flex';
      tabPreview.innerHTML = renderAttachmentItemsHtml('tab');
    } else {
      tabPreview.style.display = 'none';
      tabPreview.innerHTML = '';
    }
  }
  syncComposer();
}

function renderAttachmentItemsHtml(context) {
  const remove = (type, label) => `<button type="button" class="chat-chip-remove" onclick="window._clearChatAttachment('${type}')" title="Remover ${label}" aria-label="Remover ${label}"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>`;
  return `
    <div class="chat-chips${context === 'tab' ? ' is-tab' : ''}">
      ${attachedSong ? `
        <div class="chat-chip">
          ${attachedSong.artwork ? `<img class="chat-chip-thumb" alt="" src="${safeUrl(attachedSong.artwork)}">` : ''}
          <div class="chat-chip-meta">
            <div class="chat-chip-title"><span class="ui-icon" aria-hidden="true">${ICONS.music}</span> ${esc(attachedSong.title)}</div>
            <div class="chat-chip-sub">${esc(attachedSong.artist)}</div>
          </div>
          ${remove('song', 'música')}
        </div>` : ''}

      ${attachedImage ? `
        <div class="chat-chip">
          <img class="chat-chip-thumb" src="${safeUrl(attachedImage)}" alt="Prévia">
          <span class="chat-chip-title"><span class="ui-icon" aria-hidden="true">${ICONS.image}</span> Imagem</span>
          ${remove('image', 'imagem')}
        </div>` : ''}

      ${attachedGif ? `
        <div class="chat-chip">
          <img class="chat-chip-thumb" src="${safeUrl(attachedGif)}" alt="GIF">
          <span class="chat-chip-title">GIF</span>
          ${remove('gif', 'GIF')}
        </div>` : ''}
    </div>`;
}

// ──────────────────────────────────────────
// USERS / CONTACTS RETRIEVAL
// ──────────────────────────────────────────

function getSortedContacts() {
  const activeUser = Storage.getActiveUser();
  const following = Storage.getFollowing(activeUser.id);
  // Só dá para conversar com quem você segue (conversas antigas continuam na lista)
  const allUsers = Storage.getAllUsers().filter(u => u.id !== activeUser.id
    && (following.includes(u.id) || Storage.getChatMessages(activeUser.id, u.id).length > 0));

  return allUsers.sort((a, b) => {
    const msgsA = Storage.getChatMessages(activeUser.id, a.id);
    const msgsB = Storage.getChatMessages(activeUser.id, b.id);
    const hasMsgsA = msgsA.length > 0;
    const hasMsgsB = msgsB.length > 0;

    if (hasMsgsA && !hasMsgsB) return -1;
    if (!hasMsgsA && hasMsgsB) return 1;
    // Most recent conversation first
    const lastA = msgsA[msgsA.length - 1]?.createdAtIso || '';
    const lastB = msgsB[msgsB.length - 1]?.createdAtIso || '';
    if (lastA !== lastB) return lastB.localeCompare(lastA);

    const followA = following.includes(a.id);
    const followB = following.includes(b.id);
    if (followA && !followB) return -1;
    if (!followA && followB) return 1;

    return a.name.localeCompare(b.name);
  });
}

// ──────────────────────────────────────────
// LARGE CHAT TAB VIEW (Spacious Messenger Section)
// ──────────────────────────────────────────

/** Which conversation the chat shows (the floating DM window can change it): a kept chat tab is redrawn on return when this changed. */
export const chatSignature = () => String(activeContactId);

export function renderChatTab(container = document.getElementById('tab-chat')) {
  if (!container) return;
  paintedIds.delete('chat-tab-messages'); // re-entering the tab is a first paint, not new messages

  container.innerHTML = `
    <div class="chat-tab-container">
      <!-- Chat Header with Sair button -->
      <div class="chat-tab-header">
        <div>
          <div class="chat-tab-header-title"><span>Mensagens</span></div>
          <div class="chat-tab-header-sub">Converse e compartilhe músicas, fotos e GIFs.</div>
        </div>
      </div>

      <!-- Main Body -->
      <div class="chat-tab-body">
        <!-- Sidebar Contacts Column -->
        <div class="chat-tab-sidebar">
          <div class="chat-tab-search-box">
            <input class="doodle-input" id="chat-contact-search-input" placeholder="Buscar pessoas" style="width:100%;font-size:var(--fs-detail);padding:7px 12px;" oninput="window._filterChatContacts(this.value)">
          </div>
          <div class="chat-tab-contacts-list" id="chat-tab-contacts-list"></div>
        </div>

        <!-- Main Conversation Area -->
        <div class="chat-tab-main" id="chat-tab-main"></div>
      </div>
    </div>
  `;

  renderChatTabContacts();

  // On wide screens open the most recent conversation; phones start on the contact list
  const isPhone = window.matchMedia('(max-width: 700px)').matches;
  if (!activeContactId && !isPhone) {
    const contacts = getSortedContacts();
    const activeUser = Storage.getActiveUser();
    const firstWithMessages = contacts.find(c => Storage.getChatMessages(activeUser.id, c.id).length > 0);
    if (firstWithMessages) {
      activeContactId = firstWithMessages.id;
    } else if (contacts.length > 0) {
      activeContactId = contacts[0].id;
    }
  }

  renderChatTabMain(activeContactId);
  container.querySelector('.chat-tab-container')?.classList.toggle('has-conversation', Boolean(activeContactId));
}

function renderChatTabContacts() {
  const container = document.getElementById('chat-tab-contacts-list');
  if (!container) return;

  const activeUser = Storage.getActiveUser();
  let contacts = getSortedContacts();

  if (contactsSearchTerm) {
    const term = contactsSearchTerm.toLowerCase();
    contacts = contacts.filter(u => u.name.toLowerCase().includes(term) || (u.handle || '').toLowerCase().includes(term));
  }

  if (!contacts.length) {
    container.innerHTML = contactsSearchTerm
      ? emptyState(ICONS.search, 'Nenhum resultado', 'Nenhum usuário encontrado.')
      : emptyState(ICONS.chat, 'Nenhuma conversa', 'Siga alguém para poder mandar mensagem.');
    return;
  }

  container.innerHTML = contacts.map(u => {
    const msgs = Storage.getChatMessages(activeUser.id, u.id);
    const last = msgs[msgs.length - 1];
    const unread = Storage.getUnreadMessageCount(activeUser.id, u.id);
    let previewText = 'Iniciar conversa';
    if (last) {
      if (last.text) previewText = last.text;
      else if (last.song) previewText = `Música: ${last.song.title}`;
      else if (last.imageUrl) previewText = 'Foto';
      else if (last.gifUrl) previewText = 'GIF';
    }

    const uAvatarHtml = isImageAvatar(u.avatar)
      ? `<img src="${safeUrl(u.avatar)}" alt="${esc(u.name)}" style="width:100%;height:100%;object-fit:cover;">`
      : esc(u.avatar || u.name[0]);

    const showUnread = unread && activeContactId !== u.id;
    const when = last ? (shortAgo(last.createdAtIso) || last.createdAt || '') : '';
    return `
      <div class="chat-contact-card${activeContactId === u.id ? ' active' : ''}${showUnread ? ' is-unread' : ''}" onclick="window._selectChatContact('${u.id}')">
        <div class="chat-contact-card-avatar">${uAvatarHtml}</div>
        <div class="chat-contact-card-info">
          <div class="chat-contact-card-top">
            <div class="chat-contact-card-name">${esc(u.name)}${adminBadge(u.id)}</div>
            ${when ? `<span class="chat-contact-card-time">${esc(when)}</span>` : ''}
          </div>
          <div class="chat-contact-card-bottom">
            <div class="chat-contact-card-preview">${esc(previewText)}</div>
            ${showUnread ? `<span class="chat-unread-badge" aria-label="${unread} não lidas">${unread > 9 ? '9+' : unread}</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderChatTabMain(contactId) {
  const container = document.getElementById('chat-tab-main');
  if (!container) return;

  if (!contactId) {
    paintedIds.delete('chat-tab-messages');
    container.innerHTML = emptyState(ICONS.chat, 'Selecione uma conversa', 'Escolha alguém na lista para conversar e trocar músicas, fotos e GIFs.');
    return;
  }

  const activeUser = Storage.getActiveUser();
  const contact = Storage.getUserById(contactId);
  if (!contact) return;

  const msgs = Storage.getChatMessages(activeUser.id, contactId);
  Storage.markChatRead(contactId);
  window._renderChatBadge?.();
  openChatChannel(contactId);
  markConversationRead(contactId);

  const cAvatarHtml = isImageAvatar(contact.avatar)
    ? `<img src="${safeUrl(contact.avatar)}" alt="${esc(contact.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : esc(contact.avatar || contact.name[0]);

  container.innerHTML = `
    <!-- Conversation Header -->
    <div class="chat-main-header">
      <button type="button" class="chat-back-btn" onclick="window._closeChatConversation()" aria-label="Voltar para as conversas">${ICONS.chevronLeft}</button>
      <div class="chat-main-peer" onclick="window._goToProfile('${contact.id}')" title="Ver perfil de ${esc(contact.name)}">
        <div class="chat-main-avatar">${cAvatarHtml}</div>
        <div class="chat-main-peer-text">
          <div class="chat-main-name">${esc(contact.name)}${adminBadge(contact.id)}</div>
          ${contact.handle ? `<div class="chat-main-handle">${esc(contact.handle)}</div>` : ''}
        </div>
      </div>
      <div class="chat-profile-btn">
        <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="window._goToProfile('${contact.id}')">
          Ver perfil
        </button>
      </div>
    </div>

    <!-- Messages Scroll Area -->
    <div class="chat-main-messages" id="chat-tab-messages">
      ${renderMessagesListHtml(msgs, activeUser.id)}
    </div>

    <div class="chat-typing" id="chat-typing" hidden aria-live="polite"><span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(contact.name)} está digitando…</span></div>

    <!-- Attached Media Preview Bar -->
    <div class="chat-tab-attached-preview" id="chat-tab-attached-preview" style="display:none;"></div>

    <!-- Composer Box -->
    <div class="chat-main-composer">
      <!-- Reply Banner -->
      <div id="chat-tab-reply-banner" style="display:none;"></div>

      <div class="chat-composer-row">
        <div class="chat-composer-tools">
          <button type="button" class="chat-tool-btn" onclick="window._openChatMusicSearch()" title="Anexar música do acervo" aria-label="Anexar música">${ICONS.music}</button>
          <button type="button" class="chat-tool-btn" onclick="window._openChatImagePicker()" title="Anexar imagem ou foto" aria-label="Anexar imagem">${ICONS.image}</button>
          <button type="button" class="chat-tool-btn" onclick="window._openChatGifPicker()" title="Pesquisar e anexar GIF" aria-label="Anexar GIF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M7 15V9h2.5v2H8.5"></path><path d="M12 9v6"></path><path d="M15 9h3M15 12h2M15 9v6"></path></svg>
          </button>
        </div>
        <textarea class="doodle-input chat-composer-input" id="chat-tab-text-input" rows="1" placeholder="Mensagem" aria-label="Mensagem para ${esc(contact.name)}" onkeydown="if(event.key==='Enter' && !event.shiftKey && !event.isComposing){event.preventDefault();window._sendChatTabMessage();}" oninput="window._chatTyping()"></textarea>
        <button type="button" class="chat-send-btn" id="chat-tab-send-btn" onclick="window._sendChatTabMessage()" aria-label="Enviar" title="Enviar" disabled>${ICONS.send}</button>
      </div>
    </div>
  `;

  renderAttachedBars();
  renderReplyBanners();

  const msgArea = document.getElementById('chat-tab-messages');
  if (msgArea) { msgArea.scrollTop = msgArea.scrollHeight; stickToBottom(msgArea); }
  animateNewBubbles(msgArea, contactId);
}

/** Inline style that reserves a photo/GIF box before it loads; '' leaves the CSS 4/3 default (older messages). */
export function mediaBoxStyle(m) {
  return m.width > 0 && m.height > 0 ? `aspect-ratio: ${m.width} / ${m.height}` : '';
}

/**
 * Keeps a message list at its end while its images load, but only if the person was there:
 * "pinned" is measured on scroll (before the image grows), not at load time (after it did).
 * Call after every render/scroll-to-end; the listeners are added once per element.
 */
export function stickToBottom(area) {
  const measure = () => { area._pinned = area.scrollHeight - area.scrollTop - area.clientHeight <= 80; };
  measure();
  if (area._stickToBottom) return;
  area._stickToBottom = true;
  area.addEventListener('scroll', measure, { passive: true });
  // load doesn't bubble: listen in capture for every img inside the list
  area.addEventListener('load', () => { if (area._pinned) area.scrollTop = area.scrollHeight; }, true);
}

const mediaAttrs = (m) => mediaBoxStyle(m) ? ` width="${m.width}" height="${m.height}" style="${mediaBoxStyle(m)}"` : '';

/** Width/height of a picked photo/GIF, read once it decodes; null if it fails (the box falls back to 4/3). */
function readMediaSize(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Same author, under 5 minutes apart and on the same day: one visual group
function sameGroup(a, b) {
  if (!a || !b || a.fromUserId !== b.fromUserId) return false;
  const da = toDate(a.createdAtIso), db = toDate(b.createdAtIso);
  return Boolean(da && db) && sameDay(da, db) && Math.abs(db - da) < 5 * MIN;
}

const REPLY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>';

const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

// Delivery status beside the time: clock (sending), one check (sent), two checks (seen)
const STATUS = {
  sending: { label: 'Enviando', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg>' },
  sent: { label: 'Enviada', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' },
  seen: { label: 'Visto', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 6 6 16.5 1.5 12"></polyline><polyline class="chat-seen-check2" points="22.5 6 12 16.5 10.5 15"></polyline></svg>' }
};
const statusHtml = (s) => `<span class="chat-seen is-${s}${s === 'seen' ? ' seen' : ''}" data-status="${s}"><span class="chat-seen-icon" aria-hidden="true">${STATUS[s].icon}</span>${s === 'seen' ? '<span aria-hidden="true">Visto</span>' : ''}<span class="sr-only">${STATUS[s].label}</span></span>`;

function renderMessagesListHtml(msgs, activeUserId) {
  // "Enviada" / "Visto" goes under your latest message only (like most chat apps)
  let lastSentId = null;
  for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].fromUserId === activeUserId) { lastSentId = msgs[i].id; break; } }
  const lastIsTheirs = msgs.length && msgs[msgs.length - 1].fromUserId !== activeUserId;
  if (!msgs.length) {
    return emptyState(ICONS.chat, 'Nenhuma mensagem ainda', 'Envie uma mensagem, música, foto ou GIF para quebrar o gelo.');
  }

  const other = Storage.getUserById(msgs.find(m => m.fromUserId !== activeUserId)?.fromUserId);
  const otherAvatar = other ? `<span class="dm-avatar" aria-hidden="true">${avatarInner(other.avatar, other.name, '')}</span>` : '';

  return msgs.map((m, i) => {
    const isSent = m.fromUserId === activeUserId;
    const prev = msgs[i - 1];
    const next = msgs[i + 1];
    const joinsPrev = sameGroup(prev, m);
    const joinsNext = sameGroup(m, next);
    const group = joinsPrev ? (joinsNext ? 'middle' : 'last') : (joinsNext ? 'first' : 'single');
    const isGroupEnd = !joinsNext;
    // Time only under the last message of a group, like WhatsApp (edited ones keep the "(editada)" tag)
    const showTime = isGroupEnd || m.edited;
    // Status only on your latest message, while it is the last one (same rule as before)
    const status = m.id === lastSentId && !lastIsTheirs ? (m.readAt ? 'seen' : (m.synced ? 'sent' : 'sending')) : '';
    const date = toDate(m.createdAtIso);
    const prevDate = prev && toDate(prev.createdAtIso);
    const daySep = date && (!prevDate || !sameDay(prevDate, date))
      ? `<div class="chat-day-sep" role="separator"><span>${dayLabel(date)}</span></div>` : '';

    const replyBoxHtml = m.replyTo ? `
      <div class="chat-replied-box">
        <div class="chat-replied-author">${esc(m.replyTo.authorName || 'Alguém')}</div>
        <div class="chat-replied-text">${m.replyTo.text ? esc(m.replyTo.text) : (m.replyTo.song ? `Música: ${esc(m.replyTo.song.title)}` : (m.replyTo.imageUrl ? 'Foto' : (m.replyTo.gifUrl ? 'GIF' : 'Mensagem')))}</div>
      </div>` : '';

    const songHtml = m.song ? `
      <div class="chat-attached-song">
        ${m.song.artwork ? `<img class="chat-song-cover" alt="" src="${safeUrl(m.song.artwork)}">` : ''}
        <div class="chat-song-meta">
          <div class="chat-song-title">${esc(m.song.title)}</div>
          <div class="chat-song-artist">${esc(m.song.artist)}</div>
        </div>
        <button type="button" class="chat-song-play" onclick="window._playTrack(${jsArg(m.song)})" title="Tocar música" ${playAttr(m.song)}>${playIcon(m.song)}</button>
      </div>` : '';

    const imageHtml = m.imageUrl ? `
      <div class="chat-msg-media">
        <img src="${safeUrl(m.imageUrl)}" alt="Imagem anexada" data-zoom${mediaAttrs(m)}>
      </div>` : '';

    const gifHtml = m.gifUrl ? `
      <div class="chat-msg-media is-gif">
        <img src="${safeUrl(m.gifUrl)}" alt="GIF animado" data-zoom${m.imageUrl ? '' : mediaAttrs(m)}>
      </div>` : '';

    const detectedUrl = extractFirstUrl(m.text);
    const linkHtml = m.link ? renderRichLinkCard(m.link) : (detectedUrl ? renderRichLinkCard(detectedUrl) : '');

    // Floating actions: hover on desktop, long-press on touch (initChatBindings)
    const actionsBar = `
      <div class="chat-msg-actions-bar">
        <button type="button" class="chat-action-icon-btn" onclick="window._replyToChatMessage('${m.id}')" title="Responder mensagem" aria-label="Responder">${REPLY_ICON}</button>
        ${m.text ? `<button type="button" class="chat-action-icon-btn" onclick="window._copyChatMessage('${m.id}')" title="Copiar mensagem" aria-label="Copiar">${COPY_ICON}</button>` : ''}
        ${isSent && m.text ? `<button type="button" class="chat-action-icon-btn" onclick="window._openEditChatMessage('${m.id}')" title="Editar mensagem" aria-label="Editar">${ICONS.edit}</button>` : ''}
        ${isSent ? `<button type="button" class="chat-action-icon-btn delete-btn" onclick="window._confirmDeleteChatMessage('${m.id}')" title="Excluir mensagem" aria-label="Excluir">${ICONS.trash}</button>` : ''}
      </div>`;

    return `${daySep}
      <div class="dm-bubble ${isSent ? 'sent' : 'recv'}${status === 'sending' ? ' is-pending' : ''}" id="chat-msg-${m.id}" data-group="${group}">
        ${!isSent && isGroupEnd ? otherAvatar : ''}
        ${actionsBar}
        ${date ? `<time class="dm-hover-time" datetime="${esc(m.createdAtIso)}" aria-hidden="true">${hhmm(date)}</time>` : ''}
        ${replyBoxHtml}
        ${m.text ? `<div class="dm-bubble-content">${esc(m.text)}</div>` : ''}
        ${songHtml}
        ${imageHtml}
        ${gifHtml}
        ${linkHtml}
        ${showTime || status ? `<div class="dm-time">
          <span>${esc(m.createdAt || '')}</span>
          ${m.edited ? '<span class="chat-edited-tag">(editada)</span>' : ''}
          ${status ? `<span aria-hidden="true">·</span>${statusHtml(status)}` : ''}
        </div>` : ''}
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────
// FLOATING DM WINDOW
// ──────────────────────────────────────────

export function openDMWindow(contactId = null) {
  const win = document.getElementById('dm-window');
  if (!win) return;

  if (contactId) activeContactId = contactId;
  paintedIds.delete('dm-messages-area');
  win.classList.add('open');
  renderContacts();
  if (activeContactId) renderMessages(activeContactId);
}

export function closeDMWindow() {
  const win = document.getElementById('dm-window');
  win?.classList.remove('open');
}

export function toggleDMWindow(contactId = null) {
  const win = document.getElementById('dm-window');
  if (win?.classList.contains('open') && !contactId) {
    closeDMWindow();
  } else {
    openDMWindow(contactId);
  }
}

function renderContacts() {
  const container = document.getElementById('dm-contacts-list');
  if (!container) return;

  const activeUser = Storage.getActiveUser();
  const users = getSortedContacts();

  if (!users.length) {
    container.innerHTML = `<div style="padding:8px 12px;font-size:var(--fs-detail);color:var(--muted)">Nenhum contato disponível.</div>`;
    return;
  }

  container.innerHTML = users.map(u => {
    const msgs = Storage.getChatMessages(activeUser.id, u.id);
    const last = msgs[msgs.length - 1];
    let preview = '';
    if (last) {
      if (last.text) preview = last.text;
      else if (last.song) preview = `Música: ${last.song.title}`;
      else if (last.imageUrl) preview = 'Foto';
      else if (last.gifUrl) preview = 'GIF';
    }

    const uAvatarHtml = isImageAvatar(u.avatar)
      ? `<img src="${safeUrl(u.avatar)}" alt="${esc(u.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : esc(u.avatar || u.name[0]);

    return `
      <div class="dm-contact-item${activeContactId === u.id ? ' active' : ''}" onclick="window._dmSelectContact('${u.id}')">
        <div class="dm-contact-avatar" onclick="event.stopPropagation();window._goToProfile('${u.id}')" title="Ver perfil de ${esc(u.name)}" style="cursor:pointer;overflow:hidden;">${uAvatarHtml}</div>
        <div style="flex:1;min-width:0;">
          <div class="dm-contact-name">${esc(u.name)}</div>
          ${preview ? `<div class="dm-contact-preview">${esc(preview)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

export function renderMessages(contactId) {
  activeContactId = contactId;
  const activeUser = Storage.getActiveUser();
  const contact = Storage.getUserById(contactId);
  const msgs = Storage.getChatMessages(activeUser.id, contactId);

  const header = document.getElementById('dm-chat-header');
  if (header && contact) {
    const cAvatarHtml = isImageAvatar(contact.avatar)
      ? `<img src="${safeUrl(contact.avatar)}" alt="${esc(contact.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : esc(contact.avatar || contact.name[0]);
    header.innerHTML = `
      <div class="dm-header-left" onclick="window._goToProfile('${contact.id}')" title="Ver perfil de ${esc(contact.name)}" style="cursor:pointer;">
        <div class="dm-contact-avatar" style="width:30px;height:30px;overflow:hidden;">${cAvatarHtml}</div>
        <div>
          <div class="dm-header-title">${esc(contact.name)}</div>
          <div class="dm-header-sub">${esc(contact.handle || '')}</div>
        </div>
      </div>
      <div class="dm-header-actions">
        <button class="dm-header-btn" onclick="window.switchTab('chat')" title="Expandir chat maior">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
        </button>
        <button class="dm-header-btn" onclick="window._closeDM()">${ICONS.close}</button>
      </div>`;
  }

  const msgArea = document.getElementById('dm-messages-area');
  if (msgArea) {
    msgArea.innerHTML = renderMessagesListHtml(msgs, activeUser.id);
    msgArea.scrollTop = msgArea.scrollHeight;
    stickToBottom(msgArea);
    animateNewBubbles(msgArea, contactId);
  }
  if (document.getElementById('dm-window')?.classList.contains('open')) {
    Storage.markChatRead(contactId);
    window._renderChatBadge?.();
  }

  renderContacts();
}

/**
 * New messages arrived from the server: refresh the lists and the open conversation
 * without touching what is being typed.
 */
let typingTimer = null;
function hideTyping() {
  clearTimeout(typingTimer);
  const el = document.getElementById('chat-typing');
  if (el) el.hidden = true;
}

/** The other person is typing in the open conversation (shown for a few seconds after each ping). */
export function showTyping(contactId) {
  if (contactId !== activeContactId) return;
  const el = document.getElementById('chat-typing');
  if (!el) return;
  const area = document.getElementById('chat-tab-messages');
  const nearBottom = area && area.scrollHeight - area.scrollTop - area.clientHeight < 80;
  el.hidden = false;
  if (nearBottom) { area.scrollTop = area.scrollHeight; stickToBottom(area); }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(hideTyping, 4000);
}

export function refreshChatFromServer() {
  const me = Storage.getActiveUserId();
  renderChatTabContacts();
  renderContacts();
  if (!activeContactId) return;
  const msgs = Storage.getChatMessages(me, activeContactId);
  [['chat-tab-messages', Boolean(document.getElementById('chat-tab-main'))],
   ['dm-messages-area', document.getElementById('dm-window')?.classList.contains('open')]].forEach(([id, visible]) => {
    const area = document.getElementById(id);
    if (!area || !visible) return;
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    area.innerHTML = renderMessagesListHtml(msgs, me);
    if (nearBottom) area.scrollTop = area.scrollHeight;
    stickToBottom(area);
    animateNewBubbles(area, activeContactId);
    Storage.markChatRead(activeContactId);
    markConversationRead(activeContactId);
  });
  // A message arrived: they stopped typing
  if (msgs.length && msgs[msgs.length - 1].fromUserId === activeContactId) hideTyping();
}

// ──────────────────────────────────────────
// SEND MESSAGE (Unifies large view & floating window)
// ──────────────────────────────────────────

export function sendDMMessage(isLargeView = false) {
  if (!activeContactId) return;

  const inputEl = isLargeView
    ? document.getElementById('chat-tab-text-input')
    : (document.getElementById('dm-text-input') || document.getElementById('chat-tab-text-input'));

  const text = (inputEl?.value || '').trim();
  const song = attachedSong;
  const image = attachedImage;
  const gif = attachedGif;
  const reply = replyingToMessage;
  const detectedUrl = extractFirstUrl(text);
  const link = detectedUrl ? { url: detectedUrl } : null;

  if (!text && !song && !image && !gif && !link) return;

  const activeUser = Storage.getActiveUser();
  // One size per message: the photo's, or the GIF's when there is no photo (mediaBoxStyle callers match)
  Storage.sendMessage(activeUser.id, activeContactId, text || '', song, image || '', gif || '', reply, link, mediaSizes.get(image || gif));
  mediaSizes.clear();

  if (inputEl) inputEl.value = '';
  attachedSong = null;
  attachedImage = null;
  attachedGif = null;
  replyingToMessage = null;

  renderAttachedBars();
  renderReplyBanners();
  renderMessages(activeContactId);
  renderChatTabMain(activeContactId);
  renderContacts();
  renderChatTabContacts();
  // Ready for the next message: the field stays selected (the phone keyboard stays up)
  const next = isLargeView ? document.getElementById('chat-tab-text-input') : (document.getElementById('dm-text-input') || document.getElementById('chat-tab-text-input'));
  next?.focus({ preventScroll: true });
  if (isLargeView) flySendIcon();
}

function renderReplyBanners() {
  const largeBanner = document.getElementById('chat-tab-reply-banner');
  const dmBanner = document.getElementById('dm-reply-bar');

  if (!replyingToMessage) {
    if (largeBanner) { largeBanner.style.display = 'none'; largeBanner.innerHTML = ''; }
    if (dmBanner) { dmBanner.style.display = 'none'; dmBanner.innerHTML = ''; }
    return;
  }

  const snippet = replyingToMessage.text || (replyingToMessage.song ? `Música: ${replyingToMessage.song.title}` : (replyingToMessage.imageUrl ? 'Foto' : (replyingToMessage.gifUrl ? 'GIF' : 'Mensagem')));

  const bannerHtml = `
    <div class="chat-reply-banner">
      <div class="chat-reply-banner-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--purple-light);"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
        <div class="chat-reply-banner-content">
          <div class="chat-reply-banner-title">Respondendo a ${esc(replyingToMessage.authorName)}</div>
          <div class="chat-reply-banner-text">${esc(snippet)}</div>
        </div>
      </div>
      <button type="button" class="chat-reply-banner-close" onclick="window._cancelChatReply()" title="Cancelar resposta" aria-label="Cancelar resposta"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>
    </div>`;

  if (largeBanner) {
    largeBanner.style.display = 'block';
    largeBanner.innerHTML = bannerHtml;
  }
  if (dmBanner) {
    dmBanner.style.display = 'block';
    dmBanner.innerHTML = bannerHtml;
  }
}

// ──────────────────────────────────────────
// MEDIA PICKERS (Music, Image, GIF)
// ──────────────────────────────────────────

window._openChatMusicSearch = () => {
  import('./ui.js').then(u => u.openSearchModalForChat());
};

window._openChatImagePicker = () => {
  const modal = document.getElementById('chat-image-modal');
  const body = document.getElementById('chat-image-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label class="form-label" style="font-weight:800;color:var(--white);margin-bottom:6px;display:block;">URL da Imagem:</label>
        <div style="display:flex;gap:6px;">
          <input class="doodle-input" id="chat-img-url-input" placeholder="https://exemplo.com/foto.jpg" style="flex:1;font-size:var(--fs-detail);">
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="const u=document.getElementById('chat-img-url-input').value.trim();if(u){window._setChatImage(u);}">Anexar</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;height:1px;background:var(--tint-2);"></div>
        <span style="font-size:var(--fs-detail);color:var(--muted);">OU CARREGAR ARQUIVO</span>
        <div style="flex:1;height:1px;background:var(--tint-2);"></div>
      </div>

      <div>
        <label class="doodle-btn doodle-btn-secondary" style="width:100%;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
          ${ICONS.image || ''}
          <span>Escolher imagem do dispositivo</span>
          <input type="file" id="chat-img-file-input" accept="image/*" style="display:none;" onchange="window._handleChatImageUpload(event)">
        </label>
      </div>
    </div>
  `;

  if (window.openDoodleModal) window.openDoodleModal('chat-image-modal');
};

window._setChatImage = (url) => {
  attachImageToChat(url);
  if (window.closeDoodleModal) window.closeDoodleModal('chat-image-modal');
  import('./ui.js').then(u => u.showToast('Imagem anexada ao chat!'));
};

window._handleChatImageUpload = (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Shrunk like post images, so the message fits on the server
  compressImage(file, 1024, 0.8)
    .then(url => window._setChatImage(url))
    .catch(err => import('./ui.js').then(u => u.showToast(err.message || 'Não foi possível ler a imagem.')));
};

window._openChatGifPicker = () => {
  const modal = document.getElementById('chat-gif-modal');
  const body = document.getElementById('chat-gif-modal-body');
  if (!modal || !body) return;

  chatGifCategory = 'all';

  const categories = [
    { id: 'all', label: 'Em alta' },
    { id: 'dance', label: 'Dança' },
    { id: 'rock', label: 'Rock' },
    { id: 'dj', label: 'DJ e fones' },
    { id: 'cat', label: 'Gatos' },
    { id: 'sing', label: 'Cantando' },
    { id: 'react', label: 'Reações' }
  ];

  const renderGrid = (gifs) => {
    if (!gifs || !gifs.length) {
      return `<div style="grid-column:1/-1;text-align:center;padding:26px 10px;color:var(--muted);font-size:var(--fs-detail);">Nenhum GIF encontrado. Tente outro termo ou cole o link abaixo.</div>`;
    }
    return gifs.map(g => `
      <div class="gif-picker-item" onclick="window._setChatGif(${jsArg(g.url)})" title="Clique para enviar no chat">
        <img src="${safeUrl(g.url)}" alt="" loading="lazy" decoding="async">
      </div>
    `).join('');
  };

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <!-- Search Input -->
      <div style="position:relative;">
        <input class="doodle-input" id="chat-gif-search-input" placeholder="Buscar GIF ao vivo (ex: dança, rock, cat, beyonce...)" style="width:100%;font-size:var(--fs-detail);padding-right:34px;" oninput="window._handleChatGifSearch(this.value)">
        <div id="chat-gif-spinner" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);display:none;font-size:var(--fs-detail);color:var(--purple-light);">⏳</div>
      </div>

      <!-- Categories Chips -->
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;" class="hide-scrollbar">
        ${categories.map(cat => `
          <button type="button" class="doodle-btn doodle-btn-sm ${cat.id === 'all' ? 'doodle-btn-primary' : 'doodle-btn-secondary'} chat-gif-cat-btn" data-cat="${cat.id}" style="padding:4px 12px;font-size:var(--fs-detail);white-space:nowrap;border-radius:16px;" onclick="window._setChatGifCategory('${cat.id}')">
            ${esc(cat.label)}
          </button>
        `).join('')}
      </div>
      
      <!-- Direct Custom URL option -->
      <div style="display:flex;gap:6px;">
        <input class="doodle-input" id="chat-custom-gif-url" placeholder="Ou cole a URL direta de qualquer GIF (.gif)..." style="flex:1;font-size:var(--fs-detail);">
        <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="const u=document.getElementById('chat-custom-gif-url').value.trim();if(u)window._setChatGif(u)">Anexar</button>
      </div>

      <!-- Grid Container -->
      <div id="chat-gif-grid" class="gif-picker-grid">
        <div style="grid-column:1/-1;text-align:center;padding:26px 10px;color:var(--purple-light);font-size:var(--fs-detail);">Carregando GIFs...</div>
      </div>
    </div>
  `;

  // Initial load
  queryChatGifApi('', 'all').then(gifs => {
    const grid = document.getElementById('chat-gif-grid');
    if (grid) grid.innerHTML = renderGrid(gifs);
  });

  window._handleChatGifSearch = (q) => {
    const spinner = document.getElementById('chat-gif-spinner');
    if (spinner) spinner.style.display = 'block';

    if (chatGifSearchTimeout) clearTimeout(chatGifSearchTimeout);
    chatGifSearchTimeout = setTimeout(async () => {
      const gifs = await queryChatGifApi(q, chatGifCategory);
      const grid = document.getElementById('chat-gif-grid');
      if (grid) grid.innerHTML = renderGrid(gifs);
      if (spinner) spinner.style.display = 'none';
    }, 320);
  };

  window._setChatGifCategory = async (catId) => {
    chatGifCategory = catId;
    document.querySelectorAll('.chat-gif-cat-btn').forEach(btn => {
      btn.className = btn.dataset.cat === catId
        ? 'doodle-btn doodle-btn-sm doodle-btn-primary chat-gif-cat-btn'
        : 'doodle-btn doodle-btn-sm doodle-btn-secondary chat-gif-cat-btn';
    });

    const input = document.getElementById('chat-gif-search-input');
    if (input) input.value = '';

    const grid = document.getElementById('chat-gif-grid');
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:26px 10px;color:var(--purple-light);font-size:var(--fs-detail);">Carregando...</div>';

    const gifs = await queryChatGifApi('', catId);
    if (grid) grid.innerHTML = renderGrid(gifs);
  };

  if (window.openDoodleModal) window.openDoodleModal('chat-gif-modal');
};

window._setChatGif = (url) => {
  attachGifToChat(url);
  if (window.closeDoodleModal) window.closeDoodleModal('chat-gif-modal');
  import('./ui.js').then(u => u.showToast('GIF anexado ao chat!'));
};

// ──────────────────────────────────────────
// GLOBAL BINDINGS
// ──────────────────────────────────────────

export function initChatBindings() {
  // Which conversation is on screen (pop-ups skip messages from it)
  window._visibleChatContactId = () => (
    (document.getElementById('chat-tab-main')?.isConnected && document.getElementById('chat-tab-messages')) ||
    document.getElementById('dm-window')?.classList.contains('open')
  ) ? activeContactId : null;
  window._closeDM = () => closeDMWindow();
  window._dmSelectContact = (id) => renderMessages(id);
  window._dmSend = () => sendDMMessage(false);

  window._selectChatContact = (id) => {
    // Phones: the open conversation is its own screen, so the back button returns to the list
    if (id && !document.querySelector('.chat-tab-container.has-conversation') && matchMedia('(max-width: 700px)').matches) window._pushLayer?.('conv');
    activeContactId = id;
    // Phones show one pane at a time: the open conversation replaces the contact list.
    // Shown before rendering, or its scroll-to-end runs on a hidden pane and it opens at the top.
    document.querySelector('.chat-tab-container')?.classList.toggle('has-conversation', Boolean(id));
    renderChatTabContacts();
    renderChatTabMain(id);
  };

  window._closeChatConversation = () => {
    window._leaveLayer?.('conv');
    activeContactId = null;
    closeChatChannel();
    document.querySelector('.chat-tab-container')?.classList.remove('has-conversation');
    renderChatTabContacts();
    renderChatTabMain(null);
  };

  window._filterChatContacts = (term) => {
    contactsSearchTerm = term;
    renderChatTabContacts();
  };

  window._sendChatTabMessage = () => sendDMMessage(true);
  window._clearChatAttachment = (type) => clearChatAttachment(type);

  window._replyToChatMessage = (msgId) => {
    const activeUser = Storage.getActiveUser();
    if (!activeContactId) return;
    const msgs = Storage.getChatMessages(activeUser.id, activeContactId);
    const msg = msgs.find(m => String(m.id) === String(msgId));
    if (!msg) return;

    const author = msg.fromUserId === activeUser.id ? 'Você' : (Storage.getUserById(msg.fromUserId)?.name || 'Contato');
    replyingToMessage = {
      id: msg.id,
      text: msg.text || '',
      authorName: author,
      song: msg.song || null,
      imageUrl: msg.imageUrl || '',
      gifUrl: msg.gifUrl || ''
    };

    renderReplyBanners();

    // Focus active input
    const input = document.getElementById('chat-tab-text-input') || document.getElementById('dm-text-input');
    if (input) input.focus();
  };

  window._copyChatMessage = async (msgId) => {
    if (!activeContactId) return;
    const msg = Storage.getChatMessages(Storage.getActiveUserId(), activeContactId).find(m => String(m.id) === String(msgId));
    if (!msg?.text) return;
    document.querySelectorAll('.dm-bubble.show-actions').forEach(b => b.classList.remove('show-actions'));
    let ok = false;
    try { await navigator.clipboard.writeText(msg.text); ok = true; } catch {
      // Fallback for webviews/insecure contexts without the async clipboard
      const ta = document.createElement('textarea');
      ta.value = msg.text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    import('./ui.js').then(u => u.showToast(ok ? 'Mensagem copiada!' : 'Não foi possível copiar.'));
  };

  window._cancelChatReply = () => {
    replyingToMessage = null;
    renderReplyBanners();
  };

  window._openEditChatMessage = (msgId) => {
    const activeUser = Storage.getActiveUser();
    if (!activeContactId) return;
    const msgs = Storage.getChatMessages(activeUser.id, activeContactId);
    const msg = msgs.find(m => String(m.id) === String(msgId));
    if (!msg) return;

    const modal = document.getElementById('chat-edit-modal');
    const body = document.getElementById('chat-edit-modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <label class="form-label" style="font-weight:800;color:var(--white);margin:0;">Edite o texto da sua mensagem:</label>
        <textarea id="edit-chat-msg-input" class="doodle-input" rows="4" style="resize:none !important;width:100% !important;box-sizing:border-box !important;min-height:90px !important;max-height:120px !important;font-size:var(--fs-detail);border-radius:8px;padding:10px;line-height:1.4;">${esc(msg.text || '')}</textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
          <button type="button" class="doodle-btn doodle-btn-secondary" onclick="closeDoodleModal('chat-edit-modal')">Cancelar</button>
          <button type="button" class="doodle-btn doodle-btn-primary" onclick="window._saveEditChatMessage('${msg.id}')">Salvar</button>
        </div>
      </div>`;

    if (window.openDoodleModal) window.openDoodleModal('chat-edit-modal');
  };

  window._saveEditChatMessage = (msgId) => {
    const text = document.getElementById('edit-chat-msg-input')?.value || '';
    if (!text.trim()) return;

    Storage.editMessage(msgId, text);
    if (window.closeDoodleModal) window.closeDoodleModal('chat-edit-modal');

    renderMessages(activeContactId);
    renderChatTabMain(activeContactId);
    renderContacts();
    renderChatTabContacts();

    import('./ui.js').then(u => u.showToast('Mensagem editada!'));
  };

  window._confirmDeleteChatMessage = (msgId) => {
    const btn = document.getElementById('confirm-delete-chat-msg-btn');
    if (btn) {
      btn.onclick = () => window._deleteChatMessage(msgId);
    }
    if (window.openDoodleModal) window.openDoodleModal('chat-delete-msg-modal');
  };

  window._deleteChatMessage = (msgId) => {
    Storage.deleteMessage(msgId);
    if (window.closeDoodleModal) window.closeDoodleModal('chat-delete-msg-modal');

    renderMessages(activeContactId);
    renderChatTabMain(activeContactId);
    renderContacts();
    renderChatTabContacts();

    import('./ui.js').then(u => u.showToast('Mensagem excluída!'));
  };

  window._chatTyping = () => { sendTyping(); syncComposer(); };

  bindMessageLongPress();

  const input = document.getElementById('dm-text-input');
  if (input) {
    input.addEventListener('input', () => sendTyping());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDMMessage(false);
      }
    });
  }
}

// Touch: long-press a bubble (~450ms, cancelled by moving/scrolling) shows its actions bar; a tap elsewhere hides it
function bindMessageLongPress() {
  let timer = null, startX = 0, startY = 0, pressed = null, swallowClick = false;
  const closeAll = (except) => document.querySelectorAll('.dm-bubble.show-actions').forEach(b => { if (b !== except) b.classList.remove('show-actions'); });
  const cancel = () => { clearTimeout(timer); timer = null; pressed?.classList.remove('is-pressing'); pressed = null; };

  // Swipe-to-reply: received bubbles drag right, yours drag left; past 56px it locks and replies on release
  let swipe = null;
  const SWIPE_LOCK = 56, SWIPE_MAX = 72;
  const endSwipe = (reply) => {
    if (!swipe) return;
    const { bubble, icon, active, locked } = swipe;
    swipe = null;
    if (!active) return;
    swallowClick = true;
    const from = bubble.style.transform;
    bubble.style.transform = '';
    const done = () => { bubble.classList.remove('is-swiping'); icon.remove(); };
    const back = from && !reducedMotion() ? animateSpring(bubble, [{ transform: from }, { transform: 'none' }], 'snappy') : null;
    back ? (back.onfinish = done) : done();
    if (reply && locked) window._replyToChatMessage(bubble.id.slice('chat-msg-'.length));
  };

  document.addEventListener('pointerdown', (e) => {
    swallowClick = false; // some browsers send no click after a long press
    if (!e.target.closest('.dm-bubble.show-actions .chat-msg-actions-bar')) closeAll();
    const bubble = e.target.closest('.dm-bubble');
    if (!bubble || e.target.closest('button, a, .chat-msg-actions-bar') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swipe = { bubble, x: e.clientX, y: e.clientY, pointerId: e.pointerId, mouse: e.pointerType === 'mouse', active: false, locked: false, icon: null };
    if (e.pointerType === 'mouse') return;
    cancel();
    pressed = bubble;
    startX = e.clientX; startY = e.clientY;
    bubble.classList.add('is-pressing');
    timer = setTimeout(() => {
      bubble.classList.add('show-actions');
      swallowClick = true; // the release must not also open the image zoom
      cancel();
    }, 450);
  });
  document.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
    if (!swipe || e.pointerId !== swipe.pointerId) return;
    const dir = swipe.bubble.classList.contains('sent') ? -1 : 1;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { swipe = null; return; } // a scroll, not a swipe
      if (Math.abs(dx) <= 8 || Math.abs(dx) <= Math.abs(dy) * 1.5 || dx * dir <= 0) return;
      if (swipe.mouse && String(getSelection?.() || '')) { swipe = null; return; } // the mouse is selecting text
      cancel(); // no long-press once it is a swipe
      swipe.active = true;
      swipe.bubble.classList.add('is-swiping');
      swipe.bubble.setPointerCapture?.(e.pointerId);
      swipe.icon = Object.assign(document.createElement('span'), { className: 'dm-swipe-reply', innerHTML: REPLY_ICON });
      swipe.icon.setAttribute('aria-hidden', 'true');
      swipe.bubble.appendChild(swipe.icon);
    }
    const d = Math.max(0, dx * dir);
    // Rubber band: 1:1 up to the lock point, then resistance, never past 72px
    const offset = d <= SWIPE_LOCK ? d : Math.min(SWIPE_MAX, SWIPE_LOCK + (d - SWIPE_LOCK) * 0.35);
    if (!reducedMotion()) swipe.bubble.style.transform = `translateX(${offset * dir}px)`;
    const p = Math.min(d / SWIPE_LOCK, 1);
    swipe.icon.style.opacity = p;
    swipe.icon.style.transform = `scale(${0.6 + 0.4 * p})`;
    const locked = d >= SWIPE_LOCK;
    if (locked !== swipe.locked) {
      swipe.locked = locked;
      swipe.icon.classList.toggle('is-locked', locked);
      if (locked) {
        navigator.vibrate?.(10);
        if (!reducedMotion()) animateSpring(swipe.icon, [{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], 'pop');
      }
    }
  });
  document.addEventListener('pointerup', (e) => { cancel(); if (swipe && e.pointerId === swipe.pointerId) endSwipe(true); });
  document.addEventListener('pointercancel', (e) => { cancel(); if (swipe && e.pointerId === swipe.pointerId) endSwipe(false); });
  document.addEventListener('scroll', cancel, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest('.dm-bubble') && (timer || swallowClick)) e.preventDefault(); });
  document.addEventListener('click', (e) => {
    if (swallowClick) { swallowClick = false; if (e.target.closest('.dm-bubble')) { e.preventDefault(); e.stopPropagation(); return; } }
    if (e.target.closest('.chat-msg-actions-bar')) closeAll(); // an action was picked
  }, true);
}
