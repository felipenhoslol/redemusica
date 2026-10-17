// Feed module — post creation, rendering, interactions, lyric cards
import { esc, safeUrl, jsArg, avatarInner, isImageAvatar } from './dom.js';
import * as Storage from './storage.js';
import { toggleCollapse } from './motion.js';
import { globalAudio } from './audio.js';
import { ICONS, getStarSVG, renderRatingStars } from './icons.js';
import { searchTracks, renderRichLinkCard, extractFirstUrl } from './api.js';
import { fetchLastFmTrendingTracks, fetchLastFmRecentTracks, lastFmUserOf } from './lastfm.js';
import { compressImage, presenceOf, loadInlinePicture, fetchPostById } from './sync.js';
import { pollHtml } from './poll.js';
import { auth } from './auth.js';
import { adminBadge } from './badges.js';
import { linkMentions, attachMentionAutocomplete } from './mentions.js';
import { openLyricPicker, EXCERPT_MAX_LINES, EXCERPT_MAX_CHARS } from './lyricPicker.js';

// ──────────────────────────────────────────
// RENDER HELPERS
// ──────────────────────────────────────────

// Letra em destaque: um único formato de citação (estilos em css/rabisco.css)
function renderLyricsCard(post) {
  if (!post.lyrics) return '';
  return `
    <figure class="lyric-quote">
      <blockquote>${esc(post.lyrics)}</blockquote>
      ${post.lyricsSong ? `
        <figcaption>
          ${post.lyricsArt ? `<img src="${safeUrl(post.lyricsArt)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
          <span>${esc(post.lyricsSong)}</span>
        </figcaption>` : ''}
    </figure>`;
}

function renderPostPlaylistCard(post) {
  // Live playlist first; older posts may still carry an embedded snapshot as fallback
  const pl = (post.playlistId && Storage.getPlaylistById(post.playlistId)) || post.playlist || null;
  if (!pl) return '';

  const songs = pl.songs || [];
  const songsCount = songs.length;

  // Render Cover
  let coverHtml = '';
  if (pl.coverUrl) {
    coverHtml = `<img src="${safeUrl(pl.coverUrl)}" alt="${esc(pl.title)}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    const songsWithArt = songs.filter(s => !!s.artwork);
    if (songsWithArt.length >= 4) {
      coverHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:100%;height:100%;">
          <img src="${safeUrl(songsWithArt[0].artwork)}" style="width:100%;height:100%;object-fit:cover;">
          <img src="${safeUrl(songsWithArt[1].artwork)}" style="width:100%;height:100%;object-fit:cover;">
          <img src="${safeUrl(songsWithArt[2].artwork)}" style="width:100%;height:100%;object-fit:cover;">
          <img src="${safeUrl(songsWithArt[3].artwork)}" style="width:100%;height:100%;object-fit:cover;">
        </div>`;
    } else if (songsWithArt.length > 0) {
      coverHtml = `<img src="${safeUrl(songsWithArt[0].artwork)}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      coverHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--hover),var(--surface));color:var(--purple-light);">${ICONS.playlist}</div>`;
    }
  }

  // Top tracks preview
  const songsPreviewHtml = songs.slice(0, 3).map((s, idx) => `
    <div style="display:flex;align-items:center;gap:6px;font-size:0.75rem;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">
      <span style="color:var(--purple-light);font-weight:700;font-size:0.78rem;min-width:14px;">${idx+1}.</span>
      <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.title)}</span>
      <span style="color:var(--muted);font-size:0.78rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">— ${esc(s.artist)}</span>
    </div>
  `).join('');

  return `
    <div class="post-attached-playlist" onclick="window._goToSharedPlaylist('${pl.id}')" title="Clique para abrir esta playlist" style="margin:10px 0;background:linear-gradient(135deg, color-mix(in srgb, var(--hover) 85%, transparent), color-mix(in srgb, var(--surface) 95%, transparent));border:1px solid var(--purple-accent);border-radius:var(--radius-md);padding:12px 14px;cursor:pointer;transition:all 0.2s ease;display:flex;gap:14px;position:relative;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.4);">
      <div style="width:84px;height:84px;min-width:84px;border-radius:8px;overflow:hidden;background:#000;box-shadow:0 4px 10px rgba(0,0,0,0.6);flex-shrink:0;">
        ${coverHtml}
      </div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:inline-flex;align-items:center;gap:4px;font-size:0.75rem;font-weight:800;color:var(--purple-light);letter-spacing:0.04em;">
              ${ICONS.playlist} Playlist
            </div>
            <span style="font-size:0.78rem;color:var(--muted);">${songsCount} ${songsCount === 1 ? 'música' : 'músicas'}</span>
          </div>
          <h4 style="margin:2px 0 4px;font-size:0.95rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.title)}</h4>
          ${pl.description ? `<p style="margin:0 0 4px;font-size:0.75rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pl.description)}</p>` : ''}
          ${songsPreviewHtml}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;padding-left:4px;" onclick="event.stopPropagation()">
        ${songsCount > 0 ? `
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="border-radius:50%;width:36px;height:36px;padding:0;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px color-mix(in srgb, var(--accent) 40%, transparent);" title="Tocar playlist" onclick="window._playEntirePlaylist('${pl.id}')">
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
  // Your own comments, or any comment for an admin; a post's author can't delete other people's comments
  const canDelete = c.userId === activeUser.id || auth.isAdmin;

  const cAvatar = isImageAvatar(c.userAvatar)
    ? `<img src="${safeUrl(c.userAvatar)}" alt="${esc(c.userName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : esc(c.userAvatar || c.userName?.[0] || 'U');

  const songAttachmentHtml = c.song ? `
    <div class="comment-attached-song" style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:color-mix(in srgb, var(--accent) 16%, transparent);border:1px solid var(--purple-accent);padding:6px 10px;border-radius:8px;margin-top:6px;">
      <div style="display:flex;align-items:center;gap:8px;min-width:0;">
        ${c.song.artwork ? `<img src="${safeUrl(c.song.artwork)}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;">` : ''}
        <div style="min-width:0;">
          <div style="font-size:0.78rem;font-weight:700;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.song.title)}</div>
          <div style="font-size:0.78rem;color:var(--purple-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.song.artist)}</div>
        </div>
      </div>
      <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="padding:0;border-radius:50%;width:26px;height:26px;min-width:26px;display:flex;align-items:center;justify-content:center;" onclick="window._playTrack(${jsArg(c.song)})" title="Tocar prévia">
        ${ICONS.play}
      </button>
    </div>` : '';

  const imageAttachmentHtml = !c.imageUrl && c.imageLazy ? `
    <div class="comment-attached-media" style="margin-top:6px;border-radius:8px;overflow:hidden;max-width:280px;border:1px solid var(--tint-2);">
      <img class="lazy-picture" data-lazy-img="post_comments:${esc(c.id)}" alt="Anexo" style="width:100%;max-height:220px;object-fit:cover;display:block;" decoding="async">
    </div>` : c.imageUrl ? `
    <div class="comment-attached-media" style="margin-top:6px;border-radius:8px;overflow:hidden;max-width:280px;border:1px solid var(--tint-2);">
      <img src="${safeUrl(c.imageUrl)}" alt="Anexo" style="width:100%;max-height:220px;object-fit:cover;display:block;" loading="lazy" decoding="async">
    </div>` : '';

  const gifAttachmentHtml = c.gifUrl ? `
    <div class="comment-attached-media" style="margin-top:6px;border-radius:8px;overflow:hidden;max-width:280px;border:1px solid var(--tint-2);">
      <img src="${safeUrl(c.gifUrl)}" alt="GIF" style="width:100%;max-height:220px;object-fit:cover;display:block;" loading="lazy" decoding="async">
    </div>` : '';

  const deleteBtnHtml = canDelete ? `
    <button class="comment-delete-btn" title="Excluir comentário" onclick="event.stopPropagation();window._deleteComment('${postId}', '${c.id}')" style="background:transparent;border:none;color:var(--muted);cursor:pointer;padding:2px 4px;font-size:0.78rem;line-height:1;border-radius:4px;transition:all 0.15s;opacity:0.6;" onmouseover="this.style.opacity=1;this.style.color='#ff5555'" onmouseout="this.style.opacity=0.6;this.style.color='var(--muted)'">
      ${ICONS.trash || '✕'}
    </button>` : '';

  const commentLikes = Array.isArray(c.likes) ? c.likes : [];
  const commentLiked = commentLikes.includes(activeUser.id);
  const likeBtnHtml = c.id && postId ? `
    <button type="button" class="comment-like-btn${commentLiked ? ' liked' : ''}" onclick="event.stopPropagation();window._likeComment('${postId}', '${c.id}', this)"
      aria-pressed="${commentLiked}" aria-label="${commentLiked ? 'Descurtir comentário' : 'Curtir comentário'}">
      ${commentLiked ? ICONS.heartFilled : ICONS.heartEmpty}<span class="comment-like-count">${commentLikes.length || ''}</span>
    </button>` : '';

  return `
    <div class="comment-row" id="comment-${c.id || ''}" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
      <div class="comment-avatar" onclick="window._goToProfile('${c.userId || ''}')" style="cursor:pointer;" title="Ver perfil de ${esc(c.userName)}">${cAvatar}</div>
      <div class="comment-content" style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <div class="comment-name" onclick="window._goToProfile('${c.userId || ''}')" style="cursor:pointer;">${esc(c.userName)}${adminBadge(c.userId)}</div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.75rem;color:var(--muted);">${esc(c.createdAt || '')}</span>
            ${deleteBtnHtml}
          </div>
        </div>
        ${c.text ? `<div class="comment-text" style="word-break:break-word;">${linkMentions(esc(c.text))}</div>` : ''}
        ${songAttachmentHtml}
        ${imageAttachmentHtml}
        ${gifAttachmentHtml}
        ${(() => {
          const detectedCommentUrl = extractFirstUrl(c.text);
          return c.link ? renderRichLinkCard(c.link) : (detectedCommentUrl ? renderRichLinkCard(detectedCommentUrl) : '');
        })()}
        <div class="comment-actions">
          ${likeBtnHtml}
          ${c.id && postId ? `<button type="button" class="comment-reply-btn" onclick="event.stopPropagation();window._replyToComment('${postId}', '${c.id}', this)">Responder</button>` : ''}
        </div>
      </div>
    </div>`;
}

