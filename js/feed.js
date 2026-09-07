// Feed module — post creation, rendering, interactions, lyric cards
import * as Storage from './storage.js';
import { globalAudio } from './audio.js';
import { ICONS, getStarSVG, renderRatingStars } from './icons.js';
import { searchTracks, fetchLastFmTrendingTracks, renderRichLinkCard, extractFirstUrl } from './api.js';
import { getRandomLyric, getRandomCardStyle } from './lyrics_db.js';

// ──────────────────────────────────────────
// RENDER HELPERS
// ──────────────────────────────────────────

function renderLyricsCard(post) {
  if (!post.lyrics) return '';
  const text = post.lyrics;
  const attr = post.lyricsSong ? `<span class="lyrics-song-attr">— ${post.lyricsSong}</span>` : '';
  const style = post.lyricsCardStyle || 'compact';
  const art = post.lyricsArt || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80';

  if (style === 'compact' && !post.lyricsArt) {
    return `
      <div class="lyrics-card-compact">
        <div class="lyrics-text">${text}</div>
        ${attr}
      </div>`;
  }

  return `
    <div class="lyrics-card-fullbleed" style="position:relative;overflow:hidden;border-radius:var(--radius-md);margin:8px 0;padding:14px;min-height:96px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid rgba(255,255,255,0.12);">
      <img class="lyrics-bg-image" src="${art}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(12px) brightness(0.25) saturate(1.4);transform:scale(1.15);pointer-events:none;z-index:0;">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(20, 10, 35, 0.7), rgba(5, 2, 10, 0.85));z-index:1;"></div>
      <div class="lyrics-fullbleed-content" style="position:relative;z-index:2;">
        <div class="lyrics-text" style="font-size:0.95rem;line-height:1.45;color:#ffffff;font-style:italic;font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,0.85);">${text}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.15);">
          <img src="${art}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0;border:1px solid rgba(255,255,255,0.2);">
          <div style="font-size:0.75rem;font-weight:700;color:var(--purple-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${post.lyricsSong || 'Música Destacada'}
          </div>
        </div>
      </div>
    </div>`;
}

function renderPostPlaylistCard(post) {
  let pl = post.playlist;
  if (!pl && post.playlistId) {
    pl = Storage.getPlaylistById(post.playlistId);
  }
  if (!pl) return '';

  const songs = pl.songs || [];
  const songsCount = songs.length;

  // Render Cover
  let coverHtml = '';
  if (pl.coverUrl) {
    coverHtml = `<img src="${pl.coverUrl}" alt="${pl.title}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    const songsWithArt = songs.filter(s => !!s.artwork);
    if (songsWithArt.length >= 4) {
      coverHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%;">
          <img src="${songsWithArt[0].artwork}" style="width:100%;height:100%;object-fit:cover;">
          <img src="${songsWithArt[1].artwork}" style="width:100%;height:100%;object-fit:cover;">
          <img src="${songsWithArt[2].artwork}" style="width:100%;height:100%;object-fit:cover;">
          <img src="${songsWithArt[3].artwork}" style="width:100%;height:100%;object-fit:cover;">
        </div>`;
    } else if (songsWithArt.length > 0) {
      coverHtml = `<img src="${songsWithArt[0].artwork}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      coverHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#2b1548,#0d0b14);color:var(--purple-light);">${ICONS.playlist}</div>`;
    }
  }

  // Top tracks preview
  const songsPreviewHtml = songs.slice(0, 3).map((s, idx) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">
      <span style="color:var(--purple-light);font-weight:700;font-size:0.7rem;min-width:14px;">${idx+1}.</span>
      <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.title}</span>
      <span style="color:var(--muted);font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">— ${s.artist}</span>
    </div>
  `).join('');

  return `
    <div class="post-attached-playlist" onclick="window._goToSharedPlaylist('${pl.id}')" title="Clique para abrir esta playlist" style="margin:10px 0;background:linear-gradient(135deg, rgba(30, 16, 52, 0.85), rgba(12, 8, 20, 0.95));border:1px solid var(--purple-accent);border-radius:var(--radius-md);padding:12px 14px;cursor:pointer;transition:all 0.2s ease;display:flex;gap:14px;position:relative;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.4);">
      <div style="width:84px;height:84px;min-width:84px;border-radius:8px;overflow:hidden;background:#000;box-shadow:0 4px 10px rgba(0,0,0,0.6);flex-shrink:0;">
        ${coverHtml}
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:inline-flex;align-items:center;gap:4px;font-size:0.68rem;font-weight:800;color:var(--purple-light);text-transform:uppercase;letter-spacing:0.04em;">
              ${ICONS.playlist} Playlist
            </div>
            <span style="font-size:0.72rem;color:var(--muted);">${songsCount} ${songsCount === 1 ? 'música' : 'músicas'}</span>
          </div>
          <h4 style="margin:2px 0 4px;font-size:0.95rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pl.title}</h4>
          ${pl.description ? `<p style="margin:0 0 4px;font-size:0.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pl.description}</p>` : ''}
          ${songsPreviewHtml}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;padding-left:4px;" onclick="event.stopPropagation()">
        ${songsCount > 0 ? `
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="border-radius:50%;width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(157,78,221,0.4);" title="Tocar playlist" onclick="window._playEntirePlaylist('${pl.id}')">
            ${ICONS.play}
          </button>
        ` : ''}
      </div>
    </div>`;
}

export const MUSIC_GIFS = [
  // Dança & Movimento
  { category: 'dance', title: 'Dança Pop', url: 'https://media.giphy.com/media/l3vRlT2k2L35Cnn5C/giphy.gif' },
  { category: 'dance', title: 'Sapo Dançarino', url: 'https://media.giphy.com/media/GeimqsH0TLDt4tScGw/giphy.gif' },
  { category: 'dance', title: 'Festa e Dança', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { category: 'dance', title: 'Dança no Ritmo', url: 'https://media.giphy.com/media/13CoXDiaCcCoyk/giphy.gif' },
  { category: 'dance', title: 'Dança Maluca', url: 'https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif' },
  { category: 'dance', title: 'Passinhos', url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif' },
  { category: 'dance', title: 'Dança na Sala', url: 'https://media.giphy.com/media/bcKmIWkUMCjVm/giphy.gif' },
  
  // Rock & Instrumental
  { category: 'rock', title: 'Headbang Rock', url: 'https://media.giphy.com/media/gui6OTCcE8x21vzhmT/giphy.gif' },
  { category: 'rock', title: 'Solo de Guitarra', url: 'https://media.giphy.com/media/xT39CXg70nNS0MFNzb/giphy.gif' },
  { category: 'rock', title: 'Guitarra Elétrica', url: 'https://media.giphy.com/media/wAxlCmeX1ri1y/giphy.gif' },
  { category: 'rock', title: 'Tocando Piano', url: 'https://media.giphy.com/media/3o85xwxr06YNoFdSbm/giphy.gif' },
  { category: 'rock', title: 'Saxofone Solo', url: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
  { category: 'rock', title: 'Bateria Pesada', url: 'https://media.giphy.com/media/y8Mz1yj13s3Cw/giphy.gif' },

  // DJ & Fones
  { category: 'dj', title: 'DJ na Pista', url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif' },
  { category: 'dj', title: 'Fones Ouvindo', url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif' },
  { category: 'dj', title: 'Disco de Vinil', url: 'https://media.giphy.com/media/ule4akeEDWA0g/giphy.gif' },
  { category: 'dj', title: 'Curtindo o Som', url: 'https://media.giphy.com/media/11ISwbgCxEzMyY/giphy.gif' },
  { category: 'dj', title: 'Fones de Ouvido', url: 'https://media.giphy.com/media/14qb1Uhf40ndw4/giphy.gif' },
  { category: 'dj', title: 'Mixando Música', url: 'https://media.giphy.com/media/5xaOcLGvzHxDKjufnLW/giphy.gif' },

  // Gatos & Memes
  { category: 'cat', title: 'Gato Dançando', url: 'https://media.giphy.com/media/3o7TKMGPU46JWzzAo8/giphy.gif' },
  { category: 'cat', title: 'Vibing Cat', url: 'https://media.giphy.com/media/DhstvI455Y09oa7APF/giphy.gif' },
  { category: 'cat', title: 'Gato Sax', url: 'https://media.giphy.com/media/chZ3FB29DuhMAHQtJL/giphy.gif' },
  { category: 'cat', title: 'Gato nos Fones', url: 'https://media.giphy.com/media/ckeHl52mNtoq87veET/giphy.gif' },

  // Cantando & Voz
  { category: 'sing', title: 'Cantando Alto', url: 'https://media.giphy.com/media/hiLLD9o1wTB3a/giphy.gif' },
  { category: 'sing', title: 'Microfone e Show', url: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif' },
  { category: 'sing', title: 'Dueto Emocionante', url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif' },

  // Reações & Emoções
  { category: 'react', title: 'Mente Explodindo', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { category: 'react', title: 'Chorando de Emoção', url: 'https://media.giphy.com/media/L95W4wv8nnb9K/giphy.gif' },
  { category: 'react', title: 'Aplausos', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { category: 'react', title: 'Gargalhada', url: 'https://media.giphy.com/media/bC9czlgCMtw4cj8RgH/giphy.gif' },
  { category: 'react', title: 'Impressionado', url: 'https://media.giphy.com/media/UO5elnTqo4vSg/giphy.gif' },
  { category: 'react', title: 'Vibração Total', url: 'https://media.giphy.com/media/12bjQ7uASAaCKk/giphy.gif' },
  { category: 'react', title: 'Uau!', url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
  { category: 'react', title: 'Comemoração', url: 'https://media.giphy.com/media/l0MYEqEzwMWFCg8rm/giphy.gif' }
];

export function renderCommentRow(c, postId, isMaximized = false) {
  const activeUser = Storage.getActiveUser();
  const post = postId ? Storage.getPostById(postId) : null;
  const canDelete = c.userId === activeUser.id || (post && post.authorId === activeUser.id);

  const cAvatar = c.userAvatar && (c.userAvatar.startsWith('http') || c.userAvatar.startsWith('data:') || c.userAvatar.startsWith('/'))
    ? `<img src="${c.userAvatar}" alt="${c.userName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (c.userAvatar || c.userName?.[0] || 'U');

  const songAttachmentHtml = c.song ? `
    <div class="comment-attached-song" style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(157,78,221,0.16);border:1px solid var(--purple-accent);padding:6px 10px;border-radius:8px;margin-top:6px;">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${c.song.artwork ? `<img src="${c.song.artwork}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;">` : ''}
        <div style="min-width:0;">
          <div style="font-size:0.78rem;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.song.title}</div>
          <div style="font-size:0.7rem;color:var(--purple-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.song.artist}</div>
        </div>
      </div>
      <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="padding:0;border-radius:50%;width:26px;height:26px;min-width:26px;display:flex;align-items:center;justify-content:center;" onclick="window._playTrack(${JSON.stringify(c.song).replace(/"/g, '&quot;')})" title="Tocar prévia">
        ${ICONS.play}
      </button>
    </div>` : '';

  const imageAttachmentHtml = c.imageUrl ? `
    <div class="comment-attached-media" style="margin-top:6px;border-radius:8px;overflow:hidden;max-width:280px;border:1px solid rgba(255,255,255,0.1);">
      <img src="${c.imageUrl}" alt="Anexo" style="width:100%;max-height:220px;object-fit:cover;display:block;" loading="lazy">
    </div>` : '';

  const gifAttachmentHtml = c.gifUrl ? `
    <div class="comment-attached-media" style="margin-top:6px;border-radius:8px;overflow:hidden;max-width:280px;border:1px solid rgba(255,255,255,0.1);">
      <img src="${c.gifUrl}" alt="GIF" style="width:100%;max-height:220px;object-fit:cover;display:block;" loading="lazy">
    </div>` : '';

  const deleteBtnHtml = canDelete ? `
    <button class="comment-delete-btn" title="Excluir comentário" onclick="event.stopPropagation();window._deleteComment('${postId}', '${c.id}')" style="background:transparent;border:none;color:var(--muted);cursor:pointer;padding:2px 4px;font-size:0.72rem;line-height:1;border-radius:4px;transition:all 0.15s;opacity:0.6;" onmouseover="this.style.opacity=1;this.style.color='#ff5555'" onmouseout="this.style.opacity=0.6;this.style.color='var(--muted)'">
      ${ICONS.trash || '✕'}
    </button>` : '';

  return `
    <div class="comment-row" id="comment-${c.id || ''}" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
      <div class="comment-avatar" onclick="window._goToProfile('${c.userId || ''}')" style="cursor:pointer;" title="Ver perfil de ${c.userName}">${cAvatar}</div>
      <div class="comment-content" style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <div class="comment-name" onclick="window._goToProfile('${c.userId || ''}')" style="cursor:pointer;">${c.userName}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.68rem;color:var(--muted);">${c.createdAt || ''}</span>
            ${deleteBtnHtml}
          </div>
        </div>
        ${c.text ? `<div class="comment-text" style="word-break:break-word;">${c.text}</div>` : ''}
        ${songAttachmentHtml}
        ${imageAttachmentHtml}
        ${gifAttachmentHtml}
        ${(() => {
          const detectedCommentUrl = extractFirstUrl(c.text);
          return c.link ? renderRichLinkCard(c.link) : (detectedCommentUrl ? renderRichLinkCard(detectedCommentUrl) : '');
        })()}
      </div>
    </div>`;
}

