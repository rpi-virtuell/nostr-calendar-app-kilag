# nostr Funktionen

## Übersicht

Die `nostr.js, nostr-utils.js und bunker.js` wurden refaktorisiert. 

## Neue Architektur

### Dateistruktur

```
js/
├── nostr.js          (~678 Zeilen)
│   ├── NostrClient (ohne Bunker-spezifische Logik)
│   ├── Allgemeine Nostr-Funktionalität
│   ├── Pool & WebSocket Management
│   └── Delegation an BunkerManager
├── bunker.js         (~500 Zeilen)
│   ├── BunkerManager Klasse
│   ├── Bunker-spezifische Methoden
│   ├── UI-Funktionen (Modal, Events)
│   └── Debug-Helper
└── nostr-utils.js    (~200 Zeilen)
    ├── Allgemeine Nostr-Utilities
    └── Bunker-spezifische Utilities
```

### Module-Verantwortlichkeiten

#### `nostr.js`
- **NostrClient Klasse**: Allgemeine Nostr-Funktionalität
- **Auth-Methoden**: NIP-07, Local Key, nsec
- **Event-Verarbeitung**: publish, fetchEvents
- **Pool Management**: WebSocket-Verbindungen
- **Relay-Auswahl**: `pickFastestRelay()` für optimale Relay-Performance
- **Delegation**: `connectBunker()` delegiert an `BunkerManager`

#### `bunker.js`
- **BunkerManager Klasse**: Komplette NIP-46/Bunker Logik
- **connectBunker()**: Vollständige Bunker-Verbindung
- **signEventWithTimeoutBunker()**: Bunker-spezifische Signatur
- **UI-Funktionen**: Modal, Event-Handler
- **Debug-Funktionen**: Test-Helper, Logging

#### `nostr-utils.js`
- **Allgemeine Utilities**: hex/bytes Konvertierung, npub/nsec
- **Relay-Utilities**:
  - `pickFastestRelay()`: Standalone-Funktion für Relay-Auswahl
  - `preflightRelay()`: Schneller Relay-Test
- **Bunker Utilities**:
  - `loadNip46Module()`: NIP-46 Modul laden
  - `createBunkerSigner()`: BunkerSigner mit Debug-Wrappern
  - `wrapBunkerPoolPublish()`: Debug-Wrapper für pool.publish
  - `wrapBunkerSendRequest()`: Debug-Wrapper für sendRequest

## Abwärtskompatibilität

### Öffentliche APIs
Alle öffentlichen APIs bleiben unverändert:

```javascript
// Funktioniert weiterhin wie zuvor
client.connectBunker(uri, options);
client.signEventWithTimeout(event, timeout);
client.login();
client.publish(data);

// NEU: Schnellsten Relay auswählen
const fastestRelay = await client.pickFastestRelay(relays, options);
```

### Event-Listener
Alle bestehenden Event-Listener funktionieren weiterhin:

```javascript
// Diese Events bleiben unverändert
window.addEventListener('nip46-connected', handler);
window.addEventListener('nip46-auth-url', handler);
window.addEventListener('nip46-connect-started', handler);
```

### Debug-Helper
Globale Debug-Funktionen bleiben verfügbar:

```javascript
// Funktioniert weiterhin
window.nip46.openLastAuth();
window.nip46.testSign(kind);
window.nip46.testSignKinds(...kinds);
```

## Interne Änderungen

### NostrClient Erweiterungen
```javascript
export class NostrClient {
  constructor() {
    // ... bestehende Properties
    this.bunker = new BunkerManager(this); // NEU
    
    // Speed helpers (memo)
    this.fastRelay = null;         // gemessener schnellster Relay
    this.fastProbeAt = 0;          // timestamp der letzten Messung
    this.fastProbeTTL = 5 * 60e3;  // 5 Minuten Cache
  }
  
  // Delegation für Abwärtskompatibilität
  async connectBunker(connectURI, options = {}) {
    return this.bunker.connectBunker(connectURI, options);
  }
  
  // NEU: Schnellsten Relay ermitteln
  async pickFastestRelay(relays, { capMs = 1200, fastRelay, fastProbeAt, fastProbeTTL }) {
    // Implementierung: WebSocket-Race zur Geschwindigkeitsmessung
    // mit Caching für Performance-Optimierung
  }
}
```

### BunkerManager Klasse
```javascript
export class BunkerManager {
  constructor(nostrClient) {
    this.client = nostrClient;
    // Bunker-spezifische Properties
    this._nip46Connecting = false;
    this._signQueue = Promise.resolve();
    this._bunker = null;
  }
  
  // Vollständige Bunker-Logik
  async connectBunker(connectURI, { openAuth = true } = {}) {
    // Komplette Implementierung aus NostrClient
  }
  
  async signEventWithTimeoutBunker(evt, timeoutMs = 8000) {
    // Bunker-spezifische Signatur-Logik
  }
}
```

## Import-Beziehungen

### Neue Import-Struktur
```javascript
// nostr.js
import { BunkerManager } from './bunker.js';

// bunker.js  
import { loadNip46Module, preflightRelay, createBunkerSigner, wrapBunkerPoolPublish, wrapBunkerSendRequest } from './nostr-utils.js';

// nostr-utils.js
// Keine neuen Abhängigkeiten
```

### Bestehende Importe bleiben unverändert
```javascript
// app.js, author.js, blossom.js, etc.
import { client } from './nostr.js'; // Unverändert
```

## Verwendung von pickFastestRelay

### Grundlegende Verwendung
```javascript
// Einfache Relay-Auswahl
const relays = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social'];
const fastestRelay = await client.pickFastestRelay(relays);
console.log('Schnellster Relay:', fastestRelay);
```

### Mit Caching-Optionen
```javascript
// Mit benutzerdefinierten Caching-Optionen
const options = {
  capMs: 2000,              // Maximale Wartezeit (Standard: 1200ms)
  fastRelay: client.fastRelay,    // Vorheriger schnellster Relay
  fastProbeAt: client.fastProbeAt, // Zeit der letzten Messung
  fastProbeTTL: 10 * 60e3   // Cache-Dauer (Standard: 5 Minuten)
};

const fastestRelay = await client.pickFastestRelay(relays, options);
// client.fastRelay und client.fastProbeAt werden automatisch aktualisiert
```

### In subscriptions.js verwendet
```javascript
// Beispiel aus subscriptions.js
const relay = await client.pickFastestRelay(Config.relays, {
  capMs: 1200,
  fastRelay: client.fastRelay,
  fastProbeAt: client.fastProbeAt,
  fastProbeTTL: client.fastProbeTTL
}).catch(() => Config.relays[0]);

// Verwendung für schnelle Anfragen
const events = await client.listByWebSocketOne(relay, filter, 2500);
```

### Performance-Optimierung
Die Methode verwendet:
- **WebSocket-Race**: Mehrere Relays werden parallel getestet
- **Caching**: Ergebnisse werden für 5 Minuten zwischengespeichert
- **Fallback**: Bei Fehlern wird der erste Relay aus der Liste verwendet
- **Limitierung**: Maximal 4 Relays werden getestet (Performance)
