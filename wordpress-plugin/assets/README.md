# Nostr Calendar (NIP‑52, Kind 31923)

Eine kleine Vanilla‑JS Web‑App zum **Erstellen, Posten und Aktualisieren** von Kalender‑Events auf Nostr (NIP‑52).

## Features

- **Authentifizierung**: 
  - NIP‑07 (z. B. NOS2X, Alby) mit automatischer Erkennung und Fallback auf lokale Keys.
  - Manueller Login mit nsec-Key (Bech32 oder Hex), verschlüsselt mit Passwort (AES-GCM via WebCrypto) und persistent gespeichert (Cookie/localStorage, 30 Tage).
  - NIP‑46 (Bunker) Unterstützung mit interaktivem Modal für Connect-URI (bunker:// oder nostrconnect://), Auto-Reconnect, Popup für Auth-URL und Zwischenablage-Fallback.
  - Auto-Login nach User-Geste für gespeicherte Keys, SessionStorage für aktuelle Tab.

- **Ansichten**:
  - **Karten-/Listenansicht**: Sortiert nach Startzeit, mit Karten-Layout (Titel, Datum, Ort, Summary, Tags, Bild-Cover), Edit-Button pro Event.
  - **Monatskalenderansicht**: Vollständiger Monatsgrid (6 Wochen), Events pro Tag mit Uhrzeit, Navigation (←/→), Cross-Month-Events sichtbar, Edit per Klick.
  - **Filter & Suche**: Tag-Filter (Chips mit Entfernen), Textsuche (Titel/Tags), Monatsfilter (Dropdown mit verfügbaren Monaten), dynamische Ergebnisanzeige.

- **Event-Formular**:
  - Vollständiges CRUD: Erstellen/Bearbeiten/Löschen (Status 'cancelled' als Replace).
  - Pflichtfelder: Titel, Start/Ende (lokale Zeitzone, ISO-Input).
  - Optionale Felder: Status (planned/cancelled), Ort, Summary (280 Zeichen), Markdown-Inhalt, Bild-URL, Tags (Chips mit ✕), 'd'-Tag für Replaceable.
  - **Markdown-Editor**: Toolbar für Bold (**), Italic (*), Link [text](url), Image ![alt](url); Live-Vorschau per Button (mdToHtml).
  - **Bild-Upload**: Drag&Drop/File-Input, Upload zu Blossom (POST /upload), Fallback NIP‑96 (signierter HTTP mit NIP-98), Data-URL (Demo), oder custom Endpoint.

- **ICS-Import/Export**:
  - **Export**: Alle/gefiltterte Events zu ICS-Datei (VCALENDAR mit UID=d@nostr, DTSTART/END, SUMMARY, LOCATION, DESCRIPTION).
  - **Import**: Parse VEVENTs (DTSTART/END, SUMMARY, LOCATION, DESCRIPTION, UID→d), Multi-Event-Erkennung mit Batch-Veröffentlichen (sequentiell mit Progress-Bar und Bericht).
  - **RRule-Unterstützung**: Erweiterte Expansion für recurring Events (DAILY/WEEKLY/MONTHLY, BYDAY/BYMONTHDAY, INTERVAL, COUNT/UNTIL), bis zu 400 Instanzen.

- **Dateimanager (Blossom)**:
  - Modal-UI mit Tabelle (Vorschau-Thumnail, Name, Größe KB, Erstellungsdatum, Aktionen).
  - Filter: Typ (image/video/audio/other), Größe (Min/Max KB), Pagination (Seite/Größe).
  - Aktionen: Copy-URL zu Clipboard, Delete (DELETE /delete?url= oder POST {url}), Preview-Modal (Img oder Iframe).
  - Upload: Drag&Drop-Zone oder File-Input, Multi-File, Refresh nach Upload.

- **Theme-System**: 
  - CSS-Variablen für light/dark/custom, persistent in localStorage, Select-Dropdown zum Wechseln.

- **Nostr-Kern**:
  - **Events**: Kind 31923 (parameterized replaceable via 'd'-Tag), Deduping nach höchstem created_at, Fetch seit 1000 Tagen (authors-Filter optional).
  - **Relays**: Konfigurierbar, Fastest-Relay-Selection (Race zu 4 Relays, 1200ms Cap), Robust Fetch (SimplePool.list/query + WS-Fallback, Timeout 3500ms).
  - **Publish**: Zu allen Relays, asynchron mit OK-Warte (800ms), App-Tag (NIP-78: client/nostr-calendar-demo).
  - **Tools**: nostr-tools@2.8.1 (pure/pool/nip46), ESM-CDN, Hex/Bech32-Hilfen (npub/nsec to hex).

- **Technik**:
  - ES6-Module, keine Build-Tools, saubere Trennung HTML/CSS/JS.
  - Vanilla JS, PWA-ready (statisch hostbar, file:// lokal).
  - Sicherheit: Lokale Keys nur Demo, verschlüsselter manueller Key, HTTPS/CSP empfohlen.
  - UI: Modals (Event-Form, Blossom, Preview, Progress), Buttons/Events (CustomEvents für Edit), Responsive (Viewport-Meta).

## Quickstart

1. Legen Sie die Dateien auf einen statischen Webserver (oder nutzen Sie `file://` lokal).
2. Öffnen Sie `index.html` im Browser.
3. **Login**: Wählen Sie NIP-07 (Extension), manuellen nsec (Prompt, optional speichern), oder Bunker (Modal für URI).
4. **Ansicht**: Karten oder Monatskalender, filtern/suchen.
5. **Neuer Termin**: Formular ausfüllen (Markdown, Upload, Tags), **Speichern & veröffentlichen**.
6. **Import/Export**: ICS-Datei laden/speichern, Multi-Batch möglich.
7. **Media**: Button öffnet Blossom-Manager für Upload/Delete.

> Hinweis: App verwendet `nostr-tools@2.8.1` per ESM‑CDN. Publiziert an Relays in `js/config.js`. Für Production: Eigene Relays, NIP-46/Bunker bevorzugen.

## Konfiguration (`js/config.js`)

- `relays`: Array von WebSocket-URLs (z.B. ['wss://relay.damus.io']).
- `allowedAuthors`: Optional, hex/npub-Array für Fetch-Filter (oder leer).
- `defaultTheme`: 'light' | 'dark' | 'custom'.
- `mediaUploadEndpoint`: Optional, URL für einfachen File-POST (Fallback: Blossom/NIP-96).
- `blossom`: { endpoint: 'https://blossom.band' } – Host für Upload/List/Delete.
- `nip46`: { connectURI: 'bunker://...' } – Vordefinierter Bunker-URI (UI-Override möglich).
- `appTag`: ['client', 'nostr-calendar-demo'] – Für NIP-78 Tags.

## NIP‑52 Update‑Mechanik

Kalendereinträge (Kind **31923**) sind **parameterized replaceable** via `d`‑Tag (Base64 von url|title|starts). Beim Bearbeiten/Löschen: Neues Event mit gleichem `d`, höherem `created_at` ersetzt alte Version auf Relays. Deduping beim Fetch.

## Authentifizierung im Detail

- **NIP-07**: Automatisch via `window.nostr`, signEvent/getPublicKey.
- **Manuell**: nsec-Input, Validierung (Bech32/Hex, 32 Bytes), Verschlüsselung mit PBKDF2/AES-GCM + Passwort, persistent (30 Tage), Auto-Decrypt nach Gesture.
- **NIP-46/Bunker**: URI-Parsing, BunkerSigner mit onauth-Popup/Clipboard, Polling für getPublicKey (bis 45s), Relay-Preflight, Reconnect-Retry.

## Bild‑Upload & NIP-96

- Primär: Blossom-POST /upload (FormData {file}), JSON-Antwort mit url.
- Fallback: NIP‑96 signierter Upload (NIP-98 Auth-Header) an `mediaUploadEndpoint`.
- Weiterer Fallback: Data-URL (Base64, nur Demo, Größenlimit beachten).
- Integration: Button in Form, Progress via Modal.

## ICS Multi-Import & RRule

- **Export**: Vollständige ICS (VCALENDAR 2.0, PRODID, UID=d@nostr, DTSTAMP, SUMMARY/LOCATION/DESCRIPTION).
- **Import**: VEVENT-Parsing, Multi-Erkennung mit Confirm/Batch (Progress-Modal, ok/fehlgeschlagen-Zähler).
- **RRule**: Erweiterte Parsing/Expansion (FREQ=DAILY/WEEKLY/MONTHLY, BYDAY/BYMONTHDAY/INTERVAL, COUNT/UNTIL), Instanzen bis Limit=400, sequentielles Publish.

## Blossom-Dateimanager

- **UI**: Modal mit Tabelle, Filter (Typ, Min/Max KB), Pagination (25/Seite, Nav), Sortierung implizit.
- **Aktionen**: Copy-URL, Delete (API-Versuche: DELETE ?url= oder POST /delete), Preview (Image/Iframe in Modal).
- **Upload**: Drag&Drop-Zone (Multi-File), File-Input-Fallback, Auto-Refresh nach Upload.
- **Endpoint**: Konfigurierbar, /list für JSON-Array, Normalisierung (url/size/created/name/id).

## Sicherheit & Produktion

- Lokale/manuelle Keys **nur Demo** – Verwenden Sie NIP-07/NIP-46 in Production.
- Relays: Passen Sie Write-Policies an, testen Sie Read/Write-Separation.
- Verschlüsselung: WebCrypto für manuellen Key, aber Browser-Speicher unsicher (kein Server).
- Hosting: HTTPS/CSP aktivieren, statisch (GitHub Pages/Netlify).
- Limits: Fetch-Limit 1000, RRule 400 Instanzen, Upload-Größen via Endpoint.

## Lizenz

MIT

## ToDo-Liste

- [ ] WySiWyG Editor
- [ ] Edit Tests
- [ ] UI Verbesserungen
- [ ] Kachelansicht verbessern
- [ ] Mobile-Optimierungen: Touch-Handling für Calendar, responsive Modals.
- [ ] NIP-89 Support: Event-Attachments/Files integrieren.
- [ ] Error-Handling verbessern: Netzwerk-Fehler mit Retry-Button, Offline-Modus (IndexedDB).
- [ ] i18n: Deutsche/Englische Texte, Locale für Datum/Uhrzeit.