export function renderCommentsSectionHtml(post) {
  const commentsHtml = (post.comments || []).map(c => renderCommentRow(c, post.id)).join('');

  return `
    <div class="post-comments-container">
      <div id="comments-list-${post.id}" class="comments-list">
        ${commentsHtml || '<div class="no-comments-msg" style="font-size:0.8rem;color:var(--muted);text-align:center;padding:12px 0;">Seja o primeiro a comentar!</div>'}
      </div>

      <!-- Pending Attachment Preview (large & clear) -->
      <div id="comment-pending-attach-${post.id}" class="comment-pending-attach-box" style="display:none;margin-top:10px;"></div>

      <!-- Input and Tool Bar -->
      <div class="comment-composer-box" style="margin-top:8px;background:var(--bg-surface);border:1px solid var(--border-accent);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;align-items:center;gap:8px;width:100%;">
          <input class="doodle-input" id="comment-input-${post.id}" placeholder="Escreva um comentário..." style="font-size:0.84rem;padding:6px 10px;flex:1;background:transparent;border:none;box-shadow:none;" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();window._submitRichComment('${post.id}', this)}">
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="padding:6px 16px;" onclick="window._submitRichComment('${post.id}', this)">Enviar</button>
        </div>
        
        <!-- Attachment Toolbar -->
        <div style="display:flex;align-items:center;gap:6px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.74rem;padding:3px 8px;gap:4px;color:var(--purple-light);" onclick="window._openCommentMusicSearch('${post.id}')" title="Anexar música">
            ${ICONS.music} <span>Música</span>
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.74rem;padding:3px 8px;gap:4px;color:var(--purple-light);" onclick="window._openCommentImagePicker('${post.id}')" title="Anexar imagem">
            ${ICONS.image || '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'}
            <span>Imagem</span>
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.74rem;padding:3px 8px;gap:4px;color:var(--purple-light);" onclick="window._openCommentGifPicker('${post.id}')" title="Anexar GIF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M7 15V9h2.5v2H8.5"></path><path d="M12 9v6"></path><path d="M15 9h3M15 12h2M15 9v6"></path></svg>
            <span>GIF</span>
          </button>
        </div>
      </div>
    </div>`;
}

