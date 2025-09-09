# Authentifizierung (Login)

Kurzüberblick
- Die App unterstützt mehrere Login‑Methoden:
  - NIP-07 (Browser-Extensions / window.nostr)
  - Manueller nsec-Key (Bech32 `nsec1...` oder 64-hex)
  - NIP-46 / "Bunker" (nostrconnect / bunker URI)
- Der zentrale Client ist in [`js/nostr.js:49`](js/nostr.js:49) implementiert (Klasse `NostrClient`).
- Die UI-Logik für Login/Logout/Auto-Login ist in [`js/auth.js:1`](js/auth.js:1).

1) High-Level Ablauf (einfach)
- Nutzer klickt "Login" → die UI fragt die gewünschte Login‑Option ab.
- Die App versucht, einen Signer zu bekommen (ein Objekt, das öffentliche Schlüssel liefert und Events signiert).
- Nach erfolgreichem Login wird die Pubkey angezeigt (whoami) und Buttons werden entsprechend aktiviert/deaktiviert.
- **Ergänzung: Erkennen eines erfolgreichen Logins**
  - Die `login()` Methode gibt ein Objekt zurück, z. B. `{ method: 'nip07', pubkey: '...' }` oder `{ method: 'local', pubkey: '...' }`.
  - Prüfe den Rückgabewert: `pubkey` sollte ein gültiger 64-stelliger Hex-String sein (z. B. mit Regex `/^[0-9a-f]{64}$/i`).
  - Interne Zustände: Nach Erfolg sind `this.signer` (mit `type`, `getPublicKey` und `signEvent`) und `this.pubkey` gesetzt.
  - Für NIP-46: Höre auf das Custom-Event `'nip46-connected'` mit Details zur Pubkey.
  - Bei Fehlern wirft die Methode Ausnahmen (z. B. `'Pool not initialized'`); verwende `try/catch` zur Fehlerbehandlung.

2) NIP-07 (Extension) — wie es funktioniert & wo im Code
- Konzept: Browser-Extensions (z. B. nos2x) injizieren ein `window.nostr`-Objekt mit `getPublicKey()` und `signEvent()` Methoden.
- Code:
  - Die Funktion [`NostrClient.login()`](js/nostr.js:195) prüft zuerst `if (window.nostr && window.nostr.getPublicKey)`.
  - Wenn vorhanden wird `this.pubkey = await window.nostr.getPublicKey()` gesetzt und `this.signer` als Nip07-Signer (wrappe `window.nostr.signEvent`) angelegt.
  - Rückgabe: `{ method: 'nip07', pubkey }`.
- UI:
  - Der Button-Handler in [`js/auth.js:225`](js/auth.js:225) ruft `login()` auf und prüft `res.method === 'nip07'`, aktualisiert dann `whoami` und UI.
- **Ergänzung: Unterschied zur lokalen Signatur**
  - `window.nostr.signEvent(evt)` verwendet die Erweiterung für sichere Signatur; der private Schlüssel verlässt die Erweiterung nicht und erfordert oft Benutzerbestätigung.
  - Höhere Sicherheit im Vergleich zu lokalen Schlüsseln, die im Browser-Speicher gehalten werden.

3) Manueller nsec-Key (local/manual) — Idee & Sicherheit
- Idee: Benutzer gibt seinen privaten Schlüssel (nsec) per Prompt ein. App validiert Key (Bech32 oder Hex) und erstellt daraus Pubkey + Signer.
- Sicherheit:
  - Optionales Speichern: Der nsec kann mit einem Passwort per WebCrypto (PBKDF2 → AES-GCM) verschlüsselt und als Cookie/localStorage für 30 Tage abgelegt werden.
  - In einer Tab‑Session wird der entschlüsselte Key in sessionStorage gehalten (nur aktueller Tab).
  - Funktionen zum Verschlüsseln/Entschlüsseln sind in [`js/auth.js:69`](js/auth.js:69) (`encryptWithPassword`, `decryptWithPassword`).
- Code:
  - `NostrClient.loginWithNsec(nsec)` in [`js/nostr.js:224`](js/nostr.js:224) nimmt den nsec, konvertiert ihn via `nsecToHex` und erstellt `this.signer` mit `tools.finalizeEvent(evt, skBytes)`. Rückgabe `{ method: 'manual', pubkey }`.
  - UI: In [`js/auth.js:184`](js/auth.js:184) ist der Klick-Handler für manuellen Login. Dort:
    - `prompt()` für nsec
    - `client.loginWithNsec(nsec)` aufrufen
    - optionales Verschlüsseln + `setPersistentEncrypted('nostr_manual_nsec', enc, 30)` (speichert cookie + localStorage) — siehe [`js/auth.js:196`](js/auth.js:196).
  - Auto-Login: Beim Laden prüft die App, ob ein verschlüsselter Key vorhanden ist; nach einer Nutzer-Geste wird das Passwort per `prompt()` angefragt und der Key per `decryptWithPassword` entschlüsselt, dann `client.loginWithNsec` aufgerufen. Diese Logik steht in [`js/auth.js:249`](js/auth.js:249) und weiter.
- **Ergänzung: Unterschied zur NIP-07 Signatur**
  - `tools.finalizeEvent(evt, skBytes)` signiert lokal mit dem gespeicherten Schlüssel; weniger sicher, da der Schlüssel im Browser zugänglich ist und automatisch erfolgt.
  - Im Vergleich zu NIP-07: Keine Benutzerinteraktion, aber höheres Risiko für Schlüsselverlust.

