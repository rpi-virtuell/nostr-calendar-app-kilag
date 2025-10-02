# NIP-46 Bunker Quick Fix für Uploads - ✅ GELÖST!

## Status: ✅ FUNKTIONIERT!

Uploads über NIP-46 (Bunker) funktionieren jetzt erfolgreich mit den implementierten Fixes!

## Das Problem (gelöst)
Uploads funktionierten mit NIP-07, aber nicht mit NIP-46 Bunker.

## Die Lösung (implementiert)

### 1️⃣ Permission hinzufügen
In Ihrer Bunker-App (z.B. nsec.app):
- Gehe zu App-Permissions für "nostr-calendar-app"
- Füge **kind 24242** hinzu (NIP-98 HTTP Auth)
- Speichern

### 2️⃣ Testen
In Browser-Console (F12):
```javascript
await window.testBlossomAuth()
```

Erwartete Ausgabe:
```
✅ Bunker kann kind 24242 signieren!
```

### 3️⃣ Upload versuchen
- Datei hochladen
- **Wichtig:** Bis zu 60 Sekunden warten
- Im Bunker bestätigen wenn gefragt
- Upload sollte funktionieren! ✅

## Erfolgreiche Konfiguration

### Timeouts (FINAL - WORKING)
- **Blossom Auth Gesamt:** 60 Sekunden
- **signEvent (kind 24242):** 45 Sekunden
- **Retry:** 45-90 Sekunden
- **hasPubkey:** true ✅

### Erwartete Console-Logs (Erfolg)
```
[Blossom] Signing auth event (kind 24242) with timeout: 60000 ms, signer type: nip46
[Blossom] NIP-46 Bunker detected. This may take up to 60 seconds. Please approve...
[signEventWithTimeout] start kind= 24242 timeoutMs= 45000 hasPubkey= true signerType= nip46
[Bunker] signEvent() ok in 8234 ms
[signEventWithTimeout] done kind= 24242
✅ Upload successful: https://files.sovbit.host
```

## Was wurde geändert

### ✅ Fix 1: Drastisch erhöhte Timeouts
```javascript
// VORHER: 5-15 Sekunden (zu kurz!)
// NACHHER: 45-60 Sekunden (ausreichend!)
```

### ✅ Fix 2: Pubkey wird gesetzt
```javascript
// VORHER: hasPubkey= false
// NACHHER: hasPubkey= true
```

### ✅ Fix 3: Protocol-aware Delete
```javascript
// NIP-96: DELETE /api/v2/media/<hash>
// Blossom: DELETE /<hash>
```

## Wichtige Hinweise

⏰ **Geduld erforderlich:** NIP-46 Bunker kann 8-60 Sekunden für Signatur brauchen
✅ **Permission erforderlich:** kind 24242 MUSS im Bunker freigegeben sein
📱 **Bunker-App offen:** Bunker-App muss im Hintergrund laufen

## Performance

| Auth-Methode | Upload-Dauer | Auth-Signatur |
|--------------|--------------|---------------|
| NIP-07 (nos2x) | ~500-1000ms | ~50-100ms |
| NIP-46 (Bunker) | 8-60 Sekunden | 8-25 Sekunden |

**Fazit:** NIP-46 ist langsamer, aber funktioniert zuverlässig! ✅

## Detaillierte Anleitung
Siehe: [docs/nip46-bunker-permissions.md](./nip46-bunker-permissions.md)

## Änderungen in diesem Update

### js/blossom.js
- ✅ Erhöhtes Timeout für NIP-46: 15 Sekunden (statt 5)
- ✅ Bessere Fehlerbehandlung mit spezifischen Hinweisen
- ✅ Debug-Tool: `window.testBlossomAuth()`

### js/nostr.js
- ✅ Erweiterte Fehlerdiagnose für kind 24242/24133
- ✅ Hilfreiche Console-Logs mit Permissions-Hinweisen

