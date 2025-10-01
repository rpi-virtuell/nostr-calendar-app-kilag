# Changelog - NIP-46 Bunker Upload Fix

## [2.1.0] - 2025-10-01 - ✅ WebP-Duplikate Fix

### 🎉 Fixed: NIP-96 WebP-Duplikate Problem

#### Problem
- NIP-96 Server erstellen automatisch WebP-Versionen der hochgeladenen Bilder
- Beide Dateien (Original + WebP) erschienen in der Liste
- WebP-Dateien mit Hash-Namen konnten nicht gelöscht werden (404 Not Found)

#### Fixed
- **Upload**: Bevorzugt Original-Datei aus `processing_url`
- **List**: Filtert Server-generierte WebP-Duplikate automatisch heraus
- **Delete**: Extrahiert Hash aus URL als Fallback für korrekte Löschung

#### Changed
- `uploadToNip96()`: Prüft `processing_url` nach Original-Datei
- `listBlossom()`: Filter für WebP-Dateien mit Hash-Namen (Pattern: `^[a-f0-9]{64}\.webp$`)
- `deleteFromBlossom()`: Hash-Extraktion aus URL wenn nicht in Metadaten
- Debug-Logging: `console.debug('[NIP-96] Upload response:')` zur Diagnose

#### Documentation
- **Neu**: `docs/nip96-webp-duplicates.md` - Vollständige Dokumentation des Problems & Lösung

---

## [2.0.0] - 2025-10-01 - ✅ PRODUCTION READY

### 🎉 Major Fix: NIP-46 Bunker Uploads funktionieren!

#### Added
- **Erhöhte Timeouts für NIP-46:**
  - Blossom Auth: 60 Sekunden Gesamt-Timeout
  - signEvent (kind 24242): 45 Sekunden
  - Retry: 45-90 Sekunden (dynamisch)
- **User-Feedback Warnings:**
  - Console-Warnung bei NIP-46 Detection
  - Hinweis auf bis zu 60 Sekunden Wartezeit
  - Retry-Indicator in Console
- **Debug-Tool:** `window.testBlossomAuth()` zum Testen der Bunker-Permissions
- **Protocol-aware Delete:** NIP-96 vs Blossom unterschiedliche Endpoints
- **Dokumentation:**
  - `docs/nip46-success-story.md` - Success Story & Lessons Learned
  - `docs/nip46-bunker-permissions.md` - Aktualisierte Timeouts
  - `docs/nip46-quick-fix.md` - Quick Reference
  - `BUNKER-UPLOAD-FIX.md` - Hauptdokumentation

#### Changed
- **Pubkey-Handling:** pubkey wird jetzt IMMER für NIP-46 Events gesetzt
  - Vorher: `hasPubkey= false`
  - Nachher: `hasPubkey= true` ✅
- **Timeout-Hierarchie:**
  - kind 24242/24133: max 45 Sekunden (vorher 20s)
  - Andere Kinds: max 15 Sekunden (vorher 12s)
  - Retry: mindestens 45 Sekunden (vorher 20s)
- **Error Messages:** Spezifischere Fehlerbehandlung für NIP-46
  - Timeout-spezifische Hinweise
  - Permission-spezifische Lösungsvorschläge
  - Unterscheidung zwischen kind 24242/24133 und anderen Kinds

#### Fixed
- **❌ → ✅ Upload Timeouts:** NIP-46 Bunker bekommt jetzt ausreichend Zeit
- **❌ → ✅ Fehlender pubkey:** Events enthalten jetzt korrekten pubkey
- **❌ → ✅ Delete 404 Error:** NIP-96 verwendet jetzt korrekten Endpoint
- **❌ → ✅ Timeout-Begrenzung:** Hard-coded 10s Limit entfernt

---

## [1.2.0] - 2025-09-30

### Added
- **NIP-98 Authentication:** kind 24242 Support für Blossom/NIP-96
- **Retry-Logik:** Automatische Wiederholung bei NIP-46 Timeouts
- **Console-Logging:** Detaillierte Diagnose-Ausgaben

### Changed
- **Timeout von 5s auf 15s erhöht** (noch zu kurz für Bunker)
- **Bessere Fehlerbehandlung** in `createBlossomAuth()`

