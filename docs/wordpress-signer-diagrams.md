# WordPress Signer - Architektur-Diagramme

## System-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                     nostr-calendar-app                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    AuthManager                           │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │   Nostr      │  │  WordPress   │  │  Keycloak    │  │  │
│  │  │ AuthPlugin   │  │ AuthPlugin   │  │ AuthPlugin   │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  │         │                 │                  │          │  │
│  └─────────┼─────────────────┼──────────────────┼──────────┘  │
│            │                 │                  │             │
│            └─────────────────┴──────────────────┘             │
│                              │                                │
│                    ┌─────────▼─────────┐                      │
│                    │   Global Client   │                      │
│                    │                   │                      │
│                    │  • signer         │                      │
│                    │  • pubkey         │                      │
│                    │  • signerType     │                      │
│                    └─────────┬─────────┘                      │
│                              │                                │
│         ┌────────────────────┼────────────────────┐           │
│         │                    │                    │           │
│    ┌────▼─────┐      ┌───────▼────────┐   ┌──────▼──────┐   │
│    │ Blossom  │      │  Event System  │   │    Form     │   │
│    │  Upload  │      │                │   │  Handling   │   │
│    └──────────┘      └────────────────┘   └─────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Signer-Interface-Hierarchie

```
┌────────────────────────────────────────────────────────┐
│                  Signer Interface                      │
│                                                        │
│  • type: string                                        │
│  • getPublicKey(): Promise<string>                     │
│  • signEvent(event): Promise<SignedEvent>              │
└────────────────┬───────────────────────────────────────┘
                 │
         ┌───────┴───────┬──────────────┬────────────────┐
         │               │              │                │
    ┌────▼────┐    ┌─────▼─────┐  ┌────▼──────┐   ┌─────▼──────┐
    │ NIP-07  │    │  NIP-46   │  │ WordPress │   │  Keycloak  │
    │ Signer  │    │  Bunker   │  │  Signer   │   │   Signer   │
    └────┬────┘    └─────┬─────┘  └────┬──────┘   └─────┬──────┘
         │               │              │                │
    window.nostr    Bunker Relay   WP_NostrTools   Keycloak API
```

## WordPress Signer - Detail

```
┌─────────────────────────────────────────────────────────────┐
│            WordPressAuthPlugin                              │
│                                                             │
│  constructor() {                                            │
│    ┌───────────────────────────────────────────────────┐   │
│    │        this.wordpressSigner                       │   │
│    │                                                   │   │
│    │  type: 'wordpress'                                │   │
│    │                                                   │   │
│    │  getPublicKey: async () => {                      │   │
│    │    const identity = await this.getIdentity();     │   │
│    │    return identity?.user?.pubkey;                 │   │
│    │  }                                                │   │
│    │                                                   │   │
│    │  signEvent: async (event) => {                    │   │
│    │    return await window.WP_NostrTools.nostr_sign(  │   │
│    │      event, 'user', { ... }                       │   │
│    │    );                                             │   │
│    │  }                                                │   │
│    └───────────────────────────────────────────────────┘   │
│  }                                                          │
│                                                             │
│  initialize() {                                             │
│    if (session) {                                           │
│      client.signer = this.wordpressSigner  ───────┐        │
│      client.pubkey = session.user.pubkey          │        │
│    }                                               │        │
│  }                                                 │        │
└────────────────────────────────────────────────────┼────────┘
                                                     │
                                                     ▼
                                       ┌─────────────────────┐
                                       │   Global Client     │
                                       │                     │
                                       │ signer ───────────┐ │
                                       │ pubkey            │ │
                                       └───────────────────┼─┘
                                                           │
                                                           ▼
                                               Verwendet von allen
                                                 App-Komponenten
```

## Signatur-Flow

### WordPress SSO Upload

```
┌─────────────┐
│   User      │
│  wählt Bild │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ uploadToBlossom  │
└──────┬───────────┘
       │
       ▼
┌────────────────────┐
│ createBlossomAuth  │
└──────┬─────────────┘
       │
       │ if (!client.signer) → null
       │
       ▼
┌────────────────────────────┐
│ client.signEventWithTimeout│
└──────┬─────────────────────┘
       │
       │ signer.type === 'wordpress'?
       │
       ▼
┌──────────────────────────┐
│ wordpressSigner.signEvent│
└──────┬───────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ window.WP_NostrTools.nostr_sign│
└──────┬────────────────────────┘
       │
       ▼
┌────────────────────────────────┐
│ WordPress Backend              │
│ /wp-json/nostr-signer/v1/      │
│   sign-event                   │
└──────┬─────────────────────────┘
       │
       ▼ Signiertes Event
┌──────────────────┐
│ Authorization    │
│ Header erstellen │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Upload zu        │
│ Blossom Server   │
└──────────────────┘
```

### NIP-07 Upload (zum Vergleich)

```
┌─────────────┐
│   User      │
│  wählt Bild │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ uploadToBlossom  │
└──────┬───────────┘
       │
       ▼
┌────────────────────┐
│ createBlossomAuth  │
└──────┬─────────────┘
       │
       ▼
┌────────────────────────────┐
│ client.signEventWithTimeout│
└──────┬─────────────────────┘
       │
       │ signer.type === 'nip07'?
       │
       ▼
┌──────────────────────────┐
│ nip07Signer.signEvent    │
└──────┬───────────────────┘
       │
       ▼
┌───────────────────────────┐
│ window.nostr.signEvent    │
│ (Browser Extension)       │
└──────┬────────────────────┘
       │
       ▼ Signiertes Event
┌──────────────────┐
│ Authorization    │
│ Header erstellen │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Upload zu        │
│ Blossom Server   │
└──────────────────┘
```