export function renderPostCard(post, options = {}) {
  const author = Storage.getUserById(post.authorId) || { name: '???', avatar: '?', handle: '@...' };
  const activeUser = Storage.getActiveUser();
  const liked = Array.isArray(post.likes) && post.likes.includes(activeUser.id);
  const bookmarked = Storage.isBookmarked(post.id);
  const reposted = Array.isArray(post.reposts) && post.reposts.includes(activeUser.id);
  const pinnedPostId = author.pinnedPostId;
  const isPinned = pinnedPostId === post.id;
  const isOwner = post.authorId === activeUser.id;

  const isRepost = post.isRepost || options.isRepost;
  const reposterName = post.reposterName || options.reposterName || '';

  const repostBannerHtml = isRepost ? `
    <div class="repost-header-banner">
      ${ICONS.repost || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M17 1l4 4-4 4"></path><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><path d="M7 23l-4-4 4-4"></path><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>'}
      <span>${reposterName ? `${reposterName} repostou` : 'Repostado'}</span>
    </div>` : '';

  const songHtml = post.song ? `
    <div class="post-attached-song">
      <div class="post-song-info">
        <img class="post-song-cover" src="${post.song.artwork || ''}" alt="" onerror="this.style.display='none'">
        <div>
          <div class="post-song-title">${post.song.title}</div>
          <div class="post-song-artist">${post.song.artist}</div>
        </div>
      </div>
      <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._playTrack(${JSON.stringify(post.song).replace(/"/g, '&quot;')})">
        ${ICONS.play}
      </button>
    </div>` : '';

  const playlistHtml = renderPostPlaylistCard(post);
  const imageHtml = post.imageUrl ? `<img class="post-attached-image" src="${post.imageUrl}" alt="post image" loading="lazy">` : '';
  const detectedPostUrl = extractFirstUrl(post.text);
  const linkHtml = post.link ? renderRichLinkCard(post.link) : (detectedPostUrl ? renderRichLinkCard(detectedPostUrl) : '');

  const ratingHtml = post.rating > 0 ? `
    <div class="post-rating-display">
      ${renderRatingStars(post.rating, 18)}
      <span>${post.rating.toFixed(1)}</span>
    </div>` : '';

  const pinnedLabel = isPinned ? `<div class="pinned-label">${ICONS.pin} Post Fixado</div>` : '';

  const authorAvatarHtml = author.avatar && (author.avatar.startsWith('http') || author.avatar.startsWith('data:') || author.avatar.startsWith('/'))
    ? `<img src="${author.avatar}" alt="${author.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (author.avatar || author.name?.[0] || 'U');

  return `
    <div class="post-card${isPinned ? ' pinned-post' : ''}" data-post-id="${post.id}">
      ${repostBannerHtml}
      ${pinnedLabel}
      <div class="post-header">
        <div class="post-author" onclick="window._goToProfile('${post.authorId}')">
          <div class="post-author-avatar">${authorAvatarHtml}</div>
          <div>
            <div class="post-author-name">${author.name}</div>
            <div class="post-author-handle">${author.handle || ''}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="post-meta">${post.updatedAt || post.createdAt || ''}</span>
          <button class="post-options-btn" onclick="window._togglePostOptions('${post.id}', event)" title="Opções">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="12" cy="19" r="2"></circle></svg>
          </button>
        </div>
      </div>
      <div id="post-options-${post.id}" class="post-options-dropdown" style="display:none;">
        ${isOwner ? `
          <button class="post-options-item" onclick="window._openEditPost('${post.id}')">Editar post</button>
          <button class="post-options-item" onclick="window._pinPost('${post.id}')">
            ${isPinned ? 'Desfixar do perfil' : 'Fixar no perfil'}
          </button>
          <button class="post-options-item danger" onclick="window._deletePost('${post.id}')">Excluir post</button>
        ` : ''}
        <button class="post-options-item" onclick="window._bookmarkPost('${post.id}')">
          ${bookmarked ? 'Remover dos salvos' : 'Salvar post'}
        </button>
        ${!isOwner ? `<button class="post-options-item danger" onclick="window._reportUser('${post.authorId}')">Reportar</button>` : ''}
      </div>

      ${post.text ? `<div class="post-text">${post.text}${post.tag ? `<span class="post-tag">${post.tag}</span>` : ''}</div>` : ''}
      ${ratingHtml}
      ${renderLyricsCard(post)}
      ${imageHtml}
      ${songHtml}
      ${playlistHtml}
      ${linkHtml}

      <div class="post-actions">
        <button class="btn-post-action${liked ? ' liked' : ''}" onclick="window._likePost('${post.id}', this)">
          ${liked ? ICONS.heartFilled : ICONS.heartEmpty}
          <span class="like-count">${(post.likes || []).length}</span>
        </button>
        <button class="btn-post-action" onclick="window._toggleComments('${post.id}', this, event)">
          ${ICONS.chat}
          <span class="comment-count">${(post.comments || []).length}</span>
        </button>
        <button class="btn-post-action${reposted ? ' reposted' : ''}" onclick="window._repostPost('${post.id}', this)">
          ${ICONS.repost || ICONS.refresh}
          <span class="repost-count">${(post.reposts || []).length}</span>
        </button>
        <button class="btn-post-action${bookmarked ? ' bookmarked' : ''}" onclick="window._bookmarkPost('${post.id}')">
          ${ICONS.bookmark || ICONS.attach}
        </button>
      </div>

      <div id="comments-${post.id}" class="post-comments-section" style="display:none;">
        ${renderCommentsSectionHtml(post, false)}
      </div>
    </div>`;
}

// ──────────────────────────────────────────
// POST CREATOR
// ──────────────────────────────────────────

export let creatorState = {
  selectedSong: null,
  selectedPlaylist: null,
  lyricsText: '',
  lyricsSong: '',
  lyricsArt: '',
  lyricsCardStyle: 'compact',
  rating: 0,
  tag: '#música',
  showLyrics: false
};

export function renderPostCreator(containerEl) {
  const activeUser = Storage.getActiveUser();
  const creatorAvatarHtml = activeUser.avatar && (activeUser.avatar.startsWith('http') || activeUser.avatar.startsWith('data:') || activeUser.avatar.startsWith('/'))
    ? `<img src="${activeUser.avatar}" alt="${activeUser.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : (activeUser.avatar || activeUser.name?.[0] || 'U');

  containerEl.innerHTML = `
    <div class="create-post-card">
      <div class="create-post-top">
        <div class="creator-avatar">${creatorAvatarHtml}</div>
        <div class="creator-fields">
          <textarea id="creator-text" class="create-post-textarea" placeholder="Compartilhe algo..."></textarea>
        </div>
      </div>

      <!-- Attachments — full width, below the top row -->
      <div id="creator-lyrics-attach"    style="display:none"></div>
      <div id="creator-song-attach"      style="display:none"></div>
      <div id="creator-playlist-attach"  style="display:none"></div>
      <div id="creator-image-attach"     style="display:none"></div>
      <div id="creator-rating-attach"    style="display:none"></div>

      <!-- Separator -->
      <div style="border-top:var(--border);margin-top:12px;"></div>

      <!-- Action bar -->
      <div class="creator-action-bar">
        <div class="creator-attach-btns">
          <button class="btn-attach" title="Adicionar letra" onclick="window._creatorToggleLyrics()">
            ${ICONS.music}
            <span>Letra</span>
          </button>
          <button class="btn-attach" title="Vincular música" onclick="window._creatorOpenSearch()">
            ${ICONS.search}
            <span>Música</span>
          </button>
          <button class="btn-attach" title="Vincular playlist" onclick="window._creatorOpenPlaylistPicker()">
            ${ICONS.playlist}
            <span>Playlist</span>
          </button>
          <button class="btn-attach" title="Anexar imagem (URL ou arquivo)" onclick="window._creatorOpenImagePicker()">
            ${ICONS.image || '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'}
            <span>Imagem</span>
          </button>
          <button class="btn-attach" title="Dar nota" onclick="window._creatorToggleRating()">
            ${getStarSVG(1, 16)}
            <span>Nota</span>
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <select id="creator-tag" class="doodle-input" style="width:auto;padding:6px 10px;font-size:0.82rem;">
            <option value="#música">#música</option>
            <option value="#letra">#letra</option>
            <option value="#desabafo">#desabafo</option>
            <option value="#descoberta">#descoberta</option>
            <option value="#recomendo">#recomendo</option>
            <option value="#ao-vivo">#ao-vivo</option>
            <option value="#clássico">#clássico</option>
          </select>
          <button class="doodle-btn doodle-btn-primary" style="padding:8px 22px;" onclick="window._submitPost()">Postar</button>
        </div>
      </div>
    </div>`;

  // Re-bind creator global handlers
  window._creatorToggleLyrics = () => {
    creatorState.showLyrics = !creatorState.showLyrics;
    const el = document.getElementById('creator-lyrics-attach');
    if (!el) return;
    if (creatorState.showLyrics) {
      // Pick a random card style
      const lyricData = getRandomLyric();
      creatorState.lyricsText = lyricData.lyrics;
      creatorState.lyricsSong = `${lyricData.song} — ${lyricData.artist}`;
      creatorState.lyricsArt = lyricData.albumArt || '';
      creatorState.lyricsCardStyle = getRandomCardStyle();
      el.style.display = 'block';
      el.innerHTML = `
        <div class="creator-lyrics-box">
          <!-- Header -->
          <div class="creator-lyrics-header">
            <div style="display:flex;align-items:center;gap:6px;">
              ${ICONS.music}
              <span style="font-weight:700;color:var(--white);font-size:0.88rem;">Letra Anexada</span>
            </div>
            <button type="button" class="btn-attach" style="color:#ff5555;border-color:rgba(255,85,85,0.35);" onclick="window._creatorRemoveLyrics()">
              Remover ${ICONS.close}
            </button>
          </div>

          <!-- Lyrics textarea -->
          <textarea id="creator-lyrics" class="creator-lyrics-textarea" placeholder="Cole o trecho da letra aqui..." oninput="window._creatorLyricsChanged()">${lyricData.lyrics}</textarea>

          <!-- Song chip — shows selected track or CTA to search -->
          <div id="creator-lyrics-song-row" style="display:flex;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--purple-accent);border-radius:var(--radius-md);">
            <div id="creator-lyrics-song-info" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
              ${creatorState.selectedLyricsTrack ? `
                <img id="creator-lyrics-preview-img" src="${creatorState.selectedLyricsTrack.artwork}" style="width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;">
                <div style="min-width:0;flex:1;">
                  <div id="creator-lyrics-preview-title" style="font-size:0.9rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${creatorState.lyricsSong}</div>
                  <div style="font-size:0.72rem;color:var(--purple-light);">Música vinculada à letra</div>
                </div>
              ` : `
                <div style="min-width:0;flex:1;">
                  <div id="creator-lyrics-preview-title" style="font-size:0.88rem;color:var(--muted);">Nenhuma música vinculada ainda</div>
                </div>
              `}
            </div>
            <button type="button" class="doodle-btn doodle-btn-primary doodle-btn-sm" style="flex-shrink:0;display:flex;align-items:center;gap:6px;" onclick="window._openSearchForLyrics()">
              ${ICONS.search} Buscar música
            </button>
          </div>

          <!-- Hidden inputs to carry data through -->
          <input type="hidden" id="creator-lyrics-song" value="${lyricData.song} — ${lyricData.artist}">
          <input type="hidden" id="creator-lyrics-art" value="${lyricData.albumArt || ''}">
        </div>`;
    } else {
      window._creatorRemoveLyrics();
    }
  };

  window._setCreatorLyricsSong = (track) => {
    creatorState.lyricsSong = `${track.title} — ${track.artist}`;
    creatorState.lyricsArt = track.artwork;
    creatorState.selectedLyricsTrack = track;
    creatorState.lyricsCardStyle = 'with-cover'; // auto-pick best style when there's art

    const songInp = document.getElementById('creator-lyrics-song');
    const artInp  = document.getElementById('creator-lyrics-art');
    if (songInp) songInp.value = creatorState.lyricsSong;
    if (artInp)  artInp.value  = creatorState.lyricsArt;

    // Rebuild the song-info chip to show the cover thumbnail
    const songInfo = document.getElementById('creator-lyrics-song-info');
    if (songInfo) {
      songInfo.innerHTML = `
        <img id="creator-lyrics-preview-img" src="${track.artwork}" style="width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--purple-accent);">
        <div style="min-width:0;flex:1;">
          <div id="creator-lyrics-preview-title" style="font-size:0.9rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${creatorState.lyricsSong}</div>
          <div style="font-size:0.72rem;color:var(--purple-light);">Música vinculada à letra</div>
        </div>`;
    }
  };

  window._creatorRemoveLyrics = () => {
    creatorState.showLyrics = false;
    creatorState.lyricsText = '';
    creatorState.lyricsSong = '';
    creatorState.lyricsArt = '';
    const el = document.getElementById('creator-lyrics-attach');
    if (el) {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  };

  window._creatorLyricsChanged = () => {
    creatorState.lyricsText = document.getElementById('creator-lyrics')?.value || '';
    creatorState.lyricsSong = document.getElementById('creator-lyrics-song')?.value || '';
    creatorState.lyricsArt  = document.getElementById('creator-lyrics-art')?.value  || '';
    
    const prevTitle = document.getElementById('creator-lyrics-preview-title');
    const prevImg = document.getElementById('creator-lyrics-preview-img');
    if (prevTitle && creatorState.lyricsSong) prevTitle.textContent = creatorState.lyricsSong;
    if (prevImg && creatorState.lyricsArt) prevImg.src = creatorState.lyricsArt;
  };

  window._creatorToggleRating = () => {
    const el = document.getElementById('creator-rating-attach');
    if (!el) return;
    if (el.style.display === 'none' || !el.style.display) {
      el.style.display = 'block';
      renderCreatorRating(el);
    } else {
      el.style.display = 'none';
      creatorState.rating = 0;
    }
  };

  window._creatorSetTag = (tag) => {
    creatorState.tag = tag;
    const sel = document.getElementById('creator-tag');
    if (sel) sel.value = tag;
  };

  window._creatorOpenImagePicker = () => {
    const modal = document.getElementById('post-image-modal');
    const body = document.getElementById('post-image-modal-body');
    if (!modal || !body) return;

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <label class="form-label" style="font-weight:700;color:var(--white);margin-bottom:6px;display:block;">URL da Imagem da Web:</label>
          <div style="display:flex;gap:6px;">
            <input class="doodle-input" id="post-img-url-input" placeholder="https://exemplo.com/foto.jpg" style="flex:1;font-size:0.86rem;">
            <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="const u=document.getElementById('post-img-url-input').value.trim();if(u){window._setPostCreatorImage(u);}">Anexar</button>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;">
          <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
          <span style="font-size:0.75rem;color:var(--muted);font-weight:700;">OU CARREGAR DO DISPOSITIVO</span>
          <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
        </div>

        <div>
          <label class="doodle-btn doodle-btn-secondary" style="width:100%;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;padding:12px;font-weight:700;">
            ${ICONS.image || ''}
            <span>Escolher imagem do computador / celular</span>
            <input type="file" id="post-img-file-input" accept="image/*" style="display:none;" onchange="window._handlePostImageUpload(event)">
          </label>
        </div>
      </div>`;

    if (window.openDoodleModal) window.openDoodleModal('post-image-modal');
  };

  window._handlePostImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      window._setPostCreatorImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  window._setPostCreatorImage = (url) => {
    window._pendingCreatorImage = url;
    if (window.closeDoodleModal) window.closeDoodleModal('post-image-modal');
    const el = document.getElementById('creator-image-attach');
    if (el) {
      el.style.display = 'block';
      el.innerHTML = `
        <div style="position:relative;display:inline-block;max-width:320px;border-radius:10px;overflow:hidden;border:1.5px solid #00f2fe;box-shadow:0 4px 12px rgba(0,0,0,0.3);margin-top:10px;">
          <img src="${url}" alt="Imagem do post" style="width:100%;max-height:220px;object-fit:cover;display:block;">
          <button type="button" onclick="window._removeCreatorImage()" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.7);color:#fff;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;font-weight:900;display:flex;align-items:center;justify-content:center;" title="Remover imagem">✕</button>
        </div>`;
    }
    import('./ui.js').then(u => u.showToast('Imagem anexada à publicação!'));
  };

  window._removeCreatorImage = () => {
    window._pendingCreatorImage = null;
    const el = document.getElementById('creator-image-attach');
    if (el) {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  };
}

function renderCreatorRating(el) {
  const currentRating = creatorState.rating || 0;
  const presets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

  el.innerHTML = `
    <div class="creator-rating-row" style="display:flex;flex-direction:column;gap:8px;background:var(--bg-surface);border:1px solid var(--purple-accent);border-radius:var(--radius-md);padding:10px 12px;margin-top:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <span class="form-label" style="margin:0;font-weight:700;color:var(--white);">Nota para a música:</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="rating-value-badge" style="font-size:0.9rem;font-weight:800;color:#ffb800;background:rgba(255,184,0,0.12);padding:2px 8px;border-radius:var(--radius-pill);border:1px solid rgba(255,184,0,0.3);display:inline-flex;align-items:center;gap:4px;">
            ${currentRating > 0 ? `${getStarSVG(1, 14)} <span>${currentRating.toFixed(1)}</span>` : 'Sem nota'}
          </span>
          ${currentRating > 0 ? `<button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.7rem;padding:2px 6px;" onclick="window._pickStar(0)">Limpar</button>` : ''}
        </div>
      </div>

      <!-- 5 Interactive Stars with Half-Star Click Zones -->
      <div id="creator-stars-row" style="display:flex;gap:6px;align-items:center;padding:4px 0;">
        ${[1, 2, 3, 4, 5].map(n => {
          const fill = currentRating >= n ? 1 : (currentRating >= n - 0.5 ? 0.5 : 0);
          return `
            <div style="position:relative;display:inline-block;cursor:pointer;line-height:0;" title="${n-0.5} ou ${n}">
              ${getStarSVG(fill, 28)}
              <!-- Left half click target (.5) -->
              <div onclick="window._pickStar(${n - 0.5})" style="position:absolute;top:0;left:0;width:50%;height:100%;z-index:2;" title="Nota ${n - 0.5}"></div>
              <!-- Right half click target (.0) -->
              <div onclick="window._pickStar(${n})" style="position:absolute;top:0;right:0;width:50%;height:100%;z-index:2;" title="Nota ${n}.0"></div>
            </div>`;
        }).join('')}
      </div>

      <!-- Quick Decimal Rating Preset Pills -->
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
        ${presets.map(p => `
          <button type="button" class="rating-preset-btn${currentRating === p ? ' active' : ''}" onclick="window._pickStar(${p})" style="padding:2px 6px;font-size:0.72rem;background:${currentRating === p ? 'rgba(255,184,0,0.2)' : 'var(--bg-card)'};border:1px solid ${currentRating === p ? '#ffb800' : 'var(--border)'};color:${currentRating === p ? '#ffb800' : 'var(--muted)'};border-radius:4px;cursor:pointer;">
            ${p.toFixed(1)}
          </button>
        `).join('')}
      </div>
    </div>`;

  window._pickStar = (val) => {
    creatorState.rating = val;
    renderCreatorRating(el);
  };
}

// ──────────────────────────────────────────
// FEED RENDERING
// ──────────────────────────────────────────

export function renderFeed(container, filterMode = 'all') {
  const posts = Storage.getFeedPosts(filterMode);
  const activeUser = Storage.getActiveUser();

  if (!posts.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Nada por aqui ainda</div><div class="empty-state-sub">${filterMode === 'following' ? 'Siga alguém para ver os posts deles.' : 'Seja o primeiro a postar algo!'}</div></div>`;
    return;
  }

  container.innerHTML = `<div class="feed-posts-list">${posts.map(p => renderPostCard(p)).join('')}</div>`;

  // Close options dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-options-btn') && !e.target.closest('.post-options-dropdown')) {
      document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
    }
  });
}

