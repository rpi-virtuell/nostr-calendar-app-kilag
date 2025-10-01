# Verbesserung der Bild-Upload-Usability

## Übersicht
Die Bild-Upload-Funktionalität im Event-Formular wurde verbessert, um eine bessere Integration mit dem Blossom Media Manager zu bieten.

## Änderungen

### 1. HTML-Struktur (index.html)
**Vorher:**
```html
<div class="col">
  <label>Bild-URL</label>
  <input id="f-image" placeholder="https://…" />
  <div class="row gap">
    <input id="f-image-file" type="file" accept="image/*" />
    <button id="btn-upload" class="btn btn-ghost" type="button">Upload » URL einfügen</button>
  </div>
</div>
```

**Nachher:**
```html
<div class="col">
  <label>Bild-URL</label>
  <input id="f-image" placeholder="https://…" />
  <div class="row gap">
    <button id="btn-select-from-blossom" class="btn btn-ghost" type="button" title="Aus Mediathek auswählen">📁 Mediathek</button>
    <input id="f-image-file" type="file" accept="image/*" style="display:none;" />
    <button id="btn-upload-image" class="btn btn-ghost" type="button" title="Neues Bild hochladen">📤 Hochladen</button>
  </div>
</div>
```

**Verbesserungen:**
- ✅ File-Input ist jetzt versteckt (bessere UX)
- ✅ Zwei separate, klar beschriftete Buttons:
  - **📁 Mediathek**: Öffnet das Blossom-Modal zur Auswahl bereits hochgeladener Bilder
  - **📤 Hochladen**: Öffnet den Datei-Auswahldialog zum Upload neuer Bilder
- ✅ Tooltips für bessere Benutzerführung
- ✅ Emoji-Icons für visuelle Unterscheidung

### 2. JavaScript-Logik (app.js)
Die `setupUpload()`-Funktion wurde komplett überarbeitet:

**Neue Funktionalität:**

#### Button 1: Mediathek öffnen
```javascript
btnSelectFromBlossom.addEventListener('click', async () => {
  // Öffnet Blossom-Modal
  els.blossomModal.showModal();
  
  // Lädt und zeigt vorhandene Medien
  await refreshBlossom(els.blossomInfo, blossomState);
  renderBlossom(...);
  
  // Zeigt Hinweis
  showNotification('Wählen Sie ein Bild aus und klicken Sie auf "Verwenden"', 'info');
});
```

**Workflow:**
1. User klickt auf "📁 Mediathek"
2. Blossom-Modal öffnet sich
3. Alle hochgeladenen Bilder werden angezeigt
4. User klickt auf "Verwenden" bei einem Bild
5. URL wird automatisch in `f-image` eingetragen
6. Modal schließt sich automatisch

#### Button 2: Neues Bild hochladen
```javascript
btnUploadImage.addEventListener('click', () => {
  fileInput.click(); // Öffnet versteckten File-Input
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  
  // Validierung
  if (!file.type.startsWith('image/')) {
    showNotification('Bitte wählen Sie eine Bilddatei aus', 'error');
    return;
  }
  
  // Upload via Blossom
  showNotification('Bild wird hochgeladen...', 'info');
  const { url } = await uploadToBlossom(file);
  
  // URL direkt ins Formular eintragen
  imageUrlInput.value = url;
  showNotification('✅ Bild erfolgreich hochgeladen!', 'success');
});
```

**Workflow:**
1. User klickt auf "📤 Hochladen"
2. Dateiauswahl-Dialog öffnet sich
3. User wählt Bilddatei
4. Automatischer Upload zu Blossom
5. URL wird automatisch in `f-image` eingetragen
6. Erfolgs-Benachrichtigung

### 3. Blossom-Integration (blossom.js)
Die bestehende "Verwenden"-Funktionalität wurde bereits implementiert:

```javascript
// Use image in event form
if (isImg) {
  const useBtn = tr.querySelector('.use-image');
  if (useBtn) {
    useBtn.addEventListener('click', ()=>{
      const imageInput = document.getElementById('f-image');
      if (imageInput) {
        // URL ins Formular übernehmen
        imageInput.value = it.url;
        imageInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Modal schließen
        const blossomModal = document.getElementById('blossom-modal');
        if (blossomModal) blossomModal.close();
        
        // Erfolgs-Benachrichtigung
        if(window.showNotification) {
          window.showNotification('Bild als Event-Bild gesetzt', 'success');
        }
      }
    });
  }
}
```

## Benutzer-Workflows

