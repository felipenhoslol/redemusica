// Global Audio Player manager for 30s music previews
import { ICONS } from './icons.js';
import { esc } from './dom.js';

class AudioController {
  constructor() {
    this.audio = new Audio();
    this.currentTrack = null;
    this.isPlaying = false;
    this.listeners = new Set();
    this.volume = 0.8;

    this.audio.volume = this.volume;

    this._setupAudioEvents();
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

function syncPlayButtons() {
  const cur = globalAudio.getCurrentTrack();
  const key = globalAudio.getIsPlaying() && cur ? playKey(cur) : null;
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