// ──────────────────────────────────────────
// POST MAXIMIZATION & RICH COMMENTS HANDLERS
// ──────────────────────────────────────────

window._pendingCommentAttachments = window._pendingCommentAttachments || {};

function updateCommentPendingBox(postId) {
  const data = (window._pendingCommentAttachments && window._pendingCommentAttachments[postId]) || {};
  const cards = document.querySelectorAll(`.post-card[data-post-id="${postId}"]`);
  const hasAttach = Boolean(data.song || data.imageUrl || data.gifUrl);

  cards.forEach(card => {
    const box = card.querySelector('.comment-pending-attach-box');
    if (!box) return;

    if (!hasAttach) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }

    box.style.display = 'flex';
    box.style.flexDirection = 'column';
    box.style.gap = '10px';
    box.style.marginTop = '10px';
    box.style.marginBottom = '6px';
    box.innerHTML = `
    ${data.song ? `
      <div style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(157,78,221,0.18);border:1.5px solid var(--purple-accent);border-radius:10px;padding:10px 14px;box-shadow:0 4px 12px rgba(0,0,0,0.25);">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          ${data.song.artwork ? `<img src="${data.song.artwork}" style="width:54px;height:54px;border-radius:8px;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,0.3);flex-shrink:0;">` : ''}
          <div style="min-width:0;">
            <div style="font-size:0.72rem;color:var(--purple-light);font-weight:800;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">🎵 Música Anexada</div>
            <div style="font-size:0.94rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${data.song.title}</div>
            <div style="font-size:0.8rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${data.song.artist}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <button type="button" class="doodle-btn doodle-btn-primary doodle-btn-sm" style="width:34px;height:34px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;" onclick="window._playTrack(${JSON.stringify(data.song).replace(/"/g, '&quot;')})" title="Ouvir prévia">
            ${ICONS.play}
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._removeCommentAttachment('${postId}', 'song')" style="width:30px;height:30px;padding:0;border-radius:50%;color:#ff5555;font-weight:800;" title="Remover música">
            ✕
          </button>
        </div>
      </div>` : ''}

    ${data.imageUrl ? `
      <div style="position:relative;display:inline-block;max-width:340px;border-radius:10px;overflow:hidden;border:1.5px solid rgba(0,242,254,0.6);box-shadow:0 4px 14px rgba(0,0,0,0.3);background:#000;">
        <img src="${data.imageUrl}" alt="Prévia da imagem" style="width:100%;max-height:240px;object-fit:cover;display:block;">
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:3px 8px;border-radius:6px;font-size:0.72rem;color:#00f2fe;font-weight:800;">
          🖼️ Imagem Anexada
        </div>
        <button type="button" onclick="window._removeCommentAttachment('${postId}', 'imageUrl')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.75);border:1px solid rgba(255,255,255,0.2);color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-weight:900;" title="Remover imagem">✕</button>
      </div>` : ''}

    ${data.gifUrl ? `
      <div style="position:relative;display:inline-block;max-width:340px;border-radius:10px;overflow:hidden;border:1.5px solid rgba(255,184,0,0.7);box-shadow:0 4px 14px rgba(0,0,0,0.3);background:#000;">
        <img src="${data.gifUrl}" alt="Prévia do GIF" style="width:100%;max-height:240px;object-fit:cover;display:block;">
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:3px 8px;border-radius:6px;font-size:0.72rem;color:#ffb800;font-weight:800;">
          👾 GIF Anexado
        </div>
        <button type="button" onclick="window._removeCommentAttachment('${postId}', 'gifUrl')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.75);border:1px solid rgba(255,255,255,0.2);color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-weight:900;" title="Remover GIF">✕</button>
      </div>` : ''}
    `;
  });
}

window._openCommentMusicSearch = (postId) => {
  const el = document.getElementById(`comments-${postId}`);
  if (el) el.style.display = 'block';
  import('./ui.js').then(u => u.openSearchModalForComment(postId));
};

const GIPHY_API_KEY = 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh';
let activeGifCategory = 'all';
let gifSearchTimeout = null;

async function queryGifApi(term = '', category = 'all') {
  try {
    let url = '';
    const cleanTerm = (term || '').trim();
    if (cleanTerm) {
      url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(cleanTerm)}&limit=24&rating=g`;
    } else if (category && category !== 'all') {
      const catMap = {
        dance: 'dance music',
        rock: 'rock music guitar',
        dj: 'dj vinyl headphones',
        cat: 'cat vibing music',
        sing: 'singing concert',
        react: 'reaction celebration'
      };
      const catQuery = catMap[category] || category;
      url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(catQuery)}&limit=24&rating=g`;
    } else {
      url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('API error: ' + res.status);
    const data = await res.json();
    if (Array.isArray(data.data) && data.data.length > 0) {
      return data.data.map(item => ({
        title: item.title || 'GIF',
        url: item.images?.fixed_height?.url || item.images?.original?.url || item.images?.downsized?.url
      })).filter(g => Boolean(g.url));
    }
  } catch (err) {
    console.warn('GIF API query failed, fallback to local list:', err);
  }

  // Fallback to local MUSIC_GIFS
  let fallback = MUSIC_GIFS;
  if (category && category !== 'all') {
    fallback = fallback.filter(g => g.category === category);
  }
  if (term.trim()) {
    const q = term.trim().toLowerCase();
    fallback = fallback.filter(g => g.title.toLowerCase().includes(q));
  }
  return fallback;
}

window._openCommentGifPicker = (postId) => {
  const modal = document.getElementById('comment-gif-modal');
  const body = document.getElementById('comment-gif-modal-body');
  if (!modal || !body) return;

  activeGifCategory = 'all';

  const categories = [
    { id: 'all', label: '🔥 Em Alta' },
    { id: 'dance', label: '💃 Dança' },
    { id: 'rock', label: '🎸 Rock' },
    { id: 'dj', label: '🎧 DJ & Fones' },
    { id: 'cat', label: '🐱 Gatos' },
    { id: 'sing', label: '🎤 Cantando' },
    { id: 'react', label: '👏 Reações' }
  ];

  const renderGridItems = (gifs) => {
    if (!gifs || !gifs.length) {
      return `<div style="grid-column:1/-1;text-align:center;padding:30px 10px;color:var(--muted);font-size:0.85rem;">Nenhum GIF encontrado para essa pesquisa. Tente outro termo ou cole o link abaixo.</div>`;
    }
    return gifs.map(g => `
      <div class="gif-picker-item" onclick="window._setCommentGif('${postId}', '${g.url}')" title="Clique para anexar">
        <img src="${g.url}" alt="" loading="lazy">
      </div>
    `).join('');
  };

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;">
      <!-- Search Input -->
      <div style="position:relative;">
        <input class="doodle-input" id="gif-search-input" placeholder="Pesquisar qualquer GIF (ex: rock, dança, cat, beyonce...)" style="width:100%;font-size:0.88rem;padding-right:34px;" oninput="window._handleGifSearchInput('${postId}')">
        <div id="gif-search-spinner" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);display:none;font-size:12px;color:var(--purple-light);">⏳</div>
      </div>

      <!-- Categories Chips -->
      <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;" class="hide-scrollbar">
        ${categories.map(cat => `
          <button type="button" class="doodle-btn doodle-btn-sm ${cat.id === 'all' ? 'doodle-btn-primary' : 'doodle-btn-secondary'} gif-cat-btn" data-cat="${cat.id}" style="padding:4px 12px;font-size:0.75rem;white-space:nowrap;border-radius:16px;" onclick="window._handleGifCategoryChange('${cat.id}', '${postId}')">
            ${cat.label}
          </button>
        `).join('')}
      </div>
      
      <!-- Direct Custom URL option -->
      <div style="display:flex;gap:6px;">
        <input class="doodle-input" id="custom-gif-url-input" placeholder="Ou cole a URL direta de qualquer GIF (.gif)..." style="flex:1;font-size:0.8rem;">
        <button class="doodle-btn doodle-btn-secondary doodle-btn-sm" onclick="const u=document.getElementById('custom-gif-url-input').value.trim();if(u)window._setCommentGif('${postId}', u)">Anexar</button>
      </div>

      <!-- Grid Container -->
      <div id="gif-grid-container" class="gif-picker-grid">
        <div style="grid-column:1/-1;text-align:center;padding:30px 10px;color:var(--purple-light);font-size:0.85rem;">Carregando acervo de GIFs...</div>
      </div>
    </div>
  `;

  // Initial load
  queryGifApi('', 'all').then(gifs => {
    const grid = document.getElementById('gif-grid-container');
    if (grid) grid.innerHTML = renderGridItems(gifs);
  });

  window._handleGifSearchInput = (pId) => {
    const spinner = document.getElementById('gif-search-spinner');
    if (spinner) spinner.style.display = 'block';

    if (gifSearchTimeout) clearTimeout(gifSearchTimeout);
    gifSearchTimeout = setTimeout(async () => {
      const q = document.getElementById('gif-search-input')?.value || '';
      const gifs = await queryGifApi(q, activeGifCategory);
      const grid = document.getElementById('gif-grid-container');
      if (grid) grid.innerHTML = renderGridItems(gifs);
      if (spinner) spinner.style.display = 'none';
    }, 320);
  };

  window._handleGifCategoryChange = async (catId, pId) => {
    activeGifCategory = catId;
    document.querySelectorAll('.gif-cat-btn').forEach(btn => {
      if (btn.dataset.cat === catId) {
        btn.className = 'doodle-btn doodle-btn-sm doodle-btn-primary gif-cat-btn';
      } else {
        btn.className = 'doodle-btn doodle-btn-sm doodle-btn-secondary gif-cat-btn';
      }
    });

    const input = document.getElementById('gif-search-input');
    if (input) input.value = '';

    const grid = document.getElementById('gif-grid-container');
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px 10px;color:var(--purple-light);font-size:0.85rem;">Carregando...</div>';

    const gifs = await queryGifApi('', catId);
    if (grid) grid.innerHTML = renderGridItems(gifs);
  };

  if (window.openDoodleModal) window.openDoodleModal('comment-gif-modal');
};

window._openCommentImagePicker = (postId) => {
  const modal = document.getElementById('comment-image-modal');
  const body = document.getElementById('comment-image-modal-body');
  if (!modal || !body) return;

  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div>
        <label class="form-label" style="font-weight:700;color:var(--white);margin-bottom:6px;display:block;">URL da Imagem:</label>
        <div style="display:flex;gap:6px;">
          <input class="doodle-input" id="comment-img-url-input" placeholder="https://exemplo.com/foto.jpg" style="flex:1;font-size:0.84rem;">
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" onclick="const u=document.getElementById('comment-img-url-input').value.trim();if(u)window._setCommentImage('${postId}', u)">Anexar</button>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
        <span style="font-size:0.75rem;color:var(--muted);">OU CARREGAR ARQUIVO</span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
      </div>

      <div>
        <label class="doodle-btn doodle-btn-secondary" style="width:100%;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
          ${ICONS.image || ''}
          <span>Escolher imagem do dispositivo</span>
          <input type="file" id="comment-img-file-input" accept="image/*" style="display:none;" onchange="window._handleCommentImageUpload(event, '${postId}')">
        </label>
      </div>
    </div>
  `;

  if (window.openDoodleModal) window.openDoodleModal('comment-image-modal');
};

