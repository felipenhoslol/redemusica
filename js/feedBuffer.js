// New posts that arrive while you read wait above the feed (the "novos posts" pill) until you ask for them:
// nothing moves under the finger. The "cut" is what the screen showed when they started arriving, per filter.

// A repost has no time of its own: it sorts by its post. A post written here and not yet on the server
// has no server time: its id carries the moment it was written (post_<ms>_xxxx)
const timeOf = (p) => Date.parse(p.createdAtIso || p.createdAt) || Number(/^post_(\d+)_/.exec(p.id)?.[1]) || 0;

/** Newest first (stable: posts with no known time keep their order). */
export const sortNewest = (posts) => [...posts].sort((a, b) => timeOf(b) - timeOf(a));

/**
 * Split the sorted posts into what the feed draws and what waits behind the pill.
 * buffered = posts not on screen that sort above the first visible one. Posts on screen that vanished
 * from the data (deleted by someone) keep their last drawn copy until the cut is cleared.
 * @param {Array} posts sorted newest first
 * @param {{ shownIds: Set<string>, firstVisibleId: string, drawn?: Map<string, object> } | null} cut
 * @param {(post) => boolean} [hidden] gone by your own choice (an author you blocked): not kept
 */
export function applyCut(posts, cut, hidden = () => false) {
  if (!cut) return { visible: posts, buffered: [] };
  const ids = new Set(posts.map(p => p.id));
  const gone = [...cut.shownIds].filter(id => !ids.has(id) && cut.drawn?.has(id)).map(id => cut.drawn.get(id)).filter(p => !hidden(p));
  const all = gone.length ? sortNewest([...posts, ...gone]) : posts;
  const first = all.findIndex(p => p.id === cut.firstVisibleId);
  const visible = [], buffered = [];
  all.forEach((p, i) => (i < first && !cut.shownIds.has(p.id) ? buffered : visible).push(p));
  return { visible, buffered };
}

const cuts = {};
const drawn = {}; // filter → id → the post as last drawn (the same Map lives in that filter's cut)
const drawnIn = (mode) => (drawn[mode] ||= new Map());

export const getCut = (mode) => cuts[mode] || null;
export const setCut = (mode, cut) => { cuts[mode] = { drawn: drawnIn(mode), ...cut }; };
export const clearCut = (mode) => { delete cuts[mode]; };

/** What the feed just drew for this filter (renderFeed calls it with every visible post). */
export function remember(mode, posts) {
  const map = drawnIn(mode);
  map.clear();
  posts.forEach(p => map.set(p.id, p));
}