### Fixed
- **NIP-98 Auth Event Struktur:** Korrekte Tags (u, method, t, expiration)

---

## [1.1.0] - 2025-09-29

### Added
- **Multi-Server Support:** Config.mediaServers Array
- **Protocol Detection:** Blossom vs NIP-96 automatisch erkennen
- **Local Caching:** Bis zu 500 Uploads im localStorage

### Changed
- **Centralized Config:** Server-Liste in config.js statt hard-coded

---

## [1.0.0] - 2025-09-28

### Added
- **Initial Blossom Upload:** Basis-Funktionalität
- **NIP-96 Support:** files.sovbit.host Integration
- **Media Library UI:** Upload, List, Preview, Delete

### Known Issues
- ❌ NIP-46 Bunker Uploads schlagen fehl (Timeout)
- ❌ Fehlender pubkey in Events
- ❌ Delete verwendet falschen Endpoint

---

## Migration Guide

### Von 1.x zu 2.0

#### Erforderliche Schritte:

1. **Bunker-Permissions aktualisieren:**
   ```
   - Alte Version: Nur kind 1, 31923
   - Neue Version: kind 1, 31923, 24242 (WICHTIG!)
   ```

2. **localStorage Clear (optional):**
   ```javascript
   // Falls Probleme auftreten
   localStorage.removeItem('nip46_connected')
   localStorage.removeItem('nip46_connect_uri')
   ```

3. **Neu anmelden über NIP-46**

4. **Test ausführen:**
   ```javascript
   await window.testBlossomAuth()
   ```

#### Breaking Changes:

Keine! Die Änderungen sind abwärtskompatibel. NIP-07 funktioniert weiterhin wie bisher.

#### New Features:

- ✅ NIP-46 Bunker Uploads funktionieren
- ✅ Längere Timeouts (bis zu 60s)
- ✅ Bessere User-Feedback
- ✅ Protocol-aware Delete
- ✅ Debug-Tool

---

## Performance Improvements

### Version 1.x
- NIP-07 Upload: ~500-1000ms ✅
- NIP-46 Upload: ❌ Timeout nach 5-15s

### Version 2.0
- NIP-07 Upload: ~500-1000ms ✅
- NIP-46 Upload: 8-60s ✅ (funktioniert!)

**Improvement:** NIP-46 funktioniert jetzt, auch wenn es langsamer ist als NIP-07.

---

## Testing Status

### Version 2.0.0

| Feature | NIP-07 | NIP-46 | Status |
|---------|--------|--------|--------|
| Upload | ✅ | ✅ | PASS |
| Delete | ✅ | ✅ | PASS |
| List | ✅ | ✅ | PASS |
| Preview | ✅ | ✅ | PASS |
| Cache | ✅ | ✅ | PASS |
| Debug Tool | ✅ | ✅ | PASS |

**Test Environment:**
- Browser: Firefox 118, Chrome 117
- Bunker: nsec.app
- Server: files.sovbit.host (NIP-96)
- Date: 2025-10-01

---

## Known Limitations

### NIP-46 Performance
- **First signature after connect:** 30-60 seconds (by design)
- **Subsequent signatures:** 8-25 seconds
- **Reason:** Remote signing over relay with user confirmation

### Workarounds
- ✅ Use NIP-07 (nos2x) for faster uploads
- ✅ Wait patiently for NIP-46 signatures
- ✅ Keep Bunker app open in background

---

## Future Roadmap

### Planned Features (v2.1)
- [ ] Progress bar for NIP-46 uploads
- [ ] Batch upload support
- [ ] NIP-94 File Metadata events
- [ ] Server health check before upload
- [ ] Automatic permission check on connect

### Under Consideration
- [ ] Multiple server fallback
- [ ] Offline upload queue
- [ ] Upload resume after network error
- [ ] Image optimization before upload

---

## Credits

**Contributors:**
- Developer: Implementation & Testing
- AI Assistant: Code Review & Documentation

**Special Thanks:**
- nostr-tools team for NIP-46 support
- files.sovbit.host for reliable NIP-96 server
- nsec.app for Bunker implementation

---

## Support

**Issues:** https://github.com/johappel/nostr-calendar-app/issues
**Docs:** `docs/` folder in repository
**Debug:** `window.testBlossomAuth()` in browser console

---

## License

Same as main project (check repository root)
