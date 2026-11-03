// Retro look: the hidden tap gesture on the cat logo, and keeping the look in step with the signed-in identity
import { DEFAULT_LOOK, readLooks, saveLook, resolveLook, createTapCounter, discoveryActions, applyLook } from './look.js';
import { auth, identityId } from './auth.js';
import { getUserById, updateUser } from './storage.js';
import { refreshCatArt } from './logo.js';
import { animateSpring, reducedMotion } from './motion.js';

const tap = createTapCounter(); // module state: the sidebar/header redraw the cat, the count survives
let bound = false;
let locked = false;

const wait = ms => new Promise(r => setTimeout(r, ms));
// A cancelled animation (cat redrawn) or a throttled frame clock must not stall or stop the sequence
const done = anim => anim && Promise.race([anim.finished.catch(() => {}), wait(anim.effect.getTiming().duration)]);

/** One delegated listener for both logos; the click still navigates to the feed. */
export function initEasterEgg() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', e => {
    const logo = e.target.closest?.('.sidebar-logo, .mobile-brand');
    if (!logo || locked) return;
    const cat = logo.querySelector('.sidebar-logo-icon, .mobile-brand-cat');
    const id = identityId();
    if (id && tap(performance.now())) discover(id, cat);
    else squash(cat);
  });
}

function squash(cat) {
  if (!cat || reducedMotion()) return;
  cat.style.transformOrigin = '50% 100%';
  animateSpring(cat, [{ transform: 'scale(1.06, .9)' }, { transform: 'scale(1)' }], 'pop');
}

async function discover(id, cat) {
  locked = true;
  if (cat && !reducedMotion()) {
    await done(animateSpring(cat, [
      { transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' },
      { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }
    ], 'snappy'));
    await done(animateSpring(cat, [
      { filter: 'none', opacity: 1 },
      { filter: 'grayscale(1) contrast(1.4)', opacity: 0.7 },
      { filter: 'none', opacity: 1 }
    ], 'snappy', { duration: 180, easing: 'steps(3, end)' }));
  }
  saveLook(id, { skin: 'yt2016', cat: 'retro', found: true });
  updateUser(id, { easterEgg2016: true });
  document.documentElement.dataset.cat = 'retro';
  refreshCatArt();
  await wait(reducedMotion() ? 300 : 250);
  location.reload();
}

/** Apply the current identity's look, copying the discovery down from the server or up to it. */
export function syncLook(serverFound = auth.profile?.extras?.easterEgg2016 === true) {
  const id = identityId();
  if (!id) { applyLook(DEFAULT_LOOK); refreshCatArt(); return; }
  const localFound = readLooks()[id]?.found === true || getUserById(id)?.easterEgg2016 === true;
  const { saveMirror, pushFlag } = discoveryActions(localFound, serverFound);
  if (saveMirror) updateUser(id, { easterEgg2016: true }, { silent: true }); // later profile pushes keep carrying it
  if (pushFlag) updateUser(id, { easterEgg2016: true });
  if (localFound || serverFound) saveLook(id, { found: true }); // so the head script paints it before first frame next time
  applyLook(resolveLook(readLooks(), id));
  refreshCatArt();
}
