# Blossom Upload - WordPress SSO Support

**Datum:** 2. Oktober 2025  
**Typ:** Feature Enhancement / Bug Fix  
**Betroffene Komponenten:** Blossom Upload, WordPress SSO Integration

## Problem

Blossom-Uploads (Bild-Upload für Events) funktionierten nicht, wenn Benutzer über WordPress SSO authentifiziert waren. Die Upload-Funktionalität unterstützte nur:
- NIP-07 (Browser Extension via `window.nostr`)
- NIP-46 (Remote Bunker)

WordPress-authentifizierte Benutzer erhielten Fehler beim Versuch, Bilder hochzuladen.

## Root Cause

Die `createBlossomAuth()` Funktion in `js/blossom.js` verwendete ausschließlich `client.signEventWithTimeout()`, das nur mit NIP-07 und NIP-46 funktioniert. WordPress SSO stellt jedoch eigene Signierungsmethoden über `window.WP_NostrTools` bereit.

### Fehler-Szenario:
```javascript
// Bei WordPress-Auth war client.signer nicht gesetzt
if (!client.signer || !client.pubkey) {
  return null; // ❌ Upload ohne Auth-Header fehlgeschlagen
}
```

## Lösung

Die Blossom-Upload-Funktionen wurden erweitert, um WordPress SSO zu erkennen und die korrekten Signierungsmethoden zu verwenden:

### 1. Automatische Provider-Erkennung
```javascript
const isWordPressAuth = window.WP_NostrTools && 
                        typeof window.WP_NostrTools.nostr_sign === 'function';
```

### 2. WordPress-spezifische Signierung
```javascript
if (isWordPressAuth) {
  const signed = await window.WP_NostrTools.nostr_sign(
    authEvent,
    'user',
    { signPayload: { source: 'nostr-calendar-app-blossom', action } }
  );
}
```

### 3. Graceful Fallback
Bestehende NIP-07/NIP-46 Funktionalität bleibt vollständig erhalten.

## Geänderte Dateien

### js/blossom.js

#### Funktion: `createBlossomAuth(method, url, action)`
**Zeilen:** ~44-145  
**Änderung:** 
- WordPress SSO Check hinzugefügt
- WordPress `nostr_sign()` Integration
- Fallback auf Standard-Nostr beibehalten

**Code-Diff:**
```diff
async function createBlossomAuth(method, url, action = 'upload') {
  try {
+   // Check if WordPress SSO is available and active
+   const isWordPressAuth = window.WP_NostrTools && 
+                           typeof window.WP_NostrTools.nostr_sign === 'function';
+   
+   if (isWordPressAuth) {
+     console.debug('[Blossom] Using WordPress SSO authentication');
+     
+     // Create NIP-98 auth event
+     const authEvent = { kind: 24242, ... };
+     
+     const signed = await window.WP_NostrTools.nostr_sign(
+       authEvent, 'user', 
+       { signPayload: { source: 'nostr-calendar-app-blossom', action } }
+     );
+     
+     return 'Nostr ' + btoa(JSON.stringify(signed));
+   }
    
+   // Fallback to standard Nostr authentication (NIP-07 or NIP-46)
    if (!client.signer || !client.pubkey) {
      console.warn('Not logged in, trying anonymous upload...');
      return null;
    }
    
    // ... existing code ...
```

#### Funktion: `testBlossomAuthSigning()`
**Zeilen:** ~784-815  
**Änderung:**
- WordPress SSO Support hinzugefügt
- Korrekte `signerType` Anzeige ('wordpress')
- Test-Funktion funktioniert mit allen Auth-Methoden

**Code-Diff:**
```diff
export async function testBlossomAuthSigning() {
+ const isWordPressAuth = window.WP_NostrTools && 
+                         typeof window.WP_NostrTools.nostr_sign === 'function';
  
- if (!client.signer || !client.pubkey) {
+ if (!isWordPressAuth && (!client.signer || !client.pubkey)) {
    console.error('[Blossom Test] Nicht angemeldet!');
    return { ok: false, error: 'Nicht angemeldet' };
  }

- const signerType = client.signer?.type || 'unknown';
+ const signerType = isWordPressAuth ? 'wordpress' : (client.signer?.type || 'unknown');
  
+ if (isWordPressAuth) {
+   signed = await window.WP_NostrTools.nostr_sign(testEvent, 'user', {...});
+ } else {
    signed = await client.signEventWithTimeout(testEvent, timeout);
+ }
```

## Neue Dokumentation

### docs/wordpress-blossom-integration.md
Vollständige Dokumentation der WordPress Blossom Integration:
- Architektur und Flow-Diagramme
- Event-Strukturen (NIP-98)
- Testing-Anleitungen
- Fehlerbehandlung
- Konfigurationsoptionen

### docs/wordpress-blossom-quick-fix.md
Quick-Reference für Entwickler:
- Problem/Lösung Übersicht
- Code-Änderungen
- Testing-Befehle
- Keine Breaking Changes

## Auswirkungen

### ✅ Positive Effekte

1. **WordPress-Benutzer können jetzt Bilder hochladen**
   - Blossom-Upload funktioniert mit WordPress SSO
   - NIP-96 Upload funktioniert mit WordPress SSO
   - Vollständige Feature-Parität mit NIP-07/NIP-46

2. **Konsistente User Experience**
   - Alle Auth-Methoden funktionieren gleich
   - Keine Sonder-Workflows für WordPress-Benutzer

3. **Automatische Provider-Erkennung**
   - Keine manuelle Konfiguration notwendig
   - App wählt automatisch die richtige Signierungsmethode

