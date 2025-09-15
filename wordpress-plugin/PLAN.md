Zusammenfassung und empfohlenes, sicheres Workflow‑Design für dein Szenario

Ausgangslage
- Institut Comnius besitzt einen zentralen nsec (Privat‑Key).
- Es gibt mehrere WordPress‑Blogs des Instituts; deren Benutzer sollen Events anlegen, die aber im Namen des Instituts (Comnius) veröffentlicht werden.

Empfehlung: NIP‑26 Delegation (vorzugsweise) — kurzbeschreibung und Ablauf
- Anstatt Comnius nsec an einzelne Blogs oder an den Server zu übergeben, signiert Comnius einmalig eine Delegation (NIP‑26) an einen oder mehrere delegatee Public Keys (z. B. Server‑Signing‑Keys der jeweiligen Blog‑Instanz).
- Der Server (delegatee) hält seinen eigenen Private Key sicher (HSM/KMS empfohlen) und signiert Events mit diesem Key; in den Events wird die Delegation angegeben.
- Relays / Empfänger, die NIP‑26 prüfen, können validieren, dass Comnius die Delegation für genau diesen delegatee und Zeitraum erteilt hat — daher gelten Events als vom Institut autorisiert, ohne dass Comnius nsec geteilt wurde.

Kurz-Workflow (Praktisch)
1. Comnius (einmalig):
   - Erzeugt Delegation: delegator = Comnius pubkey, delegatee = Server pubkey, Einschränkungen (z. B. expiry, erlaubte kinds).
   - Signiert Delegation mit nsec von Comnius.
   - Übergibt Delegation‑Blob an die Plugin‑Admin (oder lädt ihn in Admin UI hoch).
2. Plugin/Admin:
   - Speichert die Delegation‑Metadaten (nicht den nsec).
   - Optional: zeigt abgeleiteten Blog‑Pubkey an.
3. Server (delegatee):
   - Hält delegatee private key sicher (empfohlen: HSM / KMS; sonst zumindest serverseitig, nicht in DB in Klartext).
   - Beim Erstellen eines Events signiert der Server mit delegatee private key.
   - Fügt Delegation‑Tag ins Event ein (oder sendet Delegation mit).
4. Relays/Clients:
   - Prüfen Event‑Signatur (gehört zu delegatee pubkey).
   - Prüfen Delegation (die Comnius‑Signatur ist gültig und erlaubt delegatee pubkey).
   - Akzeptieren Event als autorisiert vom Institut.

Vorteile gegenüber nsec‑Upload
- Comnius nsec bleibt niemals geteilt.
- Delegation kann zeitlich und inhaltlich beschränkt werden.
- Einfachere Rotation (Delegation neu signieren, delegatee key rotieren).
- Besseres Sicherheitsmodell: nur delegatee privkey muss geschützt, und das ist serverseitig/zentralisierbar.

Praktische Varianten (du kannst wählen)
- Zentraler delegatee pro Institut: ein delegatee key für alle Blogs; Delegation gilt für alle Blogs → vereinfachtes Management.
- Per‑Blog delegatee: jeder Blog hat eigenen delegatee key; Comnius signiert Delegation(en) für alle delegatee keys → feingranularer Zugriff, einfachere Revocation pro Blog.

Ergänzende Sicherheitsmaßnahmen (Empfohlen)
- HSM/KMS für delegatee private keys (z. B. HashiCorp Vault, AWS KMS).
- Fallback: serverseitige Speicherung verschlüsselt mit PBKDF2/argon2 + AES‑GCM; strengere KDF statt einfacher Hashes.
- Minimale Rechte: Delegatee nur Berechtigung für Event‑Kinds, Ablaufzeit strikt setzen.
- Auditing / Logging für alle Veröffentlichungen im Namen des Instituts.
- Periodische Rotation von delegatee keys + Revoke‑Mechanismus (Comnius signiert neue Delegation, alte ungültig).

Implementations‑Punkte für dein Plugin (konkret)
- Admin UI: Möglichkeit, Delegation‑Blob hochzuladen / einzufügen, Delegation anzeigen.
  - Dateien/DB speichert nur die Delegation‑Metadaten (signed), nicht Comnius nsec.
  - UI zeigt abgeleiteten institute pubkey sowie Delegation Bedingungen (expiry).
- Server: Publisher nutzt delegatee private key (lokal/HSM) zum Signieren; fügt Delegation tag hinzu.
- REST API / Token: Token kann weiterhin calendar_pubkey zurückgeben; Events signiert der Server mit delegatee key.
- Falls du trotzdem nsec‑Upload erlauben willst, behalte das optional und implementiere strengere Verschlüsselung KDF + AES‑GCM.

Nützliche Referenzen in deinem Code (zum Öffnen)
- Frontend SSO: [`js/auth/WordPressAuthPlugin.js`](js/auth/WordPressAuthPlugin.js:1) — hier wird session/calendar_identity gehandhabt.
- Admin/Token/Upload: [`wordpress-plugin/nostr-calendar-sso.php`](wordpress-plugin/nostr-calendar-sso.php:1) — hier sind Uploads / Token-Generierung implementiert.
- Fallback-Crypto: [`wordpress-plugin/includes/class-simple-crypto.php`](wordpress-plugin/includes/class-simple-crypto.php:1) — Helper, kann erweitert werden.

Mermaid — vereinfachtes Ablaufdiagramm
graph LR
  A[Comnius - delegator] -->|signiert Delegation| B[Delegation-Blob]
  B -->|hochladen| C[WP Admin - Plugin]
  C -->|speichert Delegation| D[Server (delegatee)]
  D -->|signiert Event + fügt Delegation| E[Relay / Consumer]
  E -->|prüft Delegation + Signatur| F[Akzeptiert Event]

Nächste Schritte (konkret, ich kann umsetzen)
- a) Ich implementiere ein kleines Admin‑Tool zum Erzeugen/Importieren einer Delegation (PHP/JS), inkl. UI in [`wordpress-plugin/nostr-calendar-sso.php`](wordpress-plugin/nostr-calendar-sso.php:1). (Code‑Modus)
- b) Ich integriere serverseitiges Signieren in [`wordpress-plugin/includes/class-nostr-publisher.php`](wordpress-plugin/includes/class-nostr-publisher.php:1) unter Nutzung eines delegatee keys, und füge Delegation tag zu veröffentlichten Events hinzu. (Code‑Modus)
- c) Ich schreibe eine Schritt‑für‑Schritt Anleitung, wie Comnius lokal seine Delegation erzeugt (JS + CLI Beispiele). (Ask / Docs)

Wähle bitte eine Option (a, b, oder c) oder sage, ob du lieber zuerst eine detaillierte Sicherheits‑Checkliste und Migrations‑Roadmap wünschst. Ich setze das Gewünschte im nächsten Schritt um.