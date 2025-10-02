# WordPress Blossom Integration

## Übersicht

Die Blossom-Upload-Funktionalität wurde erweitert, um WordPress SSO-Authentication zu unterstützen. Das ermöglicht Bild-Uploads und Authentifizierung über das WordPress NostrSigner Plugin.

## Änderungen

### 1. `createBlossomAuth()` Funktion (js/blossom.js)

Die Funktion zur Erstellung der Blossom-Authentifizierung (NIP-98) wurde erweitert:

```javascript
async function createBlossomAuth(method, url, action = 'upload') {
  // Prüfe ob WordPress SSO aktiv ist
  const isWordPressAuth = window.WP_NostrTools && 
                          typeof window.WP_NostrTools.nostr_sign === 'function';
  
  if (isWordPressAuth) {
    // Verwende WordPress nostr_sign() statt client.signEventWithTimeout()
    const signed = await window.WP_NostrTools.nostr_sign(
      authEvent,
      'user', // Verwende User-Key (nicht Blog-Key)
      {
        signPayload: {
          source: 'nostr-calendar-app-blossom',
          action: action
        }
      }
    );
    
    // Erstelle Auth-Header
    return 'Nostr ' + btoa(JSON.stringify(signed));
  }
  
  // Fallback auf Standard Nostr (NIP-07 oder NIP-46)
  // ...
}
```

**Funktionsweise:**
- Erkennt automatisch, ob WordPress SSO verfügbar ist
- Verwendet `window.WP_NostrTools.nostr_sign()` für WordPress-Auth
- Fällt automatisch auf Standard-Nostr-Auth zurück (NIP-07/NIP-46)
- Erstellt korrekte NIP-98 Authorization Header

### 2. `testBlossomAuthSigning()` Test-Funktion

Die Debug-Funktion wurde ebenfalls erweitert:

```javascript
export async function testBlossomAuthSigning() {
  const isWordPressAuth = window.WP_NostrTools && 
                          typeof window.WP_NostrTools.nostr_sign === 'function';
  
  if (isWordPressAuth) {
    // Teste WordPress-Signierung
    signed = await window.WP_NostrTools.nostr_sign(testEvent, 'user', {...});
  } else {
    // Teste Standard-Nostr-Signierung
    signed = await client.signEventWithTimeout(testEvent, timeout);
  }
}
```

**Verwendung in der Browser-Konsole:**
```javascript
// Test ob Blossom Auth mit aktuellem Auth-Provider funktioniert
await window.testBlossomAuth()

// Erwartetes Ergebnis bei WordPress SSO:
// { ok: true, signerType: 'wordpress', eventId: '...', message: '✅ ...' }
```

## Unterstützte Upload-Protokolle

Die Integration funktioniert mit beiden Upload-Protokollen:

1. **Blossom Protocol** (PUT mit File Body)
   - Standard Blossom-Server
   
2. **NIP-96 Protocol** (POST mit multipart/form-data)
   - files.sovbit.host
   - Andere NIP-96 konforme Server

## Authentifizierungs-Flow

### WordPress SSO aktiv:
```
Upload Request
    ↓
createBlossomAuth() erkennt WordPress
    ↓
window.WP_NostrTools.nostr_sign()
    ↓
WordPress Backend (/wp-json/nostr-signer/v1/sign-event)
    ↓
Signiertes Event (kind 24242 NIP-98)
    ↓
Authorization Header: "Nostr base64(signedEvent)"
    ↓
Upload zu Blossom/NIP-96 Server
```

### Standard Nostr (NIP-07 oder NIP-46):
```
Upload Request
    ↓
createBlossomAuth() nutzt client.signEventWithTimeout()
    ↓
window.nostr.signEvent() oder NIP-46 Bunker
    ↓
Signiertes Event (kind 24242)
    ↓
Authorization Header
    ↓
Upload zu Server
```

## Event-Struktur

### NIP-98 Auth Event (kind 24242)
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

**Tags:**
- `u`: Target-URL (Upload-Endpoint)
- `method`: HTTP-Methode (PUT für Blossom, POST für NIP-96)
- `t`: Action-Type (upload, list, get, delete)
- `expiration`: Unix-Timestamp (60 Sekunden Gültigkeit)

## WordPress NostrSigner Integration

### Voraussetzungen

1. **WordPress Plugin installiert:**
   - NostrSigner Wrapper Plugin aktiv
   - nostr-app.js geladen

2. **Globales Objekt verfügbar:**
   ```javascript
   window.WP_NostrTools = {
     nostr_sign: async (eventData, keyType, options) => {...},
     nostr_send: async (eventData, keyType, relays, options) => {...},
     nostr_me: async () => {...}
   }
   ```

3. **User eingeloggt:**
   - WordPress-Session aktiv
   - Pubkey verfügbar über `/wp-json/nostr-signer/v1/me`

### WordPress Backend-Endpoint