window._setCommentSong = (postId, track) => {
  window._pendingCommentAttachments[postId] = window._pendingCommentAttachments[postId] || {};
  window._pendingCommentAttachments[postId].song = track;

  const el = document.getElementById(`comments-${postId}`);
  if (el) el.style.display = 'block';

  updateCommentPendingBox(postId);

  const input = document.getElementById(`comment-input-${postId}`);
  if (input) input.focus();
};

window._setCommentImage = (postId, imgUrl) => {
  window._pendingCommentAttachments[postId] = window._pendingCommentAttachments[postId] || {};
  window._pendingCommentAttachments[postId].imageUrl = imgUrl;
  if (window.closeDoodleModal) window.closeDoodleModal('comment-image-modal');

  const el = document.getElementById(`comments-${postId}`);
  if (el) el.style.display = 'block';

  updateCommentPendingBox(postId);
};

window._setCommentGif = (postId, gifUrl) => {
  window._pendingCommentAttachments[postId] = window._pendingCommentAttachments[postId] || {};
  window._pendingCommentAttachments[postId].gifUrl = gifUrl;
  if (window.closeDoodleModal) window.closeDoodleModal('comment-gif-modal');

  const el = document.getElementById(`comments-${postId}`);
  if (el) el.style.display = 'block';

  updateCommentPendingBox(postId);
};