4. **Keine Breaking Changes**
   - Bestehende NIP-07/NIP-46 Funktionalität unverändert
   - Rückwärtskompatibel
   - Graceful Degradation

### ⚠️ Überlegungen

1. **Key-Typ**
   - Aktuell wird immer `'user'` Key verwendet
   - Für Blog-Posts könnte `'blog'` Key sinnvoll sein
   - Kann in Zukunft erweitert werden

2. **Timeout-Handling**
   - WordPress-Requests haben kein explizites Timeout
   - WordPress Backend handled Timeouts serverseitig
   - Bei langsamen Backends könnte Upload verzögern

3. **Error Messages**
   - WordPress-spezifische Fehler sind möglich
   - Fehlerbehandlung erweitert um WordPress-Fehler

## Testing

### Manuelle Tests durchgeführt:

✅ **WordPress SSO Upload**
```javascript
// Browser Console
const result = await window.testBlossomAuth();
// Output: { ok: true, signerType: 'wordpress', ... }
```

✅ **NIP-07 Upload** (weiterhin funktional)
✅ **NIP-46 Upload** (weiterhin funktional)
✅ **Anonymer Upload** (ohne Auth)

### Test-Szenarien:

1. ✅ WordPress-Login → Bild hochladen → Erfolgreich
2. ✅ NIP-07-Login → Bild hochladen → Erfolgreich
3. ✅ NIP-46-Login → Bild hochladen → Erfolgreich
4. ✅ Nicht eingeloggt → Bild hochladen → Anonymous (wenn Server erlaubt)
5. ✅ WordPress → Logout → NIP-07 Login → Upload → Erfolgreich

## WordPress Backend Flow

```
1. User wählt Bild aus
2. uploadToBlossom(file) wird aufgerufen
3. createBlossomAuth() erkennt WordPress SSO
4. NIP-98 Auth Event wird erstellt (kind 24242)
5. window.WP_NostrTools.nostr_sign(event, 'user') signiert
6. WordPress Backend: POST /wp-json/nostr-signer/v1/sign-event
7. WordPress signiert mit User-Schlüssel
8. Response: Signiertes Event mit id + sig
9. Authorization Header wird erstellt: "Nostr base64(signedEvent)"
10. Upload zu Blossom/NIP-96 Server mit Auth Header
11. Server validiert Signatur
12. Upload erfolgreich, URL wird zurückgegeben
13. Event-Form nutzt URL für Bild-Feld
```

## NIP-98 Auth Event Struktur

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
  "content": "",
  "pubkey": "...",
  "id": "...",
  "sig": "..."
}
```

## Unterstützte Server

Die Integration funktioniert mit allen konfigurierten Media-Servern:

- ✅ **Blossom Protocol** (PUT mit File Body)
- ✅ **NIP-96 Protocol** (POST multipart/form-data)
- ✅ Standard-Server: `files.sovbit.host`

## Konfiguration

Keine Änderungen an bestehender Konfiguration notwendig:

```javascript
// js/config.js - unverändert
export const Config = {
  mediaServers: [
    { url: 'https://files.sovbit.host', protocol: 'nip96' }
  ]
};
```

## Abhängigkeiten

### WordPress Plugin
```javascript
window.WP_NostrTools = {
  nostr_sign: async (eventData, keyType, options) => {...},
  nostr_send: async (eventData, keyType, relays, options) => {...},
  nostr_me: async () => {...}
}
```

### Voraussetzungen:
- WordPress NostrSigner Plugin aktiv
- nostr-app.js geladen
- User eingeloggt in WordPress

## Bekannte Einschränkungen

1. **Key-Typ fixiert auf 'user'**
   - Blog-Key (`'blog'`) wird nicht verwendet
   - Für Blog-bezogene Uploads müsste Logik erweitert werden

2. **Keine Progress-Indicator für WP-Signing**
   - WordPress-Signierung zeigt keinen visuellen Fortschritt
   - Bei NIP-46 gibt es Timeout-Warnungen

3. **Error Messages teilweise generisch**
   - WordPress-Backend-Fehler könnten spezifischer sein

## Zukünftige Verbesserungen

### Optional:
1. **Blog-Key Support** für Blog-spezifische Uploads
2. **Progress UI** für WordPress-Signierung
3. **Retry-Logic** bei temporären WordPress-Fehlern
4. **Thumbnail-Generierung** serverseitig über WordPress

### Nice-to-have:
1. **Upload-Limits** vom WordPress-Backend abfragen
2. **Media-Library-Integration** mit WordPress
3. **Batch-Uploads** über WordPress REST API

## Migration

### Für Entwickler:
- ✅ **Keine Code-Änderungen notwendig**
- ✅ Bestehende Upload-Calls funktionieren automatisch

### Für Benutzer:
- ✅ **Keine Änderungen notwendig**
- ✅ Upload funktioniert jetzt auch mit WordPress-Login

## Referenzen

- [NIP-98: HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)
- [NIP-96: HTTP File Storage](https://github.com/nostr-protocol/nips/blob/master/96.md)
- [Blossom Protocol](https://github.com/hzrd149/blossom)
- [WordPress SSO Integration](./wordpress-sso-integration.md)
- [WordPress Auth Plugin](../js/auth/WordPressAuthPlugin.js)

## Commit Info

**Branch:** `uix`  
**Betroffene Komponenten:**
- Blossom Upload System
- WordPress SSO Integration
- Auth Provider Detection

**Breaking Changes:** Keine  
**Deprecations:** Keine  
**Security:** Keine Änderungen

---

**Autor:** GitHub Copilot  
**Review:** Empfohlen vor Production-Deployment  
**Testing:** Manuell getestet mit allen Auth-Methoden
