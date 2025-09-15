# Delegation Admin UI Mockup

Zweck:
- Admin kann eine per-blog NIP-26 Delegation einfügen oder hochladen.
- Delegation wird lokal validiert, Bedingungen werden lesbar dargestellt.
- Nur der Delegation-Blob wird gespeichert (kein nsec).

UI-Bereich: Einstellungen → Nostr Calendar → Delegation (per Blog)

Formular (oberer Bereich)
- Label: Delegation einfügen oder Datei hochladen
- Eingabefeld: multi-line textarea [Paste Delegation JSON array here]
- Datei-Upload: [Choose file] (optional, .txt/.json)
- Hinweistext: "Die Delegation muss extern signiert sein. Füge den Delegation-Tag als JSON array ein, z. B. ['delegation','<sig>','created_at>...','<delegator_pub>']."
- Hinweis: Ein praktisches Tool zum Erzeugen der Delegation ist https://nostrtool.com/ — dort kannst du den Delegation-Tag erzeugen und kopieren.
- Button: [Validate Delegation]

Validierungsbereich (nach Validate)
- Status: ✅ Valid / ❌ Ungültig (Fehlermeldung)
- Delegator Pubkey: a0867a3f... (aus Tag)
- Bedingungen (parsed):
  - created_at > 1757894400
  - created_at < 1760486400
  - allowed kinds: (wenn angegeben) 31923, 1
- Expiry (lesbar): 2026-xx-xx → 2026-yy-yy (berechnet aus timestamps)
- Hinweis: "Delegation erlaubt das Signieren von kinds: 31923, 1 bis Expiry. Prüfe die Werte vor dem Speichern."

Speicherbereich
- Checkbox: [x] Use delegation for this blog (toggle)
- Button: [Save Delegation] (nur enabled wenn Valid)
- Button: [Remove Delegation] (falls vorhanden)
- Audit: Zeile mit Zeitstempel wer gespeichert hat (admin user), z. B. "Gespeichert von admin@comnius am 2025-09-15 09:xx"

Sicherheits-Hinweise (sichtbar, klein, rot/orange)
- "Wichtig: Füge niemals dein nsec in dieses Formular ein. Erzeuge die Delegation extern (z. B. nostrtool.com) und füge nur den signierten Delegation-Tag ein."
- "Delegation-Blob wird gespeichert, nicht der nsec. Bewahre Delegation-Inhalte vertraulich, aber Delegation ist nur ein Public-Metadatensatz."

Technische Details für die Implementierung
- Validierung (JS):
  - Prüfe, ob Eingabe ein JSON array ist
  - Array[0] === 'delegation'
  - Array[1] hex sig length plausible, Array[3] delegator pubkey plausibel (64 hex)
  - Array[2] conditions string -> parsee "created_at>..&created_at<..&kind=..." -> extract timestamps and allowed kinds
- Anzeige: berechne human readable expiry aus created_at<.. timestamp
- Speicherung: update_option('nostr_calendar_delegation_blog_<blog_id>', array('blob' => <raw>, 'parsed' => <json>, 'saved_by' => <user_id>, 'saved_at' => time()))
- UI-Endpoint: ajax handler for save/remove with capability check current_user_can('manage_options')

Beispiel: Delegation-Tag
- Raw (paste): ['delegation','54a34007...','created_at>1757894400&created_at<1760486400','a0867a3f...']
- Parsed display:
  - Delegator: a0867a3f...
  - Conditions:
    - created_at between 2025-12-15 and 2026-01-13
    - allowed kinds: (if present) show list

Next steps (nach Mockup-Freigabe)
1. Implement admin UI in `wordpress-plugin/nostr-calendar-sso.php` (new section).
2. Add JS validator (enqueue script) that runs local validation and renders parsed data.
3. Add AJAX save/remove handlers (permissioned).
4. Integrate server publisher to include delegation tag in published events.
