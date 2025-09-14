# Nostr Calendar Plugin - Architektur & Ablauf

Dieses Dokument beschreibt das Zusammenspiel aller Komponenten des WordPress-Plugins `nostr-calendar-wordpress` und des zugehörigen Frontend-Clients (`nostr-calendar-app`). Es erklärt klar, welche Aufgaben auf JavaScript-Ebene und welche auf PHP-Ebene ausgeführt werden, sowie wichtige Integrations- und Troubleshooting-Hinweise.

## Übersicht der Komponenten

- Plugin: `nostr-calendar-wordpress` (WordPress Plugin)
  - PHP-Klassen (serverseitig):
    - `NostrCalendar` (Haupt-Plugin-Bootstrap)
    - `NostrCalendarRestAPI` (REST-API-Endpoints)
    - `NostrCalendarIdentity` (Identitätsverwaltung — Erstellen/Schützen von Private Keys)
    - `NostrCalendarPublisher` (Event-Signierung & Relay-Publishing)
    - `NostrSimpleCrypto` (Fallback-Krypto & Diagnose-Tools)
  - Admin UI: Einstellungen, Relay-Liste, Diagnosen (GMP, Autoloader, Klassen-Erkennung)

- Frontend: `nostr-calendar-app` (JavaScript)
  - Komponenten (clientseitig):
    - Calendar UI (month/week/day views)
    - Auth Plugins (z. B. `WordPressPluginAuth`, `NostrAuthPlugin`)
    - Relay Manager (WebSocket-Verbindungen, reconnect, health checks)
    - Publisher Client (optionales clientseitiges Signieren + publish)

## Datenfluss und Verantwortlichkeiten

1. Benutzeranfrage (Frontend)
   - Der Benutzer interagiert mit der Calendar UI (Event erstellen/ändern/löschen).
   - JS validiert Eingaben (Titel, Zeit, Tags) lokal.

2. Authentifizierung
   - WordPress-SSO: Der Benutzer ist über WordPress eingeloggt. Der Frontend-Client ruft `GET /wp-json/nostr-calendar/v1/me` auf, um Login-Status, Rollen und Identitätsstatus zu prüfen.
   - Falls zusätzliche OAuth/SSO-Provider verwendet werden, verwaltet das entsprechende Auth-Plugin die Provider-spezifische Logik.

3. Identität (Schlüsselerzeugung & Lagerung)
   - Serverseitig (empfohlen):
     - `NostrCalendarIdentity::get_or_create_identity($user_id)` erzeugt bei Bedarf ein Schlüsselpaar, verschlüsselt den Private Key mit der WP-Option-/Salt und speichert es in `wp_nostr_calendar_identities`.
     - Vorteile: Private Keys verlassen nie den Server, Signaturen erfolgen vertrauenswürdig auf Server.
   - Clientseitig (optional):
     - Private Keys können auch im Browser erzeugt und dort gespeichert werden (z. B. LocalStorage or WebCrypto). In diesem Fall signiert der Client und pusht direkt an Relays. Sicherheit hängt vom Client-Schutz ab.

4. Event-Erstellung & Signatur
   - Serverseitig (Standard):
     - Frontend sendet `POST /wp-json/nostr-calendar/v1/event` mit Event-Daten.
     - `NostrCalendarRestAPI` prüft Berechtigungen und ruft `NostrCalendarPublisher::create_and_publish($event, $identity)` auf.
     - `NostrCalendarPublisher` signiert das Event mit dem Private Key (reale Implementierung nutzt `kornrunner/secp256k1` + GMP) und kann das Event an konfigurierte Relays senden oder nur in die DB cachen.
   - Clientseitig (optional):
     - Frontend signiert lokal und publisht direkt an Relays per WebSocket. Server wird nur verwendet, um Metadaten oder ACLs zu prüfen.

5. Publishing an Relays
   - Publisher (PHP): Verwaltet Verbindungslogik zu Relays (WebSocket oder HTTP Proxy), Wiederholungsversuch, Quittungen und Fehler-Handling.
   - Client (JS): Hat einen Relay-Manager für direkte WebSocket-Verbindungen, verwendet gleiche Relay-Liste wie Server (kann lokal überschrieben werden).

6. Löschen von Events
   - `DELETE /wp-json/nostr-calendar/v1/event/{id}` prüft Berechtigungen und veranlasst Löschung im Event-Cache sowie optionales Notify an Relays.

## Dateibasierte und Netzwerk-Komponenten

- PHP-Dateien (Server-seitig):
  - `nostr-calendar.php` — Plugin-Init, Hooks, Admin-Menü
  - `includes/class-rest-api.php` — REST-API-Routen
  - `includes/class-identity.php` — Identity DB-Operationen
  - `includes/class-publisher.php` — Sign & Publish Logik
  - `includes/class-simple-crypto.php` — Fallback & Diagnose

- JavaScript-Dateien (Client-seitig):
  - `js/app.js` — Hauptanwendung, registriert Auth-Plugins
  - `js/WordPressPluginAuth.js` — Auth Provider für WP REST API
  - `js/nostr.js` / `js/utils.js` — Nostr Protokoll Hilfsfunktionen
  - `js/views/*.js` — UI Views für Kalender

## Konfigurations-Empfehlungen

- Produktion:
  - Verwende `ext-gmp` + `kornrunner/secp256k1` für echte secp256k1 Signaturen.
  - Führe `composer install` im Plugin-Verzeichnis mit derselben PHP-Version aus, die PHP-FPM benutzt (z. B. `sudo php8.1 /usr/local/bin/composer install`).
  - Speichere Private Keys verschlüsselt in der DB und beschränke Admin-Zugriffe.

- Entwicklung:
  - Fallback-Krypto erlaubt Arbeiten ohne native Extensions. Nicht für produktive Signaturen verwenden.

## Troubleshooting (häufige Fälle)

1. GMP in CLI, aber nicht in FPM
   - Ursache: unterschiedliche `php.ini` / SAPI. Lösung: GMP in FPM aktivieren (`sudo phpenmod -v 8.1 gmp`) und `systemctl restart php8.1-fpm`.

2. Composer-Pakete nicht geladen
   - Ursache: Composer mit anderer PHP-Version ausgeführt oder `vendor/` an falschem Ort.
   - Lösung: Composer mit FPM-PHP ausführen und `vendor/autoload.php` im Plugin-Verzeichnis prüfen.

3. secp256k1-Classes nicht gefunden
   - Ursache: falscher Namespace oder Autoloader nicht geladen.
   - Lösung: Prüfe `vendor/kornrunner/secp256k1/src/` auf Klassen und passe class detection in `class-simple-crypto.php` an.

## Sicherheitshinweise

- Signiere auf dem Server, wenn du Private Keys verwaltest.
- Nutze HTTPS und strenge CORS für REST-Endpunkte.
- Schütze `wp_nostr_calendar_identities` mit eingeschränkten DB-Rechten und regelmäßigen Backups.

## Beispielablauf: Erstelle ein Event (Serverseitig signiert)

1. JS sammelt Event-Daten und sendet `POST /wp-json/nostr-calendar/v1/event`.
2. REST-API prüft User-Berechtigung.
3. Identity wird geladen (Private Key entschlüsselt)
4. Event-ID wird berechnet, Event signiert (secp256k1)
5. Event wird in DB gecached und an konfigurierten Relays veröffentlicht
6. Frontend empfängt Bestätigung und aktualisiert UI

## Kontakt

Bei Fragen: GitHub Issues — https://github.com/johappel/nostr-calendar-app/issues
