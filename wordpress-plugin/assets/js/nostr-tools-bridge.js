// ES Module bridge to expose nostr-tools as window.NostrTools for WP Admin pages
// Loads from esm.sh to avoid unpkg path issues and to match the calendar app version.

import * as NT from 'https://esm.sh/nostr-tools@2.8.1';

window.NostrTools = NT;

// Optional ready signal for other scripts (if they want to wait)
window.dispatchEvent(new CustomEvent('nostr-tools-ready', {
  detail: { version: '2.8.1' }
}));