# Blossom Media-Upload - Benutzerhandbuch

## 🚀 Schnellstart

### 1. Anmelden (erforderlich für Upload)

Vor dem Upload müssen Sie sich mit Ihrem Nostr-Account anmelden:

**Option A: Browser Extension (empfohlen)**
- Installieren Sie eine Nostr-Extension (z.B. nos2x, Alby, Flamingo)
- Klicken Sie auf "Login mit Browser-Extension"

**Option B: Lokaler Key**
- Klicken Sie auf "Login mit nsec"
- Geben Sie Ihren nsec-Key ein

**Option C: Remote Signer (NIP-46)**
- Klicken Sie auf "Login mit Bunker"
- Folgen Sie den Anweisungen

### 2. Bilder hochladen

1. Klicken Sie auf den **"Media"** Button in der Toolbar
2. Das Blossom Media-Fenster öffnet sich
3. Laden Sie Bilder hoch:
   - **Drag & Drop**: Ziehen Sie Dateien in die Dropzone
   - **Klick**: Klicken Sie auf die Dropzone und wählen Sie Dateien

### 3. Bild für Event verwenden

1. Öffnen Sie das Blossom Media-Fenster
2. Finden Sie Ihr Bild in der Liste
3. Klicken Sie auf **"Verwenden"**
4. Das Bild wird automatisch ins Event-Formular eingetragen

## 📋 Mediathek verwalten

### Dateien anzeigen

Die Mediathek zeigt alle Ihre hochgeladenen Dateien:
- **Preview**: Miniatur-Vorschau
- **Name**: Dateiname
- **Größe**: Dateigröße in KB
- **Erstellt**: Upload-Datum

### Filtern

**Nach Typ filtern:**
- Alle
- Bilder
- Videos
- Audio
- Andere

**Nach Größe filtern:**
- Minimum (KB)
- Maximum (KB)

### Pagination

- Wählen Sie 10, 25 oder 50 Dateien pro Seite
- Navigieren Sie mit ← / → zwischen Seiten

### Aktionen

**Verwenden** (nur Bilder)
- Setzt das Bild als Event-Bild

**Preview**
- Zeigt Vollbild-Vorschau

**Copy**
- Kopiert die URL in die Zwischenablage

**Delete**
- Löscht die Datei (Server + Cache)
- ⚠️ Kann nicht rückgängig gemacht werden!

## 💡 Tipps & Best Practices

### Vor dem Upload

1. **Bildgröße optimieren**: Komprimieren Sie Bilder vor dem Upload (z.B. TinyPNG, Squoosh)
2. **GPS entfernen**: Entfernen Sie GPS-Metadaten aus Fotos (Privatsphäre!)
3. **Format wählen**: JPEG/PNG für Bilder, WebP für Web-Optimierung

### Unterstützte Dateitypen

**Bilder:**
- .jpg, .jpeg, .png, .gif, .webp, .svg

**Videos:**
- .mp4, .webm, .mov, .mkv

**Audio:**
- .mp3, .wav, .ogg, .flac

**Größenlimit:**
- Kostenlos: bis zu 50 MiB pro Datei

### Sicherheit

✅ **Sicher:**
- Uploads sind mit Ihrem Nostr-Key signiert
- Nur Sie können Ihre Uploads löschen
- Dateien werden auf dezentralen Servern gespeichert

⚠️ **Beachten Sie:**
- Hochgeladene Dateien sind öffentlich zugänglich
- Laden Sie keine privaten/sensiblen Inhalte hoch
- URLs können in Events und im Netzwerk geteilt werden

## 🔧 Fehlerbehebung

### Upload funktioniert nicht

**Schritt 1: Login prüfen**
- Sind Sie angemeldet? (Check in der Toolbar)
- Funktioniert Ihre Nostr-Extension?

**Schritt 2: Browser-Konsole prüfen**
- F12 → Console-Tab
- Gibt es Fehlermeldungen?

**Schritt 3: Alternative Server**
- Die App versucht automatisch mehrere Server
- Warten Sie einige Sekunden

### Liste lädt nicht

- Die App nutzt automatisch den lokalen Cache
- Alle Ihre Uploads sind im Cache gespeichert
- Anmelden zeigt auch Server-Liste

### Bild wird nicht angezeigt

- Prüfen Sie die URL im Event-Formular
- Testen Sie die URL im Browser
- Laden Sie das Bild ggf. erneut hoch

## 📱 Offline-Funktion

Die Mediathek funktioniert auch offline:
- Alle Uploads werden lokal gecacht (bis zu 500 Dateien)
- Sie können Uploads ansehen und URLs kopieren
- Upload/Delete benötigt Online-Verbindung

## ❓ Häufig gestellte Fragen

**Q: Kostet der Upload Geld?**
A: Nein, blossom.band bietet kostenlose Uploads bis 50 MiB

**Q: Wie lange werden Dateien gespeichert?**
A: Das hängt vom Server ab. Blossom.band speichert dauerhaft.

**Q: Kann ich gelöschte Dateien wiederherstellen?**
A: Nein, Löschungen sind permanent.

**Q: Werden Dateien komprimiert?**
A: Nein, Dateien werden im Original gespeichert.

**Q: Kann ich eigene Server nutzen?**
A: Ja, siehe Entwickler-Dokumentation für Konfiguration.

**Q: Sind meine Uploads privat?**
A: Nein, alle Uploads sind öffentlich. Laden Sie keine sensiblen Daten hoch!

## 🆘 Support

Bei Problemen:
1. Prüfen Sie diese Anleitung
2. Öffnen Sie die Browser-Konsole (F12)
3. Erstellen Sie ein Issue auf GitHub
4. Fragen Sie in der Nostr-Community
