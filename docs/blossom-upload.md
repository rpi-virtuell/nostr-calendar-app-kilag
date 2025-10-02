# Blossom Upload & Media-Verwaltung

## Übersicht

Die Blossom-Integration ermöglicht das Hochladen, Verwalten und Löschen von Medien-Dateien (Bilder, Videos, Audio) für Nostr NIP-52 Calendar Events. Die Integration nutzt **NIP-98 HTTP Authentication** für sichere, signierte Uploads.

## Blossom-Spezifikation

Blossom ist ein dezentrales Media-Hosting-Protokoll für Nostr:

- **Authentifizierung**: Signierte Nostr Events (NIP-98)
- **Upload**: `PUT /upload` (Auth erforderlich)
- **Liste**: `GET /list/<pubkey>` (Auth erforderlich)
- **Löschen**: `DELETE /<sha256>` (Auth erforderlich)
- **Abrufen**: `GET /<sha256>` (Optional Auth)

### Unterstützte Server

Die App versucht mehrere Server automatisch:
1. Konfigurierter Server (siehe `config.js`)
2. `https://blossom.band` (Standard)
3. `https://blossom.primal.net` (Fallback)
4. `https://cdn.satellite.earth` (Fallback)

## Features

### 1. Upload-Funktionalität
- **Authentifizierung**: Automatische NIP-98 signierte Events
- **Multi-Server**: Automatischer Fallback auf alternative Server
- **Drag & Drop**: Dateien direkt in die Dropzone ziehen
- **Klick-Upload**: Klick auf Dropzone öffnet Datei-Dialog
- **Multi-Upload**: Mehrere Dateien gleichzeitig hochladen
- **Unterstützte Dateitypen**: Bilder, Videos, Audio
- **Anonymer Upload**: Fallback ohne Login (Server-abhängig)

### 2. Lokales Caching
- Alle Uploads werden lokal im Browser gespeichert (localStorage)
- Bis zu 500 Uploads werden gecacht
- Fallback bei Server-Problemen auf gecachte Daten

### 3. Mediathek-Verwaltung
- **Ansicht**: Liste aller hochgeladenen Dateien
- **Filter**: Nach Typ (Bild/Video/Audio), Größe
- **Pagination**: Seitenweise Anzeige (10/25/50 Dateien)
- **Sortierung**: Neueste Uploads zuerst

### 4. Aktionen
- **Preview**: Vorschau der Datei anzeigen
- **Copy URL**: URL in Zwischenablage kopieren
- **Verwenden**: Bild direkt als Event-Bild setzen
- **Delete**: Datei löschen (lokal und vom Server)

## Verwendung

### Upload über UI
1. "Media" Button in der Toolbar klicken
2. Dateien per Drag & Drop oder Klick hochladen
3. Upload-Status wird als Benachrichtigung angezeigt

### Bild für Event verwenden
1. Blossom-Modal öffnen
2. Gewünschtes Bild finden
3. "Verwenden" Button klicken
4. Bild wird automatisch im Event-Formular eingetragen

### Programmatische Verwendung

```javascript
// Upload einer Datei
import { uploadToBlossom } from './js/blossom.js';

const file = /* File object */;
const result = await uploadToBlossom(file);
console.log('Upload URL:', result.url);

// Liste aller Uploads
import { listBlossom } from './js/blossom.js';

const items = await listBlossom();
console.log('Uploads:', items);

// Datei löschen
import { deleteFromBlossom } from './js/blossom.js';

await deleteFromBlossom({ url: 'https://...', id: '...' });
```

### Debug-Tools

In der Browser-Konsole:

```javascript
// Cache-Statistiken anzeigen
window.blossomDebug.getCacheStats();
// Output: { count: 5, totalSizeMB: "2.45", ... }

// Gecachte Uploads anzeigen
window.blossomDebug.getCachedUploads();

// Cache leeren
window.blossomDebug.clearUploadCache();

// Direkter Upload
const file = /* File object */;
window.blossomDebug.uploadToBlossom(file);

// Liste abrufen
window.blossomDebug.listBlossom();
```

## Konfiguration

In `js/config.js`:

```javascript
export const Config = {
  // Blossom Endpunkt (Standard)
  blossom: { 
    endpoint: 'https://blossom.band' 
  }
};
```

### Alternative Endpoints
- `https://blossom.band` (Standard, kostenlos, 50 MiB Limit)
- `https://blossom.primal.net` (Fallback)
- `https://cdn.satellite.earth` (Fallback)
- Eigener Blossom-Server

### Voraussetzungen

**Für Upload/Delete:**
- Angemeldet mit Nostr (NIP-07, NIP-46 oder lokalem Key)
- Server muss signierte Events akzeptieren (NIP-98)

**Für Ansicht:**
- Kein Login erforderlich (nutzt lokalen Cache)

