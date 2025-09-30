# Subscriptions (People Lists) – Nutzung und Teilen

Dieses Dokument erklärt, wie die Abonnements (People Lists) in der App funktionieren, wie du eigene Listen verwaltest und wie du Listen mit anderen teilst.

## Begriffe

- People List (NIP‑51): Eine Liste von Personen ("p"‑Tags), in Nostr als ersetzbares Event (kind 30000) mit einem Identifier `d` veröffentlicht.
- d (Identifier): Der Name/Schlüssel deiner Liste, z. B. `grundschule`. Er ist nur innerhalb deines Accounts eindeutig.
- Owner: Der Nostr‑Account (Pubkey), der die Liste veröffentlicht hat.

Eine Liste ist eindeutig durch das Paar `(owner, d)`.

## Wo werden Abos gespeichert?

- Nicht eingeloggt: lokal (localStorage), mit Seeds aus `Config.allowedAuthors`.
- Eingeloggt: ausschließlich on‑chain in Nostr als NIP‑51 People List (kind 30000 + `d`).(People Lists) – Nutzung und Teilen

Dieses Dokument erklärt, wie die Abonnements (People Lists) in der App funktionieren, wie du eigene Listen verwaltest und wie du Listen mit anderen teilst.

## Begriffe

- People List (NIP‑51): Eine Liste von Personen ("p"‑Tags), in Nostr als ersetzbares Event (kind 30000) mit einem Identifier `d` veröffentlicht.
- d (Identifier): Der Name/Schlüssel deiner Liste, z. B. `grundschule`. Er ist nur innerhalb deines Accounts eindeutig.
- Owner: Der Nostr‑Account (Pubkey), der die Liste veröffentlicht hat.

Eine Liste ist eindeutig durch das Paar `(owner, d)`.

## Wo werden Abos gespeichert?

- Nicht eingeloggt: lokal (localStorage), mit Seeds aus `Config.allowedAuthors`.
- Eingeloggt: on‑chain in Nostr, bevorzugt als NIP‑51 People List (kind 30000 + `d`). Fallback ist Contacts (kind 3).

## Eigene Listen verwalten

- Sidebar → Abschnitt „Abonnements“
  - Dropdown „Meine Listen (NIP‑51)“: zeigt deine vorhandenen People‑Listen an; Auswahl wechselt die aktive Liste.
  - Feld „Weiteren npub abonnieren“: fügt eine Person zur aktiven Liste hinzu.

Die aktive Liste (ihr `d`) wird in `localStorage` gemerkt.

## Liste teilen

Du kannst einen Link teilen, der sowohl `d` als auch den Owner (als npub) enthält:

- Format: `?d=<identifier>&owner=<npub>`
- Beispiel: `https://example.org/?d=grundschule&owner=npub1...`

Wer den Link öffnet, lädt die People‑List des angegebenen Owners mit genau diesem `d` und sieht die Einträge. Freme Listen werden nicht überschrieben.

In der Sidebar gibt es einen „Teilen“‑Button, der die passende URL in die Zwischenablage kopiert.

## Fremde Liste als eigene speichern

Wenn du eine fremde Liste als Ausgangsbasis übernehmen möchtest:

1. Öffne den geteilten Link (oder wähle die Liste über `?d=&owner=` aus).
2. Klicke „Als eigene Liste speichern“.
3. Optional: gib der Liste einen Namen.

Damit wird die Liste unter deinem Account (Owner = du) mit dem aktuellen `d` veröffentlicht. Danach kannst du sie normal pflegen.

## URL‑Parameter

- `?d=…` bzw. `?list=…` – wählt den Identifier (d) der Liste.
- `?owner=…` bzw. `?author=…` – wählt den Owner der Liste (npub oder hex). Wenn gesetzt und ungleich deinem Account, wird die Liste nur gelesen.
- `?subscribe=npub1…` – fügt nach Bestätigung einen npub zur aktiven Liste hinzu.

## Hinweise zu Eindeutigkeit

- d muss nur pro Owner eindeutig sein. Zwei Accounts können beide `d=grundschule` verwenden. Eindeutigkeit ist gewährleistet durch (owner, d).
- Optional kann man Namespaces in d nutzen (z. B. `@alice/grundschule`), nötig ist das nicht.

## naddr (optional)

naddr ist ein NIP‑19 kodierter Verweis auf ein ersetzbares Event (z. B. People‑List, kind 30000) und enthält u. a. `kind`, `pubkey` und `d`. Damit kann eine Liste ebenfalls eindeutig adressiert und geteilt werden. 

Aktuell nutzt die App geteilte Links mit `?d=&owner=`, weil das ohne zusätzliche Kodierung funktioniert. Eine künftige Erweiterung könnte naddr erzeugen und parsen, um Links noch portabler zu machen.

## Listen zurücksetzen

Du kannst alle gespeicherten Listen und zugehörigen Daten löschen:

- Über die JavaScript-Konsole: `Subscriptions.reset()`
- Dies löscht:
  - Alle lokalen Abonnements (localStorage)
  - Aktive Listen-IDs und Metadaten
  - Gecachte Autorennamen und -metadaten
  - Stoppt alle laufenden Subscriptions

**Achtung:** Diese Operation kann nicht rückgängig gemacht werden. Die Listen auf Nostr bleiben erhalten, aber lokale Referenzen werden gelöscht.

## Troubleshooting

- Liste wird nicht gespeichert: Prüfe, ob du eingeloggt bist und ob die Liste nicht von einem fremden Owner stammt (fremde Listen sind schreibgeschützt).
- Teilen‑Button kopiert nicht: Browser‑Clipboard braucht HTTPS oder user gesture; sonst manuell URL aus der Adresszeile kopieren.
- Alle Listen sind weg: Verwende `Subscriptions.reset()` nur bei Problemen. Die Listen auf Nostr bleiben bestehen - einfach erneut einloggen.
