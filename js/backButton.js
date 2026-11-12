// Android back button/gesture (Capacitor app only): one step back inside the site, never straight out of the app.
// Registering the listener turns off Capacitor's default (which closes the app), so every case is handled here.

import { setPopover } from './motion.js';

// Overlays without their own history step, topmost = last in the DOM (openModal and dialogs append to body)
const OVERLAYS = '.modal-overlay.active, .app-dialog.open, #photo-editor.open, #photo-viewer, .app-promo, #me-sheet.open';

/** Dropdowns the back button closes; one already closing (`data-open="false"`) counts as closed, so the next back navigates. */
export const openDropdowns = (root = document) =>
  [...root.querySelectorAll('.post-options-dropdown')].filter(d => d.dataset.open === 'true');

/** What the back button does: close an overlay, go back in the site's history, return to the feed, or leave. */
export function backStep({ dropdown, overlay, depth, tab }) {
  if (dropdown) return 'dropdown';
  if (overlay) return 'overlay';
  if (depth > 0) return 'back';
  if (tab !== 'feed') return 'feed';
  return 'minimize';
}

export function initBackButton({ getTab, switchTab }) {
  const { App } = window.Capacitor.Plugins;
  App.addListener('backButton', () => {
    const dropdowns = openDropdowns();
    const overlay = [...document.querySelectorAll(OVERLAYS)].pop();
    // Close it with its own close button, so it runs the same cleanup (and history step) as a tap
    // (confirm modals without an X close like a tap on their scrim does)
    const closer = overlay?.querySelector('[data-close], .modal-close');
    const isModal = overlay?.classList.contains('modal-overlay');
    const step = backStep({ dropdown: dropdowns.length > 0, overlay: !!closer || isModal, depth: history.state?.depth || 0, tab: getTab() });
    if (step === 'dropdown') dropdowns.forEach(d => setPopover(d, false));
    else if (step === 'overlay') closer ? closer.click() : overlay.classList.remove('active');
    else if (step === 'back') history.back(); // the popstate handler in app.js redraws the screen
    else if (step === 'feed') {
      // Feed takes the bottom step's place (switchTab then sees "same screen" and pushes nothing), so the next back leaves
      history.replaceState({ tab: 'feed', depth: 0 }, '');
      switchTab('feed');
    }
    else App.minimizeApp(); // a blocking overlay (forced update) also lands here
  });
}