## Authentifizierung (NIP-98)

Die App erstellt automatisch signierte HTTP Auth Events:

```javascript
{
  kind: 27235,  // NIP-98 HTTP Auth
  created_at: <timestamp>,
  tags: [
    ['u', 'https://blossom.band/upload'],
    ['method', 'PUT']
  ],
  content: ''
}
```

Das Event wird signiert und als Base64 im `Authorization` Header gesendet:
```
Authorization: Nostr <base64(signed_event)>
```

## API-Referenz

### `uploadToBlossom(file)`
Lädt eine Datei hoch und speichert sie im Cache.

**Parameter:**
- `file` (File): Das hochzuladende File-Objekt

**Rückgabe:** `Promise<{url: string, meta: object}>`

**Fehler:**
- Server nicht erreichbar
- Upload fehlgeschlagen
- Keine URL in Antwort

---

### `listBlossom()`
Ruft Liste aller hochgeladenen Dateien ab.

**Rückgabe:** `Promise<Array<{url, size, created, name, id, type}>>`

**Verhalten:**
1. Versucht Liste vom Server zu holen (5s Timeout)
2. Bei Fehler: Fallback auf lokalen Cache
3. Merged Server-Daten mit Cache

---

### `deleteFromBlossom(item)`
Löscht eine Datei vom Server und aus dem Cache.

**Parameter:**
- `item` (object): `{ url, id }`

**Rückgabe:** `Promise<boolean>`

**Verhalten:**
- Optimistisches Update (Cache sofort gelöscht)
- Versucht Server-Löschung (DELETE + POST Fallback)
- Gibt `true` zurück, auch wenn Server-Löschung fehlschlägt

---

### `getCacheStats()`
Gibt Statistiken über den Upload-Cache zurück.

**Rückgabe:** `object`
```javascript
{
  count: 42,              // Anzahl gecachter Uploads
  totalSize: 12345678,    // Gesamtgröße in Bytes
  totalSizeKB: "12056.33",
  totalSizeMB: "11.77",
  oldestDate: Date,
  newestDate: Date
}
```

---

### `clearUploadCache()`
Löscht den kompletten Upload-Cache.

**Rückgabe:** `boolean` (Erfolg)

## Fehlerbehebung

### Problem: "Alle Upload-Server fehlgeschlagen"
**Ursachen:**
1. Nicht angemeldet (Login erforderlich für authentifizierten Upload)
2. Server nicht erreichbar
3. CORS-Fehler

**Lösungen:**
1. Mit Nostr anmelden (Browser Extension, nsec oder Bunker)
2. Alternative Server in `config.js` konfigurieren
3. Server-CORS-Konfiguration prüfen

### Problem: "Upload failed: 404 Not Found"
**Ursache:** Falscher Endpoint oder Methode

**Lösung:** 
- Blossom nutzt `PUT /upload` (nicht `POST /upload`)
- Überprüfen Sie die Blossom-Server-URL
- Die App versucht automatisch mehrere Server

### Problem: "Upload failed: 401 Unauthorized"
**Ursache:** Authentifizierung fehlgeschlagen

**Lösungen:**
1. Neu anmelden
2. Prüfen ob Browser Extension aktiv ist
3. NIP-46 Bunker-Verbindung überprüfen

### Problem: Liste zeigt nur gecachte Uploads
**Ursache:** Server-Liste benötigt Authentifizierung

**Lösung:**
- Mit Nostr anmelden
- Die App zeigt dann Uploads vom Server + Cache

### Problem: GPS-Metadaten-Fehler
**Ursache:** Blossom lehnt Bilder mit GPS-Daten ab (Privatsphäre)

**Lösung:**
- GPS-Metadaten vor Upload entfernen
- Bild-Tool verwenden (z.B. ExifTool, Online-Tools)

### Problem: Cache-Speicher voll
**Lösung:**
```javascript
// Cache manuell leeren
window.blossomDebug.clearUploadCache();
```

### Problem: Uploads verschwinden
**Ursache:** localStorage wurde geleert (Browser-Einstellungen, Inkognito-Modus)

**Lösung:**
- Uploads erneut durchführen
- Alternative: Server-Liste verwenden (wenn verfügbar)

## Best Practices

1. **Dateigrößen optimieren**: Bilder vor Upload komprimieren
2. **Cache-Management**: Regelmäßig alte Uploads überprüfen
3. **Backup**: Wichtige URLs extern speichern
4. **Server-Wahl**: Zuverlässigen Blossom-Server nutzen

## Zukünftige Erweiterungen

- [ ] NIP-94 File Metadata Events (automatisches Tracking)
- [ ] Batch-Upload mit Progress
- [ ] Bildbearbeitung (Crop, Resize)
- [ ] Server-Sync (mehrere Geräte)
- [ ] Export/Import der Mediathek
