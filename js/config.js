export const Config = {
  relays: [
    'wss://relilab.nostr1.com',
    'wss://relay.tchncs.de',
    'wss://relay.damus.io'
  ],
  // Optional: auf bestimmte Autoren einschränken (npub, hex oder leer lassen)
  allowedAuthors: [],
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