window._removeCommentAttachment = (postId, type) => {
  if (window._pendingCommentAttachments[postId]) {
    delete window._pendingCommentAttachments[postId][type];
  }
  updateCommentPendingBox(postId);
};

window._handleCommentImageUpload = (event, postId) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    window._setCommentImage(postId, e.target.result);
  };
  reader.readAsDataURL(file);
};

let pendingDeleteCommentTarget = null;

window._deleteComment = (postId, commentId) => {
  pendingDeleteCommentTarget = { postId, commentId };
  const btn = document.getElementById('confirm-delete-comment-btn');
  if (btn) {
    btn.onclick = () => {
      if (pendingDeleteCommentTarget) {
        const { postId: pId, commentId: cId } = pendingDeleteCommentTarget;
        const ok = Storage.deleteComment(pId, cId);
        if (ok) {
          refreshCommentsDisplay(pId);
          import('./ui.js').then(u => u.showToast('Comentário excluído com sucesso!'));
        }
      }
      if (window.closeDoodleModal) window.closeDoodleModal('delete-comment-modal');
      pendingDeleteCommentTarget = null;
    };
  }
  if (window.openDoodleModal) window.openDoodleModal('delete-comment-modal');
};

export function refreshCommentsDisplay(postId) {
  const updatedPost = Storage.getPostById(postId);
  if (!updatedPost) return;
  const updatedCount = (updatedPost.comments || []).length;

  const cards = document.querySelectorAll(`.post-card[data-post-id="${postId}"]`);
  cards.forEach(card => {
    const listEl = card.querySelector('.comments-list');
    if (listEl) {
      listEl.innerHTML = (updatedPost.comments || []).map(c => renderCommentRow(c, postId)).join('') ||
        '<div class="no-comments-msg" style="font-size:0.8rem;color:var(--muted);text-align:center;padding:12px 0;">Seja o primeiro a comentar!</div>';
    }
    const countEl = card.querySelector('.btn-post-action .comment-count');
    if (countEl) countEl.textContent = updatedCount;
  });
}