### Workflow 1: Vorhandenes Bild verwenden
```
1. Event-Formular öffnen
2. Klick auf "📁 Mediathek"
   → Blossom-Modal öffnet sich mit allen Bildern
3. Bild suchen/filtern (nach Typ, Größe, Datum)
4. Klick auf "Verwenden" beim gewünschten Bild
   → URL wird automatisch übernommen
   → Modal schließt sich
5. Event speichern
```

### Workflow 2: Neues Bild hochladen
```
1. Event-Formular öffnen
2. Klick auf "📤 Hochladen"
   → Dateiauswahl-Dialog öffnet sich
3. Bilddatei auswählen
   → Upload startet automatisch
   → Progress-Benachrichtigung
   → URL wird automatisch eingetragen
4. Event speichern
```

### Workflow 3: Manuelle URL-Eingabe (wie bisher)
```
1. Event-Formular öffnen
2. URL direkt ins Feld "Bild-URL" eingeben
3. Event speichern
```

## Vorteile

### Usability
- ✅ **Klare Trennung**: Zwei separate Buttons statt versteckter Funktionalität
- ✅ **Intuitive Icons**: Emoji-Icons machen Funktion sofort ersichtlich
- ✅ **Tooltips**: Hover zeigt detaillierte Beschreibung
- ✅ **Versteckter File-Input**: Professionelleres Aussehen
- ✅ **Automatische Workflows**: Keine manuellen Zwischenschritte nötig

### Funktionalität
- ✅ **Blossom-Integration**: Alle Uploads werden zentral in Blossom verwaltet
- ✅ **Wiederverwendung**: Bereits hochgeladene Bilder können einfach wiederverwendet werden
- ✅ **Validierung**: Automatische Prüfung auf Bildformat
- ✅ **Feedback**: Toast-Benachrichtigungen für alle Aktionen
- ✅ **Error-Handling**: Fehler werden sauber behandelt und angezeigt

### Konsistenz
- ✅ **Design System**: Verwendet bestehende CSS-Klassen (`btn`, `btn-ghost`, `row gap`)
- ✅ **Notification System**: Nutzt globale `showNotification()`-Funktion
- ✅ **Blossom API**: Konsistente Nutzung der Blossom-Upload-Funktionen

## Technische Details

### Abhängigkeiten
- `uploadToBlossom()` aus `blossom.js`
- `refreshBlossom()` aus `blossom.js`
- `renderBlossom()` aus `blossom.js`
- `showNotification()` aus `app.js`
- Globale `els` Referenzen für Modal-Elemente

### Event-Handling
- File-Input wird programmatisch getriggert
- Input-Events werden dispatcht für Listener
- Modal wird automatisch geschlossen nach Auswahl

### Validierung
```javascript
// Nur Bilder erlaubt
if (!file.type.startsWith('image/')) {
  showNotification('Bitte wählen Sie eine Bilddatei aus', 'error');
  return;
}
```

### Cache-Management
- Uploads werden automatisch in Blossom-Cache gespeichert
- Cache wird bei Bedarf aktualisiert
- Siehe `blossom.js` für Details

## Testing

### Manuelle Tests
1. ✅ Mediathek-Button öffnet Modal
2. ✅ "Verwenden" übernimmt URL und schließt Modal
3. ✅ Upload-Button öffnet Dateiauswahl
4. ✅ Upload speichert in Blossom und trägt URL ein
5. ✅ Validierung verhindert Nicht-Bild-Uploads
6. ✅ Toast-Benachrichtigungen erscheinen korrekt
7. ✅ Alle drei Workflows funktionieren parallel

### Edge Cases
- ✅ Kein File ausgewählt: Keine Aktion
- ✅ Nicht-Bild ausgewählt: Error-Message
- ✅ Upload fehlgeschlagen: Error-Message mit Details
- ✅ Blossom-Modal bereits offen: Wird refreshed
- ✅ Kein Auth: Upload funktioniert trotzdem (Blossom erlaubt anonyme Uploads)

## Migration

Keine Breaking Changes:
- ✅ Bestehende URL-Eingabe funktioniert weiterhin
- ✅ Alte Button-IDs wurden durch neue ersetzt (kein Legacy-Code betroffen)
- ✅ Blossom-Modal-Funktionalität bleibt unverändert

## Zukünftige Verbesserungen

Mögliche Erweiterungen:
- 🔄 Drag & Drop direkt aufs Bild-URL-Feld
- 🔄 Preview des ausgewählten Bildes im Formular
- 🔄 Crop/Resize-Funktionalität vor Upload
- 🔄 Batch-Upload mehrerer Bilder
- 🔄 Image-Galerie im Event (mehrere Bilder)

## Referenzen

- **NIP-96**: HTTP File Storage Integration
- **Blossom Protocol**: Decentralized media storage
- **Design System**: Siehe `Agents.md`
