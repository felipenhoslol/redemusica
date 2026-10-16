// Small badges next to people's names (currently: the admin gear).
import { ICONS } from './icons.js';
import * as Storage from './storage.js';

/** A gear for admins ('' for everyone else). */
export function adminBadge(userId) {
  return Storage.isAdminUser(userId)
    ? `<span class="admin-badge" title="Admin da rede de música" aria-label="Admin" role="img">${ICONS.gear}</span>`
    : '';
}
