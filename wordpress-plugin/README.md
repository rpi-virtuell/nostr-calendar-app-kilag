# Nostr Calendar WordPress Plugin

Ein WordPress Plugin für dezentrale Kalender-Events über das Nostr-Protokoll.

## Features

- 🔐 **WordPress SSO Integration** - Nutzt bestehende WordPress-Benutzer
- 📅 **Dezentrale Events** - Publiziert Events zu Nostr-Relays
- 🔑 **Automatische Identitäten** - Generiert Nostr-Identitäten für WordPress-Benutzer
- 🎨 **Responsive UI** - Modernes Calendar-Interface mit Sidebar
- 🔄 **Real-time Sync** - WebSocket-Verbindungen zu Nostr-Relays
- 🎯 **Plugin-Architektur** - Erweiterbar für andere Auth-Methoden

## Installation

### 1. Plugin Installation

```bash
# Plugin-Ordner in WordPress kopieren
cp -r wordpress-plugin /path/to/wordpress/wp-content/plugins/nostr-calendar

# PHP Dependencies installieren
cd /path/to/wordpress/wp-content/plugins/nostr-calendar
composer install --no-dev --optimize-autoloader
```

### 2. Plugin Aktivierung

1. WordPress Admin → Plugins
2. "Nostr Calendar" aktivieren
3. Settings → Nostr Calendar → Relay-URLs konfigurieren

### 3. Verwendung

#### Shortcode für kompletten Kalender:
```php
[nostr_calendar theme="light" view="month" height="600px"]
```

#### Shortcode für Benutzer-spezifischen Kalender:
```php
[nostr_user_calendar user_id="123" readonly="true"]
```

#### Shortcode mit benutzerdefinierten Relays:
```php
[nostr_calendar relays="wss://relay1.com,wss://relay2.com"]
```

## WordPress REST API Endpoints

Das Plugin ersetzt die Node.js Server-Endpoints:

### Authentifizierung
- `GET /wp-json/nostr-calendar/v1/me` - Aktueller Benutzer-Status
- `GET /wp-json/nostr-calendar/v1/sso-status` - SSO-Status prüfen

### Event-Management
- `POST /wp-json/nostr-calendar/v1/event` - Event erstellen
- `DELETE /wp-json/nostr-calendar/v1/event/{id}` - Event löschen
- `GET /wp-json/nostr-calendar/v1/events` - Benutzer-Events abrufen

## Technische Architektur

### PHP-Klassen:
- `NostrCalendar` - Haupt-Plugin-Klasse
- `NostrCalendarRestAPI` - REST API Handler
- `NostrCalendarIdentity` - Identitäts-Management
- `NostrCalendarPublisher` - Nostr Event Publishing

### JavaScript Integration:
- `WordPressPluginAuth.js` - WordPress Plugin Auth Provider
- Nutzt WordPress REST API statt Node.js Server
- Integriert mit bestehender Plugin-Architektur

### Datenbank-Tabellen:
- `wp_nostr_calendar_identities` - Nostr-Identitäten für WP-Benutzer
- `wp_nostr_calendar_events` - Event-Cache für Performance

## Migration von Node.js

### Schritte zur Migration:

1. **WordPress Plugin installieren und aktivieren**
2. **Frontend aktualisieren:**
   ```javascript
   // Ersetze in app.js:
   import { WordPressAuthPlugin } from './auth/WordPressAuthPlugin.js';
   // Mit:
   import { WordPressPluginAuth } from './WordPressPluginAuth.js';
   
   // Plugin-Registrierung aktualisieren:
   const wpPlugin = new WordPressPluginAuth();
   authRegistry.register('wordpress', wpPlugin);
   ```

3. **Server-URLs anpassen:**
   ```javascript
   // Alte Node.js URLs:
   // http://localhost:8787/wp-calendar/event
   
   // Neue WordPress REST API URLs:
   // /wp-json/nostr-calendar/v1/event
   ```

4. **Node.js Server entfernen** (optional nach erfolgreicher Migration)

## Konfiguration

### Admin-Einstellungen:
- **Relays:** Liste der Nostr-Relay-URLs
- **Identitäts-Management:** Automatische Schlüsselgenerierung
- **Event-Einstellungen:** Cache-Konfiguration

### Programmatische Konfiguration:
```php
// Relays setzen
update_option('nostr_calendar_relays', [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social'
]);

// Identität für Benutzer abrufen
$identity_manager = new NostrCalendarIdentity();
$identity = $identity_manager->get_or_create_identity(get_current_user_id());
```

## Entwicklung

### Requirements:
- PHP 7.4+
- WordPress 5.0+
- Composer
- secp256k1 PHP Extension (empfohlen)

### Development Setup:
```bash
git clone https://github.com/johappel/nostr-calendar-app
cd nostr-calendar-app/wordpress-plugin
composer install
```

### Testing:
```bash
composer test
```

## Roadmap

- [ ] **Advanced Relay Management** - Relay-Health-Monitoring
- [ ] **Event Categories** - WordPress-Category Integration
- [ ] **Multi-Site Support** - WordPress Multisite Kompatibilität
- [ ] **Advanced Permissions** - Rollenbasierte Event-Berechtigungen
- [ ] **Export/Import** - Bulk-Event Management
- [ ] **Analytics** - Event-Statistiken im WordPress Dashboard

## Sicherheit

### Empfohlene Sicherheitsmaßnahmen:
- HTTPS für alle Relay-Verbindungen
- Starke WordPress-Passwörter
- Regular Plugin-Updates
- Backup der Nostr-Identitäten

### Private Key Management:
- Private Keys werden verschlüsselt in der WordPress-Datenbank gespeichert
- Nur für Server-seitige Event-Signierung verwendet
- Nie an Frontend übertragen

## Support

Bei Fragen oder Problemen:
- GitHub Issues: https://github.com/johappel/nostr-calendar-app/issues
- WordPress Support Forum
- Nostr Community Discord

## Lizenz

MIT License - siehe LICENSE Datei für Details.