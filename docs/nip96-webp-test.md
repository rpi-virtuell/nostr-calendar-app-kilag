# Test-Anleitung: NIP-96 WebP-Duplikate Fix

## Quick Test

### 1. Upload-Test

```javascript
// Console öffnen (F12)
// Upload ein JPEG/PNG Bild über die UI

// Nach Upload im Console-Log prüfen:
// ✅ Sollte sehen: "[NIP-96] Upload response:" mit processing_url
// ✅ Sollte sehen: "Using original file URL instead of processed version"
```

### 2. List-Test

```javascript
// Mediathek öffnen
// Liste aktualisieren

// Erwartetes Verhalten:
// ✅ Nur Original-Dateien sichtbar (z.B. "church-828640_1920.jpg")
// ❌ KEINE Hash-WebP-Dateien (z.B. "fdb075f...webp")

// Console prüfen:
// ✅ Sollte sehen: "Filtering out server-generated WebP duplicate: [hash].webp"
```

### 3. Delete-Test

```javascript
// Original-Datei auswählen
// "Delete" klicken

// Erwartetes Verhalten:
// ✅ Datei wird gelöscht (kein 404-Fehler)
// ✅ Verschwindet aus Liste
// ✅ Console: "File deleted from server"
```

## Detaillierter Test

### Vorbereitung

1. **Login**: Mit NIP-07 oder NIP-46 einloggen
2. **Server**: files.sovbit.host (NIP-96)
3. **Test-Dateien**: 2-3 Bilder (JPEG/PNG)

### Test-Schritte

#### Schritt 1: Upload mehrerer Dateien

```
1. "Datei hochladen" klicken
2. Bild auswählen (z.B. church-828640_1920.jpg)
3. Upload bestätigen
4. Console-Log beobachten:

Erwartete Ausgabe:
-------------------
[Blossom] Trying NIP-96 upload to: https://files.sovbit.host
[NIP-96] Upload response: {nip94_event: {...}, processing_url: "..."}
Using original file URL instead of processed version: https://files.sovbit.host/media/church-828640_1920.jpg
✅ Upload successful: https://files.sovbit.host
```

#### Schritt 2: Liste prüfen

```
1. Mediathek öffnen
2. Liste anzeigen lassen
3. Prüfen ob WebP-Duplikate fehlen

Erwartetes Verhalten:
---------------------
Dateiliste zeigt NUR:
- church-828640_1920.jpg
- cross.png
- (weitere Original-Dateien)

NICHT sichtbar:
- fdb075fcf63be2c08eda5e2565f827ff100350d79c10e68aa546741aefa8216c.webp
- 7d82a42b463923ac014c4865f9bf4061d0821f4c0609d7253a9868a4b79df2a.webp

Console-Log:
------------
Filtering out server-generated WebP duplicate: fdb075f...webp
Filtering out server-generated WebP duplicate: 7d82a...webp
📋 Loaded X files from server (nip96)
```

#### Schritt 3: Delete-Test

```
1. Original-Datei auswählen (z.B. church-828640_1920.jpg)
2. "Delete" Button klicken
3. Bestätigung mit "OK"
4. Console-Log beobachten

Erwartete Ausgabe:
-------------------
Deleting file (nip96): https://files.sovbit.host/api/v2/media/abc123...xyz
✅ File deleted from server

Fehlerfall (falls Hash fehlt):
------------------------------
Extracted hash from URL: abc123...xyz
Deleting file (nip96): https://files.sovbit.host/api/v2/media/abc123...xyz
✅ File deleted from server
```

### Test-Matrix

| Test | Input | Erwartetes Ergebnis | Status |
|------|-------|---------------------|--------|
| Upload JPEG | church.jpg | Nur Original-URL im Cache | ⏳ |
| Upload PNG | cross.png | Nur Original-URL im Cache | ⏳ |
| List Refresh | - | Keine WebP-Hashes sichtbar | ⏳ |
| Delete Original | church.jpg | Erfolgreich gelöscht | ⏳ |
| Delete PNG | cross.png | Erfolgreich gelöscht | ⏳ |

### Fehlerszenarien

#### Szenario 1: WebP-Duplikat erscheint trotzdem

**Ursache**: Alter Cache-Eintrag  
**Lösung**:
```javascript
localStorage.removeItem('blossom-uploads');
location.reload();
```

#### Szenario 2: 404 beim Löschen

**Ursache**: Hash konnte nicht extrahiert werden  
**Debug**:
```javascript
// Console-Log prüfen:
console.debug('Item to delete:', item);
console.debug('Extracted hash:', sha256);
```

**Lösung**: Hash manuell setzen oder Cache-Eintrag löschen

#### Szenario 3: Original-URL fehlt

**Ursache**: Server gibt kein `processing_url` zurück  
**Debug**:
```javascript
console.debug('[NIP-96] Upload response:', json);
// Prüfen ob processing_url vorhanden
```

**Fallback**: Code verwendet dann `nip94_event.tags['url']`

