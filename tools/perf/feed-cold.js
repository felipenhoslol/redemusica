// Cold feed: link previews arrive after the first paint and must not push the feed (CLS < 0.05).
// node tools/perf.mjs --url http://localhost:5174/ --setup tools/perf/feed-cold.setup.js --scenario tools/perf/feed-cold.js
async () => {
  const motion = (await import('/tools/ui-audit.mjs')).watchMotion();
  await new Promise(r => setTimeout(r, 4000)); // previews arrive
  const { cls, shifts, longFrames } = motion.stop();
  const slots = document.querySelectorAll('.auto-link-slot').length;
  const cards = document.querySelectorAll('#feed-posts .rich-link-card').length;
  return { cls, pass: cls < 0.05, cards, slotsLeft: slots, shifts: shifts.slice(0, 8), longFrames };
}
