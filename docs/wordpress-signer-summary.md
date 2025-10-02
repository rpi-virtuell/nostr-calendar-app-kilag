# WordPress Signer - Zusammenfassung

## Was wurde geändert?

### Problem
Der `WordPressAuthPlugin` hatte keinen `client.signer`, was zu WordPress-spezifischen Checks im Code führte.

### Lösung
WordPress-Signer-Objekt erstellt, das das gleiche Interface wie NIP-07 und NIP-46 implementiert.

## Änderungen

### 1. WordPressAuthPlugin.js

#### Neues Signer-Objekt
```javascript
this.wordpressSigner = {
  type: 'wordpress',
  
  getPublicKey: async () => {
    const identity = await this.getIdentity();
    return identity?.user?.pubkey || null;
  },
  
  signEvent: async (event) => {
    return await window.WP_NostrTools.nostr_sign(
      event, 'user',
      { signPayload: { source: 'nostr-calendar-app', kind: event.kind } }
    );
  }
};
```

#### Signer-Registrierung
```javascript
// In initialize() und getSession()
if (pubkey) {
  this.client.signer = this.wordpressSigner;
  this.client.pubkey = pubkey;
  this.client.signerType = 'wordpress';
}

// In logout()
if (this.client.signer?.type === 'wordpress') {
  this.client.signer = null;
  this.client.pubkey = null;
}
```

### 2. blossom.js

#### Vereinfachte createBlossomAuth()
```javascript
// VORHER: WordPress-spezifischer Code-Pfad
if (window.WP_NostrTools) {
  const signed = await window.WP_NostrTools.nostr_sign(...);
} else {
  const signed = await client.signEventWithTimeout(...);
}

// NACHHER: Einheitlich für alle Auth-Methoden
if (!client.signer || !client.pubkey) {
  return null;
}
const signed = await client.signEventWithTimeout(authEvent, timeout);
```

#### Vereinfachte testBlossomAuthSigning()
```javascript
// VORHER: WordPress-Check
if (window.WP_NostrTools) {
  signed = await window.WP_NostrTools.nostr_sign(...);
} else {
  signed = await client.signEventWithTimeout(...);
}

// NACHHER: Einheitlich
const signed = await client.signEventWithTimeout(testEvent, timeout);
```

### 3. nostr.js

#### WordPress-Support in signEventWithTimeout()
```javascript
if (signer?.type === 'wordpress') {
  const pk = this.pubkey || await signer.getPublicKey();
  if (pk && !prepared.pubkey) {
    prepared.pubkey = pk;
  }
}

// WordPress nutzt Standard-Signatur-Logik
// (nicht Bunker-spezifisch)
```

## Vorteile

### ✅ Konsistenz
- Alle Auth-Methoden nutzen `client.signer`
- Einheitliches Interface für alle Signer
- Keine WordPress-spezifischen Checks mehr nötig

### ✅ Wartbarkeit
- Weniger Code-Duplikation
- Einfachere Fehlerbehandlung
- Separation of Concerns

### ✅ Erweiterbarkeit
- Neue Auth-Methoden können einfach hinzugefügt werden
- Jeder Signer muss nur `signEvent()` implementieren
- Plugin-Architektur

## Code-Fluss

### Vorher (WordPress)
```
Blossom Upload
    ↓
createBlossomAuth()
    ↓
if (window.WP_NostrTools) → WordPress-Pfad
    ↓
window.WP_NostrTools.nostr_sign()
    ↓
WordPress Backend
```

### Nachher (WordPress)
```
Blossom Upload
    ↓
createBlossomAuth()
    ↓
client.signEventWithTimeout()
    ↓
client.signer.signEvent() → wordpressSigner
    ↓
window.WP_NostrTools.nostr_sign()
    ↓
WordPress Backend
```

### Vorteil
Gleicher Code-Pfad für alle Auth-Methoden (WordPress, NIP-07, NIP-46)

## Signer-Interface

Alle Signer implementieren:

```javascript
{
  type: 'nip07' | 'nip46' | 'wordpress',
  getPublicKey: () => Promise<string>,
  signEvent: (event) => Promise<SignedEvent>
}
```

## Client-State

```javascript
client = {
  signer: wordpressSigner | nip07Signer | nip46Signer | null,
  pubkey: string | null,
  signerType: 'wordpress' | 'nip07' | 'nip46' | null
}
```

## Testing

```javascript
// Browser Console
console.log('Signer:', client.signer?.type);
// Output: 'wordpress' oder 'nip07' oder 'nip46'

console.log('Pubkey:', client.pubkey?.substring(0, 16) + '...');

// Test Blossom Auth
await window.testBlossomAuth();
// Funktioniert mit allen Signer-Typen
```

## Migration

✅ **Keine Breaking Changes**  
✅ **Bestehender Code funktioniert automatisch**  
✅ **Rückwärtskompatibel**

## Dateien

### Geändert
- `js/auth/WordPressAuthPlugin.js` (+40 Zeilen)
- `js/blossom.js` (-50 Zeilen)
- `js/nostr.js` (+5 Zeilen)

### Neu
- `docs/wordpress-signer-architecture.md`
- `docs/wordpress-signer-summary.md`

## Nächste Schritte

Optional:
1. **Unit Tests** für WordPress-Signer
2. **Integration Tests** für alle Signer-Typen
3. **Type Definitions** für Signer-Interface
4. **Weitere Auth-Plugins** nach gleichem Muster

## Status

✅ **Implementiert**  
✅ **Getestet** (manuell)  
⏳ **Deployment** (pending)

---

**Erstellt:** 2. Oktober 2025  
**Branch:** `uix`  
**Review:** Empfohlen
