export const Config = {
  // Nostr relays to connect to 'wss://relilab.nostr1.com',
    
  relays: [
    'wss://relilab.nostr1.com',
    'wss://relay-rpi.edufeed.org'
  ],
  // Optional: auf bestimmte Autoren einschränken (npub, hex oder leer lassen)
  allowedAuthors: ["67aea7eb0d97183c98676f320b5cdb48f7efbb73b3d7ff8c2c1b40cfb6866586","54a340072ccc625516c8d572b638a828c5b857074511302fb4392f26e34e1913", "456912bd34aa93070adec252bb5ebff4ee6d4120e1b848ae6b396b841fb5016a" ],
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