### Neue Dateien
- ✅ `docs/nip46-bunker-permissions.md` - Detaillierte Anleitung
- ✅ `docs/nip46-quick-fix.md` - Diese Datei

## Code-Verbesserungen

### createBlossomAuth() - Bessere Fehlerbehandlung
```javascript
// Vorher: Returniert null bei Fehler
return null;

// Nachher: Wirft spezifischen Fehler
throw new Error('NIP-46 Bunker Signatur-Timeout für kind 24242...');
```

### signEventWithTimeout() - Erweiterte Kind-Diagnose
```javascript
// Jetzt mit Hinweisen für kind 24242/24133
else if (k === 24242 || k === 24133) {
  console.warn('Bitte kind 24242 (NIP-98 Auth) in Bunker freigeben...');
}
```

### Debug-Tool
```javascript
// Neu: Bunker-Permissions testen
await window.testBlossomAuth()
// → Gibt detaillierte Info über Signatur-Fähigkeit
```

## Warum NIP-46 komplizierter ist

| Aspekt          | NIP-07 (nos2x)     | NIP-46 (Bunker)           |
|-----------------|-------------------|---------------------------|
| Verbindung      | Lokal (Extension) | Remote (Relay)            |
| Latenz          | ~50ms             | ~500-2000ms               |
| Permissions     | Automatisch       | **Manuell konfigurieren** |
| Event Kinds     | Alle erlaubt      | **Whitelist erforderlich**|
| Timeout         | 5s ausreichend    | 15s+ erforderlich         |

## Häufige Fehler

### "signEvent timeout after 15000ms"
**Ursache:** kind 24242 nicht in Bunker freigegeben
**Lösung:** Permission hinzufügen (siehe oben)

### "Permission denied for kind 24242"
**Ursache:** Explizite Ablehnung in Bunker
**Lösung:** kind 24242 in Whitelist aufnehmen

### Auth funktioniert, aber Upload schlägt fehl
**Ursache:** Upload nutzt separates kind 24242 Event
**Lösung:** Stelle sicher, dass kind 24242 **zusätzlich** zu kind 31923 freigegeben ist

## Empfohlene Bunker-Permissions

Für volle nostr-calendar-app Funktionalität:

```
✅ kind 1     - Basis-Funktionalität
✅ kind 3     - Kontakte
✅ kind 30000 - Subscriptions
✅ kind 31923 - Calendar Events
✅ kind 24242 - Uploads (NIP-98 Auth)
⚪ kind 24133 - File Metadata (optional)
```

## Support & Debugging

### Console Commands
```javascript
// Test Bunker Auth
await window.testBlossomAuth()

// Teste verschiedene Event Kinds
await window.nip46.testSignKinds(1, 31923, 24242)

// Öffne letzte Auth-URL
window.nip46.openLastAuth()
```

### Logs prüfen
Suche in Console (F12) nach:
```
[Blossom] Signing auth event (kind 24242)...
[signEventWithTimeout] start kind= 24242...
```

### Bei Problemen
1. Console öffnen (F12)
2. `await window.testBlossomAuth()` ausführen
3. Output kopieren und Issue erstellen

## Was wurde behoben?

### ❌ Vorher
- Upload scheitert mit generischem Fehler
- Keine Hinweise auf fehlende Permissions
- Timeout nach 5 Sekunden (zu kurz für Bunker)
- Fehler wird abgefangen und returniert null

### ✅ Nachher
- Spezifische Fehlermeldung mit Lösungsvorschlag
- Console-Logs zeigen genau was fehlt
- 15 Sekunden Timeout für Bunker
- Fehler werden propagiert mit Kontext
- Test-Tool verfügbar: `window.testBlossomAuth()`

## Nächste Schritte

1. **Sofort:** kind 24242 in Bunker hinzufügen
2. **Testen:** `await window.testBlossomAuth()`
3. **Hochladen:** Datei auswählen und hochladen
4. **Bei Erfolg:** Optional kind 24133 hinzufügen für File Metadata

**Viel Erfolg! 🚀**
