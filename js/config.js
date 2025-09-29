export const Config = {
  // Server-URL für Nostr-Events (z. B. WebSocket-Relay)  
  relays: [
    'wss://relay-rpi.edufeed.org'
  ],
  // Optional: auf bestimmte Autoren einschränken (npub, hex oder leer lassen)
  allowedAuthors: ["6f50351f348f571316427ed65397e867b9c4f56f0911be9350c24bf97b36c393","67aea7eb0d97183c98676f320b5cdb48f7efbb73b3d7ff8c2c1b40cfb6866586","54a340072ccc625516c8d572b638a828c5b857074511302fb4392f26e34e1913", "456912bd34aa93070adec252bb5ebff4ee6d4120e1b848ae6b396b841fb5016a" ],
  // Subscriptions-Speicher: Standard lokal für nicht angemeldete Nutzer.
  // Bei Anmeldung bevorzugt NIP-51 (parameterized replaceable list) mit eigenem d-Namen.
  subscriptionsList: {
    strategy: 'auto', // 'auto' | 'local' | 'nip51' | 'contacts'
    nip51: {
      kind: 30000,
      d: 'nostr-calendar:subscriptions',
      name: 'Nostr Calendar Subscriptions',
      description: 'Autorisierte Aboliste für den Kalender'
    },
    contactsKind: 3 // Fallback: NIP-02 Contacts (nicht empfohlen zum Schreiben)
  },
  defaultTheme: 'light',
  // Optionaler NIP-96 Upload-Endpunkt (z. B. https://media.server/api/upload )
  mediaUploadEndpoint: '',
  // Blossom host (für Datei-Uploads & Verwaltung)
  blossom: { endpoint: 'https://blossom.band' },
  // NIP-46 (Bunker) – optional vordefinierte Connect-URI (kann per UI gesetzt werden)
  nip46: { connectURI: '' },
  // App metadata for NIP-78 client tags
  appTag: ['client', 'nostr-calendar-demo']
};

// Dev-/Debug-Override: Relays per URL-Parameter setzen (?relay=wss://… oder ?relays=wss://a,wss://b)
try {
  const p = new URLSearchParams(location.search);
  const raw = p.get('relays') || p.get('relay');
  if (raw) {
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length) {
      Config.relays = list;
      console.info('[Config] Using relays from URL:', Config.relays);
    }
  }
} catch {}
