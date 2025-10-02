# WordPress Blossom Upload - Quick Fix

## Problem
Blossom-Upload funktionierte nicht mit WordPress SSO Authentication, weil die Auth-Header-Generierung nur `window.nostr` (NIP-07) und NIP-46 (Bunker) unterstützte.

## Lösung
Die `createBlossomAuth()` Funktion in `js/blossom.js` erkennt jetzt automatisch WordPress SSO und verwendet `window.WP_NostrTools.nostr_sign()` für die Signierung.

## Geänderte Dateien

### js/blossom.js

1. **`createBlossomAuth()` Funktion (Zeile ~44-95)**
   - Prüft ob `window.WP_NostrTools` verfügbar ist
   - Verwendet WordPress `nostr_sign()` wenn aktiv
   - Fallback auf Standard Nostr (NIP-07/NIP-46)

2. **`testBlossomAuthSigning()` Funktion (Zeile ~784-813)**
   - Test-Funktion unterstützt jetzt auch WordPress SSO
   - Zeigt korrekten `signerType: 'wordpress'` an

## Code-Änderungen

### Vorher:
```javascript
async function createBlossomAuth(method, url, action) {
  if (!client.signer || !client.pubkey) {
    return null;
  }
  
  const signed = await client.signEventWithTimeout(authEvent, timeout);
  return 'Nostr ' + btoa(JSON.stringify(signed));
}
```

### Nachher:
```javascript
async function createBlossomAuth(method, url, action) {
  // WordPress SSO Check
  const isWordPressAuth = window.WP_NostrTools && 
                          typeof window.WP_NostrTools.nostr_sign === 'function';
  
  if (isWordPressAuth) {
    // WordPress Signierung
    const signed = await window.WP_NostrTools.nostr_sign(
      authEvent,
      'user',
      { signPayload: { source: 'nostr-calendar-app-blossom', action } }
    );
    return 'Nostr ' + btoa(JSON.stringify(signed));
  }
  
  // Fallback: Standard Nostr
  if (!client.signer || !client.pubkey) {
    return null;
  }
  const signed = await client.signEventWithTimeout(authEvent, timeout);
  return 'Nostr ' + btoa(JSON.stringify(signed));
}
```

## Funktioniert jetzt mit

✅ **WordPress SSO** (window.WP_NostrTools)  
✅ **NIP-07** (Browser Extension - window.nostr)  
✅ **NIP-46** (Remote Bunker)  

## Testing

```javascript
// Browser Console
await window.testBlossomAuth()

// Expected Output mit WordPress:
// { ok: true, signerType: 'wordpress', message: '✅ ...' }
```

## WordPress Backend Flow

```
Client: createBlossomAuth()
    ↓
window.WP_NostrTools.nostr_sign(event, 'user')
    ↓
WordPress: POST /wp-json/nostr-signer/v1/sign-event
    ↓
WordPress Backend signiert mit User-Key
    ↓
Response: { event: { id, sig, pubkey, ... } }
    ↓
Client: Authorization Header erstellen
    ↓
Upload zu Blossom/NIP-96 Server
```

## Wichtige Details

### Event-Struktur (NIP-98)
```json
{
  "kind": 24242,
  "created_at": 1738425600,
  "tags": [
    ["u", "https://files.sovbit.host/upload"],
    ["method", "PUT"],
    ["t", "upload"],
    ["expiration", "1738425660"]
  ],
  "content": ""
}
```

### Key-Typ
- Verwendet `'user'` Key (nicht `'blog'`)
- WordPress Backend signiert mit User-Schlüssel
- Für Blog-Posts müsste `'blog'` Key verwendet werden

### Timeout
- WordPress: Kein explizites Timeout (WordPress Backend handled das)
- NIP-46: 60 Sekunden
- NIP-07: 8 Sekunden

## Keine Breaking Changes

- Bestehende NIP-07/NIP-46 Funktionalität unverändert
- Automatische Erkennung des Auth-Providers
- Kein Migrations-Code notwendig

## Verwandte Dateien

- `js/auth/WordPressAuthPlugin.js` - WordPress Auth Plugin
- `js/auth/AuthManager.js` - Auth Management
- `js/blossom.js` - Blossom Upload (GEÄNDERT)
- `docs/wordpress-blossom-integration.md` - Dokumentation (NEU)

## Nächste Schritte

Optional könnten weitere WordPress-spezifische Features hinzugefügt werden:

1. **Blog-Key Support** für Blog-Posts
2. **Progress-Tracking** über WordPress REST API
3. **Upload-Limits** vom WordPress-Backend abrufen
4. **Thumbnail-Generierung** serverseitig

## Referenzen

- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)
- [NIP-96: HTTP File Storage](https://github.com/nostr-protocol/nips/blob/master/96.md)
- [Blossom Protocol](https://github.com/hzrd149/blossom)
