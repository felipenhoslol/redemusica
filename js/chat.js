// Chat / DM module — floating window with contacts and messages
import * as Storage from './storage.js';
import { ICONS } from './icons.js';
import { globalAudio } from './audio.js';

let activeContactId = null;
let attachedSong = null;
let isPlayingInDM = false;

// ──────────────────────────────────────────
// DM WINDOW OPEN/CLOSE
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

// ──────────────────────────────────────────
// RENDER CONTACTS LIST
// ──────────────────────────────────────────

function renderContacts() {
  const container = document.getElementById('dm-contacts-list');
  if (!container) return;

  const activeUser = Storage.getActiveUser();
  const following = Storage.getFollowing(activeUser.id);
  const users = Storage.getAllUsers().filter(u => u.id !== activeUser.id && following.includes(u.id));

  if (!users.length) {
    container.innerHTML = `<div style="padding:8px 12px;font-size:0.78rem;color:var(--muted)">Siga alguém para conversar.</div>`;
    return;
  }

  container.innerHTML = users.map(u => {
    const msgs = Storage.getChatMessages(activeUser.id, u.id);
    const last = msgs[msgs.length - 1];
    const uAvatarHtml = u.avatar && (u.avatar.startsWith('http') || u.avatar.startsWith('data:') || u.avatar.startsWith('/'))
      ? `<img src="${u.avatar}" alt="${u.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : (u.avatar || u.name[0]);
    return `
      <div class="dm-contact-item${activeContactId === u.id ? ' active' : ''}" onclick="window._dmSelectContact('${u.id}')">
        <div class="dm-contact-avatar" onclick="event.stopPropagation();window._goToProfile('${u.id}')" title="Ver perfil de ${u.name}" style="cursor:pointer;overflow:hidden;">${uAvatarHtml}</div>
        <div style="flex:1;min-width:0;">
          <div class="dm-contact-name">${u.name}</div>
          ${last ? `<div class="dm-contact-preview">${last.text || '(música)'}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────
// RENDER MESSAGES
// ──────────────────────────────────────────

export function renderMessages(contactId) {
  activeContactId = contactId;
  const activeUser = Storage.getActiveUser();
  const contact = Storage.getUserById(contactId);
  const msgs = Storage.getChatMessages(activeUser.id, contactId);

  const header = document.getElementById('dm-chat-header');
  if (header && contact) {
    const cAvatarHtml = contact.avatar && (contact.avatar.startsWith('http') || contact.avatar.startsWith('data:') || contact.avatar.startsWith('/'))
      ? `<img src="${contact.avatar}" alt="${contact.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : (contact.avatar || contact.name[0]);
    header.innerHTML = `
      <div class="dm-header-left" onclick="window._goToProfile('${contact.id}')" title="Ver perfil de ${contact.name}" style="cursor:pointer;">
        <div class="dm-contact-avatar" style="width:30px;height:30px;overflow:hidden;">${cAvatarHtml}</div>
        <div>
          <div class="dm-header-title">${contact.name}</div>
          <div class="dm-header-sub">${contact.handle || ''}</div>
        </div>
      </div>
      <div class="dm-header-actions">
        <button class="dm-header-btn" onclick="window._closeDM()">${ICONS.close}</button>
      </div>`;
  }

  const msgArea = document.getElementById('dm-messages-area');
  if (!msgArea) return;

  if (!msgs.length) {
    msgArea.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.8rem">Nenhuma mensagem ainda.</div>`;
  } else {
    msgArea.innerHTML = msgs.map(m => {
      const isSent = m.fromUserId === activeUser.id;
      const songHtml = m.song ? `
        <div class="dm-attached-song">
          <img class="dm-song-cover" src="${m.song.artwork||''}" alt="" onerror="this.style.display='none'">
          <div>
            <div class="dm-song-title">${m.song.title}</div>
            <div class="dm-song-artist">${m.song.artist}</div>
          </div>
          <button style="background:transparent;border:none;color:var(--purple-light);cursor:pointer;padding:2px 4px;" onclick="window._playTrack(${JSON.stringify(m.song).replace(/"/g, '&quot;')})">
            ${ICONS.play}
          </button>
        </div>` : '';

      return `
        <div class="dm-bubble ${isSent ? 'sent' : 'recv'}">
          ${m.text ? `<div class="dm-bubble-content">${m.text}</div>` : ''}
          ${songHtml}
          <div class="dm-time">${m.createdAt}</div>
        </div>`;
    }).join('');
  }

  msgArea.scrollTop = msgArea.scrollHeight;
  renderContacts(); // Update contact list
}

// ──────────────────────────────────────────
// SEND MESSAGE
// ──────────────────────────────────────────

export function sendDMMessage() {
  if (!activeContactId) return;

  const inputEl = document.getElementById('dm-text-input');
  const text = (inputEl?.value || '').trim();
  const song = attachedSong;

  if (!text && !song) return;

  const activeUser = Storage.getActiveUser();
  Storage.sendMessage(activeUser.id, activeContactId, text || '', song);

  if (inputEl) inputEl.value = '';
  attachedSong = null;
  renderAttachedBar();
  renderMessages(activeContactId);

  // Toggle play button icon
  const sendBtn = document.getElementById('dm-send-btn');
  if (sendBtn) {
    sendBtn.innerHTML = ICONS.pause;
    setTimeout(() => { sendBtn.innerHTML = ICONS.send; }, 500);
  }
}

function renderAttachedBar() {
  const bar = document.getElementById('dm-attached-bar');
  if (!bar) return;
  if (attachedSong) {
    bar.style.display = 'flex';
    bar.innerHTML = `
      <span>${attachedSong.title} — ${attachedSong.artist}</span>
      <button style="background:transparent;border:none;color:var(--muted);cursor:pointer;" onclick="window._dmClearSong()">
        ${ICONS.close}
      </button>`;
  } else {
    bar.style.display = 'none';
    bar.innerHTML = '';
  }
}

// ──────────────────────────────────────────
// ATTACH SONG IN DM
// ──────────────────────────────────────────

export function attachSongToDM(track) {
  attachedSong = track;
  renderAttachedBar();
}

// ──────────────────────────────────────────
// INIT DM WINDOW HTML BINDINGS
// ──────────────────────────────────────────

export function initChatBindings() {
  // Global handlers for DM window
  window._closeDM = () => closeDMWindow();
  window._dmSelectContact = (id) => renderMessages(id);
  window._dmClearSong = () => { attachedSong = null; renderAttachedBar(); };

  window._dmSend = () => sendDMMessage();

  const input = document.getElementById('dm-text-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendDMMessage();
      }
    });
  }
}