## Automatisierter Test (Optional)

### Test-Script

```javascript
// Test-Funktion in Console kopieren
async function testWebPDuplicates() {
  console.log('🧪 Testing NIP-96 WebP Duplicates Fix...\n');
  
  // 1. List Files
  console.log('📋 Loading file list...');
  const items = await window.listBlossom();
  console.log(`Found ${items.length} files\n`);
  
  // 2. Check for WebP duplicates
  const webpHashes = items.filter(item => {
    const name = item.name || '';
    return name.match(/^[a-f0-9]{64}\.webp$/i);
  });
  
  if (webpHashes.length === 0) {
    console.log('✅ No WebP hash duplicates found!');
  } else {
    console.error('❌ Found WebP duplicates:', webpHashes);
  }
  
  // 3. Check URLs
  items.forEach(item => {
    const hasOriginalName = !item.name.match(/^[a-f0-9]{64}\./i);
    console.log(hasOriginalName ? '✅' : '❌', item.name, '-', item.url);
  });
  
  console.log('\n🧪 Test complete!');
}

// Ausführen
await testWebPDuplicates();
```

### Erwartete Ausgabe

```
🧪 Testing NIP-96 WebP Duplicates Fix...

📋 Loading file list...
Found 3 files

✅ No WebP hash duplicates found!
✅ church-828640_1920.jpg - https://files.sovbit.host/media/church-828640_1920.jpg
✅ cross.png - https://files.sovbit.host/media/cross.png
✅ 7d82a42b463923ac014c4865f9bf4061d0821f4c0609d7253a9868a4b79df2a.webp - https://...

🧪 Test complete!
```

## Regression Tests

### Vor dem Fix

1. Upload Bild → **2 Dateien** erscheinen
2. Liste öffnen → WebP-Duplikat sichtbar
3. WebP löschen → **404 Not Found** ❌

### Nach dem Fix

1. Upload Bild → **1 Datei** erscheint
2. Liste öffnen → Nur Original sichtbar
3. Original löschen → **Erfolgreich** ✅

## Performance-Test

### Vor dem Fix

- Liste mit 100 Uploads → **200 Items** (Duplikate)
- Verwirrend für User
- Langsamer (mehr Items zu rendern)

### Nach dem Fix

- Liste mit 100 Uploads → **100 Items** (gefiltert)
- Klar & übersichtlich
- Schneller (weniger Items)

## Edge Cases

### Edge Case 1: Nur WebP-Upload

```
User uploaded: bild.webp (direkter WebP-Upload)
Filename: bild.webp (echter Name, nicht Hash)
Pattern: ^[a-f0-9]{64}\.webp$ → NICHT matched
Ergebnis: ✅ Wird angezeigt (ist kein Duplikat)
```

### Edge Case 2: Hash-Name aber kein .webp

```
User uploaded: abc123...xyz.jpg (umbenannt mit Hash)
Filename: abc123...xyz.jpg
Pattern: ^[a-f0-9]{64}\.webp$ → NICHT matched (.jpg ≠ .webp)
Ergebnis: ✅ Wird angezeigt (Pattern prüft nur .webp)
```

### Edge Case 3: Kurzer Hash

```
Server-generiert: ab12.webp (kein 64-Zeichen Hash)
Pattern: ^[a-f0-9]{64}\.webp$ → NICHT matched (nur 4 Zeichen)
Ergebnis: ✅ Wird angezeigt (zu kurz für SHA256)
```

## Debug-Tools

### Console Commands

```javascript
// 1. Aktuellen Cache anzeigen
console.table(JSON.parse(localStorage.getItem('blossom-uploads')));

// 2. Bestimmte Datei suchen
const items = JSON.parse(localStorage.getItem('blossom-uploads'));
const file = items.find(i => i.name.includes('church'));
console.log(file);

// 3. WebP-Duplikate im Cache suchen
const webps = items.filter(i => i.name.match(/^[a-f0-9]{64}\.webp$/));
console.log('WebP duplicates in cache:', webps);

// 4. Cache komplett löschen
localStorage.removeItem('blossom-uploads');
console.log('Cache cleared!');

// 5. Server-Liste neu laden
const fresh = await listBlossom();
console.log('Fresh from server:', fresh);
```

## Checkliste

### Vor Release

- [ ] Upload-Test mit JPEG durchgeführt
- [ ] Upload-Test mit PNG durchgeführt
- [ ] Liste zeigt keine WebP-Hashes
- [ ] Delete funktioniert ohne 404
- [ ] Console-Logs korrekt
- [ ] Dokumentation aktualisiert
- [ ] Edge Cases getestet

### Nach Release

- [ ] User-Feedback sammeln
- [ ] Performance-Monitoring
- [ ] Error-Tracking (Sentry/etc.)
- [ ] Server-Logs prüfen

---

**Version**: 2.1.0  
**Datum**: 01.10.2025  
**Status**: ✅ Bereit für Test
