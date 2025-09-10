export const Config = {
  relays: [
    'wss://relilab.nostr1.com',
    'wss://relay-rpi.edufeed.org'
  ],
  // Optional: auf bestimmte Autoren einschränken (npub, hex oder leer lassen)
  allowedAuthors: ["54a340072ccc625516c8d572b638a828c5b857074511302fb4392f26e34e1913", "6f50351f348f571316427ed65397e867b9c4f56f0911be9350c24bf97b36c393"],
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
