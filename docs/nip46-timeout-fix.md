# NIP-46 Timeout Fix für kind 24242

## Problem-Analyse aus den Logs

```
[signEventWithTimeout] start kind= 24242 timeoutMs= 10000 hasPubkey= false signerType= nip46
[signEventWithTimeout] nip46 signEvent threw before timeout: signEvent timeout after 10000ms
```

### Zwei Probleme identifiziert:

1. **Timeout zu kurz:** 10 Sekunden statt der geplanten 15 Sekunden
2. **Fehlender pubkey:** `hasPubkey= false` obwohl Bunker den pubkey benötigt

## Root Cause

### Problem 1: Timeout-Begrenzung

**Code in `nostr.js` (Zeile 1019):**
```javascript
// VORHER - limitiert auf max 10 Sekunden
const effectiveTimeout = isNip46 ? Math.max(5000, Math.min(timeoutMs, 10000)) : timeoutMs;
```

Auch wenn `blossom.js` 15 Sekunden übergibt, wird es auf 10 Sekunden begrenzt!

### Problem 2: Pubkey wurde entfernt

**Code in `nostr.js` (Zeile 1004-1006):**
```javascript
// VORHER - entfernt pubkey für NIP-46
if (signer?.type === 'nip46') {
  if ('pubkey' in prepared) try { delete prepared.pubkey; } catch {}
}
```

Dann später versucht der Code, den pubkey wieder hinzuzufügen, aber er ist schon verloren!

## Implementierte Fixes

### Fix 1: Kind-spezifische Timeouts

```javascript
// NACHHER - längere Timeouts für Blossom/File Events
const maxTimeout = (prepared?.kind === 24242 || prepared?.kind === 24133) ? 20000 : 12000;
const effectiveTimeout = isNip46 ? Math.max(5000, Math.min(timeoutMs, maxTimeout)) : timeoutMs;
```

**Neue Timeout-Werte:**
- kind 24242 (Blossom Auth): bis zu **20 Sekunden**
- kind 24133 (File Metadata): bis zu **20 Sekunden**
- Andere Kinds: bis zu **12 Sekunden** (erhöht von 10)

### Fix 2: Pubkey-Management für NIP-46

```javascript
// NACHHER - pubkey merken statt löschen
if (signer?.type === 'nip46') {
  prepared._nip46_pubkey = pkLocal || this.pubkey;
  // NICHT löschen! Wir probieren später mit und ohne
}
```

**Neue Logik:**
1. Pubkey in temporärem Feld `_nip46_pubkey` speichern
2. Beim Signieren: erst MIT pubkey versuchen
3. Bei Fehler: OHNE pubkey versuchen
4. Bei Retry: wieder MIT pubkey, dann OHNE

### Fix 3: Verbesserter Signatur-Flow

```javascript
// 1. Versuch: MIT pubkey
const pubkeyToUse = prepared._nip46_pubkey || this.pubkey || prepared.pubkey;
const { _nip46_pubkey, ...cleanEvent } = prepared;
const ev1 = { ...cleanEvent, pubkey: pubkeyToUse };
res = await attemptSign(effectiveTimeout, ev1);

// 2. Versuch: OHNE pubkey (Fallback)
const { pubkey: _pk, _nip46_pubkey, ...rest } = prepared;
const ev2 = { ...rest };
res = await attemptSign(effectiveTimeout, ev2);
```

## Erwartete Log-Ausgabe (nach Fix)

```
[Blossom] Signing auth event (kind 24242) with timeout: 15000 ms, signer type: nip46
[signEventWithTimeout] start kind= 24242 timeoutMs= 15000 hasPubkey= true signerType= nip46
```

**Änderungen:**
- ✅ `timeoutMs= 15000` (statt 10000)
- ✅ `hasPubkey= true` (statt false)

## Neue Timeout-Hierarchie

| Event Kind | Base Timeout | Max Timeout | Retry Timeout |
|-----------|-------------|-------------|---------------|
| 24242 Auth | 15s | 20s | 20s |
| 24133 File | 15s | 20s | 20s |
| 31923 Event | 8s | 12s | 20s |
| Andere | 8s | 12s | 20s |

## Signatur-Strategie

```
Versuch 1 (MIT pubkey, 15-20s):
├─ Event: { kind: 24242, pubkey: "abc...", ... }
├─ Erfolg? → Fertig ✅
└─ Timeout? → Versuch 2

Versuch 2 (OHNE pubkey, 15-20s):
├─ Event: { kind: 24242, ... } (kein pubkey)
├─ Erfolg? → Fertig ✅
└─ Timeout? → Retry

Retry (MIT pubkey, 20s):
├─ bunker.connect() aufrufen
├─ Event: { kind: 24242, pubkey: "abc...", ... }
├─ Erfolg? → Fertig ✅
└─ Timeout? → Retry ohne pubkey

Final Retry (OHNE pubkey, 20s):
├─ Event: { kind: 24242, ... }
├─ Erfolg? → Fertig ✅
└─ Timeout? → Fehler ❌
```