window._toggleComments = (postId, btn, event) => {
  if (event) event.stopPropagation();

  let postCard = btn ? btn.closest('.post-card') : null;
  if (!postCard) {
    const cards = Array.from(document.querySelectorAll(`.post-card[data-post-id="${postId}"]`));
    postCard = cards.find(c => c.offsetParent !== null) || cards[0];
  }
  if (!postCard) return;

  const commentsSection = postCard.querySelector('.post-comments-section');
  if (!commentsSection) return;

  const isHidden = window.getComputedStyle(commentsSection).display === 'none' || commentsSection.style.display === 'none' || !commentsSection.style.display;
  commentsSection.style.display = isHidden ? 'flex' : 'none';

  if (isHidden) {
    const input = commentsSection.querySelector('.doodle-input');
    if (input) setTimeout(() => input.focus(), 50);
  }
};

window._submitRichComment = (postId, btn) => {
  let postCard = btn ? btn.closest('.post-card') : null;
  if (!postCard) {
    const cards = Array.from(document.querySelectorAll(`.post-card[data-post-id="${postId}"]`));
    postCard = cards.find(c => c.offsetParent !== null) || cards[0];
  }
  const inputEl = postCard ? postCard.querySelector(`input[id^="comment-input-"]`) : document.getElementById(`comment-input-${postId}`);
  const text = inputEl?.value?.trim() || '';
  window._pendingCommentAttachments = window._pendingCommentAttachments || {};
  const attach = window._pendingCommentAttachments[postId] || {};

  if (!text && !attach.song && !attach.imageUrl && !attach.gifUrl) return;

  const newComment = Storage.addCommentToPost(postId, {
    text,
    song: attach.song || null,
    imageUrl: attach.imageUrl || '',
    gifUrl: attach.gifUrl || ''
  });

  if (newComment) {
    if (inputEl) inputEl.value = '';

    window._pendingCommentAttachments[postId] = {};
    updateCommentPendingBox(postId);

    refreshCommentsDisplay(postId);

    import('./ui.js').then(u => u.showToast('Comentário enviado!'));
  }
};

// ──────────────────────────────────────────
// LYRIC OF THE DAY WIDGET
// ──────────────────────────────────────────

let cachedLyricOfDay = null;
let cachedLyricCardStyle = null;
let _isAudioSubscribedForLyrics = false;

