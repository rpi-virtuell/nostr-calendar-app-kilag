# NIP‑46 (Bunker) richtig nutzen – Signieren in der Kalender‑App

Diese Seite fasst die wichtigsten Hinweise für das Signieren über NIP‑46 (Bunker) in dieser App zusammen: Einrichtung, Ablauf, Diagnose und Troubleshooting.

## Voraussetzungen

- Ein Bunker‑Account/Signer (bunker:// oder nostrconnect:// URI)
- Relays in `js/config.js` (oder via URL‑Parameter `?relays=`/`?relay=`)
- Erlaubnisse im Bunker für die benötigten Event‑Kinds:
  - Kind 30000 (NIP‑51 „People List“ – für Abolisten)
  - Kind 3 (NIP‑02 „Contacts“ – nur als Fallback)
  - Optional: Kind 1 (Probe/Diagnose)

> Hinweis: Die App taggt Events mit `['client','nostr-calendar-demo']` (NIP‑78), hilfreich für Policies.

## Verbinden und freigeben

1) In der App NIP‑46 (Bunker) auswählen und mit deinem `bunker://…` (oder `nostrconnect://…`) verbinden.
2) Es öffnet sich (oder wird angezeigt) eine Bunker‑Auth‑URL. Dort unbedingt die Signatur‑Erlaubnis bestätigen.
3) Achte darauf, dass die Kinds 30000/3 in deinen Bunker‑Policies erlaubt sind (mindestens für diesen Client).

Die App speichert die letzte Auth‑URL unter `localStorage['nip46_last_auth_url']`. Du kannst sie jederzeit wieder öffnen.

```js
// Im Browser‑Konsolenfenster
window.nip46.openLastAuth();
```

## Signieren – was die App macht

- Events werden vor dem Signieren vorbereitet: `created_at`, `tags`, `content`; `id`/`sig` werden entfernt.
- Für NIP‑46 probiert die App zwei Varianten: zuerst „mit pubkey“, dann „ohne pubkey“.
- Nach einem Fehlschlag gibt es einen gezielten Retry (inkl. kurzer `getPublicKey`‑„Ping“ und optionalem Reconnect) und verlängertem Timeout (bis 20s), damit du in der Bunker‑UI freigeben kannst.
- Die App zeigt bei Bedarf einen Prompt, um die Bunker‑Auth‑Seite direkt zu öffnen.

## Diagnose: klappt das Signieren?

Die App bringt einfache Diagnose‑Helper mit, die du im Browser nutzen kannst:

```js
// Testet mehrere Kinds (Standard: 1, 3, 30000)
await window.nip46.testSignKinds();

// Teste gezielt ein Kind
await window.nip46.testSign(30000);
```

Interpretation:
- kind 1 ok, 30000/3 hängen → Bunker‑Policy erlaubt wahrscheinlich nur kind 1. Bitte 30000/3 freigeben.
- Alles hängt → Verbindung/Session prüfen (openLastAuth, Reconnect) oder Relays testen.

## Typische Log‑Zeilen (Konsole)

- Start: `[signEventWithTimeout] start kind= 30000 … signerType= nip46`
- RPC abgesendet: `[Bunker] signEvent() called kind= 30000`
- Timeout beim ersten Versuch: `nip46 signEvent threw before timeout`
- Retry mit Hinweis/Prompt und längerem Timeout.
- Erfolg: `[Bunker] signEvent() ok in … ms` → anschließend Publish an deine Relays.

## Troubleshooting

- „Hängt“ bei 30000/3, aber kind 1 funktioniert:
  - In der Bunker‑UI die Signatur für Kind 30000 (NIP‑51 People List) und ggf. 3 (Contacts) aktiv erlauben.
  - Danach erneut speichern.
- Popup wurde blockiert:
  - Die App kopiert die Auth‑URL in die Zwischenablage. Öffne sie manuell (oder `window.nip46.openLastAuth()`).
- Relays variieren/testen:
  - Per URL: `?relay=wss://relay.example` oder `?relays=wss://a,wss://b`
- Alternative Signer (zum Isolieren des Problems):
  - NIP‑07 Browser‑Erweiterung (z. B. Alby, nos2x)
  - Manueller nsec (Demo‑Variante; nur zu Testzwecken)

## Hinweise zu Subscriptions (Aboliste)

- Die App speichert bevorzugt als NIP‑51 People List (kind 30000, `d`‑Tag, `p`‑Tags, optional `name`/`description`).
- Schreibschutz: Geteilte fremde Listen werden nicht überschrieben; „Als eigene speichern“ legt eine eigene Liste an.
- Nach dem Speichern werden Listen neu geladen, damit die Auswahl sofort aktualisiert.

## Sicherheit

- Bevorzuge NIP‑07/NIP‑46; die manuelle nsec‑Eingabe ist nur für lokale Tests gedacht.
- Nutze HTTPS und vertrauenswürdige Relays.
- Bunker‑Policies bewusst und minimal halten (nur benötigte Kinds/Clients).

## Referenz – relevante Kinds

- 31923: NIP‑52 (Kalender‑Events; wird beim Erstellen/Bearbeiten/Löschen signiert)
- 30000: NIP‑51 (People List, für Subscriptions/Aboliste)
- 3: NIP‑02 (Contacts; nur Fallback)
- 1: Diagnose/Probe

---

Wenn eine Signatur weiter hängt: Auth‑URL öffnen, Policies prüfen, kurz `window.nip46.testSignKinds()` laufen lassen und die Konsole nach `[Bunker] signEvent()` / `signEventWithTimeout`‑Hinweisen checken. Danach sollte das Speichern deiner Liste und das Publizieren an die Relays erwartungsgemäß funktionieren.