## Warum diese Änderungen?

### Längere Timeouts für kind 24242

1. **Remote-Signatur dauert länger:** NIP-46 kommuniziert über Relay
2. **User-Interaktion:** Bunker fragt oft nach Bestätigung
3. **Netzwerk-Latenz:** Relay kann langsam sein

### Pubkey-Handling

1. **Bunker-Variabilität:** Manche Bunker brauchen pubkey, andere nicht
2. **Kompatibilität:** Beide Varianten versuchen maximiert Erfolgsrate
3. **Debugging:** Logs zeigen jetzt klar welche Variante verwendet wird

## Testing

### Test 1: Console Check
```javascript
await window.testBlossomAuth()
```

**Erwartete Logs:**
```
[Blossom] Signing auth event (kind 24242) with timeout: 15000 ms, signer type: nip46
[signEventWithTimeout] start kind= 24242 timeoutMs= 15000 hasPubkey= true signerType= nip46
```

### Test 2: Upload
1. Datei hochladen
2. Console beobachten
3. Bei Bunker-Prompt: Bestätigen
4. Logs sollten zeigen: `timeoutMs= 15000` und `hasPubkey= true`

## Code-Änderungen im Detail

### `js/nostr.js` - Zeile 1000-1016

**Vorher:**
```javascript
if (signer?.type === 'nip46') {
  if ('pubkey' in prepared) try { delete prepared.pubkey; } catch {}
}
```

**Nachher:**
```javascript
if (signer?.type === 'nip46') {
  prepared._nip46_pubkey = pkLocal || this.pubkey;
}
```

### `js/nostr.js` - Zeile 1019-1020

**Vorher:**
```javascript
const effectiveTimeout = isNip46 ? Math.max(5000, Math.min(timeoutMs, 10000)) : timeoutMs;
```

**Nachher:**
```javascript
const maxTimeout = (prepared?.kind === 24242 || prepared?.kind === 24133) ? 20000 : 12000;
const effectiveTimeout = isNip46 ? Math.max(5000, Math.min(timeoutMs, maxTimeout)) : timeoutMs;
```

### `js/nostr.js` - Zeile 1033-1040

**Vorher:**
```javascript
const ev1 = isNip46 ? { ...prepared, pubkey: (this.pubkey || prepared.pubkey) } : prepared;
res = await attemptSign(effectiveTimeout, ev1);
```

**Nachher:**
```javascript
if (isNip46) {
  const pubkeyToUse = prepared._nip46_pubkey || this.pubkey || prepared.pubkey;
  const { _nip46_pubkey, ...cleanEvent } = prepared;
  const ev1 = { ...cleanEvent, pubkey: pubkeyToUse };
  res = await attemptSign(effectiveTimeout, ev1);
} else {
  res = await attemptSign(effectiveTimeout, prepared);
}
```

### `js/nostr.js` - Zeile 1102-1104

**Vorher:**
```javascript
const ev3a = { ...prepared, pubkey: (this.pubkey || prepared.pubkey) };
```

**Nachher:**
```javascript
const pubkeyToUse = prepared._nip46_pubkey || this.pubkey || prepared.pubkey;
const { _nip46_pubkey: _npk, ...cleanPrepared } = prepared;
const ev3a = { ...cleanPrepared, pubkey: pubkeyToUse };
```

## Zusammenfassung

### ✅ Was wurde behoben:

1. **Timeout erhöht:** 10s → 15-20s für kind 24242/24133
2. **Pubkey verfügbar:** Event enthält jetzt pubkey beim ersten Versuch
3. **Bessere Retry-Logik:** Systematisches Probieren mit/ohne pubkey
4. **Kind-spezifische Timeouts:** Blossom Auth bekommt mehr Zeit

### 📊 Erwartete Verbesserung:

- **Erfolgsrate steigt:** Mehr Zeit für Bunker-Interaktion
- **Weniger Timeouts:** 50-100% längere Wartezeit
- **Bessere Kompatibilität:** Pubkey-Varianten werden probiert

### 🎯 Nächster Schritt:

**Upload erneut versuchen und Logs prüfen:**
```
[signEventWithTimeout] start kind= 24242 timeoutMs= 15000 hasPubkey= true
```

**Bei Erfolg sollten Sie sehen:**
```
[signEventWithTimeout] done kind= 24242
✅ Upload successful: https://files.sovbit.host
```

---

**Mit diesen Änderungen sollten NIP-46 Uploads deutlich zuverlässiger funktionieren! 🚀**
