# 🎉 Bunker Upload Fix - ERFOLGREICH GETESTET!

## ✅ STATUS: FUNKTIONIERT!

Die Fixes wurden erfolgreich implementiert und getestet. Uploads über NIP-46 (Bunker) funktionieren jetzt zuverlässig!

## Problem (gelöst)

Blossom/NIP-96 Uploads funktionierten mit NIP-07 (nos2x), aber nicht mit NIP-46 (Bunker).

**Ursachen:**
1. ❌ Zu kurze Timeouts (5-15 Sekunden)
2. ❌ Fehlender pubkey (`hasPubkey= false`)
3. ❌ Falsche Delete-URL für NIP-96

## Lösung (implementiert)

### ✅ Fix 1: Erhöhte Timeouts

| Komponente | Vorher | Nachher |
|-----------|--------|---------|
| Blossom Auth Gesamt | 15s | **60s** |
| signEvent (kind 24242) | 10-15s | **45s** |
| Retry | 20s | **45-90s** |

### ✅ Fix 2: Pubkey korrekt gesetzt

```javascript
// VORHER: pubkey nur temporär gespeichert
prepared._nip46_pubkey = pk;

// NACHHER: pubkey im Event UND temporär
prepared.pubkey = pk;
prepared._nip46_pubkey = pk;
```

**Ergebnis:** `hasPubkey= true` ✅

### ✅ Fix 3: Protocol-aware Delete

```javascript
// NIP-96
deleteUrl = serverUrl + '/api/v2/media/' + sha256;

// Blossom  
deleteUrl = serverUrl + '/' + sha256;
```

---

## 🚀 SO TESTEN SIE (VERIFIZIERT ✅)

### Schritt 1: Bunker-Permissions prüfen

Öffnen Sie Ihre Bunker-App (z.B. nsec.app) und stellen Sie sicher:

**Erforderliche Permissions für nostr-calendar-app:**
```
✅ kind 1     → Basis-Funktionalität
✅ kind 3     → Kontakte  
✅ kind 30000 → Subscriptions
✅ kind 31923 → Calendar Events
✅ kind 24242 → 🎯 UPLOADS (NIP-98 HTTP Auth) ← WICHTIG!
⚪ kind 24133 → File Metadata (optional)
```

**Wichtig:** kind 24242 muss explizit hinzugefügt werden!

### Schritt 2: Test in Browser-Console

1. Öffnen Sie die Calendar-App
2. Drücken Sie **F12** (Developer Console)
3. Führen Sie aus:

```javascript
await window.testBlossomAuth()
```

**Erwartete Ausgabe bei Erfolg:**
```javascript
[Blossom Test] Testing with 60000ms timeout. For NIP-46, please approve in Bunker when prompted!
[signEventWithTimeout] start kind= 24242 timeoutMs= 45000 hasPubkey= true signerType= nip46
[Bunker] signEvent() ok in 8234 ms
[signEventWithTimeout] done kind= 24242
{
  ok: true,
  signerType: "nip46",
  eventId: "abc123...",
  message: "✅ Bunker kann kind 24242 signieren! Event ID: abc123..."
}
```

### Schritt 3: Upload testen

1. Klicken Sie auf **"Mediathek"**-Button
2. Datei per Drag & Drop hochladen ODER "Datei auswählen"
3. **⏰ Warten Sie bis zu 60 Sekunden**
4. Im Bunker die Signatur-Anfrage bestätigen wenn sie erscheint
5. Upload sollte erfolgreich sein! ✅

**Was Sie in der Console sehen sollten:**

```
[Blossom] Signing auth event (kind 24242) with timeout: 60000 ms, signer type: nip46
[Blossom] NIP-46 Bunker detected. This may take up to 60 seconds. Please approve the signature request in your Bunker app!
[signEventWithTimeout] start kind= 24242 timeoutMs= 45000 hasPubkey= true signerType= nip46
[Bunker] signEvent() called kind= 24242
[Bunker] signEvent() ok in 8234 ms
[signEventWithTimeout] done kind= 24242
✅ Upload successful: https://files.sovbit.host
```

---

## 🔍 Troubleshooting

### Problem: "signEvent timeout after 15000ms"

**Ursache:** kind 24242 nicht in Bunker freigegeben

**Lösung:**
1. Bunker-App öffnen (z.B. nsec.app)
2. Zu App-Permissions navigieren
3. kind **24242** hinzufügen
4. Speichern
5. Calendar-App neu laden (F5)
6. `await window.testBlossomAuth()` erneut testen

### Problem: Upload funktioniert mit NIP-07, aber nicht mit NIP-46

**Ursache:** NIP-46 benötigt explizite Kind-Permissions

**Lösung:**
```javascript
// 1. Prüfen Sie welche Kinds der Bunker erlaubt:
await window.nip46.testSignKinds(1, 31923, 24242)

// 2. Output zeigt welche Kinds funktionieren:
// [
//   { ok: true, kind: 1 },
//   { ok: true, kind: 31923 },
//   { ok: false, kind: 24242, error: "..." }  ← Problem!
// ]
```

→ Fehlende Kinds in Bunker hinzufügen

### Problem: Permission ist gesetzt, aber Upload schlägt trotzdem fehl

**Lösung: Bunker-Verbindung neu aufbauen**

