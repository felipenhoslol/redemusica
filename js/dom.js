// DOM safety helpers — escape every user/third-party value before it goes into an HTML template string

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape a value for HTML text or a quoted attribute
 * @param {*} value
 * @returns {string}
 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/**
 * Allow only safe URL schemes (http, https, image data URLs, blob, relative) and escape for attributes.
 * Anything else (javascript:, vbscript:, data:text/html...) becomes an empty string.
 * @param {string} url
 * @returns {string}
 */
export function safeUrl(url) {
  if (!url) return '';
  const clean = String(url).trim();
  if (/^(https?:|blob:)/i.test(clean) || /^data:image\/[a-z0-9.+-]+[;,]/i.test(clean)) return esc(clean);
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) return '';
  // Protocol-relative ("//host", "/\host", "\\host") would load from another site
  if (/^[\\/]{2}|^\/\\/.test(clean)) return '';
  return esc(clean);
}

/**
 * A URL for CSS url(...) inside a style attribute: only http(s)/blob/image data URLs, with quotes, parens,
 * backslashes and spaces percent-encoded so the value can't close url() or the attribute.
 * @param {string} url
 * @returns {string} '' when the URL isn't allowed
 */
export function cssUrl(url) {
  const clean = String(url || '').trim();
  if (!/^(https?:|blob:)/i.test(clean) && !/^data:image\/[a-z0-9.+-]+[;,]/i.test(clean)) return '';
  return esc(clean.replace(/["'()\\\s<>]/g, ch => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()));
}

/**
 * Serialize a value as a JS literal inside an inline handler attribute, e.g. onclick="fn(${jsArg(track)})"
 * @param {*} value
 * @returns {string}
 */
export function jsArg(value) {
  return esc(JSON.stringify(value === undefined ? null : value));
}

/**
 * Whether an avatar value is an image URL (vs. a letter/emoji)
 * @param {string} avatar
 * @returns {boolean}
 */
export function isImageAvatar(avatar) {
  return Boolean(avatar) && (avatar.startsWith('http') || avatar.startsWith('data:image') || avatar.startsWith('/'));
}

/**
 * Inner HTML for an avatar: an <img> when it is a URL, otherwise the escaped letter/emoji
 * @param {string} avatar
 * @param {string} name
 * @param {string} imgStyle inline style for the <img>
 * @returns {string}
 */
export function avatarInner(avatar, name, imgStyle = 'width:100%;height:100%;object-fit:cover;border-radius:50%;') {
  if (isImageAvatar(avatar)) {
    return `<img src="${safeUrl(avatar)}" alt="${esc(name)}" style="${imgStyle}">`;
  }
  return esc(avatar || (name ? name[0] : '') || 'U');
}
