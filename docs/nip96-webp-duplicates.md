# NIP-96 WebP-Duplikate Problem - Gelöst ✅

## Problem

Beim Hochladen von Bildern zu einem NIP-96 Server (z.B. files.sovbit.host) wurden **zwei Dateien** erstellt:

1. **Original-Datei**: `church-828640_1920.jpg` (kann gelöscht werden ✅)
2. **WebP-Konvertierung**: `fdb075fcf63be2c08eda5e2565f827ff100350d79c10e68aa546741aefa8216c.webp` (Löschen gibt 404 ❌)

### Symptome

- Dateiliste zeigt beide Dateien an
- Original-Datei hat normalen Namen: `church-828640_1920.jpg`
- WebP-Datei hat Hash-Namen: `[64-Zeichen-Hash].webp`
- Beim Löschen der WebP-Datei: **404 Not Found**

### Ursache

NIP-96 Server erstellen oft **automatisch optimierte Versionen** der hochgeladenen Dateien:
- Original-Upload wird gespeichert
- Server erstellt zusätzlich WebP-Konvertierung für bessere Performance
- Beide Dateien werden in der `/api/v2/media` Liste zurückgegeben
- WebP-Version hat **anderen Hash** als im Dateinamen

## Lösung

### 1. Upload: Bevorzuge Original-Dateien

```javascript
// Check processing_url for original file (NIP-96 creates multiple versions)
if (json.processing_url) {
  // Extract original file from processing_url (not WebP conversion)
  const origMatch = json.processing_url.match(/(https?:\/\/[^\s]+?\.(jpg|jpeg|png|gif|svg))/);
  if (origMatch && origMatch[1]) {
    originalUrl = origMatch[1];
  }
}

// Prefer original URL over converted versions (WebP, etc.)
if (originalUrl) {
  console.info('Using original file URL instead of processed version:', originalUrl);
  outUrl = originalUrl;
}
```

**Effekt**: Bei Upload wird nur die **Original-Datei** im Cache gespeichert, nicht die WebP-Version.

### 2. List: Filter WebP-Duplikate

```javascript
// Filter out WebP duplicates created by server
const seen = new Set();
serverItems = allFiles.filter((file) => {
  // Skip WebP files that have hash-only filenames (server-generated conversions)
  const fileName = file.name || '';
  const isHashWebP = fileName.match(/^[a-f0-9]{64}\.webp$/i);
  
  if (isHashWebP) {
    console.debug('Filtering out server-generated WebP duplicate:', fileName);
    return false; // Skip this file
  }
  
  // Deduplicate by URL
  if (seen.has(file.url)) {
    return false;
  }
  seen.add(file.url);
  return true;
});
```

**Effekt**: WebP-Dateien mit Hash-Namen werden **nicht angezeigt** in der Liste.

### 3. Delete: Hash aus URL extrahieren

```javascript
// Extract SHA256 hash from item
let sha256 = item.id || item.hash || item.sha256;

// Try to extract hash from URL if not found in metadata
if (!sha256 || sha256.startsWith('http')) {
  // Extract from URL: either filename hash or path hash
  // Pattern: /abc123...xyz.webp or /media/abc123...xyz or /abc123...xyz
  const hashMatch = item.url.match(/\/([a-f0-9]{64})(?:\.\w+)?(?:\?|$)/i);
  if (hashMatch && hashMatch[1]) {
    sha256 = hashMatch[1];
    console.debug('Extracted hash from URL:', sha256);
  }
}
```

**Effekt**: Hash wird auch aus URL extrahiert, falls nicht in Metadaten vorhanden.

## Testen

### Vor dem Fix

```
Dateiliste:
1. church-828640_1920.jpg              577.8 KB  ✅ Löschen funktioniert
2. fdb075f...a8216c.webp              106.8 KB  ❌ 404 Not Found beim Löschen
3. cross.png                          1225.4 KB  ✅ Löschen funktioniert
4. 7d82a...f2a.webp                    75.9 KB  ❌ 404 Not Found beim Löschen
```