4) NIP-46 / Bunker (externer Signer) — Ablauf & Code
- Idee: NIP-46 erlaubt das Verbinden mit externen Signern (z. B. Bunker). App startet einen BunkerSigner mit einem "connect URI". Der Signer zeigt (oder liefert) eine Autorisierungs-URL; Benutzer bestätigt in externem UI; die App pollt dann `getPublicKey()` bis Pubkey verfügbar ist.
- Code:
  - Implementiert in `NostrClient.connectBunker(connectURI, { openAuth })` in [`js/nostr.js:256`](js/nostr.js:256).
  - Schritte:
    - Parse/normalisiere connect URI (`parseBunkerInput` / `toBunkerURL`).
    - Erzeuge oder lade lokalen Client-Secret (`nip46_client_sk_hex`) für den Signer.
    - Optionaler Relay-Preflight (wählt schnellen Relay) — Funktion `preflightRelay`.
    - Erstelle `BunkerSigner` mit `onauth`-Callback. `onauth` öffnet die Autorisierungs-URL in einem Popup oder schreibt sie in die Zwischenablage — siehe [`js/nostr.js:336`](js/nostr.js:336).
    - Starte `bunker.connect()` im Hintergrund und poll `bunker.getPublicKey()` (bis 45s). Wenn Pubkey verfügbar → setze `this.signer` (type: 'nip46') und `this.pubkey`. Rückgabe `{ method: 'nip46', pubkey, relay }`.
  - UI:
    - Auto-Reconnect-Logik versucht gespeicherte `nip46_connect_uri` zu verwenden (z. B. in [`js/bunker.js:155`](js/bunker.js:155) `autoReconnectBunker`).

5) Gemeinsame Konzepte im Code
- Signer-Interface:
  - `this.signer` hat mindestens: `getPublicKey()` und `signEvent(evt)`. Siehe die verschiedenen Varianten in [`js/nostr.js:195`](js/nostr.js:195), [`js/nostr.js:236`](js/nostr.js:236), [`js/nostr.js:435`](js/nostr.js:435).
- Publizieren/Signieren:
  - Vor dem Publish wird überprüft, ob `this.signer` gesetzt ist; falls nicht, ruft `client.login()` auf. Signieren erfolgt durch `this.signer.signEvent(evt)` (siehe `NostrClient.publish()` in [`js/nostr.js:476`](js/nostr.js:476)).
- UI-Helpers:
  - `isLoggedIn()` in [`js/auth.js:101`](js/auth.js:101) prüft `!!(client && client.signer)`.
  - `updateAuthUI(...)` in [`js/auth.js:110`](js/auth.js:110) zeigt/verdeckt Buttons je nach Login-Zustand.
  - `updateWhoami(...)` in [`js/auth.js:163`](js/auth.js:163) holt Author-Meta und zeigt Namen/Trunked-Pubkey an.
- **Ergänzung: Schrittweise Erklärung der `login()` Methode**
  - Initialisiere Pool: `await this.initPool();`.
  - Prüfe NIP-07: Wenn verfügbar, hole Pubkey und setze Signer.
  - Fallback auf lokalen Schlüssel: Lade/generiere Schlüssel, setze lokalen Signer.
  - Rückgabe: Objekt mit Methode und Pubkey.

6) Security‑Hinweise (praktisch)
- Manueller Key ist mächtig: Wenn jemand Zugriff auf den Browser‑Speicher + Passwort hat, kann er posten. Deshalb:
  - Speichern nur wenn nötig und nur verschlüsselt mit starkem Passwort.
  - SessionStorage (nur Tab) ist sicherer als persistentes Speichern.
  - Für Production: NIP-07 oder NIP-46 bevorzugen, niemals unverschlüsselte Keys persistent abspeichern.
- WebCrypto wird für Verschlüsselung benutzt (`PBKDF2` + `AES-GCM`) in [`js/auth.js:57`](js/auth.js:57) ff.

7) Wichtige Dateiverweise (zum schnellen Nachschlagen)
- `NostrClient` (Login & Signer, publish, NIP-46): [`js/nostr.js:49`](js/nostr.js:49)
- Manueller Login & UI-Flow: [`js/auth.js:184`](js/auth.js:184) (Prompt → loginWithNsec → optional encrypt)
- Auto-Login (gestenbasierte Entschlüsselung): [`js/auth.js:249`](js/auth.js:249)
- NIP‑96 / NIP‑98 HTTP Auth (für Uploads): [`js/nip96.js:14`](js/nip96.js:14)
- README (Kurzdoku Auth/Arten): [`README.md:77`](README.md:77)
- Index (Login UI Buttons): [`index.html:42`](index.html:42)

8) FAQ — Kurzantworten
- "Woher weiß die App, mit welchem Signer zu signieren ist?"
  - Der aktive Signer steht in `client.signer`. Vor jedem Publish ruft `publish()` sicherheitshalber `await this.login()` auf, falls kein Signer existiert.
- "Was passiert bei Logout?"
  - `client.logout()` entfernt Signer + Pubkey; zusätzlich löscht `js/auth.js.logout()` gespeicherte Keys/Cookies/sessionStorage (`nostr_manual_nsec`, `nostr_sk_hex`, `nip46_connect_uri`).
- "Warum prompt() beim Speichern/Entschlüsseln?"
  - Browser blockieren automatisierte Prompts; die App wartet auf eine User-Geste bevor sie das Passwort-Prompt startet (sicherer UX).

Zusammenfassung
- Login ist in drei Hauptwege geteilt: NIP‑07 (Extension), manueller nsec-Key (local/manual) und NIP‑46 (Bunker).
- Das zentrale Objekt ist [`js/nostr.js`](js/nostr.js:49) (Klasse `NostrClient`); UI/Klick-Handler sind in [`js/auth.js`](js/auth.js:1).
- Für sichere Nutzung: NIP‑07 / NIP‑46 bevorzugen; manuellen Key nur verschlüsselt und mit Bedacht speichern.