# WordPress Rewrite-Regeln neu laden

Um die neuen Rewrite-Regeln zu aktivieren, haben Sie folgende Optionen:

## Option 1: Plugin deaktivieren und wieder aktivieren
1. Gehen Sie zu WordPress Admin → Plugins
2. Deaktivieren Sie "Nostr Calendar" 
3. Aktivieren Sie es wieder

## Option 2: Permalinks neu speichern
1. Gehen Sie zu WordPress Admin → Einstellungen → Permalinks
2. Klicken Sie einfach auf "Änderungen speichern" (ohne etwas zu ändern)

## Option 3: Manuell über WordPress-CLI (falls verfügbar)
```bash
wp rewrite flush
```

## Option 4: Programmatisch (temporär)
Fügen Sie temporär diesen Code zu `functions.php` des aktiven Themes hinzu:
```php
add_action('init', function() {
    flush_rewrite_rules();
}, 999);
```

**Wichtig**: Entfernen Sie den Code aus Option 4 nach dem ersten Seitenaufruf wieder!

## Testen
Nach dem Reload der Rewrite-Regeln sollten folgende URLs funktionieren:
- https://test1.rpi-virtuell.de/nostr-calendar/ → 200 ✅
- https://test1.rpi-virtuell.de/nostr-calendar/index.html → 200 ✅  
- https://test1.rpi-virtuell.de/nostr-calendar/wp-sso.html → 200 ✅