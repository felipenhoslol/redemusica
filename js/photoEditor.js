// Photo editor for the profile picture and banner: pick a file, drag to position, zoom, save a cropped JPEG.
// The result is a data: URL; sync.js uploads it to Supabase Storage and keeps only the public URL.
import { ICONS } from './icons.js';

const SHAPES = {
  avatar: { title: 'Foto de perfil', ratio: 1, outW: 512, outH: 512 },
  banner: { title: 'Banner', ratio: 3, outW: 1500, outH: 500 }
};
const MAX_ZOOM = 4;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * @param {{ kind: 'avatar'|'banner', src?: string, onSave: (dataUrl: string) => void }} opts
 *   onSave receives '' when the person removes the photo.
 */
export function openPhotoEditor({ kind, src = '', onSave }) {
  const shape = SHAPES[kind] || SHAPES.avatar;
  document.getElementById('photo-editor')?.remove();

  const root = document.createElement('div');
  root.id = 'photo-editor';
  root.className = `photo-editor photo-editor-${kind}`;
  root.innerHTML = `
    <div class="photo-editor-scrim" data-close></div>
    <div class="photo-editor-panel" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title" tabindex="-1">
      <div class="photo-editor-head">
        <button type="button" class="photo-editor-icon" data-close aria-label="Fechar">${ICONS.close}</button>
        <h2 id="photo-editor-title">${shape.title}</h2>
        <button type="button" class="photo-editor-save" data-save disabled>Salvar</button>
      </div>
      <div class="photo-editor-stage" tabindex="0" aria-label="Arraste para posicionar a imagem. Setas movem, mais e menos dão zoom." style="aspect-ratio:${shape.ratio}">
        <img class="photo-editor-img" alt="" draggable="false" hidden>
        <div class="photo-editor-mask" aria-hidden="true"></div>
        <button type="button" class="photo-editor-empty" data-pick>
          ${ICONS.image}<span>Escolher foto</span>
        </button>
      </div>
      <div class="photo-editor-controls" hidden>
        <button type="button" class="photo-editor-icon" data-zoom="-1" aria-label="Diminuir zoom">−</button>
        <input type="range" class="photo-editor-zoom" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Zoom">
        <button type="button" class="photo-editor-icon" data-zoom="1" aria-label="Aumentar zoom">+</button>
      </div>
      <p class="photo-editor-hint" hidden>Arraste a imagem para escolher o enquadramento.</p>
      <p class="photo-editor-error" role="alert" hidden></p>
      <div class="photo-editor-actions">
        <button type="button" class="doodle-btn doodle-btn-secondary" data-pick>${ICONS.image} Trocar foto</button>
        ${src ? `<button type="button" class="doodle-btn doodle-btn-ghost" data-remove>Remover</button>` : ''}
      </div>
      <input type="file" accept="image/*" hidden>
    </div>`;
  document.body.appendChild(root);

  const stage = root.querySelector('.photo-editor-stage');
  const img = root.querySelector('.photo-editor-img');
  const zoomInput = root.querySelector('.photo-editor-zoom');
  const saveBtn = root.querySelector('[data-save]');
  const fileInput = root.querySelector('input[type="file"]');
  const errorEl = root.querySelector('.photo-editor-error');

  // View state: image top-left (x, y) inside the stage, and zoom over the "cover" scale
  let W = 0, H = 0, base = 1, zoom = 1, x = 0, y = 0, loaded = false, tainted = false;

  const scale = () => base * zoom;
  const clamp = () => {
    const w = img.naturalWidth * scale(), h = img.naturalHeight * scale();
    x = Math.min(0, Math.max(W - w, x));
    y = Math.min(0, Math.max(H - h, y));
  };
  const paint = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale()})`;
    zoomInput.value = String(zoom);
  };
  // Layout size, not getBoundingClientRect: the panel opens with a scale animation, and a
  // scaled measurement made the crop cover less than the frame and saved a shifted/zoomed photo
  const stageSize = () => ({ width: stage.clientWidth, height: stage.clientHeight });
  const measure = () => {
    const r = stageSize();
    const prevScale = scale();
    // Keep the same point in the middle when the stage changes size
    const cx = (W / 2 - x) / (prevScale || 1), cy = (H / 2 - y) / (prevScale || 1);
    W = r.width; H = r.height;
    if (!loaded) return;
    base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    x = W / 2 - cx * scale(); y = H / 2 - cy * scale();
    clamp(); paint();
  };
  const setZoom = (z, cx = W / 2, cy = H / 2) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    const ix = (cx - x) / scale(), iy = (cy - y) / scale(); // image point under the zoom center
    zoom = next;
    x = cx - ix * scale(); y = cy - iy * scale();
    clamp(); paint();
  };

  const showError = (msg) => { errorEl.textContent = msg; errorEl.hidden = !msg; };

  function load(url, isLocal) {
    showError('');
    loaded = false;
    saveBtn.disabled = true;
    tainted = false;
    img.hidden = true;
    const attempt = (cors) => {
      if (cors) img.crossOrigin = 'anonymous'; else img.removeAttribute('crossorigin');
      img.onload = () => {
        loaded = true;
        tainted = !cors && !isLocal;
        zoom = 1;
        const r = stageSize();
        W = r.width; H = r.height;
        base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        x = (W - img.naturalWidth * base) / 2;
        y = (H - img.naturalHeight * base) / 2;
        paint();
        img.hidden = false;
        root.classList.add('has-image');
        root.querySelector('.photo-editor-controls').hidden = false;
        root.querySelector('.photo-editor-hint').hidden = false;
        saveBtn.disabled = false;
        if (tainted) showError('Esta imagem vem de outro site e não pode ser ajustada. Envie a foto do seu dispositivo.');
      };
      img.onerror = () => {
        if (cors && !isLocal) return attempt(false);
        showError('Não foi possível abrir esta imagem. Tente outro arquivo.');
      };
      img.src = url;
    };
    attempt(!isLocal);
  }

  function pickFile() { fileInput.value = ''; fileInput.click(); }
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showError('Escolha um arquivo de imagem (JPG, PNG, WEBP ou GIF).'); return; }
    if (file.size > 15 * 1024 * 1024) { showError('Imagem muito grande. Escolha uma de até 15 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => load(reader.result, true);
    reader.readAsDataURL(file);
  });

  function save() {
    if (!loaded) return;
    if (tainted) { showError('Esta imagem vem de outro site e não pode ser ajustada. Envie a foto do seu dispositivo.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = shape.outW; canvas.height = shape.outH;
    const r = shape.outW / W;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x * r, y * r, img.naturalWidth * scale() * r, img.naturalHeight * scale() * r);
    let dataUrl;
    try { dataUrl = canvas.toDataURL('image/jpeg', 0.88); }
    catch { showError('Não foi possível salvar esta imagem. Envie a foto do seu dispositivo.'); return; }
    close();
    onSave?.(dataUrl);
  }

  // ─── dragging and pinching ───
  const pointers = new Map();
  let pinchStart = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!loaded || e.target.closest('[data-pick]')) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage.classList.add('dragging');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, now);
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const rect = stage.getBoundingClientRect();
      setZoom(pinchStart.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.dist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }
    x += now.x - prev.x; y += now.y - prev.y;
    clamp(); paint();
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('wheel', (e) => {
    if (!loaded) return;
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    if (!loaded) return;
    const step = e.shiftKey ? 40 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) { e.preventDefault(); x += moves[e.key][0]; y += moves[e.key][1]; clamp(); paint(); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zoom + 0.15); }
    if (e.key === '-') { e.preventDefault(); setZoom(zoom - 0.15); }
  });
  zoomInput.addEventListener('input', () => setZoom(Number(zoomInput.value)));

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-close]');
    if (!t) return;
    if (t.hasAttribute('data-close')) close();
    else if (t.hasAttribute('data-pick')) pickFile();
    else if (t.hasAttribute('data-save')) save();
    else if (t.hasAttribute('data-remove')) { close(); onSave?.(''); }
    else if (t.dataset.zoom) setZoom(zoom + Number(t.dataset.zoom) * 0.25);
  });

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(stage);

  function close() {
    document.removeEventListener('keydown', onKey);
    resizeObserver.disconnect();
    root.classList.remove('open');
    setTimeout(() => root.remove(), reducedMotion.matches ? 0 : 200);
  }

  requestAnimationFrame(() => root.classList.add('open'));
  // Without a photo the stage shows the "Escolher foto" button (a programmatic file dialog is blocked on iOS)
  if (src) load(src, /^data:/.test(src));
  root.querySelector('.photo-editor-panel').focus({ preventScroll: true });
}
