// Fonts a person can pick for their bio. Each Google Font loads only when a bio on screen uses it.

export const BIO_FONTS = [
  { id: 'padrao',      label: 'Padrão',      family: 'var(--f-ui)' },
  { id: 'classica',    label: 'Clássica',    family: "'Fraunces', Georgia, serif",            css: 'Fraunces:opsz,wght@9..144,400' },
  { id: 'manuscrita',  label: 'Manuscrita',  family: "'Caveat', cursive",                     css: 'Caveat:wght@500', size: '1.25em' },
  { id: 'maquina',     label: 'Máquina',     family: "'Space Mono', ui-monospace, monospace", css: 'Space+Mono', size: '.92em' },
  { id: 'elegante',    label: 'Elegante',    family: "'Playfair Display', Georgia, serif",    css: 'Playfair+Display:ital@1', italic: true },
  { id: 'arredondada', label: 'Arredondada', family: "'Fredoka', system-ui, sans-serif",      css: 'Fredoka:wght@500' }
];

const loaded = new Set();

/** Known font for an id (anything unknown, e.g. from an old profile, falls back to the default). */
export function bioFont(id) {
  return BIO_FONTS.find(f => f.id === id) || BIO_FONTS[0];
}

/** Add the Google Fonts stylesheet for this font once. */
export function ensureBioFont(id) {
  const font = bioFont(id);
  if (!font.css || loaded.has(font.id)) return;
  loaded.add(font.id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${font.css}&display=swap`;
  document.head.appendChild(link);
}

/** Inline style for an element showing text in this font. */
export function bioFontStyle(id) {
  const font = bioFont(id);
  ensureBioFont(font.id);
  return `font-family:${font.family};${font.size ? `font-size:${font.size};` : ''}${font.italic ? 'font-style:italic;' : ''}`;
}
