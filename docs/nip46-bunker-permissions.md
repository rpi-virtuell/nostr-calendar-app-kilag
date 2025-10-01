# NIP-46 Bunker Permissions für Blossom/NIP-96 Uploads

## Problem

Wenn Sie sich über NIP-46 (Bunker) authentifizieren, funktioniert alles außer Blossom/NIP-96 Datei-Uploads. Der Upload schlägt mit einem Timeout- oder Permission-Fehler fehl.

## Ursache

Blossom und NIP-96 verwenden **kind 24242** (NIP-98 HTTP Authentication) für die Autorisierung von Upload-Requests. Dieser Event-Kind muss explizit in Ihrer Bunker-App freigegeben werden.

## Lösung

### 1. Erforderliche Permissions

Fügen Sie folgende Event-Kinds in Ihrer Bunker-App hinzu:

- **kind 24242** (NIP-98 HTTP Auth) - **Erforderlich** für alle Blossom/NIP-96 Operationen
- **kind 24133** (NIP-94 File Metadata) - Optional, für File Metadata Events

### 2. Bunker-spezifische Anleitungen

#### nsec.app (nsecBunker)

1. Öffnen Sie https://nsec.app
2. Navigieren Sie zu Ihrer App-Verbindung (nostr-calendar-app)
3. Klicken Sie auf "Edit Permissions" oder "Manage Permissions"
4. Fügen Sie folgende Kinds hinzu:
   - `24242` - NIP-98 HTTP Authentication
   - `24133` - NIP-94 File Metadata (optional)
5. Speichern Sie die Änderungen
6. Reload der Calendar-App und erneut versuchen

#### Andere Bunker-Apps

Die meisten Bunker-Apps haben eine ähnliche Permissions-Verwaltung:

1. Finden Sie die App-Permissions oder App-Settings
2. Suchen Sie nach "Event Kinds" oder "Allowed Kinds"
3. Fügen Sie `24242` hinzu
4. Optional: auch `24133`
5. Speichern und App neu laden

### 3. Permissions testen

Sie können die Bunker-Permissions direkt in der Browser-Konsole testen:

```javascript
// Test ob kind 24242 signiert werden kann
await window.testBlossomAuth()
```

**Erwartete Ausgabe bei Erfolg:**
```javascript
{
  ok: true,
  signerType: "nip46",
  eventId: "abc123...",
  message: "✅ Bunker kann kind 24242 signieren! Event ID: abc123..."
}
```

**Bei Fehler:**
```javascript
{
  ok: false,
  signerType: "nip46",
  error: "signEvent timeout after 15000ms",
  message: "❌ kind 24242 Signatur fehlgeschlagen: ..."
}
```

### 4. Debugging

#### Console Logs überprüfen

Öffnen Sie die Browser-Konsole (F12) und suchen Sie nach:

```
[Blossom] Signing auth event (kind 24242) with timeout: 60000 ms, signer type: nip46
[Blossom] NIP-46 Bunker detected. This may take up to 60 seconds. Please approve the signature request in your Bunker app!
[signEventWithTimeout] start kind= 24242 timeoutMs= 45000 hasPubkey= true signerType= nip46
```

#### Häufige Fehler

**Timeout nach 45-60 Sekunden:**
```
signEvent timeout after 45000ms
```
→ **Lösung:** kind 24242 ist nicht freigegeben oder Bunker-Verbindung unterbrochen
→ **Hinweis:** Falls der Timeout auch nach 60 Sekunden auftritt, ist die Permission definitiv nicht gesetzt!

**"Permission denied":**
```
Permission denied for kind 24242
```
→ **Lösung:** Explizit kind 24242 in Bunker-Permissions hinzufügen

**"no auth_url received":**
```
NIP-46 connect timeout (no auth_url received)
```
→ **Lösung:** Bunker-Verbindung neu aufbauen (Re-Connect)

### 5. Bunker neu verbinden

Falls die Permissions nicht wirksam werden:

1. **Logout** aus der Calendar-App (oben rechts)
2. **Bunker-Verbindung löschen:**
   ```javascript
   localStorage.removeItem('nip46_connected')
   localStorage.removeItem('nip46_connect_uri')
   ```
3. Seite neu laden (F5)
4. **Neu anmelden** über NIP-46
5. Permissions in Bunker prüfen
6. Upload erneut versuchen

### 6. Weitere Event-Kinds für nostr-calendar-app

Für volle Funktionalität sollten folgende Kinds freigegeben sein:

| Kind  | Beschreibung                | Erforderlich für           |
|-------|----------------------------|----------------------------|
| 1     | Short Text Note            | Basis-Funktionalität       |
| 3     | Contact List               | Kontakte (NIP-02)         |
| 30000 | People List                | Subscriptions (NIP-51)    |
| 31923 | Calendar Event             | Events erstellen/bearbeiten|
| 24242 | HTTP Authentication        | **Blossom/NIP-96 Uploads**|
| 24133 | File Metadata              | File Metadata (optional)   |

### 7. Technische Details

#### NIP-98 Auth Event Struktur

```javascript
{
  kind: 24242,
  created_at: 1704067200,
  tags: [
    ['u', 'https://files.sovbit.host/upload'],      // URL
    ['method', 'PUT'],                              // HTTP Method
    ['t', 'upload'],                                // Action type
    ['expiration', '1704067260']                    // 60 Sekunden gültig
  ],
  content: ''
}
```

#### Timeout-Werte

- **NIP-07 (nos2x):** 8 Sekunden
- **NIP-46 (Bunker):** 45-60 Sekunden (erhöht für Remote-Signierung)
  - Blossom Auth (kind 24242): **60 Sekunden** Gesamt-Timeout
  - signEvent first attempt: **45 Sekunden**
  - signEvent retry: **45-90 Sekunden** (dynamisch)

#### Retry-Logik

Die App versucht automatisch mehrmals zu signieren:

1. **Versuch 1:** Mit pubkey (45s timeout für kind 24242)
2. **Versuch 2:** Ohne pubkey (falls Bunker pubkey automatisch setzt, 45s timeout)
3. **Retry:** Bei Timeout mit erhöhtem Timeout (45-90s, mindestens 45s)
4. **Final Retry:** Ohne pubkey (45-90s)

Zwischen den Versuchen wird `bunker.connect()` aufgerufen, um die Verbindung aufzufrischen.

**Wichtig:** Bei NIP-46 kann die erste Signatur nach dem Connect bis zu 60 Sekunden dauern. Bitte warten Sie und bestätigen Sie die Anfrage im Bunker wenn diese erscheint!

## Support

Bei weiteren Problemen:

1. Browser-Konsole (F12) öffnen
2. Upload-Versuch starten
3. Alle Logs kopieren (besonders `[Blossom]` und `[signEventWithTimeout]`)
4. Issue auf GitHub erstellen: https://github.com/johappel/nostr-calendar-app/issues

## Zusammenfassung

✅ **kind 24242** in Bunker-Permissions hinzufügen
✅ `window.testBlossomAuth()` in Console ausführen
✅ Bei Problemen: Logout → Bunker-Verbindung löschen → Neu anmelden
✅ Browser-Console Logs prüfen

**Mit diesen Einstellungen sollten Blossom/NIP-96 Uploads über NIP-46 einwandfrei funktionieren! 🚀**
