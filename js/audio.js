// Global Audio Player manager for 30s music previews
import { ICONS } from './icons.js';
import { esc, safeUrl } from './dom.js';

class AudioController {
  constructor() {
    this.audio = new Audio();
    this.currentTrack = null;
    this.isPlaying = false;
    this.listeners = new Set();
    this.volume = 0.8;

    this.audio.volume = this.volume;

    this._setupAudioEvents();
    this._setupMediaSession();
  }

  // Lock screen / notification controls. No queue in the app, so no previoustrack/nexttrack.
  _setupMediaSession() {
    const ms = typeof navigator !== 'undefined' && navigator.mediaSession;
    if (!ms) return;
    const a = this.audio;
    const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* action unsupported */ } };
    const seek = (t) => { if (Number.isFinite(a.duration)) a.currentTime = Math.max(0, Math.min(t, a.duration)); };
    set('play', () => { if (!this.isPlaying) this.togglePlayPause(); });
    set('pause', () => this.pause());
    set('stop', () => { this.pause(); seek(0); ms.playbackState = 'none'; });
    set('seekto', (d) => seek(d.seekTime));
    set('seekbackward', (d) => seek(a.currentTime - (d.seekOffset || 10)));
    set('seekforward', (d) => seek(a.currentTime + (d.seekOffset || 10)));

    let lastPos = 0;
    const position = (force) => {
      if (!ms.setPositionState || !Number.isFinite(a.duration) || a.duration <= 0) return;
      const now = Date.now();
      if (!force && now - lastPos < 1000) return;
      lastPos = now;
      try { ms.setPositionState({ duration: a.duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, a.duration) }); } catch { /* bad state */ }
    };
    a.addEventListener('play', () => {
      // Set on every play: app.js may swap in HD artwork after the track starts
      const t = this.currentTrack;
      if (t && typeof MediaMetadata !== 'undefined') {
        const art = String(t.artwork || '');
        try {
          ms.metadata = new MediaMetadata({
            title: t.title || '', artist: t.artist || '', album: t.album || '',
            artwork: art ? [{ src: art.replace(/\/\d+x\d+bb\./, '/512x512bb.'), sizes: '512x512' }] : []
          });
        } catch { /* bad metadata */ }
      }
      ms.playbackState = 'playing';
    });
    a.addEventListener('pause', () => { ms.playbackState = 'paused'; });
    a.addEventListener('ended', () => { ms.playbackState = 'none'; });
    a.addEventListener('loadedmetadata', () => position(true));
    a.addEventListener('seeked', () => position(true));
    a.addEventListener('timeupdate', () => position(false));
  }

  _setupAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this._emit('play', this.currentTrack);
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this._emit('pause', this.currentTrack);
    });

    this.audio.addEventListener('timeupdate', () => {
      const currentTime = this.audio.currentTime;
      const duration = this.audio.duration || 30;
      const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
      this._emit('timeupdate', {
        currentTime,
        duration,
        progress,
        formattedCurrentTime: this._formatTime(currentTime),
        formattedDuration: this._formatTime(duration)
      });
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
      this._emit('ended', this.currentTrack);
    });

    this.audio.addEventListener('error', (e) => {
      this.isPlaying = false;
      console.warn('Audio playback error:', e);
      this._emit('error', {
        message: 'Prévia de áudio não disponível para esta música.',
        track: this.currentTrack
      });
    });

    this.audio.addEventListener('waiting', () => {
      this._emit('buffering', true);
    });

    this.audio.addEventListener('playing', () => {
      this._emit('buffering', false);
    });
  }

  _formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  _emit(event, data) {
    this.listeners.forEach(cb => {
      try {
        cb(event, data);
      } catch (err) {
        console.error('Audio listener error:', err);
      }
    });
  }

  /**
   * Subscribe to player state changes
   * @param {Function} callback (event, data) => void
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Play or toggle a track
   * @param {object} trackData 
   */
  playTrack(trackData) {
    if (!trackData) return;

    if (!trackData.previewUrl) {
      this._emit('error', {
        message: 'Esta música não possui prévia de 30 segundos disponível.',
        track: trackData
      });
      return;
    }

    // If same track is playing, toggle pause / play / restart
    const isCurrent = this.currentTrack && (
      (this.currentTrack.id && trackData.id && String(this.currentTrack.id) === String(trackData.id)) ||
      (this.currentTrack.previewUrl && trackData.previewUrl && this.currentTrack.previewUrl === trackData.previewUrl) ||
      (this.currentTrack.title && trackData.title &&
       this.currentTrack.title.trim().toLowerCase() === trackData.title.trim().toLowerCase() &&
       this.currentTrack.artist && trackData.artist &&
       this.currentTrack.artist.trim().toLowerCase() === trackData.artist.trim().toLowerCase())
    );

    if (isCurrent) {
      if (this.isPlaying) {
        this.audio.pause();
      } else {
        if (this.audio.ended || (this.audio.duration && this.audio.currentTime >= this.audio.duration - 0.5)) {
          this.audio.currentTime = this._startOf(this.currentTrack);
        }
        const playPromise = this.audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            console.warn('Play error:', e);
            this.isPlaying = false;
            this._emit('pause', this.currentTrack);
          });
        }
      }
      return;
    }

    // New track
    this.currentTrack = trackData;
    this.audio.src = trackData.previewUrl;
    this.audio.currentTime = 0;
    // A post can pick where its preview starts (song.startAt, in seconds)
    if (this._startOf(trackData)) {
      this.audio.addEventListener('loadedmetadata', () => { this.audio.currentTime = this._startOf(trackData); }, { once: true });
    }
    this._emit('trackchange', trackData);

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.warn('Auto-play prevented or error:', error);
        this.isPlaying = false;
        this._emit('pause', trackData);
      });
    }
  }

  togglePlayPause() {
    if (!this.currentTrack) return;
    if (this.isPlaying) {
      this.audio.pause();
    } else {
      if (this.audio.ended || (this.audio.duration && this.audio.currentTime >= this.audio.duration - 0.5)) {
        this.audio.currentTime = this._startOf(this.currentTrack);
      }
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn('Play error:', e);
          this.isPlaying = false;
          this._emit('pause', this.currentTrack);
        });
      }
    }
  }

  /** Second the preview starts at: song.startAt, kept inside the 30s preview (a few seconds left to hear) */
  _startOf(track) {
    const start = Math.max(0, Number(track?.startAt) || 0);
    const room = (this.audio.duration || 30) - 3;
    return Math.min(start, Math.max(0, room));
  }

  pause() {
    if (this.isPlaying) {
      this.audio.pause();
    }
  }

  seekToPercent(percent) {
    if (this.audio.duration) {
      const targetTime = (percent / 100) * this.audio.duration;
      this.audio.currentTime = Math.max(0, Math.min(targetTime, this.audio.duration));
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audio.volume = this.volume;
    this._emit('volumechange', this.volume);
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  getIsPlaying() {
    return this.isPlaying;
  }
}

export const globalAudio = new AudioController();

// ─── Play buttons that follow the player ─────────────────────────────────────
// A button with data-play-key (see playAttr) shows pause while its song plays, wherever it is on screen.

const playKey = (t) => `${String(t?.title || '').trim()}|${String(t?.artist || '').trim()}`.toLowerCase();
const isPlayingTrack = (t) => globalAudio.getIsPlaying() && Boolean(globalAudio.getCurrentTrack())
  && playKey(globalAudio.getCurrentTrack()) === playKey(t);

/** Attribute that ties a button to a song: `<button ${playAttr(song)}>${playIcon(song)}</button>` */
export const playAttr = (t) => `data-play-key="${esc(playKey(t))}"`; // search.js uses data-play for its own rows
export const playIcon = (t) => (isPlayingTrack(t) ? ICONS.pause : ICONS.play);
export const playClass = (t) => (isPlayingTrack(t) ? ' playing' : ''); // render-time twin of the class syncPlayButtons toggles

const VINYL_FALLBACK = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';
/** Sleeve + record peeking out behind it; the record spins only while its own song plays (data-spin-key). */
export const vinylStage = (t, { coverClass = '', onclick = '', title = '' } = {}) => `
  <div class="featured-vinyl-stage"${onclick ? ` onclick="${onclick}"` : ''}${title ? ` title="${esc(title)}"` : ''}>
    <div class="featured-album-sleeve">
      <img class="featured-sleeve-art ${coverClass}" src="${safeUrl(t.artwork || '')}" alt="${esc(t.title)}" onerror="this.src='${VINYL_FALLBACK}'">
      <div class="sleeve-edge-sheen"></div>
    </div>
    <div class="featured-vinyl-disk${playClass(t)}" data-spin-key="${esc(playKey(t))}">
      <div class="vinyl-groove-rings"></div>
      <div class="vinyl-light-sheen"></div>
      <div class="vinyl-center-label">
        <img class="vinyl-label-art" src="${safeUrl(t.artwork || '')}" alt="" onerror="this.src='${VINYL_FALLBACK}'">
        <div class="vinyl-spindle-hole"></div>
      </div>
    </div>
  </div>`;

function syncPlayButtons() {
  const cur = globalAudio.getCurrentTrack();
  const key = globalAudio.getIsPlaying() && cur ? playKey(cur) : null;
  document.querySelectorAll('[data-spin-key]').forEach(d => d.classList.toggle('playing', d.dataset.spinKey === key));
  document.querySelectorAll('[data-play-key]').forEach(btn => {
    const on = btn.dataset.playKey === key;
    if (btn.classList.contains('playing') === on) return;
    btn.classList.toggle('playing', on);
    btn.innerHTML = on ? ICONS.pause : ICONS.play;
  });
}
globalAudio.subscribe((event) => {
  if (['play', 'pause', 'ended', 'trackchange', 'error'].includes(event)) syncPlayButtons();
});