function updateLyricPlayButtonState() {
  const btn = document.getElementById('lyric-play-btn');
  const coverThumb = document.getElementById('lyric-widget-cover');
  if (!btn || !cachedLyricOfDay) return;

  const cur = globalAudio.getCurrentTrack();
  const isThisSong = cur && (
    (cachedLyricOfDay.itunesTrack?.id && cur.id && String(cachedLyricOfDay.itunesTrack.id) === String(cur.id)) ||
    (cachedLyricOfDay.previewUrl && cur.previewUrl && cachedLyricOfDay.previewUrl === cur.previewUrl) ||
    (cur.title && cachedLyricOfDay.song && cur.title.trim().toLowerCase() === cachedLyricOfDay.song.trim().toLowerCase() &&
     cur.artist && cachedLyricOfDay.artist && cur.artist.trim().toLowerCase() === cachedLyricOfDay.artist.trim().toLowerCase())
  );

  const isPlaying = isThisSong && globalAudio.getIsPlaying();

  if (isPlaying) {
    btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`;
    btn.classList.add('playing');
    btn.title = "Pausar prévia";
    if (coverThumb) coverThumb.classList.add('playing');
  } else {
    btn.innerHTML = ICONS.play;
    btn.classList.remove('playing');
    btn.title = "Ouvir prévia no iTunes";
    if (coverThumb) coverThumb.classList.remove('playing');
  }
}

// Global handler to play/pause lyric of the day
window._playLyricTrack = async () => {
  if (!cachedLyricOfDay) return;

  // If already loaded in globalAudio, toggle directly
  const cur = globalAudio.getCurrentTrack();
  const isThisSong = cur && (
    (cachedLyricOfDay.itunesTrack?.id && cur.id && String(cachedLyricOfDay.itunesTrack.id) === String(cur.id)) ||
    (cachedLyricOfDay.previewUrl && cur.previewUrl && cachedLyricOfDay.previewUrl === cur.previewUrl) ||
    (cur.title && cachedLyricOfDay.song && cur.title.trim().toLowerCase() === cachedLyricOfDay.song.trim().toLowerCase() &&
     cur.artist && cachedLyricOfDay.artist && cur.artist.trim().toLowerCase() === cachedLyricOfDay.artist.trim().toLowerCase())
  );

  if (isThisSong) {
    globalAudio.playTrack(cur);
    updateLyricPlayButtonState();
    return;
  }

  // If we already have the itunesTrack or previewUrl, play directly
  if (cachedLyricOfDay.itunesTrack && cachedLyricOfDay.itunesTrack.previewUrl) {
    globalAudio.playTrack(cachedLyricOfDay.itunesTrack);
    updateLyricPlayButtonState();
    return;
  }

  if (cachedLyricOfDay.previewUrl) {
    const trackObj = {
      title: cachedLyricOfDay.song,
      artist: cachedLyricOfDay.artist,
      artwork: cachedLyricOfDay.albumArt || '',
      previewUrl: cachedLyricOfDay.previewUrl,
      duration: cachedLyricOfDay.duration || '0:30'
    };
    globalAudio.playTrack(trackObj);
    updateLyricPlayButtonState();
    return;
  }

  // Otherwise, use _playTrack to fetch and play
  const trackObj = {
    title: cachedLyricOfDay.song,
    artist: cachedLyricOfDay.artist,
    artwork: cachedLyricOfDay.albumArt || ''
  };
  await window._playTrack(trackObj);
  updateLyricPlayButtonState();
};

export function renderLyricWidget(container, forceNew = false) {
  if (!container) return;

  if (!_isAudioSubscribedForLyrics) {
    globalAudio.subscribe((event) => {
      if (['play', 'pause', 'ended', 'trackchange'].includes(event)) {
        updateLyricPlayButtonState();
      }
    });
    _isAudioSubscribedForLyrics = true;
  }

  if (!cachedLyricOfDay || forceNew) {
    cachedLyricOfDay = getRandomLyric();
    cachedLyricCardStyle = getRandomCardStyle();
    cachedLyricOfDay._itunesResolved = false;
    cachedLyricOfDay._loadingItunes = false;
  }

  const lyric = cachedLyricOfDay;
  const hasArt = !!lyric.albumArt;

  container.innerHTML = `
    <div class="lyric-widget-immersive" style="position:relative;overflow:hidden;border-radius:0 0 var(--radius-lg) var(--radius-lg);padding:16px;min-height:130px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg, #130a24, #080311);">
      <!-- Atmospheric Cover Background (fades in once real cover is loaded, no template placeholder) -->
      <img id="lyric-widget-bg" class="lyric-widget-bg-img" src="${hasArt ? lyric.albumArt : ''}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(16px) brightness(0.24) saturate(1.4);transform:scale(1.2);pointer-events:none;z-index:0;transition:opacity 0.4s ease;opacity:${hasArt ? '1' : '0'};display:${hasArt ? 'block' : 'none'};">
      <div style="position:absolute;inset:0;background:linear-gradient(135deg, rgba(20, 10, 35, 0.75), rgba(5, 2, 10, 0.9));z-index:1;"></div>

      <!-- Lyric Text -->
      <div style="position:relative;z-index:2;margin-bottom:12px;">
        <div style="font-size:0.98rem;line-height:1.45;color:#ffffff;font-style:italic;font-weight:600;">
          "${lyric.lyrics}"
        </div>
      </div>

      <!-- Song Attribution Bar with Play, Search, and Loading Indicator for Cover -->
      <div style="position:relative;z-index:2;display:flex;align-items:center;gap:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.12);">
        <div id="lyric-cover-container" style="flex-shrink:0;width:46px;height:46px;overflow:hidden;">
          ${hasArt ? `
            <img id="lyric-widget-cover" class="lyric-cover-art" src="${lyric.albumArt}" alt="${lyric.song}" onclick="window._playLyricTrack()" title="Ouvir música no iTunes" style="width:46px;height:46px;min-width:46px;border-radius:8px;object-fit:cover;flex-shrink:0;display:block;">
          ` : `
            <div id="lyric-cover-loading" class="lyric-cover-loader" title="Carregando capa do álbum no iTunes...">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1s linear infinite;color:var(--purple-light);">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
              </svg>
            </div>
          `}
        </div>
        <div style="min-width:0;flex:1;cursor:pointer;" onclick="window._playLyricTrack()" title="Clique para ouvir">
          <div style="font-size:0.86rem;font-weight:700;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${lyric.song}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.7);">${lyric.artist}${lyric.year ? ` &bull; ${lyric.year}` : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <button type="button" id="lyric-play-btn" class="doodle-btn doodle-btn-ghost doodle-btn-sm lyric-play-button" style="padding:5px 8px;color:var(--purple-light);border-radius:50%;" onclick="window._playLyricTrack()" title="Ouvir prévia no iTunes">
            ${ICONS.play}
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:5px 8px;color:var(--purple-light);border-radius:50%;" onclick="window._searchLyricSong('${lyric.song.replace(/'/g, "\\'")}', '${lyric.artist.replace(/'/g, "\\'")}')" title="Buscar no catálogo do iTunes">
            ${ICONS.search}
          </button>
        </div>
      </div>
    </div>`;

  updateLyricPlayButtonState();

  // Fetch real album cover and audio preview from iTunes
  const currentLyric = lyric;
  if (!currentLyric._itunesResolved && !currentLyric._loadingItunes) {
    currentLyric._loadingItunes = true;
    const searchTerm = currentLyric.searchQuery || `${currentLyric.song} ${currentLyric.artist}`.trim();

    searchTracks(searchTerm, 1).then(results => {
      currentLyric._loadingItunes = false;
      if (results && results.length > 0) {
        const match = results[0];
        currentLyric._itunesResolved = true;
        currentLyric.albumArt = match.artwork;
        currentLyric.previewUrl = match.previewUrl;
        currentLyric.duration = match.duration;
        currentLyric.itunesTrack = match;

        // Preload image and update only when the real album cover is loaded in memory
        if (match.artwork) {
          const imgLoader = new Image();
          imgLoader.src = match.artwork;
          imgLoader.onload = () => {
            if (cachedLyricOfDay === currentLyric) {
              const coverContainer = document.getElementById('lyric-cover-container');
              if (coverContainer) {
                coverContainer.innerHTML = `<img id="lyric-widget-cover" class="lyric-cover-art" src="${match.artwork}" alt="${currentLyric.song}" onclick="window._playLyricTrack()" title="Ouvir música no iTunes" style="width:46px;height:46px;min-width:46px;border-radius:8px;object-fit:cover;flex-shrink:0;display:block;animation:fadeIn 0.25s ease-out;">`;
              }
              const bgEl = document.getElementById('lyric-widget-bg');
              if (bgEl) {
                bgEl.src = match.artwork;
                bgEl.style.display = 'block';
                setTimeout(() => { bgEl.style.opacity = '1'; }, 20);
              }
              updateLyricPlayButtonState();
            }
          };
          imgLoader.onerror = () => {
            if (cachedLyricOfDay === currentLyric) {
              const coverContainer = document.getElementById('lyric-cover-container');
              if (coverContainer) {
                coverContainer.innerHTML = `<div class="lyric-cover-loader" onclick="window._playLyricTrack()" style="cursor:pointer;" title="Ouvir música">${ICONS.music}</div>`;
              }
            }
          };
        }
      } else {
        if (cachedLyricOfDay === currentLyric) {
          const coverContainer = document.getElementById('lyric-cover-container');
          if (coverContainer) {
            coverContainer.innerHTML = `<div class="lyric-cover-loader" onclick="window._playLyricTrack()" style="cursor:pointer;" title="Ouvir música">${ICONS.music}</div>`;
          }
        }
      }
    }).catch(err => {
      console.warn('iTunes search error for lyric:', err);
      currentLyric._loadingItunes = false;
      if (cachedLyricOfDay === currentLyric) {
        const coverContainer = document.getElementById('lyric-cover-container');
        if (coverContainer) {
          coverContainer.innerHTML = `<div class="lyric-cover-loader" onclick="window._playLyricTrack()" style="cursor:pointer;" title="Ouvir música">${ICONS.music}</div>`;
        }
      }
    });
  }
}

// ──────────────────────────────────────────
// TRENDING WIDGET (LAST.FM CHARTS API)
// ──────────────────────────────────────────

let cachedTrendingList = null;

export async function renderTrendingWidget(container) {
  if (!container) return;

  if (cachedTrendingList) {
    drawTrendingHtml(container, cachedTrendingList);
    return;
  }

  container.innerHTML = `
    <div style="padding:14px;text-align:center;color:var(--purple-light);font-size:0.75rem;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:4px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      Carregando tendências do Last.fm...
    </div>`;

  try {
    const tracks = await fetchLastFmTrendingTracks(5);
    cachedTrendingList = tracks;
    drawTrendingHtml(container, tracks);
  } catch (err) {
    container.innerHTML = `<div class="notif-empty" style="padding:12px">Não foi possível carregar tendências no momento.</div>`;
  }
}

function drawTrendingHtml(container, tracks) {
  if (!tracks || !tracks.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:12px">Sem dados de tendências.</div>`;
    return;
  }

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1px;">
      ${tracks.map((s, i) => `
        <div class="trending-item" style="cursor:pointer;" onclick="window._playTrack(${JSON.stringify(s).replace(/"/g, '&quot;')})" title="Ouvir prévia de ${s.title}">
          <span class="trending-rank">#${i + 1}</span>
          <img class="trending-cover" src="${s.artwork}" alt="${s.title}" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'">
          <div class="trending-info">
            <div class="trending-title">${s.title}</div>
            <div class="trending-artist" onclick="event.stopPropagation();window._searchArtistInCatalog('${s.artist.replace(/'/g, "\\'")}')" style="cursor:pointer;" title="Ver mais de ${s.artist}">${s.artist}</div>
          </div>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:3px 6px;color:var(--purple-light);border-radius:50%;" onclick="event.stopPropagation();window._playTrack(${JSON.stringify(s).replace(/"/g, '&quot;')})">
            ${ICONS.play}
          </button>
        </div>
      `).join('')}
    </div>`;
}

// ──────────────────────────────────────────
// FRIENDS WIDGET (online simulation)
// ──────────────────────────────────────────

export function renderFriendsWidget(container) {
  const activeUser = Storage.getActiveUser();
  const following = Storage.getFollowing(activeUser.id);
  const users = Storage.getAllUsers().filter(u => following.includes(u.id));

  if (!users.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:14px;font-size:0.78rem;text-align:center;">Você ainda não segue ninguém.</div>`;
    return;
  }

  container.innerHTML = users.map(u => {
    const isImage = u.avatar && (u.avatar.startsWith('http') || u.avatar.startsWith('data:') || u.avatar.startsWith('/'));
    const avatarHtml = isImage
      ? `<img class="friend-avatar" src="${u.avatar}" alt="${u.name}" style="width:30px;height:30px;min-width:30px;aspect-ratio:1/1;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : `<div class="friend-avatar" style="width:30px;height:30px;min-width:30px;aspect-ratio:1/1;border-radius:50%;background:var(--purple-dark);color:var(--purple-light);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;border:1px solid var(--purple-mid);flex-shrink:0;">${u.avatar || u.name[0]}</div>`;

    return `
      <div class="friend-item" onclick="window._goToProfile('${u.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;">
        <div class="friend-online-dot" style="width:7px;height:7px;border-radius:50%;background:#10b981;flex-shrink:0;box-shadow:0 0 6px #10b981;"></div>
        ${avatarHtml}
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</div>
          <div style="font-size:0.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.status || u.handle || 'online'}</div>
        </div>
      </div>`;
  }).join('');
}
