# WordPress SSO Integration für Nostr Calendar App

## Problem
Die WordPress Plugin SSO Integration führte zu einem 404-Fehler, weil die Nostr Calendar App keinen `/wp-sso` Endpunkt hatte.

## Lösung
Eine client-seitige SSO-Lösung wurde implementiert, die WordPress Tokens direkt im Frontend verarbeitet.

## Implementierte Dateien

### 1. wp-sso.html
- **Pfad**: `/wp-sso.html` 
- **Zweck**: Verarbeitet WordPress SSO Tokens und leitet zur Haupt-App weiter
- **Funktionen**:
  - Dekodiert und validiert WordPress SSO Tokens
  - Speichert Session-Daten in localStorage
  - Leitet zur Haupt-App mit Erfolgsparametern weiter
  - Zeigt Benutzerfreundliche Fehler- und Erfolgsmeldungen

### 2. WordPressAuthPlugin.js (erweitert)
- **Pfad**: `/js/auth/WordPressAuthPlugin.js`
- **Änderungen**:
  - `checkLocalSession()`: Liest WordPress SSO Session aus localStorage
  - `generateDeterministicPubkey()`: Erzeugt deterministische Pubkeys für WordPress Users
  - Client-seitige Token-Verarbeitung anstatt Server-API-Aufrufe
  - Angepasste `login()` Methode für direkte Token-Verarbeitung

### 3. nostr-calendar-sso.php (angepasst)
- **Pfad**: `/wordpress-plugin/nostr-calendar-sso.php`
- **Änderungen**:
  - Redirect-URL geändert von `/wp-sso?token=` zu `/wp-sso.html?token=`
  - iFrame-URL im Shortcode angepasst

## Workflow

1. **WordPress Plugin generiert Token**:
   ```php
   $token = $this->generate_nostr_token($user_id);
   $url = $this->calendar_app_url . '/wp-sso.html?token=' . $token;
   ```

2. **SSO-Seite verarbeitet Token**:
   ```javascript
   const payload = JSON.parse(atob(tokenData));
   const sessionData = { /* user data */ };
   localStorage.setItem('wp_sso_session', JSON.stringify(sessionData));
   ```

3. **Weiterleitung zur Haupt-App**:
   ```javascript
   window.location.href = '/?wp_sso=success&user=' + encodeURIComponent(username);
   ```

4. **WordPressAuthPlugin aktiviert sich**:
   ```javascript
   await this.checkLocalSession(); // Liest localStorage
   this.currentSession = sessionData;
   ```

## Testen

### WordPress Admin Test
1. Besuche: `https://test1.rpi-virtuell.de/wp-admin/options-general.php?page=nostr-calendar-sso`
2. Klicke "Token generieren & testen"
3. Kopiere den Token aus der JSON-Response

### Direkte SSO-Test
1. Besuche: `https://test1.rpi-virtuell.de/nostr-calendar/wp-sso.html?token=[TOKEN]`
2. Die Seite sollte das Token verarbeiten und zur Haupt-App weiterleiten
3. In der Haupt-App sollte der WordPress-User angemeldet sein

### Shortcode Test  
1. Füge `[nostr_calendar]` zu einer WordPress-Seite hinzu
2. Der iFrame sollte automatisch den aktuellen WordPress-User authentifizieren

## Token-Format

WordPress SSO Token besteht aus:
```
base64(JSON_PAYLOAD) + '.' + HMAC_SHA256_SIGNATURE
```

Payload enthält:
```json
{
  "wp_user_id": 4,
  "wp_username": "joachim-happel", 
  "wp_email": "joachim.happel@gmail.com",
  "wp_display_name": "joachim-happel",
  "wp_roles": ["subscriber"],
  "timestamp": 1757860311,
  "expires": 1757867511,
  "wp_site_url": "https://test1.rpi-virtuell.de"
}
```

## Sicherheit

- Token sind HMAC-SHA256 signiert
- 2-Stunden Ablaufzeit
- Deterministische aber eindeutige Pubkey-Generierung pro WordPress User
- Session-Daten nur in localStorage (client-seitig)

## Nächste Schritte

1. **Produktionstest**: Teste die Integration mit echten WordPress-Usern
2. **Event-Publishing**: Implementiere Backend-Endpoint für WordPress-User Events
3. **Session-Management**: Erweitere Session-Verwaltung für längere Gültigkeit
4. **Error-Handling**: Verbessere Fehlerbehandlung und User-Feedback
