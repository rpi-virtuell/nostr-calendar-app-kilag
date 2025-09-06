# Nostr Calendar (NIP‑52, Kind 31923)

Eine kleine Vanilla‑JS Web‑App zum **Erstellen, Posten und Aktualisieren** von Kalender‑Events auf Nostr (NIP‑52).

## Features

- Authentifizierung via **NIP‑07** (z. B. NOS2X, Alby, etc.). Fallback: lokale Keys.
- **Listen-/Kachelansicht** mit Tag‑Filter, Suchfeld und Monatsfilter.
- **Formular** zum Erstellen/Bearbeiten inkl. Markdown‑Editor (Vorschau) und Bild‑Upload (NIP‑96‑Hook).
- **Theme-System** über CSS‑Variablen: light, dark, custom.
- **ES6‑Module**, keine Build‑Tools, saubere Trennung in HTML/CSS/JS.

## Quickstart

1. Legen Sie die Dateien auf einen statischen Webserver (oder nutzen Sie `file://` lokal).
2. Öffnen Sie `index.html` im Browser.
3. Klicken Sie **„Mit Nostr einloggen“** (NIP‑07 Extension wie NOS2X erforderlich) oder nutzen Sie den lokalen Fallback‑Key.
4. **Neuer Termin** → Formular ausfüllen → **Speichern & veröffentlichen**.

> Hinweis: Die App verwendet `nostr-tools@1.17.0` per ESM‑CDN. Sie publiziert Events an die in `js/config.js` definierten Relays.

## Konfiguration (`js/config.js`)

- `relays`: Liste der Ziel‑Relays (WebSocket‑URLs).
- `allowedAuthors`: (Optional) Filter beim Laden – nur Events dieser Autoren (hex/npub).
- `defaultTheme`: `light` | `dark` | `custom`.
- `mediaUploadEndpoint`: (Optional) URL für **NIP‑96** Uploads. Fallback: Data‑URL.

## NIP‑52 Update‑Mechanik

Kalendereinträge (Kind **31923**) sind **parameterized replaceable** via `d`‑Tag. Beim Bearbeiten wird derselbe `d`‑Wert verwendet; ein neues Event mit höherem `created_at` **ersetzt** die ältere Version auf den Relays.

## NOS2X / NIP‑07

Wenn eine Browser‑Extension vorhanden ist (`window.nostr`), nutzt die App deren `getPublicKey` und `signEvent`. Andernfalls wird ein lokales Schlüsselpaar erstellt und in `localStorage` gespeichert (nur Demo!).

## Bild‑Upload (NIP‑96)

Hinterlegen Sie `mediaUploadEndpoint`, das eine JSON‑Antwort mit einer Bild‑`url` liefert. Ohne Endpoint nutzt die App Data‑URLs (nur zu Testzwecken).

## Sicherheit & Produktion

- Lokale Schlüssel sind **nur** für Demos. In Produktion NIP‑07 oder NIP‑46 (Bunker) verwenden.
- Passen Sie die **Relayliste** an (eigene Relays, Write‑Policies).
- CSP/HTTPS aktivieren, falls gehostet.

## Lizenz

MIT


## Neu: Blossom-Dateimanager
- **Media**-Button öffnet eine Liste der Dateien vom Blossom-Endpoint (`/list`).
- Aktionen: **Copy** (URL in Zwischenablage) und **Delete** (API versucht `DELETE ?url=` bzw. `POST /delete`).
- Endpoints sind je nach Server anders – ggf. im Code (`js/blossom.js`) anpassen.

## Neu: NIP-96 Uploads mit Signatur
- Wenn `mediaUploadEndpoint` gesetzt ist, nutzt die App einen **signierten HTTP-Upload** (NIP-98 Authorization Header) für NIP-96 File-Server.
- Falls NIP-96 scheitert, greift Blossom oder Data-URL als Fallback.

## Neu: ICS Multi-Import
- Beim Import erkennt die App mehrere `VEVENT`s und bietet **Batch-Veröffentlichen** an (sequentiell, mit Ergebnisbericht).
