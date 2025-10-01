# Blossom Integration - Änderungsprotokoll

## Version 2.0 - NIP-98 Authentifizierung

**Datum:** 1. Oktober 2025

### ✅ Implementierte Änderungen

#### 1. Korrekte Blossom-API-Integration

**Vorher:**
- ❌ Verwendete `POST /upload` (falsche Methode)
- ❌ Keine Authentifizierung
- ❌ Fester Single-Server
- ❌ Fehler bei 404/400

**Nachher:**
- ✅ Verwendet `PUT /upload` (Blossom BUD-02)
- ✅ NIP-98 HTTP Authentication
- ✅ Multi-Server mit automatischem Fallback
- ✅ Graceful Error Handling

#### 2. Authentifizierung (NIP-98)

```javascript
// Neue Funktion: createBlossomAuth()
- Erstellt signierte HTTP Auth Events (kind 27235)
- Base64-Encoding für Authorization Header
- Automatische Integration mit NostrAuth
- Fallback auf anonymen Upload (wenn Server unterstützt)
```

**Auth Event Format:**
```javascript
{
  kind: 27235,
  tags: [
    ['u', 'https://blossom.band/upload'],
    ['method', 'PUT']
  ]
}
```

#### 3. Multi-Server-Unterstützung

Die App versucht automatisch mehrere Server:

1. `Config.blossom.endpoint` (konfiguriert)
2. `https://blossom.band` (Standard)
3. `https://blossom.primal.net` (Fallback #1)
4. `https://cdn.satellite.earth` (Fallback #2)

**Vorteile:**
- Höhere Verfügbarkeit
- Automatisches Failover
- Keine Benutzerinteraktion bei Server-Ausfall

#### 4. Verbessertes List-Endpoint

**Vorher:**
```javascript
GET /list  // → 400 Error
```

**Nachher:**
```javascript
GET /list/<pubkey>  // Mit Auth
```

- Erfordert Anmeldung
- Lädt Uploads vom Server
- Merged mit lokalem Cache
- Fallback auf Cache bei Fehler

#### 5. Verbessertes Delete

**Vorher:**
```javascript
DELETE /delete?url=...  // Unsupported
POST /delete {...}      // Unsupported
```

**Nachher:**
```javascript
DELETE /<sha256>  // Mit Auth (BUD-02)
```

- Verwendet SHA256-Hash (nicht URL)
- Mit NIP-98 Auth
- Speichert Server-Info für korrekten Delete-Endpoint

### 🆕 Neue Features

#### 1. Lokales Caching-System

- Speichert alle Uploads in `localStorage`
- Bis zu 500 Uploads
- Funktioniert offline
- Automatische Bereinigung alter Einträge

#### 2. Upload-Metadaten

Jeder Upload speichert:
```javascript
{
  url: "https://...",
  size: 1234567,
  type: "image/jpeg",
  name: "photo.jpg",
  created: 1696179600,
  id: "sha256hash...",
  server: "https://blossom.band",
  meta: {...}
}
```

#### 3. Debug-Tools

```javascript
// Browser-Konsole:
window.blossomDebug.getCachedUploads()
window.blossomDebug.getCacheStats()
window.blossomDebug.clearUploadCache()
window.blossomDebug.uploadToBlossom(file)
window.blossomDebug.listBlossom()
```

#### 4. UI-Verbesserungen

- ✅ "Verwenden" Button für direkte Event-Bild-Auswahl
- ✅ Verbesserte Tooltips
- ✅ Upload-Counter (Erfolg/Fehler)
- ✅ Benachrichtigungen für alle Aktionen
- ✅ Preview-Modal für Bilder/Videos/Audio
- ✅ Server-Info in Dateiliste

### 📝 Aktualisierte Dateien

1. **js/blossom.js**
   - Komplett überarbeitet
   - NIP-98 Auth hinzugefügt
   - Multi-Server-Support
   - Verbessertes Error Handling

2. **index.html**
   - Preview-Modal hinzugefügt

3. **css/base.css**
   - Verbessertes Styling für Dropzone
   - Preview-Styles für Video/Audio
   - Table-Actions-Styling

4. **docs/blossom-upload.md**
   - Vollständige API-Dokumentation
   - NIP-98 Erklärung
   - Fehlerbehebung

5. **docs/blossom-user-guide.md** (NEU)
   - Benutzerhandbuch
   - Schritt-für-Schritt-Anleitungen
   - FAQ

### 🐛 Behobene Fehler

1. ❌ `Blossom upload failed: 404 Not Found /upload`
   - **Ursache:** Falsche Methode (POST statt PUT)
   - **Fix:** Verwendet jetzt `PUT /upload`

2. ❌ `Blossom list failed: 400`
   - **Ursache:** Fehlender Pubkey in URL
   - **Fix:** Verwendet `/list/<pubkey>` mit Auth

3. ❌ Upload ohne Authentifizierung
   - **Ursache:** Keine Auth-Header
   - **Fix:** NIP-98 signierte Events

4. ❌ Delete funktionierte nicht
   - **Ursache:** Falsche Endpoints
   - **Fix:** Verwendet `DELETE /<sha256>`

### 🔄 Breaking Changes

**Keine Breaking Changes für Benutzer.**

Für Entwickler:
- `uploadToBlossom()` erfordert jetzt Anmeldung (für Server mit Auth-Pflicht)
- `listBlossom()` lädt vom Server nur wenn angemeldet
- `deleteFromBlossom()` benötigt `item.id` (SHA256-Hash)

### 📊 Performance-Verbesserungen

- Lokaler Cache reduziert Server-Anfragen
- Parallele Server-Versuche (früher: sequenziell)
- 5s Timeout für alle Netzwerk-Requests
- Optimistisches Update bei Delete

### 🔒 Sicherheitsverbesserungen

- Alle Uploads signiert (NIP-98)
- Nur Besitzer kann eigene Uploads löschen
- GPS-Metadaten werden vom Server abgelehnt
- HTTPS-only Verbindungen

### 🎯 Nächste Schritte

Geplante Verbesserungen:
- [ ] NIP-94 File Metadata Events (automatisches Tracking)
- [ ] Batch-Upload mit Progress-Bar
- [ ] Bildbearbeitung (Crop, Resize)
- [ ] Server-Sync zwischen Geräten
- [ ] Export/Import der Mediathek
- [ ] Thumbnail-Generierung

### 📚 Ressourcen

- [Blossom Specification](https://github.com/hzrd149/blossom)
- [NIP-98 HTTP Auth](https://github.com/nostr-protocol/nips/blob/master/98.md)
- [NIP-94 File Metadata](https://github.com/nostr-protocol/nips/blob/master/94.md)

### 👥 Credits

- Blossom Protocol: hzrd149
- Implementation: nostr-calendar-app Team
- Testing: Community

---

**Status:** ✅ Production Ready
**Version:** 2.0.0
**Kompatibilität:** Alle Blossom BUD-01, BUD-02, BUD-04, BUD-05, BUD-06, BUD-08 kompatiblen Server
