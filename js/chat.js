// Chat / DM module — Spacious full-page Chat view + Floating DM window
import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import * as Storage from './storage.js';
import { ICONS } from './icons.js';
import { globalAudio } from './audio.js';
import { fetchLinkMetadata, renderRichLinkCard, extractFirstUrl } from './api.js';

let activeContactId = null;
let attachedSong = null;
let attachedImage = null;
let attachedGif = null;
let contactsSearchTerm = '';
let replyingToMessage = null;

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
  renderAttachedBars();
}

export function attachGifToChat(gifUrl) {
  attachedGif = gifUrl;
  renderAttachedBars();
}

export function clearChatAttachment(type) {
  if (type === 'song') attachedSong = null;
  if (type === 'image') attachedImage = null;
  if (type === 'gif') attachedGif = null;
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
}

function renderAttachmentItemsHtml(context) {
  const isTab = context === 'tab';
  return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:100%;">
      ${attachedSong ? `
        <div style="display:flex;align-items:center;gap:8px;background:color-mix(in srgb, var(--accent) 22%, transparent);border:1.5px solid var(--purple-accent);border-radius:8px;padding:5px 10px;box-shadow:0 2px 8px rgba(0,0,0,0.2);">
          ${attachedSong.artwork ? `<img src="${safeUrl(attachedSong.artwork)}" style="width:${isTab ? '36px' : '26px'};height:${isTab ? '36px' : '26px'};border-radius:4px;object-fit:cover;">` : ''}
          <div style="max-width:160px;min-width:0;">
            <div style="font-size:0.8rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🎵 ${esc(attachedSong.title)}</div>
            <div style="font-size:0.7rem;color:var(--purple-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(attachedSong.artist)}</div>
          </div>
          <button type="button" onclick="window._clearChatAttachment('song')" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-weight:900;padding:2px 4px;" title="Remover música">✕</button>
        </div>` : ''}

      ${attachedImage ? `
        <div style="position:relative;display:flex;align-items:center;gap:8px;background:color-mix(in srgb, var(--accent) 15%, transparent);border:1.5px solid var(--accent);border-radius:8px;padding:4px 8px;">
          <img src="${safeUrl(attachedImage)}" alt="Prévia" style="width:${isTab ? '50px' : '32px'};height:${isTab ? '50px' : '32px'};border-radius:4px;object-fit:cover;">
          <span style="font-size:0.75rem;font-weight:800;color:var(--accent);">🖼️ Imagem</span>
          <button type="button" onclick="window._clearChatAttachment('image')" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-weight:900;padding:2px 4px;" title="Remover imagem">✕</button>
        </div>` : ''}

      ${attachedGif ? `
        <div style="position:relative;display:flex;align-items:center;gap:8px;background:color-mix(in srgb, var(--star) 18%, transparent);border:1.5px solid var(--star);border-radius:8px;padding:4px 8px;">
          <img src="${safeUrl(attachedGif)}" alt="GIF" style="width:${isTab ? '50px' : '32px'};height:${isTab ? '50px' : '32px'};border-radius:4px;object-fit:cover;">
          <span style="font-size:0.75rem;font-weight:800;color:var(--star);">👾 GIF</span>
          <button type="button" onclick="window._clearChatAttachment('gif')" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-weight:900;padding:2px 4px;" title="Remover GIF">✕</button>
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

export function renderChatTab(container = document.getElementById('tab-chat')) {
  if (!container) return;

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
            <input class="doodle-input" id="chat-contact-search-input" placeholder="Buscar pessoas" style="width:100%;font-size:0.84rem;padding:7px 12px;" oninput="window._filterChatContacts(this.value)">
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
    const msg = contactsSearchTerm ? 'Nenhum usuário encontrado.' : 'Siga alguém para poder mandar mensagem.';
    container.innerHTML = `<div style="padding:24px 16px;text-align:center;color:var(--muted);font-size:0.84rem;">${msg}</div>`;
    return;
  }

  container.innerHTML = contacts.map(u => {
    const msgs = Storage.getChatMessages(activeUser.id, u.id);
    const last = msgs[msgs.length - 1];
    let previewText = 'Iniciar conversa';
    if (last) {
      if (last.text) previewText = last.text;
      else if (last.song) previewText = `🎵 ${last.song.title}`;
      else if (last.imageUrl) previewText = '🖼️ Imagem';
      else if (last.gifUrl) previewText = '👾 GIF';
    }

    const uAvatarHtml = isImageAvatar(u.avatar)
      ? `<img src="${safeUrl(u.avatar)}" alt="${esc(u.name)}" style="width:100%;height:100%;object-fit:cover;">`
      : esc(u.avatar || u.name[0]);

    return `
      <div class="chat-contact-card${activeContactId === u.id ? ' active' : ''}" onclick="window._selectChatContact('${u.id}')">
        <div class="chat-contact-card-avatar">${uAvatarHtml}</div>
        <div class="chat-contact-card-info">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="chat-contact-card-name">${esc(u.name)}</div>
            ${last ? `<span style="font-size:0.68rem;color:var(--muted);">${esc(last.createdAt || '')}</span>` : ''}
          </div>
          <div class="chat-contact-card-preview">${esc(previewText)}</div>
        </div>
      </div>`;
  }).join('');
}

function renderChatTabMain(contactId) {
  const container = document.getElementById('chat-tab-main');
  if (!container) return;

  if (!contactId) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;gap:14px;">
        <div style="width:72px;height:72px;border-radius:50%;background:color-mix(in srgb, var(--accent) 15%, transparent);border:2px solid var(--purple-accent);display:flex;align-items:center;justify-content:center;color:var(--purple-light);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h3 style="font-size:1.25rem;font-weight:800;color:var(--white);">Selecione uma conversa</h3>
        <p style="color:var(--muted);font-size:0.9rem;max-width:400px;line-height:1.5;">
          Escolha alguém na lista para conversar e trocar músicas, fotos e GIFs.
        </p>
      </div>`;
    return;
  }

  const activeUser = Storage.getActiveUser();
  const contact = Storage.getUserById(contactId);
  if (!contact) return;

  const msgs = Storage.getChatMessages(activeUser.id, contactId);

  const cAvatarHtml = isImageAvatar(contact.avatar)
    ? `<img src="${safeUrl(contact.avatar)}" alt="${esc(contact.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : esc(contact.avatar || contact.name[0]);

  container.innerHTML = `
    <!-- Conversation Header -->
    <div class="chat-main-header">
      <button type="button" class="chat-back-btn" onclick="window._closeChatConversation()" aria-label="Voltar para as conversas">${ICONS.chevronLeft}</button>
      <div style="display:flex;align-items:center;gap:12px;cursor:pointer;flex:1;min-width:0;" onclick="window._goToProfile('${contact.id}')" title="Ver perfil de ${esc(contact.name)}">
        <div style="width:42px;height:42px;border-radius:50%;overflow:hidden;background:var(--purple-dark);display:flex;align-items:center;justify-content:center;font-weight:800;border:1.5px solid var(--purple-accent);">
          ${cAvatarHtml}
        </div>
        <div>
          <div style="font-size:1rem;font-weight:800;color:var(--white);">${esc(contact.name)}</div>
          <div style="font-size:0.8rem;color:var(--text-2);">${esc(contact.handle || '')}</div>
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

    <!-- Attached Media Preview Bar -->
    <div class="chat-tab-attached-preview" id="chat-tab-attached-preview" style="display:none;"></div>

    <!-- Composer Box -->
    <div class="chat-main-composer">
      <!-- Reply Banner -->
      <div id="chat-tab-reply-banner" style="display:none;"></div>

      <div class="chat-composer-tools">
        <button type="button" class="chat-tool-btn" onclick="window._openChatMusicSearch()" title="Anexar música do acervo">
          ${ICONS.music} <span>Música</span>
        </button>
        <button type="button" class="chat-tool-btn" onclick="window._openChatImagePicker()" title="Anexar imagem ou foto">
          ${ICONS.image || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'}
          <span>Imagem</span>
        </button>
        <button type="button" class="chat-tool-btn" onclick="window._openChatGifPicker()" title="Pesquisar e anexar GIF">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M7 15V9h2.5v2H8.5"></path><path d="M12 9v6"></path><path d="M15 9h3M15 12h2M15 9v6"></path></svg>
          <span>GIF</span>
        </button>
      </div>
      <div class="chat-composer-row">
        <input class="doodle-input" id="chat-tab-text-input" placeholder="Digite uma mensagem para ${esc(contact.name)}..." style="flex:1;font-size:0.9rem;padding:9px 14px;border-radius:24px;" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();window._sendChatTabMessage();}">
        <button class="doodle-btn doodle-btn-primary" id="chat-tab-send-btn" style="padding:9px 20px;border-radius:24px;display:flex;align-items:center;gap:6px;" onclick="window._sendChatTabMessage()">
          <span>Enviar</span>
          ${ICONS.send || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>'}
        </button>
      </div>
    </div>
  `;

  renderAttachedBars();
  renderReplyBanners();

  const msgArea = document.getElementById('chat-tab-messages');
  if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
}

function renderMessagesListHtml(msgs, activeUserId) {
  if (!msgs.length) {
    return `
      <div style="text-align:center;padding:40px 10px;color:var(--muted);font-size:0.88rem;">
        Nenhuma mensagem ainda. Envie uma mensagem, música, foto ou GIF para quebrar o gelo! 👋
      </div>`;
  }

  return msgs.map(m => {
    const isSent = m.fromUserId === activeUserId;

    const replyBoxHtml = m.replyTo ? `
      <div class="chat-replied-box">
        <div class="chat-replied-author">${esc(m.replyTo.authorName || 'Alguém')}</div>
        <div class="chat-replied-text">${m.replyTo.text || (m.replyTo.song ? `🎵 ${esc(m.replyTo.song.title)}` : (m.replyTo.imageUrl ? '🖼️ Imagem' : (m.replyTo.gifUrl ? '👾 GIF' : 'Mensagem')))}</div>
      </div>` : '';

    const songHtml = m.song ? `
      <div class="chat-attached-song" style="display:flex;align-items:center;gap:10px;background:var(--tint-2);border:1.5px solid color-mix(in srgb, var(--accent) 40%, transparent);border-radius:10px;padding:8px 12px;margin-top:6px;">
        ${m.song.artwork ? `<img src="${safeUrl(m.song.artwork)}" style="width:44px;height:44px;border-radius:6px;object-fit:cover;flex-shrink:0;">` : ''}
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.86rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.song.title)}</div>
          <div style="font-size:0.75rem;color:var(--purple-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(m.song.artist)}</div>
        </div>
        <button type="button" class="doodle-btn doodle-btn-primary doodle-btn-sm" style="width:32px;height:32px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;" onclick="window._playTrack(${jsArg(m.song)})" title="Tocar música">
          ${ICONS.play}
        </button>
      </div>` : '';

    const imageHtml = m.imageUrl ? `
      <div class="chat-msg-media" style="margin-top:6px;border-radius:10px;overflow:hidden;max-width:320px;border:1.5px solid color-mix(in srgb, var(--accent) 40%, transparent);background:#000;">
        <img src="${safeUrl(m.imageUrl)}" alt="Imagem anexada" style="width:100%;max-height:260px;object-fit:cover;display:block;cursor:pointer;" onclick="window.open(${jsArg(m.imageUrl)}, '_blank', 'noopener')">
      </div>` : '';

    const gifHtml = m.gifUrl ? `
      <div class="chat-msg-media" style="margin-top:6px;border-radius:10px;overflow:hidden;max-width:320px;border:1.5px solid color-mix(in srgb, var(--star) 50%, transparent);background:#000;">
        <img src="${safeUrl(m.gifUrl)}" alt="GIF animado" style="width:100%;max-height:260px;object-fit:cover;display:block;">
      </div>` : '';

    const detectedUrl = extractFirstUrl(m.text);
    const linkHtml = m.link ? renderRichLinkCard(m.link) : (detectedUrl ? renderRichLinkCard(detectedUrl) : '');

    // Action buttons bar on hover
    const actionsBar = `
      <div class="chat-msg-actions-bar">
        <button type="button" class="chat-action-icon-btn" onclick="window._replyToChatMessage('${m.id}')" title="Responder mensagem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
        </button>
        ${isSent && m.text ? `
          <button type="button" class="chat-action-icon-btn" onclick="window._openEditChatMessage('${m.id}')" title="Editar mensagem">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>` : ''}
        ${isSent ? `
          <button type="button" class="chat-action-icon-btn delete-btn" onclick="window._confirmDeleteChatMessage('${m.id}')" title="Excluir mensagem">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>` : ''}
      </div>`;

    return `
      <div class="dm-bubble ${isSent ? 'sent' : 'recv'}" id="chat-msg-${m.id}">
        ${actionsBar}
        ${replyBoxHtml}
        ${m.text ? `<div class="dm-bubble-content">${esc(m.text)}</div>` : ''}
        ${songHtml}
        ${imageHtml}
        ${gifHtml}
        ${linkHtml}
        <div class="dm-time">
          <span>${esc(m.createdAt || '')}</span>
          ${m.edited ? '<span class="chat-edited-tag">(editada)</span>' : ''}
        </div>
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
    container.innerHTML = `<div style="padding:8px 12px;font-size:0.78rem;color:var(--muted)">Nenhum contato disponível.</div>`;
    return;
  }

  container.innerHTML = users.map(u => {
    const msgs = Storage.getChatMessages(activeUser.id, u.id);
    const last = msgs[msgs.length - 1];
    let preview = '';
    if (last) {
      if (last.text) preview = last.text;
      else if (last.song) preview = `🎵 ${last.song.title}`;
      else if (last.imageUrl) preview = '🖼️ Imagem';
      else if (last.gifUrl) preview = '👾 GIF';
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
  }

  renderContacts();
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
  Storage.sendMessage(activeUser.id, activeContactId, text || '', song, image || '', gif || '', reply, link);

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
}

function renderReplyBanners() {
  const largeBanner = document.getElementById('chat-tab-reply-banner');
  const dmBanner = document.getElementById('dm-reply-bar');

  if (!replyingToMessage) {
    if (largeBanner) { largeBanner.style.display = 'none'; largeBanner.innerHTML = ''; }
    if (dmBanner) { dmBanner.style.display = 'none'; dmBanner.innerHTML = ''; }
    return;
  }

  const snippet = replyingToMessage.text || (replyingToMessage.song ? `🎵 ${replyingToMessage.song.title}` : (replyingToMessage.imageUrl ? '🖼️ Imagem' : (replyingToMessage.gifUrl ? '👾 GIF' : 'Mensagem')));

  const bannerHtml = `
    <div class="chat-reply-banner">
      <div class="chat-reply-banner-left">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--purple-light);"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>
        <div class="chat-reply-banner-content">
          <div class="chat-reply-banner-title">Respondendo a ${esc(replyingToMessage.authorName)}</div>
          <div class="chat-reply-banner-text">${esc(snippet)}</div>
        </div>
      </div>
      <button type="button" class="chat-reply-banner-close" onclick="window._cancelChatReply()" title="Cancelar resposta">✕</button>
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
        <label class="form-label" style="font-weight:700;color:var(--white);margin-bottom:6px;display:block;">URL da Imagem:</label>
        <div style="display:flex;gap:6px;">
          <input class="doodle-input" id="chat-img-url-input" placeholder="https://exemplo.com/foto.jpg" style="flex:1;font-size:0.86rem;">
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="const u=document.getElementById('chat-img-url-input').value.trim();if(u){window._setChatImage(u);}">Anexar</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;height:1px;background:var(--tint-2);"></div>
        <span style="font-size:0.75rem;color:var(--muted);">OU CARREGAR ARQUIVO</span>
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

  const reader = new FileReader();
  reader.onload = (e) => {
    window._setChatImage(e.target.result);
  };
  reader.readAsDataURL(file);
};

window._openChatGifPicker = () => {
  const modal = document.getElementById('chat-gif-modal');
  const body = document.getElementById('chat-gif-modal-body');
  if (!modal || !body) return;

  chatGifCategory = 'all';

  const categories = [
    { id: 'all', label: '🔥 Em Alta' },
    { id: 'dance', label: '💃 Dança' },
    { id: 'rock', label: '🎸 Rock' },
    { id: 'dj', label: '🎧 DJ & Fones' },
    { id: 'cat', label: '🐱 Gatos' },
    { id: 'sing', label: '🎤 Cantando' },
    { id: 'react', label: '👏 Reações' }
  ];

  const renderGrid = (gifs) => {
    if (!gifs || !gifs.length) {
      return `<div style="grid-column:1/-1;text-align:center;padding:26px 10px;color:var(--muted);font-size:0.85rem;">Nenhum GIF encontrado. Tente outro termo ou cole o link abaixo.</div>`;
    }
    return gifs.map(g => `
      <div class="gif-picker-item" onclick="window._setChatGif(${jsArg(g.url)})" title="Clique para enviar no chat">
        <img src="${safeUrl(g.url)}" alt="" loading="lazy">
      </div>
    `).join('');
  };

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <!-- Search Input -->
      <div style="position:relative;">
        <input class="doodle-input" id="chat-gif-search-input" placeholder="Buscar GIF ao vivo (ex: dança, rock, cat, beyonce...)" style="width:100%;font-size:0.88rem;padding-right:34px;" oninput="window._handleChatGifSearch(this.value)">
        <div id="chat-gif-spinner" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);display:none;font-size:12px;color:var(--purple-light);">⏳</div>
      </div>

      <!-- Categories Chips -->
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;" class="hide-scrollbar">
        ${categories.map(cat => `
          <button type="button" class="doodle-btn doodle-btn-sm ${cat.id === 'all' ? 'doodle-btn-primary' : 'doodle-btn-secondary'} chat-gif-cat-btn" data-cat="${cat.id}" style="padding:4px 12px;font-size:0.75rem;white-space:nowrap;border-radius:16px;" onclick="window._setChatGifCategory('${cat.id}')">
            ${esc(cat.label)}
          </button>
        `).join('')}
      </div>
      
      <!-- Direct Custom URL option -->
      <div style="display:flex;gap:6px;">
        <input class="doodle-input" id="chat-custom-gif-url" placeholder="Ou cole a URL direta de qualquer GIF (.gif)..." style="flex:1;font-size:0.8rem;">
        <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="const u=document.getElementById('chat-custom-gif-url').value.trim();if(u)window._setChatGif(u)">Anexar</button>
      </div>

      <!-- Grid Container -->
      <div id="chat-gif-grid" class="gif-picker-grid">
        <div style="grid-column:1/-1;text-align:center;padding:26px 10px;color:var(--purple-light);font-size:0.85rem;">Carregando GIFs...</div>
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
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:26px 10px;color:var(--purple-light);font-size:0.85rem;">Carregando...</div>';

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
  window._closeDM = () => closeDMWindow();
  window._dmSelectContact = (id) => renderMessages(id);
  window._dmSend = () => sendDMMessage(false);

  window._selectChatContact = (id) => {
    activeContactId = id;
    renderChatTabContacts();
    renderChatTabMain(id);
    // Phones show one pane at a time: the open conversation replaces the contact list
    document.querySelector('.chat-tab-container')?.classList.toggle('has-conversation', Boolean(id));
  };

  window._closeChatConversation = () => {
    activeContactId = null;
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
        <label class="form-label" style="font-weight:700;color:var(--white);margin:0;">Edite o texto da sua mensagem:</label>
        <textarea id="edit-chat-msg-input" class="doodle-input" rows="4" style="resize:none !important;width:100% !important;box-sizing:border-box !important;min-height:90px !important;max-height:120px !important;font-size:0.9rem;border-radius:8px;padding:10px;line-height:1.4;">${esc(msg.text || '')}</textarea>
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

  const input = document.getElementById('dm-text-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDMMessage(false);
      }
    });
  }
}