## Auth-Plugin Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  WordPressAuthPlugin                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ constructor()
                           ▼
                  ┌─────────────────┐
                  │ Erstelle Signer │
                  │     Objekt      │
                  └────────┬────────┘
                           │
                           │ initialize()
                           ▼
                  ┌─────────────────┐
                  │ Prüfe Session   │
                  └────────┬────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
         Session vorhanden?    Keine Session
                │                     │
                ▼                     ▼
      ┌──────────────────┐    ┌──────────────┐
      │ Setze            │    │ Signer bleibt│
      │ client.signer    │    │ null         │
      │ client.pubkey    │    └──────────────┘
      └────────┬─────────┘
               │
               │ App läuft
               │
               │ logout()
               ▼
      ┌──────────────────┐
      │ Entferne         │
      │ client.signer    │
      │ client.pubkey    │
      └────────┬─────────┘
               │
               ▼
      ┌──────────────────┐
      │ Redirect zu WP   │
      │ Logout           │
      └──────────────────┘
```

## Client-State-Machine

```
┌─────────────┐
│ Keine Auth  │
│             │
│ signer: null│
│ pubkey: null│
└──────┬──────┘
       │
       │ WordPress Login
       ▼
┌─────────────────────┐
│ WordPress Auth      │
│                     │
│ signer: {           │
│   type: 'wordpress' │
│   signEvent: ...    │
│ }                   │
│ pubkey: "abc..."    │
└──────┬──────────────┘
       │
       │ Logout
       ▼
┌─────────────┐
│ Keine Auth  │
└──────┬──────┘
       │
       │ NIP-07 Login
       ▼
┌─────────────────────┐
│ NIP-07 Auth         │
│                     │
│ signer: {           │
│   type: 'nip07'     │
│   signEvent: ...    │
│ }                   │
│ pubkey: "xyz..."    │
└──────┬──────────────┘
       │
       │ Logout
       ▼
┌─────────────┐
│ Keine Auth  │
└─────────────┘
```

## Vergleich: Vorher vs. Nachher

### Vorher: Verzweigte Logik

```
createBlossomAuth()
      │
      ├─── if (window.WP_NostrTools)
      │         │
      │         ▼
      │    WordPress-Pfad
      │    • Event erstellen
      │    • WP_NostrTools.nostr_sign()
      │    • Auth-Header erstellen
      │
      └─── else
                │
                ▼
           Standard-Pfad
           • Event erstellen
           • client.signEventWithTimeout()
           • Auth-Header erstellen
```

### Nachher: Einheitliche Logik

```
createBlossomAuth()
      │
      ├─── if (!client.signer) → null
      │
      ▼
  Einheitlicher Pfad
  • Event erstellen
  • client.signEventWithTimeout()
      │
      ├─── type === 'wordpress'?
      │         │
      │         ▼
      │    wordpressSigner.signEvent()
      │         │
      │         ▼
      │    WP_NostrTools.nostr_sign()
      │
      ├─── type === 'nip07'?
      │         │
      │         ▼
      │    nip07Signer.signEvent()
      │         │
      │         ▼
      │    window.nostr.signEvent()
      │
      └─── type === 'nip46'?
                │
                ▼
           bunker.signEvent()
  
  • Auth-Header erstellen
```

## Komponenten-Interaktion

```
┌─────────────────────────────────────────────────────────────┐
│                        App Layer                            │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Blossom  │  │  Event   │  │  Form    │  │  Detail   │  │
│  │  Upload  │  │  Create  │  │ Handling │  │   View    │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬─────┘  │
└───────┼─────────────┼─────────────┼───────────────┼────────┘
        │             │             │               │
        └─────────────┴─────────────┴───────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                  Client Layer                               │
│                           │                                 │
│                    ┌──────▼──────┐                          │
│                    │   Client    │                          │
│                    │             │                          │
│                    │  • signer   │◄────────────────┐        │
│                    │  • pubkey   │                 │        │
│                    └──────┬──────┘                 │        │
└───────────────────────────┼────────────────────────┼────────┘
                            │                        │
┌───────────────────────────┼────────────────────────┼────────┐
│                  Auth Layer                        │        │
│                           │                        │        │
│  ┌────────────────────────▼────────┐               │        │
│  │       AuthManager               │               │        │
│  └────────┬────────────────┬───────┘               │        │
│           │                │                       │        │
│  ┌────────▼──────┐  ┌──────▼───────────┐          │        │
│  │ NostrAuth     │  │ WordPressAuth    │          │        │
│  │ Plugin        │  │ Plugin           │          │        │
│  │               │  │                  │          │        │
│  │ • nip07Signer │  │ • wordpressSigner├──────────┘        │
│  │ • nip46Signer │  │                  │                   │
│  └───────────────┘  └──────────────────┘                   │
└────────────────────────────────────────────────────────────┘
```

## Datenfluss

```
User Action
    │
    ▼
App Component (z.B. Upload)
    │
    ▼
Global Client
    │
    ├─── signer.type === 'wordpress'?
    │         │
    │         ▼
    │    WordPressAuthPlugin.wordpressSigner
    │         │
    │         ▼
    │    window.WP_NostrTools
    │         │
    │         ▼
    │    WordPress Backend
    │         │
    │         ▼
    │    WordPress User Key
    │         │
    │         └─── signiertes Event
    │                   │
    └───────────────────┘
                        │
                        ▼
              App erhält Signatur
                        │
                        ▼
              Weiterverarbeitung
```

---

**Legende:**
- `│` Vertikaler Flow
- `▼` Fortsetzung nach unten
- `─►` Horizontaler Flow
- `┌─┐` Box/Container
- `├─┤` Verzweigung