```
POST /wp-json/nostr-signer/v1/sign-event
Content-Type: application/json
X-WP-Nonce: <nonce>

{
  "event": {
    "kind": 24242,
    "created_at": 1738425600,
    "tags": [...],
    "content": ""
  },
  "key_type": "user"
}
```

**Response:**
```json
{
  "event": {
    "id": "...",
    "pubkey": "...",
    "sig": "...",
    "kind": 24242,
    "created_at": 1738425600,
    "tags": [...],
    "content": ""
  }
}
```

## Fehlerbehandlung

### WordPress-spezifische Fehler

```javascript
try {
  const result = await uploadToBlossom(file);
} catch (error) {
  if (error.message.includes('WordPress SSO')) {
    // WordPress-Auth-Fehler
    console.error('WordPress-Authentifizierung fehlgeschlagen:', error);
    // Eventuell Benutzer zur WP-Login-Seite weiterleiten
  }
}
```

### Mögliche Fehlerquellen:

1. **WordPress nicht verfügbar:**
   - `window.WP_NostrTools` nicht definiert
   - → Fallback auf Standard-Nostr

2. **Signierung fehlgeschlagen:**
   - WordPress-Backend-Fehler
   - Benutzer nicht eingeloggt
   - Nonce ungültig

3. **Upload fehlgeschlagen:**
   - Server nicht erreichbar
   - Signatur ungültig
   - Rate-Limit überschritten

## Testing

### Browser-Konsole Tests

```javascript
// 1. Prüfe ob WordPress SSO verfügbar ist
console.log('WordPress:', window.WP_NostrTools ? 'verfügbar' : 'nicht verfügbar');

// 2. Teste Blossom-Auth-Signierung
const result = await window.testBlossomAuth();
console.log(result);

// 3. Prüfe Session-Daten
const me = await window.WP_NostrTools.nostr_me();
console.log('User:', me.user);
console.log('Pubkey:', me.user.pubkey.npub);

// 4. Test-Upload
const fileInput = document.querySelector('input[type="file"]');
const file = fileInput.files[0];
const uploadResult = await window.blossomDebug.uploadToBlossom(file);
console.log('Upload:', uploadResult);
```

### Expected Output (WordPress SSO):

```javascript
// testBlossomAuth()
{
  ok: true,
  signerType: 'wordpress',
  eventId: 'abc123...',
  message: '✅ WordPress SSO kann kind 24242 signieren! Event ID: abc123...'
}

// uploadToBlossom()
{
  url: 'https://files.sovbit.host/abc123.jpg',
  meta: { sha256: '...', size: 12345, ... }
}
```

## Migration von NIP-07/NIP-46

### Automatische Erkennung

Die App erkennt automatisch die verfügbare Auth-Methode:

```javascript
// Keine Code-Änderungen notwendig!
// uploadToBlossom() funktioniert mit allen Auth-Methoden:

const result = await uploadToBlossom(file);
// ✅ Funktioniert mit WordPress SSO
// ✅ Funktioniert mit NIP-07 (window.nostr)
// ✅ Funktioniert mit NIP-46 (Bunker)
```

### Auth-Priorität

1. **WordPress SSO** (wenn verfügbar)
2. **NIP-07** (Browser Extension)
3. **NIP-46** (Remote Signer/Bunker)

## Konfiguration

### WordPress NostrSigner Config

```javascript
window.NostrSignerConfig = {
  enabled: true,
  nonce: 'abc123...',
  loginUrl: '/wp-login.php',
  logoutUrl: '/wp-login.php?action=logout',
  defaultRelays: [
    'wss://relay.damus.io',
    'wss://relay.snort.social'
  ]
};
```

### Blossom Upload Config (js/config.js)

```javascript
export const Config = {
  mediaServers: [
    { 
      url: 'https://files.sovbit.host', 
      protocol: 'nip96' 
    }
  ]
};
```

## Bekannte Einschränkungen

1. **Key-Typ:**
   - Verwendet immer `'user'` Key (nicht `'blog'`)
   - Für Blog-Posts müssten Events mit Blog-Key signiert werden

2. **Timeout:**
   - WordPress-Signierung hat kein explizites Timeout
   - NIP-46: 60 Sekunden
   - NIP-07: 8 Sekunden

3. **Permissions:**
   - Bei NIP-46 muss kind 24242 explizit erlaubt sein
   - WordPress: Keine Permission-Abfrage nötig

## Weiterführende Dokumentation

- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)
- [NIP-96: HTTP File Storage](https://github.com/nostr-protocol/nips/blob/master/96.md)
- [Blossom Protocol](https://github.com/hzrd149/blossom)
- [WordPress NostrSigner Plugin](../docs/wordpress-sso-integration.md)

## Changelog

### 2025-01-02
- ✅ `createBlossomAuth()` unterstützt WordPress SSO
- ✅ `testBlossomAuthSigning()` unterstützt WordPress SSO
- ✅ Automatische Erkennung des aktiven Auth-Providers
- ✅ Fallback auf Standard-Nostr (NIP-07/NIP-46)
