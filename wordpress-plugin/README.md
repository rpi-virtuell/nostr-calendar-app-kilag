# Nostr Calendar WordPress Plugin

Ein WordPress-Plugin, das dezentrale Kalender-Events über das Nostr-Protokoll verwaltet und sowohl client- als auch serverseitige Optionen für Signatur und Publishing bietet.

## Kurzüberblick

- WordPress-SSO Integration: Verwendet WordPress-Benutzerkonten und Rollen.
- Dezentrale Events: Publiziert Nostr-Events zu konfigurierbaren Relays.
- Identitäts-Management: Generiert und verwaltet Nostr-Identitäten pro Benutzer.
- Flexible Architektur: Serverseitiges Signieren/Publizieren via PHP oder clientseitiges Publizieren via WebSocket (konfigurierbar).

## Highlights (neu)

- Admin-Diagnose: Detaillierte Informationen zu PHP-SAPI, geladenen Extensions (z. B. GMP), Composer-Autoloader-Pfaden und Klassen-Erkennung.
- Fallback-Krypto: Vereinfachte Implementierung für Umgebungen ohne ext-gmp (nur für Entwicklung). Produktion sollte `ext-gmp` + `kornrunner/secp256k1` verwenden.
- Composer-Integration: Installiere PHP-Libraries im Plugin-Ordner mit derselben PHP-Version wie der Webserver (PHP-FPM).

## Installation

1. Plugin-Ordner nach WordPress kopieren:

```bash
cp -r wordpress-plugin /path/to/wordpress/wp-content/plugins/nostr-calendar
```

2. Composer-Abhängigkeiten im Plugin-Verzeichnis installieren. WICHTIG: Verwende dieselbe PHP-Binärdatei, die auch vom Webserver (PHP-FPM) genutzt wird. Beispiel für Ubuntu mit PHP 8.1 FPM:

```bash
cd /path/to/wordpress/wp-content/plugins/nostr-calendar
sudo php8.1 /usr/local/bin/composer install --no-dev --optimize-autoloader
```

3. Plugin in WordPress aktivieren (Admin → Plugins).

4. Einstellungen → Nostr Calendar → Relays konfigurieren.

## Shortcodes

Shortcode kompletter Kalender:

```php
[nostr_calendar theme="light" view="month" height="600px"]
```

Benutzerspezifischer Kalender (readonly):

```php
[nostr_user_calendar user_id="123" readonly="true"]
```

Shortcode mit benutzerdefinierten Relays:

```php
[nostr_calendar relays="wss://relay1.com,wss://relay2.com"]
```

## WordPress REST API Endpoints

Die wichtigsten REST-Endpunkte (Namespace: `nostr-calendar/v1`):

- `GET /wp-json/nostr-calendar/v1/me` — aktueller Benutzer-Status
- `GET /wp-json/nostr-calendar/v1/sso-status` — SSO-Status prüfen
- `POST /wp-json/nostr-calendar/v1/event` — Event erstellen (signieren + optional publish)
- `DELETE /wp-json/nostr-calendar/v1/event/{id}` — Event löschen
- `GET /wp-json/nostr-calendar/v1/events` — Benutzer-Events abrufen

Hinweis: Publishing kann serverseitig in PHP erfolgen (empfohlen, wenn private keys serverseitig gespeichert) oder clientseitig per WebSocket, falls private keys nur im Browser verwendet werden.

## Projektstruktur (wichtige Dateien)

- `nostr-calendar.php` — Haupt-Plugin-Bootstrap und Admin-Menü
- `includes/class-simple-crypto.php` — Fallback-Kryptographie und Diagnose-Utilities
- `includes/class-rest-api.php` — REST-API-Routen und Handler
- `includes/class-identity.php` — Identitätsverwaltung (Erstellen, Abrufen, Verschlüsseln von Private Keys)
- `includes/class-publisher.php` — Publisher-Logik (signieren, Relay-Publishing)
- `wordpress-plugin/README.md` — Diese Datei
- `wordpress-plugin/INSTALL.md` — Installationshinweise
- `wordpress-plugin/documentation.md` — (neu) Detaillierte Architektur & Ablaufbeschreibung
- `vendor/` — Composer-Abhängigkeiten (nach `composer install`)

## Betrieb & Troubleshooting

1. GMP wird in vielen Systemen nicht automatisch in allen SAPIs geladen (CLI vs FPM). Wenn Admin-Diagnose `gmp` nicht zeigt, prüfe:

```bash
# Paket installieren (Beispiel Ubuntu und php8.1-fpm installiert):
sudo apt install php8.1-gmp
# GMP für SAPI aktivieren (wenn nötig):
sudo phpenmod -v 8.1 gmp
sudo systemctl restart php8.1-fpm 
sudo systemctl restart apache2  # oder nginx

# Composer mit derselben PHP-Version ausführen wie FPM:
sudo php8.1 /usr/local/bin/composer install --no-dev --optimize-autoloader
```

2. Composer-Autoloader wird im Plugin-Ordner erwartet: `wp-content/plugins/nostr-calendar/vendor/autoload.php`.
3. Wenn `kornrunner/secp256k1` nicht geladen wird, prüfe die `vendor/`-Ordnerinhalte und ob `composer install` mit der Webserver-PHP ausgeführt wurde.

## Sicherheit

- Private Keys werden verschlüsselt in der WordPress-Datenbank gespeichert und sollten niemals an das Frontend gesendet werden.
- Für Produktion: ext-gmp + `kornrunner/secp256k1` verwenden. Fallback-Krypto ist nur für Entwicklung.
- Verwende HTTPS für alle Relay-Verbindungen.

## Migration von Node.js

Wenn vorher ein Node.js-Server für Signing/Publishing verwendet wurde, sind die Schritte:

1. Plugin installieren und aktivieren.
2. Frontend-Code so anpassen, dass die neue REST-API genutzt wird (siehe Migration-Guide in `documentation.md`).
3. Testen: Event-Erstellung, Signatur-Verifikation, Publishing an Relays.
4. Node.js-Server abschalten, wenn alle Funktionen erfolgreich migriert sind.

## Entwicklung

Requirements:

- PHP >= 8.1 (empfohlen für `kornrunner/secp256k1`)
- Composer
- WordPress 5.0+

Dev-Setup:

```bash
git clone https://github.com/johappel/nostr-calendar-app
cd nostr-calendar-app/wordpress-plugin
composer install
```

## Support & Kontakt

- GitHub Issues: https://github.com/johappel/nostr-calendar-app/issues
- WordPress Support Forum

## Lizenz

MIT License