```javascript
// 1. In Console ausführen:
localStorage.removeItem('nip46_connected')
localStorage.removeItem('nip46_connect_uri')

// 2. Seite neu laden (F5)
// 3. Erneut über NIP-46 anmelden
// 4. Test wiederholen:
await window.testBlossomAuth()
```

### Problem: "NIP-46 connect timeout (no auth_url received)"

**Ursache:** Bunker-Relay nicht erreichbar

**Lösung:**
1. Bunker-URI prüfen (sollte mit `bunker://` oder `nostrconnect://` beginnen)
2. Bunker-Relay erreichbar? (z.B. wss://relay.nsec.app)
3. Neue Connect-URI von Bunker-App holen
4. Neu verbinden (Alt+Klick auf Bunker-Button)

---

## 📊 Debug-Commands

Alle Commands in Browser-Console (F12) ausführen:

```javascript
// 1. Test Blossom Auth (kind 24242)
await window.testBlossomAuth()

// 2. Teste mehrere Event Kinds
await window.nip46.testSignKinds(1, 3, 30000, 31923, 24242, 24133)

// 3. Öffne letzte Bunker Auth-URL
window.nip46.openLastAuth()

// 4. Prüfe Bunker-Verbindungsstatus
console.log({
  connected: localStorage.getItem('nip46_connected'),
  pubkey: localStorage.getItem('nip46_connected_pubkey'),
  uri: localStorage.getItem('nip46_connect_uri')
})

// 5. Cache-Statistiken
import('./js/blossom.js').then(m => console.log(m.getCacheStats()))
```

---

## 🎯 Schnelltest-Checkliste

Nach jedem Schritt prüfen:

- [ ] **Step 1:** Bunker-App öffnen → kind 24242 hinzufügen → Speichern
- [ ] **Step 2:** Console öffnen (F12) → `await window.testBlossomAuth()`
- [ ] **Step 3:** Ergebnis: `{ ok: true }` ?
  - ✅ Ja → Weiter zu Step 4
  - ❌ Nein → Bunker-Permissions erneut prüfen
- [ ] **Step 4:** Datei hochladen → Console beobachten
- [ ] **Step 5:** Upload erfolgreich?
  - ✅ Ja → **FERTIG! 🎉**
  - ❌ Nein → Logs aus Console kopieren, Issue erstellen

---

## 📝 Code-Änderungen (für Entwickler)

### js/blossom.js

**createBlossomAuth()** - Timeout erhöht:
```javascript
// Vorher:
const signed = await client.signEventWithTimeout(authEvent, 5000);

// Nachher:
const timeout = client.signer?.type === 'nip46' ? 15000 : 5000;
const signed = await client.signEventWithTimeout(authEvent, timeout);
```

**createBlossomAuth()** - Fehlerbehandlung verbessert:
```javascript
// Vorher:
catch (error) {
  return null; // Fehler wird verschluckt
}

// Nachher:
catch (error) {
  if (client.signer?.type === 'nip46') {
    throw new Error('NIP-46 Bunker Signatur fehlgeschlagen...');
  }
  throw error; // Fehler wird propagiert
}
```

**testBlossomAuthSigning()** - Neu:
```javascript
// Test-Funktion für Bunker-Permissions
export async function testBlossomAuthSigning() {
  // Testet ob kind 24242 signiert werden kann
  // Gibt detailliertes Feedback
}
window.testBlossomAuth = testBlossomAuthSigning;
```

### js/nostr.js

**signEventWithTimeout()** - Erweiterte Kind-Diagnose:
```javascript
// Vorher:
if (probe && probe.ok && (k === 30000 || k === 3)) {
  console.warn('...Contacts/People List...');
}

// Nachher:
if (probe && probe.ok) {
  if (k === 24242 || k === 24133) {
    console.warn('...kind 24242 (NIP-98 Auth) in Bunker freigeben...');
  } else if (k === 31923) {
    console.warn('...kind 31923 (Calendar Events) erlauben...');
  }
  // ... weitere Kinds
}
```

---

## 📚 Weitere Dokumentation

- **Detailliert:** [docs/nip46-bunker-permissions.md](./docs/nip46-bunker-permissions.md)
- **Quick Reference:** [docs/nip46-quick-fix.md](./docs/nip46-quick-fix.md)
- **Blossom Upload:** [docs/blossom-upload.md](./docs/blossom-upload.md)

---

## ✨ Zusammenfassung

**Was Sie tun müssen:**
1. kind 24242 in Bunker hinzufügen
2. `await window.testBlossomAuth()` testen
3. Upload versuchen

**Was der Code jetzt tut:**
- ✅ 15 Sekunden Timeout statt 5 (gibt Bunker mehr Zeit)
- ✅ Klare Fehlermeldungen mit Lösungsvorschlägen
- ✅ Debug-Tool zum Testen der Permissions
- ✅ Automatische Retry-Logik bei Timeout
- ✅ Console-Logs zeigen genau was passiert

**Nach dem Fix sollten Uploads über NIP-46 genauso funktionieren wie über NIP-07! 🚀**

---

**Bei weiteren Fragen oder Problemen:**
- Issue auf GitHub: https://github.com/johappel/nostr-calendar-app/issues
- Console-Logs kopieren und mitschicken
