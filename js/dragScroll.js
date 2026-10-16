// Drag sideways with the mouse on any row that scrolls horizontally (tabs, filters, artist carousels),
// the way a finger already does on touch screens. A click that ends a drag is swallowed so nothing opens by accident.

const THRESHOLD = 6; // px before a press becomes a drag

function horizontalScroller(start) {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return el;
    }
  }
  return null;
}

let started = false;

export function initDragScroll() {
  if (started) return;
  started = true;
  let drag = null;

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"], .photo-editor-stage')) return;
    const el = horizontalScroller(e.target);
    if (el) drag = { el, id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
  });

  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < THRESHOLD) return;
      drag.moved = true;
      drag.el.classList.add('is-drag-scrolling');
      window.getSelection()?.removeAllRanges();
    }
    drag.el.scrollLeft = drag.left - dx;
    e.preventDefault();
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { el, moved } = drag;
    drag = null;
    el.classList.remove('is-drag-scrolling');
    if (!moved) return;
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  // Images inside a scrolling row would start the browser's own image drag instead
  document.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement && horizontalScroller(e.target)) e.preventDefault();
  });
}