const NO_COMMENTS_HTML = '<div class="no-comments-msg" style="font-size:0.8rem;color:var(--muted);text-align:center;padding:12px 0;">Seja o primeiro a comentar!</div>';

/** Comments with their replies indented under them (one level; a reply whose comment was deleted shows on its own). */
export function renderCommentThreadHtml(comments, postId) {
  const list = comments || [];
  const byId = new Map(list.map(c => [c.id, c]));
  const rootOf = (c) => {
    let cur = c;
    for (let i = 0; i < 5 && cur.parentId && byId.has(cur.parentId); i++) cur = byId.get(cur.parentId);
    return cur;
  };
  const replies = new Map();
  const roots = [];
  list.forEach(c => {
    const root = rootOf(c);
    if (root === c) roots.push(c);
    else replies.set(root.id, [...(replies.get(root.id) || []), c]);
  });
  return roots.map(c => {
    const kids = replies.get(c.id) || [];
    return renderCommentRow(c, postId) + (kids.length
      ? `<div class="comment-replies">${kids.map(r => renderCommentRow(r, postId)).join('')}</div>` : '');
  }).join('') || NO_COMMENTS_HTML;
}

export function renderCommentsSectionHtml(post) {

  return `
    <div class="post-comments-container">
      <div id="comments-list-${post.id}" class="comments-list">
        ${renderCommentThreadHtml(post.comments, post.id)}
      </div>

      <!-- Pending Attachment Preview (large & clear) -->
      <div id="comment-pending-attach-${post.id}" class="comment-pending-attach-box" style="display:none;margin-top:10px;"></div>

      <!-- Input and Tool Bar -->
      <div class="comment-composer-box" style="margin-top:8px;background:var(--bg-surface);border:1px solid var(--border-accent);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px;">
        <div class="comment-reply-banner" hidden></div>
        <div style="display:flex;align-items:center;gap:8px;width:100%;">
          <input class="doodle-input" id="comment-input-${post.id}" placeholder="Escreva um comentário..." style="font-size:0.84rem;padding:6px 10px;flex:1;background:transparent;border:none;box-shadow:none;" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault();window._submitRichComment('${post.id}', this)}else if(event.key==='Escape'){window._cancelCommentReply('${post.id}', this)}">
          <button class="doodle-btn doodle-btn-primary doodle-btn-sm" style="padding:6px 16px;" onclick="window._submitRichComment('${post.id}', this)">Enviar</button>
        </div>
        
        <!-- Attachment Toolbar -->
        <div style="display:flex;align-items:center;gap:6px;border-top:1px solid var(--tint-1);padding-top:6px;">
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.78rem;padding:3px 8px;gap:4px;color:var(--purple-light);" onclick="window._openCommentMusicSearch('${post.id}')" title="Anexar música">
            ${ICONS.music} <span>Música</span>
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.78rem;padding:3px 8px;gap:4px;color:var(--purple-light);" onclick="window._openCommentImagePicker('${post.id}')" title="Anexar imagem">
            ${ICONS.image || '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'}
            <span>Imagem</span>
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.78rem;padding:3px 8px;gap:4px;color:var(--purple-light);" onclick="window._openCommentGifPicker('${post.id}')" title="Anexar GIF">
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
      <span>${reposterName ? `${esc(reposterName)} repostou` : 'Repostado'}</span>
    </div>` : '';

  const songHtml = post.song ? `
    <div class="post-attached-song">
      <div class="post-song-info">
        <img class="post-song-cover" src="${safeUrl(post.song.artwork || '')}" alt="" onerror="this.style.display='none'">
        <div>
          <div class="post-song-title">${esc(post.song.title)}</div>
          <div class="post-song-artist">${esc(post.song.artist)}</div>
        </div>
      </div>
      <button class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._playTrack(${jsArg(post.song)})">
        ${ICONS.play}
      </button>
    </div>` : '';

  const playlistHtml = renderPostPlaylistCard(post);
  const gallery = (post.images || []).filter(Boolean);
  const imageHtml = gallery.length > 1
    ? `<div class="post-gallery post-gallery-${Math.min(gallery.length, 4)}">${gallery.map((u, i) => `
        <button type="button" class="post-gallery-item" onclick="event.stopPropagation();window._openPhotoViewer(${jsArg(gallery)}, ${i})" aria-label="Ver foto ${i + 1} de ${gallery.length}">
          <img src="${safeUrl(u)}" alt="" loading="lazy" decoding="async">
        </button>`).join('')}</div>`
    : post.imageUrl
    ? `<img class="post-attached-image" src="${safeUrl(post.imageUrl)}" alt="post image" loading="lazy" decoding="async" onclick="event.stopPropagation();window._openPhotoViewer(${jsArg([post.imageUrl])}, 0)">`
    : post.imageLazy ? `<img class="post-attached-image lazy-picture" data-lazy-img="posts:${esc(post.id)}" alt="post image" decoding="async">` : '';
  const detectedPostUrl = extractFirstUrl(post.text);
  const linkHtml = post.link ? renderRichLinkCard(post.link) : (detectedPostUrl ? renderRichLinkCard(detectedPostUrl) : '');

  const ratingHtml = post.rating > 0 ? `
    <div class="post-rating-display">
      ${renderRatingStars(post.rating, 18)}
      <span>${post.rating.toFixed(1)}</span>
    </div>` : '';

  const pinnedLabel = isPinned ? `<div class="pinned-label">${ICONS.pin} Post Fixado</div>` : '';

  const authorAvatarHtml = isImageAvatar(author.avatar)
    ? `<img src="${safeUrl(author.avatar)}" alt="${esc(author.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : esc(author.avatar || author.name?.[0] || 'U');

  return `
    <div class="post-card${isPinned ? ' pinned-post' : ''}" data-post-id="${post.id}">
      ${repostBannerHtml}
      ${pinnedLabel}
      <div class="post-header">
        <div class="post-author" onclick="window._goToProfile('${post.authorId}')">
          <div class="post-author-avatar">${authorAvatarHtml}</div>
          <div>
            <div class="post-author-name">${esc(author.name)}${adminBadge(post.authorId)}</div>
            <div class="post-author-handle">${esc(author.handle || '')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="post-meta">${esc(post.updatedAt || post.createdAt || '')}</span>
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
        <button class="post-options-item" onclick="window._showPostPeople('${post.id}', 'likes')">Ver quem curtiu</button>
        <button class="post-options-item" onclick="window._showPostPeople('${post.id}', 'reposts')">Ver quem repostou</button>
        ${!isOwner ? `<button class="post-options-item danger" onclick="window._reportUser('${post.authorId}')">Reportar</button>` : ''}
        ${!isOwner && auth.isAdmin ? `<button class="post-options-item danger" onclick="window._deletePost('${post.id}')">Excluir post (admin)</button>` : ''}
      </div>

      ${post.text ? `<div class="post-text">${linkMentions(esc(post.text))}</div>` : ''}
      ${ratingHtml}
      ${renderLyricsCard(post)}
      ${imageHtml}
      ${songHtml}
      ${pollHtml(post)}
      ${playlistHtml}
      ${linkHtml}

      <div class="post-actions">
        <button class="btn-post-action${liked ? ' liked' : ''}" onclick="window._likePost('${post.id}', this)">
          ${liked ? ICONS.heartFilled : ICONS.heartEmpty}
          <span class="like-count" role="button" tabindex="0" title="Ver quem curtiu" onclick="event.stopPropagation();window._showPostPeople('${post.id}', 'likes')">${(post.likes || []).length}</span>
        </button>
        <button class="btn-post-action" onclick="window._toggleComments('${post.id}', this, event)">
          ${ICONS.chat}
          <span class="comment-count">${(post.comments || []).length}</span>
        </button>
        <button class="btn-post-action${reposted ? ' reposted' : ''}" onclick="window._repostPost('${post.id}', this)">
          ${ICONS.repost || ICONS.refresh}
          <span class="repost-count" role="button" tabindex="0" title="Ver quem repostou" onclick="event.stopPropagation();window._showPostPeople('${post.id}', 'reposts')">${(post.reposts || []).length}</span>
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
  rating: 0,
  showLyrics: false
};

export function renderPostCreator(containerEl) {
  const activeUser = Storage.getActiveUser();
  const creatorAvatarHtml = isImageAvatar(activeUser.avatar)
    ? `<img src="${safeUrl(activeUser.avatar)}" alt="${esc(activeUser.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : esc(activeUser.avatar || activeUser.name?.[0] || 'U');

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
      <div id="creator-poll-attach"      style="display:none"></div>
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
          <button class="btn-attach" title="Criar votação de músicas" onclick="window._creatorOpenPoll()">
            ${ICONS.poll}
            <span>Votação</span>
          </button>
          <button class="btn-attach" title="Dar nota" onclick="window._creatorToggleRating()">
            ${ICONS.star}
            <span>Nota</span>
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="doodle-btn doodle-btn-primary" style="padding:8px 22px;" onclick="window._submitPost()">Postar</button>
        </div>
      </div>
    </div>`;

  attachMentionAutocomplete(containerEl.querySelector('#creator-text'));
  window._pendingCreatorImages = [];

  // Re-bind creator global handlers
  // "Letra": pick lines from the real lyrics (LRCLIB), or write the excerpt yourself
  window._creatorToggleLyrics = () => {
    const current = creatorState.selectedLyricsTrack || window._pendingCreatorSong || null;
    openLyricPicker({
      track: current,
      onPick: ({ lyrics, track }) => renderLyricsAttach(lyrics, track),
      onManual: (track) => renderLyricsAttach('', track)
    });
  };

  function renderLyricsAttach(lyrics, track) {
    const el = document.getElementById('creator-lyrics-attach');
    if (!el) return;
    creatorState.showLyrics = true;
    creatorState.lyricsText = lyrics;
    creatorState.selectedLyricsTrack = track || null;
    creatorState.lyricsSong = track ? `${track.title} — ${track.artist}` : '';
    creatorState.lyricsArt = track?.artwork || '';
    el.style.display = 'block';
    el.innerHTML = `
      <div class="creator-lyrics-box">
        <div class="creator-lyrics-header">
          <div style="display:flex;align-items:center;gap:6px;">
            ${ICONS.music}
            <span style="font-weight:700;color:var(--text);font-size:0.88rem;">Trecho da letra</span>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn-attach" onclick="window._creatorToggleLyrics()">Trocar trecho</button>
            <button type="button" class="btn-attach" style="color:var(--danger);" onclick="window._creatorRemoveLyrics()">Remover ${ICONS.close}</button>
          </div>
        </div>
        <textarea id="creator-lyrics" class="creator-lyrics-textarea" maxlength="${EXCERPT_MAX_CHARS}" placeholder="Escreva o trecho da letra (até ${EXCERPT_MAX_LINES} linhas)" oninput="window._creatorLyricsChanged()">${esc(lyrics)}</textarea>
        <div id="creator-lyrics-song-row" class="creator-lyrics-song">
          <div id="creator-lyrics-song-info" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
            ${track ? `
              <img id="creator-lyrics-preview-img" src="${safeUrl(track.artwork)}" alt="" style="width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;">
              <div style="min-width:0;flex:1;">
                <div id="creator-lyrics-preview-title" style="font-size:0.9rem;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(creatorState.lyricsSong)}</div>
                <div style="font-size:0.78rem;color:var(--text-2);">Música do trecho</div>
              </div>
            ` : `
              <div id="creator-lyrics-preview-title" style="font-size:0.88rem;color:var(--text-2);">Nenhuma música vinculada</div>
            `}
          </div>
          <button type="button" class="doodle-btn doodle-btn-secondary doodle-btn-sm" style="flex-shrink:0;display:flex;align-items:center;gap:6px;" onclick="window._openSearchForLyrics()">
            ${ICONS.search} ${track ? 'Trocar' : 'Vincular música'}
          </button>
        </div>
        <input type="hidden" id="creator-lyrics-song" value="${esc(creatorState.lyricsSong)}">
        <input type="hidden" id="creator-lyrics-art" value="${esc(creatorState.lyricsArt)}">
      </div>`;
    if (!lyrics) setTimeout(() => document.getElementById('creator-lyrics')?.focus(), 0);
  }

  window._setCreatorLyricsSong = (track) => {
    creatorState.lyricsSong = `${track.title} — ${track.artist}`;
    creatorState.lyricsArt = track.artwork;
    creatorState.selectedLyricsTrack = track;

    const songInp = document.getElementById('creator-lyrics-song');
    const artInp  = document.getElementById('creator-lyrics-art');
    if (songInp) songInp.value = creatorState.lyricsSong;
    if (artInp)  artInp.value  = creatorState.lyricsArt;

    // Rebuild the song-info chip to show the cover thumbnail
    const songInfo = document.getElementById('creator-lyrics-song-info');
    if (songInfo) {
      songInfo.innerHTML = `
        <img id="creator-lyrics-preview-img" src="${safeUrl(track.artwork)}" style="width:42px;height:42px;border-radius:6px;object-fit:cover;flex-shrink:0;border:1px solid var(--purple-accent);">
        <div style="min-width:0;flex:1;">
          <div id="creator-lyrics-preview-title" style="font-size:0.9rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(creatorState.lyricsSong)}</div>
          <div style="font-size:0.78rem;color:var(--purple-light);">Música vinculada à letra</div>
        </div>`;
    }
  };

  window._creatorRemoveLyrics = () => {
    creatorState.showLyrics = false;
    creatorState.lyricsText = '';
    creatorState.lyricsSong = '';
    creatorState.lyricsArt = '';
    creatorState.selectedLyricsTrack = null;
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
          <div style="flex:1;height:1px;background:var(--tint-2);"></div>
          <span style="font-size:0.75rem;color:var(--muted);font-weight:700;">OU CARREGAR DO DISPOSITIVO</span>
          <div style="flex:1;height:1px;background:var(--tint-2);"></div>
        </div>

        <div>
          <label class="doodle-btn doodle-btn-secondary" style="width:100%;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;padding:12px;font-weight:700;">
            ${ICONS.image || ''}
            <span>Escolher imagens do computador / celular (até ${MAX_POST_IMAGES})</span>
            <input type="file" id="post-img-file-input" accept="image/*" multiple style="display:none;" onchange="window._handlePostImageUpload(event)">
          </label>
        </div>
      </div>`;

    if (window.openDoodleModal) window.openDoodleModal('post-image-modal');
  };

  window._handlePostImageUpload = (event) => {
    const room = MAX_POST_IMAGES - (window._pendingCreatorImages || []).length;
    const files = [...(event.target.files || [])].slice(0, Math.max(0, room));
    if (!files.length) { window.showDoodleToast?.(`Um post pode ter até ${MAX_POST_IMAGES} fotos.`); return; }
    Promise.all(files.map(f => compressImage(f).catch(err => { window.showDoodleToast?.(err.message); return null; })))
      .then(urls => urls.filter(Boolean).forEach(u => window._setPostCreatorImage(u, { quiet: true })))
      .then(() => window.closeDoodleModal?.('post-image-modal'));
  };

  // Pictures of the post being written (up to MAX_POST_IMAGES), shown as removable thumbnails
  window._setPostCreatorImage = (url, opts = {}) => {
    const list = window._pendingCreatorImages || (window._pendingCreatorImages = []);
    if (list.length >= MAX_POST_IMAGES) { window.showDoodleToast?.(`Um post pode ter até ${MAX_POST_IMAGES} fotos.`); return; }
    list.push(url);
    if (!opts.quiet) window.closeDoodleModal?.('post-image-modal');
    renderCreatorImages();
  };

  window._removeCreatorImage = (index) => {
    const list = window._pendingCreatorImages || [];
    if (index === undefined) list.length = 0; else list.splice(index, 1);
    renderCreatorImages();
  };
}

const MAX_POST_IMAGES = 4;

function renderCreatorImages() {
  const list = window._pendingCreatorImages || [];
  const el = document.getElementById('creator-image-attach');
  if (!el) return;
  el.style.display = list.length ? 'block' : 'none';
  el.innerHTML = list.length ? `
    <div class="creator-images">
      ${list.map((url, i) => `
        <div class="creator-image-thumb">
          <img src="${safeUrl(url)}" alt="Foto ${i + 1} do post">
          <button type="button" onclick="window._removeCreatorImage(${i})" aria-label="Tirar a foto ${i + 1}" title="Tirar foto"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>
        </div>`).join('')}
      ${list.length < MAX_POST_IMAGES ? `<button type="button" class="creator-image-add" onclick="window._creatorOpenImagePicker()" aria-label="Adicionar mais fotos">${ICONS.plus}</button>` : ''}
    </div>` : '';
}

function renderCreatorRating(el) {
  const currentRating = creatorState.rating || 0;
  const presets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0];

  el.innerHTML = `
    <div class="creator-rating-row" style="display:flex;flex-direction:column;gap:8px;background:var(--bg-surface);border:1px solid var(--purple-accent);border-radius:var(--radius-md);padding:10px 12px;margin-top:8px;">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <span class="form-label" style="margin:0;font-weight:700;color:var(--white);">Nota para a música:</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="rating-value-badge" style="font-size:0.9rem;font-weight:800;color:var(--star);background:color-mix(in srgb, var(--star) 12%, transparent);padding:2px 8px;border-radius:var(--radius-pill);border:1px solid color-mix(in srgb, var(--star) 30%, transparent);display:inline-flex;align-items:center;gap:4px;">
            ${currentRating > 0 ? `${getStarSVG(1, 14)} <span>${currentRating.toFixed(1)}</span>` : 'Sem nota'}
          </span>
          ${currentRating > 0 ? `<button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="font-size:0.78rem;padding:2px 6px;" onclick="window._pickStar(0)">Limpar</button>` : ''}
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
          <button type="button" class="rating-preset-btn${currentRating === p ? ' active' : ''}" onclick="window._pickStar(${p})" style="padding:2px 6px;font-size:0.78rem;background:${currentRating === p ? 'color-mix(in srgb, var(--star) 20%, transparent)' : 'var(--bg-card)'};border:1px solid ${currentRating === p ? 'var(--star)' : 'var(--border)'};color:${currentRating === p ? 'var(--star)' : 'var(--muted)'};border-radius:4px;cursor:pointer;">
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

  // Drawn in pages: the first cards show up right away and the rest come in as you scroll.
  // A refresh keeps however many were already on screen (and the scroll position with them).
  const shown = Math.max(FEED_PAGE, Number(container.dataset.shown) || 0);
  const first = posts.slice(0, shown);
  container.dataset.shown = String(first.length);
  container.innerHTML = `<div class="feed-posts-list">${first.map(p => renderPostCard(p)).join('')}</div>`;
  attachFeedPager(container, posts);
  // Outside-click closing of option dropdowns is bound once in app.js (bindGlobalHandlers)
}

const FEED_PAGE = 15;
const feedPagers = new WeakMap(); // container → IntersectionObserver

function attachFeedPager(container, posts) {
  feedPagers.get(container)?.disconnect();
  if (Number(container.dataset.shown) >= posts.length) return;
  const list = container.querySelector('.feed-posts-list');
  const sentinel = document.createElement('div');
  sentinel.className = 'feed-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  container.appendChild(sentinel);
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    const from = Number(container.dataset.shown) || 0;
    const next = posts.slice(from, from + FEED_PAGE);
    list.insertAdjacentHTML('beforeend', next.map(p => renderPostCard(p)).join(''));
    container.dataset.shown = String(from + next.length);
    if (from + next.length >= posts.length) { observer.disconnect(); sentinel.remove(); }
  }, { rootMargin: '900px 0px' }); // start well before the end so scrolling never hits a gap
  observer.observe(sentinel);
  feedPagers.set(container, observer);
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
      <div style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;background:color-mix(in srgb, var(--accent) 18%, transparent);border:1.5px solid var(--purple-accent);border-radius:10px;padding:10px 14px;box-shadow:0 4px 12px rgba(0,0,0,0.25);">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          ${data.song.artwork ? `<img src="${safeUrl(data.song.artwork)}" style="width:54px;height:54px;border-radius:8px;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,0.3);flex-shrink:0;">` : ''}
          <div style="min-width:0;">
            <div style="font-size:0.78rem;color:var(--purple-light);font-weight:800;letter-spacing:0.5px;margin-bottom:2px;"><span class="ui-icon" aria-hidden="true">${ICONS.music}</span> Música anexada</div>
            <div style="font-size:0.94rem;font-weight:800;color:var(--white);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(data.song.title)}</div>
            <div style="font-size:0.8rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(data.song.artist)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <button type="button" class="doodle-btn doodle-btn-primary doodle-btn-sm" style="width:34px;height:34px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;" onclick="window._playTrack(${jsArg(data.song)})" title="Ouvir prévia">
            ${ICONS.play}
          </button>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" onclick="window._removeCommentAttachment('${postId}', 'song')" style="width:30px;height:30px;padding:0;border-radius:50%;color:var(--danger);font-weight:800;" title="Remover música"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>
        </div>
      </div>` : ''}

    ${data.imageUrl ? `
      <div style="position:relative;display:inline-block;max-width:340px;border-radius:10px;overflow:hidden;border:1.5px solid color-mix(in srgb, var(--accent) 60%, transparent);box-shadow:0 4px 14px rgba(0,0,0,0.3);background:#000;">
        <img src="${safeUrl(data.imageUrl)}" alt="Prévia da imagem" style="width:100%;max-height:240px;object-fit:cover;display:block;">
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:3px 8px;border-radius:6px;font-size:0.78rem;color:var(--accent);font-weight:800;">
          <span class="ui-icon" aria-hidden="true">${ICONS.image}</span> Imagem anexada
        </div>
        <button type="button" onclick="window._removeCommentAttachment('${postId}', 'imageUrl')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.75);border:1px solid var(--tint-3);color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-weight:900;" title="Remover imagem" aria-label="Remover imagem"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>
      </div>` : ''}

    ${data.gifUrl ? `
      <div style="position:relative;display:inline-block;max-width:340px;border-radius:10px;overflow:hidden;border:1.5px solid color-mix(in srgb, var(--star) 70%, transparent);box-shadow:0 4px 14px rgba(0,0,0,0.3);background:#000;">
        <img src="${safeUrl(data.gifUrl)}" alt="Prévia do GIF" style="width:100%;max-height:240px;object-fit:cover;display:block;">
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);padding:3px 8px;border-radius:6px;font-size:0.78rem;color:var(--star);font-weight:800;">
          GIF anexado
        </div>
        <button type="button" onclick="window._removeCommentAttachment('${postId}', 'gifUrl')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.75);border:1px solid var(--tint-3);color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-weight:900;" title="Remover GIF" aria-label="Remover GIF"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>
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
    { id: 'all', label: 'Em alta' },
    { id: 'dance', label: 'Dança' },
    { id: 'rock', label: 'Rock' },
    { id: 'dj', label: 'DJ e fones' },
    { id: 'cat', label: 'Gatos' },
    { id: 'sing', label: 'Cantando' },
    { id: 'react', label: 'Reações' }
  ];

  const renderGridItems = (gifs) => {
    if (!gifs || !gifs.length) {
      return `<div style="grid-column:1/-1;text-align:center;padding:30px 10px;color:var(--muted);font-size:0.85rem;">Nenhum GIF encontrado para essa pesquisa. Tente outro termo ou cole o link abaixo.</div>`;
    }
    return gifs.map(g => `
      <div class="gif-picker-item" onclick="window._setCommentGif('${postId}', ${jsArg(g.url)})" title="Clique para anexar">
        <img src="${safeUrl(g.url)}" alt="" loading="lazy" decoding="async">
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
            ${esc(cat.label)}
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
        <div style="flex:1;height:1px;background:var(--tint-2);"></div>
        <span style="font-size:0.75rem;color:var(--muted);">OU CARREGAR ARQUIVO</span>
        <div style="flex:1;height:1px;background:var(--tint-2);"></div>
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

  compressImage(file, 960)
    .then(url => window._setCommentImage(postId, url))
    .catch(err => window.showDoodleToast?.(err.message));
};

window._showPostPeople = (postId, kind) => {
  document.querySelectorAll('.post-options-dropdown').forEach(d => d.style.display = 'none');
  const post = Storage.getPostById(postId);
  if (!post) return;
  const ids = [...(kind === 'reposts' ? post.reposts : post.likes) || []].reverse(); // most recent first
  import('./profile.js').then(m => m.renderPeopleListModal(
    kind === 'reposts' ? 'Repostado por' : 'Curtido por', ids,
    kind === 'reposts' ? 'Ninguém repostou ainda.' : 'Ninguém curtiu ainda.'));
};

window._likeComment = (postId, commentId, btn) => {
  const comment = Storage.toggleLikeComment(postId, commentId);
  if (!comment || !btn) return;
  const liked = comment.likes.includes(Storage.getActiveUserId());
  btn.classList.toggle('liked', liked);
  btn.setAttribute('aria-pressed', String(liked));
  btn.setAttribute('aria-label', liked ? 'Descurtir comentário' : 'Curtir comentário');
  btn.innerHTML = `${liked ? ICONS.heartFilled : ICONS.heartEmpty}<span class="comment-like-count">${comment.likes.length || ''}</span>`;
};

let pendingDeleteCommentTarget = null;

window._deleteComment = (postId, commentId) => {
  pendingDeleteCommentTarget = { postId, commentId };
  const btn = document.getElementById('confirm-delete-comment-btn');
  if (btn) {
    btn.onclick = () => {
      if (pendingDeleteCommentTarget) {
        const { postId: pId, commentId: cId } = pendingDeleteCommentTarget;
        const ok = Storage.deleteComment(pId, cId, { force: auth.isAdmin });
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
      listEl.innerHTML = renderCommentThreadHtml(updatedPost.comments, postId);
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
  // Opens and closes like an accordion: the posts below move with it instead of jumping
  toggleCollapse(commentsSection, isHidden, 'flex');
  if (isHidden) attachMentionAutocomplete(commentsSection.querySelector('input[id^="comment-input-"]'));

  if (isHidden) {
    const input = commentsSection.querySelector('.doodle-input');
    if (input) setTimeout(() => input.focus(), 50);
  }
};

function visiblePostCard(postId, el) {
  const card = el ? el.closest('.post-card') : null;
  if (card) return card;
  const cards = Array.from(document.querySelectorAll(`.post-card[data-post-id="${postId}"]`));
  return cards.find(c => c.offsetParent !== null) || cards[0] || null;
}

// Who the comment being written answers, per post: { parentId, name }
const commentReplyTarget = {};

function paintReplyBanner(postId, postCard) {
  const target = commentReplyTarget[postId];
  (postCard ? [postCard] : document.querySelectorAll(`.post-card[data-post-id="${postId}"]`)).forEach(card => {
    const banner = card.querySelector('.comment-reply-banner');
    if (!banner) return;
    banner.hidden = !target;
    banner.innerHTML = target ? `
      <span>Respondendo a <strong>${esc(target.name)}</strong></span>
      <button type="button" class="comment-reply-cancel" aria-label="Cancelar resposta" onclick="window._cancelCommentReply('${esc(postId)}', this)"><span class="ui-icon" aria-hidden="true">${ICONS.close}</span></button>` : '';
    const input = card.querySelector('input[id^="comment-input-"]');
    if (input) input.placeholder = target ? `Responder ${target.name}...` : 'Escreva um comentário...';
  });
}

window._replyToComment = (postId, commentId, btn) => {
  const post = Storage.getPostById(postId);
  const comment = post?.comments?.find(c => c.id === commentId);
  if (!comment) return;
  // Replies stay one level deep: answering a reply goes under the same comment, @mentioning who wrote it
  const parent = (comment.parentId && post.comments.find(c => c.id === comment.parentId)) || comment;
  commentReplyTarget[postId] = { parentId: parent.id, name: comment.userName || 'Alguém' };
  const postCard = visiblePostCard(postId, btn);
  const section = postCard?.querySelector('.post-comments-section');
  if (section && window.getComputedStyle(section).display === 'none') window._toggleComments(postId, btn);
  paintReplyBanner(postId, postCard);
  const input = postCard?.querySelector('input[id^="comment-input-"]');
  if (!input) return;
  const handle = (Storage.getAllUsers().find(u => u.id === comment.userId)?.handle || '').replace(/^@/, '');
  const me = Storage.getActiveUserId();
  if (comment !== parent && handle && comment.userId !== me && !input.value.includes('@' + handle)) {
    input.value = `@${handle} ${input.value.replace(/^\s+/, '')}`;
  }
  attachMentionAutocomplete(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
};

window._cancelCommentReply = (postId, el) => {
  if (!commentReplyTarget[postId]) return;
  delete commentReplyTarget[postId];
  paintReplyBanner(postId, visiblePostCard(postId, el));
};

window._submitRichComment = (postId, btn) => {
  const postCard = visiblePostCard(postId, btn);
  const inputEl = postCard ? postCard.querySelector(`input[id^="comment-input-"]`) : document.getElementById(`comment-input-${postId}`);
  const text = inputEl?.value?.trim() || '';
  window._pendingCommentAttachments = window._pendingCommentAttachments || {};
  const attach = window._pendingCommentAttachments[postId] || {};

  if (!text && !attach.song && !attach.imageUrl && !attach.gifUrl) return;

  const newComment = Storage.addCommentToPost(postId, {
    text,
    song: attach.song || null,
    imageUrl: attach.imageUrl || '',
    gifUrl: attach.gifUrl || '',
    parentId: commentReplyTarget[postId]?.parentId || null
  });

  if (newComment) {
    if (inputEl) inputEl.value = '';
    if (commentReplyTarget[postId]) {
      delete commentReplyTarget[postId];
      paintReplyBanner(postId);
    }

    window._pendingCommentAttachments[postId] = {};
    updateCommentPendingBox(postId);

    refreshCommentsDisplay(postId);

    import('./ui.js').then(u => u.showToast('Comentário enviado!'));
  }
};

// Lyric of the day: see dailyLyric.js

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
        <div class="trending-item" style="cursor:pointer;" onclick="window._playTrack(${jsArg(s)})" title="Ouvir prévia de ${esc(s.title)}">
          <span class="trending-rank">#${i + 1}</span>
          <img class="trending-cover" src="${safeUrl(s.artwork)}" alt="${esc(s.title)}" onerror="this.src='https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80'">
          <div class="trending-info">
            <div class="trending-title">${esc(s.title)}</div>
            <div class="trending-artist" onclick="event.stopPropagation();window._searchArtistInCatalog(${jsArg(s.artist)})" style="cursor:pointer;" title="Ver mais de ${esc(s.artist)}">${esc(s.artist)}</div>
          </div>
          <button type="button" class="doodle-btn doodle-btn-ghost doodle-btn-sm" style="padding:3px 6px;color:var(--purple-light);border-radius:50%;" onclick="event.stopPropagation();window._playTrack(${jsArg(s)})">
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
  const users = Storage.getAllUsers().filter(u => following.includes(u.id))
    .map(u => ({ u, p: presenceOf(u) }))
    // Online first, then whoever was seen most recently
    .sort((a, b) => (b.p.online - a.p.online) || (new Date(b.u.lastSeenAt || 0) - new Date(a.u.lastSeenAt || 0)) || a.u.name.localeCompare(b.u.name));

  if (!users.length) {
    container.innerHTML = `<div class="notif-empty" style="padding:14px;font-size:0.78rem;text-align:center;">Você ainda não segue ninguém.</div>`;
    return;
  }

  container.innerHTML = users.map(({ u, p }) => {
    const isImage = isImageAvatar(u.avatar);
    const avatarHtml = isImage
      ? `<img class="friend-avatar" src="${safeUrl(u.avatar)}" alt="${esc(u.name)}" style="width:30px;height:30px;min-width:30px;aspect-ratio:1/1;border-radius:50%;object-fit:cover;flex-shrink:0;">`
      : `<div class="friend-avatar" style="width:30px;height:30px;min-width:30px;aspect-ratio:1/1;border-radius:50%;background:var(--purple-dark);color:var(--purple-light);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.75rem;border:1px solid var(--purple-mid);flex-shrink:0;">${esc(u.avatar || u.name[0])}</div>`;
    const lfm = lastFmUserOf(u);
    const sub = p.known ? p.label : (u.status || u.handle || '');

    return `
      <div class="friend-item" onclick="window._goToProfile('${u.id}')" style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;">
        <div class="friend-online-dot${p.online ? ' online' : ''}" title="${p.online ? 'Online' : esc(p.label || 'Offline')}" aria-label="${p.online ? 'Online' : 'Offline'}"></div>
        ${avatarHtml}
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(u.name)}${adminBadge(u.id)}</div>
          <div class="friend-sub" ${lfm ? `data-np-user="${esc(lfm)}"` : ''} style="font-size:0.78rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(sub)}</div>
        </div>
      </div>`;
  }).join('');

  // Who is playing something right now (Last.fm), filled in after the list shows up
  container.querySelectorAll('[data-np-user]').forEach(async (el, i) => {
    if (i >= 15) return;
    try {
      const { nowPlaying } = await fetchLastFmRecentTracks(el.dataset.npUser, 1);
      if (nowPlaying && el.isConnected) {
        el.classList.add('now-playing');
        el.innerHTML = `${ICONS.headphones} ${esc(nowPlaying.title)} — ${esc(nowPlaying.artist)}`;
        el.title = `Ouvindo agora: ${nowPlaying.title} — ${nowPlaying.artist}`;
      }
    } catch { /* no Last.fm, private profile...: keep the presence line */ }
  });
}

// ─── Pictures still stored inline (base64) in old posts/comments ───
// The feed doesn't download them; each one is fetched alone when its card comes near the screen.
const lazyPictureObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    lazyPictureObserver.unobserve(img);
    const [table, id] = (img.dataset.lazyImg || '').split(':');
    loadInlinePicture(table, id).then(url => {
      if (url && /^(data:image\/|https:\/\/)/.test(url)) { img.src = url; img.classList.remove('lazy-picture'); }
      else (img.closest('.comment-attached-media') || img).remove();
    });
  });
}, { rootMargin: '600px 0px' });

function watchLazyPictures(node) {
  if (node.nodeType !== 1) return;
  if (node.matches?.('[data-lazy-img]')) lazyPictureObserver.observe(node);
  node.querySelectorAll?.('[data-lazy-img]').forEach(img => lazyPictureObserver.observe(img));
}
new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(watchLazyPictures)))
  .observe(document.documentElement, { childList: true, subtree: true });

// ─── Tap to enlarge, anywhere: comment and chat pictures, other people's profile photo and banner,
// or any <img data-zoom> / element with data-zoom-src. Post galleries open their own set (below).
const ZOOM_TARGETS = '[data-zoom-src], img[data-zoom], .comment-attached-media img:not(.lazy-picture), .lyric-quote figcaption img';
document.addEventListener('click', (e) => {
  const el = e.target.closest(ZOOM_TARGETS);
  if (!el || e.target.closest('button:not([data-zoom-src]), a')) return;
  const src = el.dataset.zoomSrc || el.currentSrc || el.src;
  if (!src) return;
  e.preventDefault();
  e.stopPropagation();
  window._openPhotoViewer([src], 0);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('[data-zoom-src]')) e.target.click();
});

// ─── Photo viewer: tap a post picture to see it big (swipe or arrows between a post's photos) ───
window._openPhotoViewer = (urls, start = 0) => {
  const list = (urls || []).filter(u => /^(https:\/\/|data:image\/)/.test(u));
  if (!list.length) return;
  document.getElementById('photo-viewer')?.remove();
  let i = Math.min(Math.max(0, start), list.length - 1);
  const root = document.createElement('div');
  root.id = 'photo-viewer';
  root.className = 'photo-viewer';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Foto do post');
  root.innerHTML = `
    <button type="button" class="photo-viewer-close" data-close aria-label="Fechar">${ICONS.close}</button>
    ${list.length > 1 ? `<button type="button" class="photo-viewer-nav prev" data-step="-1" aria-label="Foto anterior">${ICONS.chevronLeft}</button>
    <button type="button" class="photo-viewer-nav next" data-step="1" aria-label="Próxima foto">${ICONS.chevronRight}</button>` : ''}
    <img alt="">
    ${list.length > 1 ? '<div class="photo-viewer-count"></div>' : ''}`;
  const img = root.querySelector('img');
  const show = () => {
    img.src = list[i];
    const c = root.querySelector('.photo-viewer-count');
    if (c) c.textContent = `${i + 1} / ${list.length}`;
  };
  const step = (d) => { i = (i + d + list.length) % list.length; show(); };
  const close = () => { document.removeEventListener('keydown', onKey); root.remove(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step], [data-close]');
    if (b?.dataset.step) step(Number(b.dataset.step));
    else if (b || e.target === root) close();
  });
  let touchX = null;
  root.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (touchX === null || list.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(root);
  show();
  root.querySelector('[data-close]').focus({ preventScroll: true });
};

// ─── Single post view: opened from a notification (liked, reposted, commented, mentioned...) ───
window._openPostView = async (postId, opts = {}) => {
  document.getElementById('post-view')?.remove();
  const root = document.createElement('div');
  root.id = 'post-view';
  root.className = 'app-dialog post-view';
  root.innerHTML = `
    <div class="app-dialog-scrim" data-close></div>
    <div class="app-dialog-panel post-view-panel" role="dialog" aria-modal="true" aria-label="Post">
      <div class="app-dialog-head">
        <button type="button" class="photo-editor-icon" data-close aria-label="Fechar">${ICONS.close}</button>
        <h2>Post</h2>
      </div>
      <div class="post-view-body"><div class="post-view-empty">Carregando…</div></div>
    </div>`;
  document.body.appendChild(root);
  const close = () => { document.removeEventListener('keydown', onKey); root.classList.remove('open'); setTimeout(() => root.remove(), 200); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.getElementById('photo-viewer')) close(); };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
    // Going to someone's profile from inside the post leaves the post view
    else if (e.target.closest('.post-author, .comment-name, .comment-avatar, .mention-link')) setTimeout(close, 0);
  });
  requestAnimationFrame(() => root.classList.add('open'));

  const post = Storage.getPostById(postId) || await fetchPostById(postId);
  const body = root.querySelector('.post-view-body');
  if (!root.isConnected) return;
  if (!post) { body.innerHTML = `<div class="post-view-empty">Esse post não existe mais.</div>`; return; }
  body.innerHTML = `<div class="feed-posts-list">${renderPostCard(post)}</div>`;
  // Comments open, and the comment the notification is about highlighted
  const section = body.querySelector('.post-comments-section');
  if (section) section.style.display = 'flex';
  attachMentionAutocomplete(body.querySelector('input[id^="comment-input-"]'));
  if (opts.commentId) {
    const row = body.querySelector(`#comment-${CSS.escape(opts.commentId)}`);
    if (row) { row.classList.add('comment-highlight'); setTimeout(() => row.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120); }
  }
};