### Nach dem Fix

```
Dateiliste:
1. church-828640_1920.jpg              577.8 KB  ✅ Löschen funktioniert
2. cross.png                          1225.4 KB  ✅ Löschen funktioniert

WebP-Duplikate werden automatisch herausgefiltert! ✅
```

## Debug-Ausgaben

### Upload-Response ansehen

```javascript
// Console Debug aktiviert in blossom.js
console.debug('[NIP-96] Upload response:', json);
```

Typische NIP-96 Response:
```json
{
  "nip94_event": {
    "tags": [
      ["url", "https://files.sovbit.host/media/church-828640_1920.jpg"],
      ["x", "abc123...xyz"],
      ["ox", "def456...uvw"],
      ["size", "591872"],
      ["m", "image/jpeg"]
    ]
  },
  "processing_url": "https://files.sovbit.host/media/church-828640_1920.jpg https://files.sovbit.host/media/fdb075f...webp"
}
```

**Wichtig**: `processing_url` enthält **beide URLs** (Original + WebP), getrennt durch Leerzeichen!

### List-Response ansehen

```javascript
// Console zeigt gefilterte Dateien
console.debug('Filtering out server-generated WebP duplicate:', fileName);
```

## NIP-96 Server-Verhalten

### Was Server tun

1. **Upload**: Client sendet `church.jpg`
2. **Server-Verarbeitung**:
   - Speichert Original: `church.jpg` mit Hash `abc123...`
   - Erstellt WebP: `fdb075f...webp` (optimiert, kleinere Dateigröße)
3. **Response**: Beide URLs in `processing_url`
4. **List**: Beide Dateien werden zurückgegeben

### Warum WebP?

- **Performance**: WebP ist oft 25-35% kleiner als JPEG/PNG
- **Browser-Support**: Moderne Browser unterstützen WebP
- **Fallback**: Original bleibt verfügbar für ältere Browser

### Warum 404 beim Löschen?

- WebP-Datei hat **eigenen Hash** (Hash vom WebP-Inhalt)
- Filename zeigt Hash: `fdb075f...webp`
- Aber Server-Metadaten enthalten **Original-Hash** (`abc123...`)
- DELETE mit falschem Hash → 404

## Best Practices

### Für App-Entwickler

1. ✅ **Bevorzuge Original-URLs** beim Upload
2. ✅ **Filter Server-generierte Varianten** in UI
3. ✅ **Extrahiere Hash aus URL** als Fallback
4. ✅ **Log Server-Responses** für Debugging

### Für Server-Betreiber

NIP-96 Server sollten:
- `processing_url` korrekt befüllen (alle Varianten)
- Metadaten für **jede Variante** separat bereitstellen
- DELETE-Endpoint für **beide Hashes** akzeptieren (Original + Variante)

## Migration

### Bestehende Uploads

Falls alte WebP-Duplikate in der Liste erscheinen:

1. **Option 1**: Liste neu laden
   ```javascript
   await listBlossom(); // Lädt mit neuem Filter
   ```

2. **Option 2**: Cache löschen
   ```javascript
   localStorage.removeItem('blossom-uploads');
   await listBlossom(); // Lädt frisch vom Server
   ```

### Verhalten

- Bestehende Cache-Einträge bleiben
- Neue Uploads speichern nur Original-URL
- WebP-Duplikate werden beim nächsten Refresh gefiltert

## Zusammenfassung

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| **Upload** | Beide URLs gecacht | Nur Original gecacht |
| **Liste** | Zeigt Duplikate | Filtert WebP-Hashes |
| **Löschen** | 404 bei WebP | Hash aus URL extrahiert |
| **User Experience** | Verwirrend | Sauber & intuitiv |

---

**Status**: ✅ Gelöst (Version 2.1.0)  
**Datum**: 01.10.2025  
**Betroffene Dateien**: `js/blossom.js` (Upload, List, Delete)
