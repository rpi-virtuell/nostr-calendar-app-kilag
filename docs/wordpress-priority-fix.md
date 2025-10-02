# Auth Plugin Priority System - Quick Fix

**Datum:** 2. Oktober 2025  
**Problem:** WordPress wurde nicht als Primary Auth Plugin erkannt  
**Ursache:** Fehlende `getPriority()` Methode

## Problem

WordPress war eingeloggt, aber `AuthManager.currentPlugin` zeigte `nostr` statt `wordpress`. Das führte dazu, dass die falsche Auth-Methode aktiv war.

### Debugging-Logs zeigten:
```javascript
[AuthManager] Active plugin changed: none → nostr
[AuthManager] UI current plugin: nostr  // ❌ Sollte wordpress sein!
```

## Root Cause

Die `AuthPluginRegistry.getPrimary()` Methode wählt das Plugin mit der **höchsten Priorität**:

```javascript
async getPrimary() {
  const active = await this.getActive();
  return active[0] || null;  // active ist nach Priorität sortiert
}

async getActive() {
  const active = [];
  for (const plugin of this.plugins.values()) {
    if (await plugin.isLoggedIn()) {
      active.push(plugin);
    }
  }
  // Sortierung: Höchste Priorität zuerst
  return active.sort((a, b) => b.getPriority() - a.getPriority());
}
```

### Prioritäten:

| Plugin | getPriority() | Status |
|--------|---------------|--------|
| **NostrAuthPlugin** | `10` | ✅ Implementiert |
| **WordPressAuthPlugin** | `0` (default) | ❌ Nicht implementiert |
| **KeycloakAuthPlugin** | `15` | ✅ Implementiert |

**Problem:** WordPress hatte die niedrigste Priorität (0), obwohl es aktiv war!

## Lösung

`getPriority()` Methode in `WordPressAuthPlugin` hinzugefügt:

```javascript
// js/auth/WordPressAuthPlugin.js

/**
 * Get priority for this auth plugin
 * WordPress SSO should have higher priority than Nostr when active
 * @returns {number} Priority (higher = preferred)
 */
getPriority() {
  // WordPress SSO has priority 20 (higher than Nostr's 10)
  // This ensures WordPress is the primary auth when logged in
  return 20;
}
```

### Neue Prioritäten:

| Plugin | getPriority() | Priorität |
|--------|---------------|-----------|
| **WordPressAuthPlugin** | `20` | 🥇 Höchste (SSO) |
| **KeycloakAuthPlugin** | `15` | 🥈 Mittel (Enterprise SSO) |
| **NostrAuthPlugin** | `10` | 🥉 Standard (Fallback) |

## Erwartetes Verhalten

### Szenario 1: Nur WordPress eingeloggt
```javascript
[AuthManager] Active plugins: wordpress (priority: 20)
[AuthManager] Active plugin changed: none → wordpress (priority: 20)
✅ WordPress ist Primary Plugin
```

### Szenario 2: WordPress + Nostr eingeloggt
```javascript
[AuthManager] Active plugins: wordpress (priority: 20), nostr (priority: 10)
[AuthManager] Active plugin changed: none → wordpress (priority: 20)
✅ WordPress ist Primary Plugin (höhere Priorität)
```

### Szenario 3: Nur Nostr eingeloggt
```javascript
[AuthManager] Active plugins: nostr (priority: 10)
[AuthManager] Active plugin changed: none → nostr (priority: 10)
✅ Nostr ist Primary Plugin (einziges aktives Plugin)
```

### Szenario 4: WordPress Logout → Nostr bleibt
```javascript
[AuthManager] Active plugins: nostr (priority: 10)
[AuthManager] Active plugin changed: wordpress → nostr (priority: 10)
✅ Nostr wird Primary Plugin (WordPress ausgeloggt)
```

## Debugging

Neue Debug-Logs in `refreshActivePlugin()`:

```javascript
async refreshActivePlugin() {
  // Debug: Show all active plugins with priorities
  const allActive = await authRegistry.getActive();
  console.debug('[AuthManager] Active plugins:', 
    allActive.map(p => `${p.name} (priority: ${p.getPriority()})`).join(', ')
  );
  
  const primary = await authRegistry.getPrimary();
  console.log(`[AuthManager] Active plugin changed: ${oldPlugin?.name} → ${primary?.name}${primary ? ` (priority: ${primary.getPriority()})` : ''}`);
}
```

**Output bei WordPress-Login:**
```
[AuthManager] Active plugins: wordpress (priority: 20)
[AuthManager] Active plugin changed: none → wordpress (priority: 20)
```

## Vorteile

### ✅ Korrekte Plugin-Auswahl
WordPress wird jetzt immer bevorzugt, wenn aktiv

### ✅ Klare Hierarchie
```
WordPress SSO (20) > Enterprise SSO (15) > Nostr (10) > Base (0)
```

### ✅ Flexibel erweiterbar
Neue Auth-Plugins können einfach Prioritäten definieren:

```javascript
// Hypothetisches OAuth Plugin
getPriority() {
  return 25; // Höher als WordPress
}
```

### ✅ Besseres Debugging
Logs zeigen jetzt Prioritäten an

## Vergleich: Vorher vs. Nachher

### Vorher ❌
```javascript
// WordPress eingeloggt, aber Nostr wird gewählt
isLoggedIn: wordpress ✅
isLoggedIn: nostr ✅

getPriority: wordpress → 0  (default)
getPriority: nostr → 10

Sortiert: [nostr (10), wordpress (0)]
Primary: nostr ❌ FALSCH!
```

### Nachher ✅
```javascript
// WordPress eingeloggt und wird korrekt gewählt
isLoggedIn: wordpress ✅
isLoggedIn: nostr ✅

getPriority: wordpress → 20
getPriority: nostr → 10

Sortiert: [wordpress (20), nostr (10)]
Primary: wordpress ✅ RICHTIG!
```

## Testing

### Browser Console
```javascript
// Prüfe aktuelle Plugins
const active = await authRegistry.getActive();
console.log('Active plugins:', active.map(p => 
  `${p.name}: ${p.getPriority()}`
));

// Prüfe Primary Plugin
const primary = await authRegistry.getPrimary();
console.log('Primary:', primary?.name, 'Priority:', primary?.getPriority());

// Prüfe AuthManager
console.log('Current Plugin:', authManager.currentPlugin?.name);
```

**Erwartetes Ergebnis (WordPress eingeloggt):**
```
Active plugins: ["wordpress: 20", "nostr: 10"]
Primary: wordpress Priority: 20
Current Plugin: wordpress
```

## Verwandte Dateien

- **Geändert:** `js/auth/WordPressAuthPlugin.js` (+8 Zeilen)
- **Geändert:** `js/auth/AuthManager.js` (+3 Zeilen Debug-Logs)
- **Referenz:** `js/auth/AuthPluginInterface.js` (getPriority Interface)
- **Referenz:** `js/auth/NostrAuthPlugin.js` (Priority: 10)

## Nächste Schritte

Optional könnten weitere Verbesserungen hinzugefügt werden:

1. **Dynamische Prioritäten** basierend auf Kontext
2. **User-Präferenzen** für bevorzugte Auth-Methode
3. **Admin-UI** zum Setzen von Prioritäten
4. **Plugin-Whitelist/Blacklist** für bestimmte Seiten

## Status

✅ **Implementiert**  
✅ **Getestet**  
✅ **Dokumentiert**

---

**Branch:** `uix`  
**Type:** Bug Fix  
**Breaking Changes:** None
