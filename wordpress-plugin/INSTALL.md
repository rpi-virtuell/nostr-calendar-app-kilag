# Nostr Calendar WordPress Plugin - Installation

## ✅ Installation erfolgreich!

Ihr WordPress Plugin ist jetzt installiert und kann verwendet werden.

## 🔄 Aktueller Status: Entwicklungsmodus

Das Plugin läuft aktuell im **Fallback-Modus** mit vereinfachter Kryptographie:
- ✅ Grundfunktionen verfügbar
- ✅ Event-Erstellung möglich  
- ✅ WordPress-Integration funktional
- ⚠️ Kryptographie vereinfacht (nur für Entwicklung/Demo)

## 🚀 Nächste Schritte

### 1. Plugin in WordPress aktivieren
```bash
# Plugin-Ordner nach WordPress kopieren
cp -r wordpress-plugin /path/to/wordpress/wp-content/plugins/nostr-calendar
```

### 2. WordPress Admin-Interface
1. Gehen Sie zu **WordPress Admin → Plugins**
2. Aktivieren Sie **"Nostr Calendar"**
3. Gehen Sie zu **Settings → Nostr Calendar**
4. Konfigurieren Sie Ihre Nostr-Relays

### 3. Shortcode verwenden
```php
// Vollständiger Kalender
[nostr_calendar theme="light" view="month"]

// Benutzer-spezifischer Kalender
[nostr_user_calendar readonly="true"]
```

## 🔒 Für Produktionsumgebung (optional)

Um echte secp256k1-Kryptographie zu aktivieren:

### 1. GMP Extension installieren
```bash
# Ubuntu/Debian
sudo apt-get install php-gmp

# CentOS/RHEL
sudo yum install php-gmp

# Windows (XAMPP)
# Uncomment extension=gmp in php.ini
```

### 2. Crypto-Libraries installieren
```bash
cd wordpress-plugin
composer require kornrunner/secp256k1
```

### 3. Status prüfen
Nach der Installation zeigt **Settings → Nostr Calendar** den Produktionsstatus an.

## 📋 Plugin-Features

### ✅ Verfügbare Funktionen:
- **WordPress SSO Integration** - Nutzt bestehende WP-Benutzer
- **Event-Erstellung** - Termine über WordPress-Interface
- **Nostr-Publishing** - Events werden zu Relays gesendet
- **Responsive UI** - Modernes Calendar-Interface
- **Admin-Interface** - Relay-Konfiguration
- **Shortcode-Support** - Einfache Integration in Seiten

### 🔧 API-Endpoints:
- `GET /wp-json/nostr-calendar/v1/me` - Benutzer-Status
- `POST /wp-json/nostr-calendar/v1/event` - Event erstellen
- `DELETE /wp-json/nostr-calendar/v1/event/{id}` - Event löschen
- `GET /wp-json/nostr-calendar/v1/sso-status` - SSO-Status

## 🎯 Migration von Node.js

Wenn Sie vom Node.js Server migrieren möchten:

### 1. Frontend anpassen
```javascript
// In app.js ersetzen:
import { WordPressAuthPlugin } from './auth/WordPressAuthPlugin.js';
// Mit:
import { WordPressPluginAuth } from './assets/js/WordPressPluginAuth.js';

// Plugin-Registrierung:
const wpPlugin = new WordPressPluginAuth();
authRegistry.register('wordpress', wpPlugin);
```

### 2. URLs anpassen
```javascript
// Alt: http://localhost:8787/wp-calendar/event
// Neu: /wp-json/nostr-calendar/v1/event
```

## 🐛 Troubleshooting

### Plugin nicht sichtbar?
- Prüfen Sie Dateiberechtigungen
- Kontrollieren Sie WordPress-Logs

### Crypto-Warnung?
- Normal im Entwicklungsmodus
- Für Produktion: ext-gmp installieren

### Events werden nicht publiziert?
- Prüfen Sie Relay-URLs in Settings
- Kontrollieren Sie Netzwerk-Verbindungen

## 📞 Support

- GitHub Issues: https://github.com/johappel/nostr-calendar-app/issues
- WordPress-Community: wp.org Support Forums

---

**Ihr Plugin ist einsatzbereit! 🎉**