# Event Wall Design System

## Design-Tokens

### Farben
```css
/* Primärfarben */
--color-primary: #2a73c2;           /* Hauptaktion, Links */
--color-primary-contrast: #ffffff;  /* Text auf primären Elementen */
--color-secondary: #f5a623;         /* Akzentfarbe */

/* Hintergründe */
--color-background: #f4f7f6;        /* Seitenhintergrund */
--color-surface: #ffffff;           /* Karten, Panels */
--color-filter-bg: var(--color-surface); /* Filter-Toolbar Hintergrund */
--color-filter-field-bg: var(--color-background); /* Filter Eingabefeld Hintergrund */

/* Textfarben */
--color-heading: #1e293b;           /* Überschriften */
--color-text: #0f172a;             /* Haupttext */
--color-muted: #6b7280;            /* Sekundärer Text */

/* Statusfarben */
--color-danger: #d9534f;            /* Fehlermeldungen */
--color-success: #2f855a;           /* Erfolg */
--color-warning: #f59e0b;           /* Warnungen */

/* UI-Elemente */
--color-filter-field-border: #273042; /* Filter Eingabefeld Rahmen */
--chip-bg: #eef2ff;                 /* Tag-Chip Hintergrund */
--chip-border: #c7d2fe;            /* Tag-Chip Rahmen */
--border-color: #e5e7eb;           /* Allgemeine Rahmen */
```

### Typografie
```css
/* Schriftfamilien */
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: "SFMono-Regular", Menlo, Monaco, "Roboto Mono", "Courier New", monospace;

/* Basis-Typografie */
--font-size-base: 16px;
--line-height-base: 1.45;

/* Komponenten-spezifische Größen */
--tile-title-size: 1.05rem;         /* Event-Tile Titel */
--tile-meta-size: 0.95em;           /* Event-Tile Meta-Informationen */
--chip-size: 0.85rem;               /* Tag-Chip Text */
--tag-badge-size: 0.8em;            /* Tag-Badge in Tile-Header */
```

### Abstände & Layout
```css
/* Radius-Werte */
--radius-sm: 6px;                   /* Kleine abgerundete Ecken */
--radius-md: 10px;                  /* Mittlere abgerundete Ecken */
--radius-lg: 12px;                  /* Große abgerundete Ecken */
--radius-round: 999px;              /* Runde Elemente (Pills) */

/* Abstände */
--space-xs: 6px;                    /* Extra kleiner Abstand */
--space-sm: 10px;                   /* Kleiner Abstand */
--space-md: 18px;                   /* Mittlerer Abstand */

/* Grid & Container */
--container-max-width: 1600px;      /* Maximale Container-Breite */
--grid-gap: 30px;                   /* Abstand zwischen Grid-Items */
--tile-min-width: 320px;            /* Minimale Tile-Breite */
```

### Schatten & Effekte
```css
/* Schatten */
--tile-shadow: 0 5px 15px rgba(0,0,0,.18);  /* Standard-Tile Schatten */
--tile-shadow-hover: 0 10px 24px rgba(0,0,0,.22); /* Hover-Zustand */
--modal-overlay: rgba(0,0,0,.5);    /* Modal-Hintergrund */
```

### Z-Index
```css
/* Hierarchie */
--z-dropdown: 20;                   /* Dropdown-Menüs */
--z-modal: 1000;                    /* Modal-Overlays */
```

### Animation & Timing
```css
/* Dauer und Easing */
--duration-fast: 0.15s;             /* Schnelle Animationen */
--duration-normal: 0.3s;            /* Normale Animationen */
--easing-default: ease-out;         /* Standard-Easing */

/* Modal-Animationen */
--modal-fade-duration: 0.3s;
--modal-slide-duration: 0.3s;
```

### Breakpoints
```css
/* Responsive Design */
--breakpoint-sm: 576px;             /* Mobile */
--breakpoint-md: 768px;             /* Tablet */
--breakpoint-lg: 1200px;            /* Desktop */
--breakpoint-xl: 1600px;            /* Large Desktop */

/* Container-Breiten */
--container-sm: 100%;               /* Mobile */
--container-md: 100%;               /* Tablet */
--container-lg: 1200px;             /* Desktop */
--container-xl: 1600px;             /* Large Desktop */
```

## Layout & Raster

### Grid-System
```css
/* Event Wall Grid */
.event-wall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 30px;
  max-width: 1600px;
  margin: 0 auto;
  align-items: stretch; /* Gleiche Höhe für alle Tiles */
}
```

### Container & Abstände
```css
/* Haupt-Container */
.container {
  max-width: 1600px;
  margin: 0 auto;
  padding: 0 20px;
}

/* Filter-Toolbar */
.filter-toolbar {
  max-width: 1600px;
  margin: 0 auto 24px auto;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,.18);
}

/* Tile-Dimensionen */
.tile-header-height: 200px;         /* Feste Header-Höhe */
.tile-body-min-height: auto;        /* Flexibler Body */
.tile-aspect-ratio: auto;           /* Automatische Höhe */
```

### Sections & Abstände
```css
/* XS - Extra Small Components */
--section-xs-padding: 6px;
--section-xs-gap: 6px;

/* SM - Small Components */
--section-sm-padding: 10px;
--section-sm-gap: 10px;

/* MD - Medium Components */
--section-md-padding: 18px;
--section-md-gap: 18px;

/* LG - Large Components */
--section-lg-padding: 24px;
--section-lg-gap: 30px;
```

### Card-Design
```css
/* Event Tile Card */
.event-tile {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,.18);
  overflow: hidden;
}

/* Card Hover States */
.event-tile:hover {
  box-shadow: 0 10px 24px rgba(0,0,0,.22);
  transform: translateY(-2px);
}

/* Card Focus States */
.event-tile:focus-within {
  box-shadow: 0 10px 24px rgba(0,0,0,.22);
  outline: 2px solid rgba(42,115,194,.22);
}
```

## Komponenten

### Buttons
```css
/* Basis-Button */
.btn {
  background: var(--color-primary);
  color: var(--color-surface);
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.15s ease-out;
}

/* Button-Zustände */
.btn:hover {
  background: #1e5a9e; /* Darker primary */
  transform: translateY(-1px);
}

.btn:focus {
  outline: 2px solid rgba(42,115,194,.22);
  outline-offset: 2px;
}

.btn:active {
  transform: translateY(0);
}

.btn:disabled {
  background: var(--color-muted);
  cursor: not-allowed;
  opacity: 0.6;
}

/* Button-Varianten */
.btn.primary {
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.btn.secondary {
  background: var(--color-secondary);
  color: var(--color-surface);
}

.btn.ghost {
  background: transparent;
  color: var(--color-text);
  border: 1px solid var(--border-color);
}

.btn.danger {
  background: var(--color-danger);
  color: var(--color-surface);
}
```

### Links
```css
/* Basis-Links */
a {
  color: var(--color-primary);
  text-decoration: none;
  transition: color 0.15s ease-out;
}

a:hover {
  color: #1e5a9e; /* Darker primary */
  text-decoration: underline;
}

a:focus {
  outline: 2px solid rgba(42,115,194,.22);
  outline-offset: 2px;
}

/* Link-Varianten */
a.text-link {
  color: var(--color-primary);
}

a.subtle-link {
  color: var(--color-muted);
}

a.inverted-link {
  color: var(--color-primary-contrast);
}
```

### Cards (Event Tiles)
```css
/* Event Tile Struktur */
.event-tile {
  /* Card container */
}

.tile-header {
  height: 200px;
  background-size: cover;
  background-position: center;
  position: relative;
}

.tile-body {
  flex: 1 1 auto;
  padding: 18px;
  background: var(--color-primary);
  color: var(--color-primary-contrast);
}

.tile-toolbar {
  padding: 12px 18px;
  background: var(--color-surface);
  border-top: 1px solid var(--border-color);
}

/* Card-Zustände */
.event-tile:hover .tile-header {
  transform: scale(1.02);
}

.event-tile:focus-within {
  box-shadow: 0 10px 24px rgba(0,0,0,.22);
}
```

### Header/Navigation
```css
/* Page Header */
h1 {
  text-align: center;
  color: var(--color-heading);
  margin: 0 0 10px 0;
}

.subhead {
  text-align: center;
  color: var(--color-muted);
  margin: 0 0 20px 0;
  font-size: 0.95rem;
}

/* Filter Toolbar (Navigation) */
.filter-toolbar {
  background: var(--color-filter-bg);
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,.18);
  padding: 12px;
}
```

### Footer (Tile Toolbar)
```css
/* Tile Footer */
.tile-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: var(--color-surface);
  border-top: 1px solid var(--border-color);
}

.tile-toolbar-left {
  display: flex;
  gap: 8px;
}

.tile-toolbar-right {
  display: flex;
  gap: 8px;
}

/* Toolbar Buttons */
.tile-toolbar .btn {
  font-size: 0.9rem;
  padding: 8px 12px;
}
```

### Formularfelder
```css
/* Basis-Form-Elemente */
.field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-filter-field-bg);
  border: 1px solid var(--color-filter-field-border);
  border-radius: 6px;
  padding: 8px 10px;
}

.field label {
  font-size: 0.85rem;
  color: #374151;
  white-space: nowrap;
}

.field input,
.field select {
  border: none;
  outline: none;
  background: transparent;
  flex: 1;
  font-size: 1rem;
}

/* Form-Zustände */
.field:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(42,115,194,.1);
}

.field.error {
  border-color: var(--color-danger);
}

.field.error:focus-within {
  box-shadow: 0 0 0 2px rgba(217,83,79,.1);
}
```

### Modals
```css
/* Modal Overlay */
.modal {
  display: none;
  position: fixed;
  z-index: 1000;
  inset: 0;
  background: rgba(0,0,0,.5);
  animation: fadeIn 0.3s;
}

.modal.open {
  display: block;
}

/* Modal Content */
.modal-content {
  background: var(--color-surface);
  margin: 5% auto;
  padding: 30px;
  border-radius: 6px;
  width: 90%;
  max-width: 680px;
  position: relative;
  box-shadow: 0 5px 15px rgba(0,0,0,.3);
  animation: slideIn 0.3s;
}

/* Modal Close Button */
.close-button {
  position: absolute;
  top: 10px;
  right: 20px;
  background: transparent;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #334155;
}
```

### Tabs
```css
/* Tab Navigation */
.tab-nav {
  display: flex;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 20px;
}

.tab-button {
  padding: 12px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease-out;
}

.tab-button.active {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
}

.tab-button:hover {
  background: var(--color-background);
}

/* Tab Content */
.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}
```

### Accordions
```css
/* Accordion Item */
.accordion-item {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}

.accordion-header {
  padding: 16px 20px;
  background: var(--color-surface);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.accordion-content {
  padding: 0 20px 20px 20px;
  background: var(--color-background);
  display: none;
}

.accordion-item.open .accordion-content {
  display: block;
}
```

### Alerts
```css
/* Alert Basis */
.alert {
  padding: 12px 16px;
  border-radius: 6px;
  margin: 12px 0;
  border-left: 4px solid;
}

.alert.info {
  background: #dbeafe;
  border-left-color: var(--color-primary);
  color: #1e40af;
}

.alert.success {
  background: #d1fae5;
  border-left-color: var(--color-success);
  color: #065f46;
}

.alert.warning {
  background: #fef3c7;
  border-left-color: var(--color-warning);
  color: #92400e;
}

.alert.error {
  background: #fee2e2;
  border-left-color: var(--color-danger);
  color: #991b1b;
}
```

### Tag-Komponenten
```css
/* Tag Badge */
.tag-badge {
  background-color: rgba(42,115,194,.95);
  color: var(--color-surface);
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.8em;
  border: none;
  cursor: pointer;
  max-width: 100%;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

/* Tag Chip */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--chip-bg);
  border: 1px solid var(--chip-border);
  font-size: 0.85rem;
}

.chip button {
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: bold;
  line-height: 1;
  padding: 0 2px;
}
```

## Content-Regeln

### Headings-Skala
```css
/* Typografische Hierarchie */
h1 {
  font-size: 2.25rem;    /* 36px */
  line-height: 1.2;
  margin-bottom: 0.5em;
}

h2 {
  font-size: 1.875rem;   /* 30px */
  line-height: 1.3;
  margin-bottom: 0.5em;
}

h3 {
  font-size: 1.5rem;     /* 24px */
  line-height: 1.35;
  margin-bottom: 0.5em;
}

h4 {
  font-size: 1.25rem;    /* 20px */
  line-height: 1.4;
  margin-bottom: 0.5em;
}

h5 {
  font-size: 1.125rem;   /* 18px */
  line-height: 1.45;
  margin-bottom: 0.5em;
}

h6 {
  font-size: 1rem;       /* 16px */
  line-height: 1.45;
  margin-bottom: 0.5em;
}
```

### Zeilenlängen & Lesbarkeit
```css
/* Optimale Zeilenlänge */
.content-width {
  max-width: 65ch;        /* ~65 Zeichen für optimale Lesbarkeit */
}

.tile-summary {
  max-width: 50ch;        /* Kürzere Zeilen in Tiles */
}

/* Line Height für verschiedene Textarten */
.body-text {
  line-height: 1.6;       /* Fließtext */
}

.meta-text {
  line-height: 1.4;       /* Meta-Informationen */
}

.title-text {
  line-height: 1.3;       /* Überschriften */
}
```

### Bildformate & Aspekte
```css
/* Bild-Aspekte */
.image-aspect-16-9 {
  aspect-ratio: 16/9;
}

.image-aspect-4-3 {
  aspect-ratio: 4/3;
}

.image-aspect-1-1 {
  aspect-ratio: 1/1;
}

.image-aspect-3-2 {
  aspect-ratio: 3/2;
}

/* Event Tile Header */
.tile-header {
  aspect-ratio: 16/10;    /* Event-Header Format */
}

/* Responsive Bilder */
img {
  max-width: 100%;
  height: auto;
  object-fit: cover;
}

/* Modal-Bilder */
.modal img {
  max-height: 250px;
  object-fit: contain;
}
```

### Bildunterschriften
```css
/* Caption Styles */
.image-caption {
  font-size: 0.875rem;
  color: var(--color-muted);
  text-align: center;
  margin-top: 8px;
  line-height: 1.4;
}

.caption-credit {
  font-size: 0.8rem;
  color: var(--color-muted);
  font-style: italic;
}
```

### Icon-Stil
```css
/* Icon-Größen */
.icon-xs { width: 12px; height: 12px; }
.icon-sm { width: 16px; height: 16px; }
.icon-md { width: 20px; height: 20px; }
.icon-lg { width: 24px; height: 24px; }
.icon-xl { width: 32px; height: 32px; }

/* Icon-Farben */
.icon-primary { fill: var(--color-primary); }
.icon-muted { fill: var(--color-muted); }
.icon-white { fill: var(--color-surface); }

/* Icon-Set */
.icon-clock {
  /* SVG Clock Icon */
}

.icon-location {
  /* SVG Location Icon */
}

.icon-author {
  /* SVG Author Icon */
}
```

## Zugänglichkeit (A11y)

### Kontraste
```css
/* Mindestkontraste (WCAG AA) */
.text-on-light {
  color: var(--color-text); /* 4.5:1 auf weiß */
}

.text-on-primary {
  color: var(--color-primary-contrast); /* 4.5:1 auf primary */
}

.text-muted {
  color: var(--color-muted); /* 4.5:1 auf weiß */
}

/* High-Contrast Fallbacks */
@media (prefers-contrast: high) {
  :root {
    --color-primary: #0066cc;
    --color-text: #000000;
    --border-color: #000000;
  }
}
```

### Focus-Styles
```css
/* Sichtbare Focus-Indikatoren */
*:focus {
  outline: 2px solid rgba(42,115,194,.22);
  outline-offset: 2px;
}

/* Focus-Ring für interaktive Elemente */
.btn:focus,
.tag-badge:focus,
.chip button:focus {
  outline: 2px solid rgba(42,115,194,.22);
  outline-offset: 2px;
}

/* Skip-Links */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: var(--color-primary);
  color: var(--color-primary-contrast);
  padding: 8px;
  text-decoration: none;
  z-index: 100;
}

.skip-link:focus {
  top: 6px;
}
```

### Tastatur-Navigation
```css
/* Keyboard Support */
.event-tile:focus {
  outline: 2px solid rgba(42,115,194,.22);
  outline-offset: 2px;
}

/* Tab-Reihenfolge */
.tabindex-0 {
  tabindex: 0; /* Programmatisch fokussierbar */
}

/* ARIA States */
[aria-expanded="true"] {
  /* Expanded state styles */
}

[aria-expanded="false"] {
  /* Collapsed state styles */
}
```

### ARIA-Patterns
```css
/* Modal ARIA */
.modal[aria-modal="true"] {
  /* Modal styles */
}

.modal[role="dialog"] {
  /* Dialog role styles */
}

/* Live Regions */
[aria-live="polite"] {
  /* Polite announcements */
}

[aria-live="assertive"] {
  /* Assertive announcements */
}

/* Button ARIA */
button[aria-label] {
  /* Accessible button names */
}

/* Form ARIA */
.field[aria-describedby] {
  /* Field descriptions */
}
```

### Fehlertexte
```css
/* Error Messages */
.error-message {
  color: var(--color-danger);
  font-size: 0.875rem;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.error-message::before {
  content: "⚠";
  font-size: 0.8em;
}

/* Field Error States */
.field.error input {
  border-color: var(--color-danger);
}

.field.error .error-message {
  display: block;
}
```

## Theming

### Hell/Dunkel-Modi
```css
/* Light Theme (Default) */
:root {
  --color-background: #f4f7f6;
  --color-surface: #ffffff;
  --color-text: #0f172a;
  --color-heading: #1e293b;
  --tile-shadow: 0 5px 15px rgba(0,0,0,.18);
}

/* Dark Theme */
[data-theme="dark"] {
  --color-background: #0b1220;
  --color-surface: #091021;
  --color-text: #e6eefc;
  --color-heading: #f1f5f9;
  --color-muted: #9aa6bb;
  --tile-shadow: 0 6px 20px rgba(0,0,0,.6);
  --chip-bg: #1e293b;
  --chip-border: #334155;
  --border-color: #334155;
  --color-filter-field-bg: #1e293b;
  --color-filter-field-border: #475569;
}
```

### High-Contrast-Fallbacks
```css
/* High Contrast Mode */
@media (prefers-contrast: high) {
  :root {
    --color-primary: #0066cc;
    --color-text: #000000;
    --color-background: #ffffff;
    --border-color: #000000;
    --tile-shadow: 0 2px 8px rgba(0,0,0,.5);
  }

  [data-theme="dark"] {
    --color-primary: #66b3ff;
    --color-text: #ffffff;
    --color-background: #000000;
    --border-color: #ffffff;
    --tile-shadow: 0 2px 8px rgba(255,255,255,.3);
  }
}

/* Reduced Motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Theme-Token-Paare
```css
/* Semantic Color Pairs */
:root {
  /* Surface Colors */
  --surface-primary: var(--color-surface);
  --surface-secondary: var(--color-background);
  --surface-tertiary: var(--color-filter-bg);

  /* Text Colors */
  --text-primary: var(--color-text);
  --text-secondary: var(--color-heading);
  --text-tertiary: var(--color-muted);

  /* Interactive Colors */
  --interactive-primary: var(--color-primary);
  --interactive-secondary: var(--color-secondary);
  --interactive-tertiary: var(--color-danger);
}

/* Theme-specific overrides */
[data-theme="dark"] {
  --surface-primary: var(--color-surface);
  --surface-secondary: var(--color-background);
  --text-primary: var(--color-text);
  --interactive-primary: #6aa6ff;
}
```

## Event-Datenstruktur

### Standard-Event-Objekt
```javascript
const standardEvent = {
  // Pflichtfelder
  ID: "unique-identifier",           // Eindeutige Event-ID
  title: "Event Titel",              // Event-Titel (erforderlich)
  start: "2025-01-01T10:00:00Z",     // ISO-String Startzeit
  end: "2025-01-01T12:00:00Z",       // ISO-String Endzeit

  // Optionale Felder
  status: "confirmed",               // Event-Status
  location: "https://...",           // Ort/Link (HTML erlaubt)
  tags: "tag1,tag2,tag3",            // Komma-separierte Tags
  summary: "Kurze Beschreibung",     // HTML erlaubt
  content: "<p>Ausführliche...</p>", // HTML-Content
  pubkey: "npub1...",                // Nostr Pubkey des Autors
  image: "https://...",              // Event-Bild URL
  location_url: "https://..."        // Externe Event-URL
};
```

### Event-Status-Werte
```javascript
const EVENT_STATUSES = {
  CONFIRMED: "confirmed",     // Bestätigt
  TENTATIVE: "tentative",     // Vorläufig
  CANCELLED: "cancelled"      // Abgesagt
};
```

### Tag-Normalisierung
```javascript
const normalizeTags = (raw) => {
  const arr = Array.isArray(raw) ? raw : (raw ? String(raw).split(',') : []);
  return arr.map(t => t.trim()).filter(Boolean);
};

const buildEvent = (event) => {
  const start = new Date(event.start || event.begin || event.date);
  const end = new Date(event.end || event.finish || start);
  const tagsArr = normalizeTags(event.tags);

  return {
    ...event,
    start, end,
    tagsArr,
    tagsLower: tagsArr.map(t => t.toLowerCase()),
    monthKey: toMonthKey(start)
  };
};
```

## API-Integration

### Gemeinsame API-Endpunkte
```javascript
const API_ENDPOINTS = {
  NOSTR_EVENTS: 'https://n8n.rpi-virtuell.de/webhook/nostre_termine',
  NOSTR_DIRECT: null // Wird über window.NostreAPI bereitgestellt
};
```

### Daten-Fetching-Strategie
```javascript
const fetchEvents = async () => {
  // 1) Versuch: Direkte Nostr-Abfrage (falls NostreAPI verfügbar)
  if (window.NostreAPI && typeof window.NostreAPI.getNostrFeed === 'function') {
    try {
      const { nostrfeed } = await window.NostreAPI.getNostrFeed(NOSTR_OPTIONS);
      if (Array.isArray(nostrfeed) && nostrfeed.length > 0) {
        return nostrfeed.map(normalizeFromNostr).map(buildEvent);
      }
    } catch (err) {
      console.warn('Nostr direct fetch fehlgeschlagen:', err);
    }
  }

  // 2) Fallback: REST-API
  try {
    const response = await fetch(API_ENDPOINTS.NOSTR_EVENTS);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const events = data?.[0]?.nostrfeed || [];
    return events.map(normalizeFromNostr).map(buildEvent);
  } catch (err) {
    console.error('API fetch fehlgeschlagen:', err);
    throw err;
  }
};
```

### NostreAPI-Normalisierung
```javascript
const normalizeFromNostr = (item) => ({
  ID: item.ID,
  title: item.title,
  start: item.start,       // ISO-String
  end: item.end,           // ISO-String
  status: item.status,
  location: item.location, // HTML-Link
  tags: item.tags,         // String "a, b, c"
  summary: item.summary,   // HTML
  content: item.content,   // HTML
  pubkey: item.pubkey,
  image: item.image,
  location_url: item.location_url,
});
```

## Modal-System

### Einheitliches Modal-Interface
```javascript
const ModalManager = {
  show: (event) => {
    updateModalContent(event);
    modal.style.display = 'block';
    updateURL(event);
  },

  hide: () => {
    modal.style.display = 'none';
    restoreURL();
  },

  updateContent: (event) => {
    // Gemeinsame Content-Updates
    updateModalImage(event.image);
    updateModalTitle(event.title);
    updateModalDate(event.start, event.end);
    updateModalDetails(event);
    updateModalTags(event.tagsArr);
    updateModalContent(event.content);
  }
};
```

### Modal-Content-Handler
```javascript
const updateModalContent = (event) => {
  // Bild
  const imgContainer = document.getElementById('modal-image-container');
  imgContainer.innerHTML = '';
  if (event.image) {
    const img = document.createElement('img');
    img.src = event.image;
    img.alt = `Bild für ${event.title}`;
    imgContainer.appendChild(img);
    imgContainer.style.display = 'block';
  } else {
    imgContainer.style.display = 'none';
  }

  // Basis-Informationen
  document.getElementById('modal-title').textContent = event.title;
  document.getElementById('modal-summary').textContent =
    toPlainText(event.summary) || 'Keine Zusammenfassung vorhanden.';

  // Ort (mit Link-Handling)
  const locationEl = document.getElementById('modal-location');
  locationEl.innerHTML = event.location && event.location.startsWith('http')
    ? `<a href="${event.location}" target="_blank" rel="noopener noreferrer">${event.location}</a>`
    : (event.location || 'Kein Ort angegeben.');

  // Datum
  document.getElementById('modal-date').textContent =
    formatEventTimeSpan(event.start, event.end);

  // Tags
  const tagsContainer = document.getElementById('modal-tags');
  tagsContainer.innerHTML = '';
  if (event.tagsArr?.length) {
    event.tagsArr.forEach(tag => {
      const button = document.createElement('button');
      button.textContent = tag;
      button.title = 'Nach Tag filtern';
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        addTagToState(tag);
      });
      tagsContainer.appendChild(button);
    });
  } else {
    tagsContainer.textContent = 'Keine';
  }

  // Content
  document.getElementById('modal-content-html').innerHTML = event.content || '';
};
```

## Filter-Logik

### Einheitliches Filter-System
```javascript
const FilterManager = {
  state: {
    selectedTags: new Set(),
    searchQuery: '',
    monthKey: '',
    dateRange: null
  },

  applyFilters: (events) => {
    return events.filter(event => {
      const tagOK = FilterManager.state.selectedTags.size === 0
        ? true
        : Array.from(FilterManager.state.selectedTags)
            .some(tag => event.tagsLower.includes(tag));

      const searchOK = !FilterManager.state.searchQuery
        ? true
        : (event.title?.toLowerCase().includes(FilterManager.state.searchQuery) ||
           event.tagsLower.some(tag => tag.includes(FilterManager.state.searchQuery)));

      const monthOK = !FilterManager.state.monthKey ||
        event.monthKey === FilterManager.state.monthKey;

      return tagOK && searchOK && monthOK;
    });
  },

  addTag: (tag) => {
    const key = tag.toLowerCase();
    FilterManager.state.selectedTags.add(key);
    FilterManager.updateUI();
    FilterManager.updateURL();
  },

  removeTag: (tag) => {
    FilterManager.state.selectedTags.delete(tag);
    FilterManager.updateUI();
    FilterManager.updateURL();
  },

  setSearch: (query) => {
    FilterManager.state.searchQuery = query.toLowerCase();
    FilterManager.updateUI();
    FilterManager.updateURL();
  },

  setMonth: (monthKey) => {
    FilterManager.state.monthKey = monthKey;
    FilterManager.updateUI();
    FilterManager.updateURL();
  },

  reset: () => {
    FilterManager.state.selectedTags.clear();
    FilterManager.state.searchQuery = '';
    FilterManager.state.monthKey = '';
    FilterManager.updateUI();
    FilterManager.updateURL();
  }
};
```

### Filter-UI-Komponenten
```javascript
const FilterUI = {
  renderTagSelector: () => {
    const tags = getAllTagsWithCounts(allEvents);
    const container = document.getElementById('tag-suggest');
    container.innerHTML = tags.map(tag =>
      `<button type="button" data-key="${tag.key}">
        ${tag.label} <span class="count">(${tag.count})</span>
      </button>`
    ).join('');
  },

  renderSelectedTags: () => {
    const container = document.getElementById('selected-tags');
    container.innerHTML = '';

    if (FilterManager.state.selectedTags.size === 0) return;

    const allTags = getAllTagsWithCounts(allEvents);
    const labelFor = (key) => (allTags.find(t => t.key === key)?.label) || key;

    FilterManager.state.selectedTags.forEach(key => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span>${labelFor(key)}</span>`;

      const removeBtn = document.createElement('button');
      removeBtn.setAttribute('aria-label', 'Tag entfernen');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => FilterManager.removeTag(key));

      chip.appendChild(removeBtn);
      container.appendChild(chip);
    });
  },

  renderMonthSelector: () => {
    const months = getAllMonths(allEvents);
    const select = document.getElementById('month-select');
    select.innerHTML = '<option value="">Alle Monate</option>';

    months.forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = monthKeyToLabel(key);
      select.appendChild(option);
    });
  }
};
```

## Zustandsmanagement

### Zentrales State-Management
```javascript
const AppState = {
  // Event-Daten
  allEvents: [],
  filteredEvents: [],

  // UI-Zustand
  currentView: 'list', // 'list' | 'calendar'
  selectedEvent: null,
  modalOpen: false,

  // Filter-Zustand (von FilterManager verwaltet)
  filters: FilterManager.state,

  // URL-Zustand
  urlState: {
    hash: '',
    lastFilterHash: ''
  },

  // Initialisierung
  init: async () => {
    try {
      AppState.allEvents = await fetchEvents();
      AppState.filteredEvents = [...AppState.allEvents];

      // Filter-UI initialisieren
      FilterUI.renderTagSelector();
      FilterUI.renderMonthSelector();

      // URL-Zustand wiederherstellen
      URLManager.restoreFromURL();

      // Events an UI binden
      bindEventListeners();

      // Initial render
      renderCurrentView();
    } catch (error) {
      console.error('Initialisierung fehlgeschlagen:', error);
      showError('Fehler beim Laden der Termine.');
    }
  },

  updateFilteredEvents: () => {
    AppState.filteredEvents = FilterManager.applyFilters(AppState.allEvents);
    renderCurrentView();
    updateResultInfo();
  }
};
```

## URL-Management

### Permalink-System
```javascript
const URLManager = {
  buildFilterHash: () => {
    const parts = [];
    if (FilterManager.state.selectedTags.size) {
      const tags = Array.from(FilterManager.state.selectedTags)
        .map(encodeURIComponent).join('|');
      parts.push(`tags:${tags}`);
    }
    if (FilterManager.state.searchQuery) {
      parts.push(`query:${encodeURIComponent(FilterManager.state.searchQuery)}`);
    }
    if (FilterManager.state.monthKey) {
      parts.push(`month:${FilterManager.state.monthKey}`);
    }
    return '#filter=' + parts.join(',');
  },

  buildEventHash: (event) => {
    return '#id=' + encodeURIComponent(event.ID || event.id || event.url || '');
  },

  parseFilterSpec: (spec) => {
    const out = { tags: [], query: '', monthKey: '' };
    if (!spec) return out;

    const cleaned = spec.replace(/[;&]/g, ',');
    cleaned.split(',').forEach(pair => {
      const [key, val = ''] = pair.split(/[:=]/);
      const k = key?.trim().toLowerCase();
      const v = val?.trim();

      if (k === 'tags') {
        out.tags = v.split(/[|,]/).map(decodeURIComponent).map(s => s.trim()).filter(Boolean);
      } else if (k === 'query' || k === 'q') {
        out.query = decodeURIComponent(v);
      } else if (k === 'month') {
        out.monthKey = v;
      }
    });
    return out;
  },

  restoreFromURL: () => {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return false;

    // Event-Modal
    const idMatch = hash.match(/^(?:id[:=]|view=modal&id=)([^,&;]+)/i);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      const event = AppState.allEvents.find(e => (e.ID || e.id || e.url) === id);
      if (event) {
        ModalManager.show(event);
        return true;
      }
    }

    // Filter
    const filterMatch = hash.match(/^filter=(.*)$/i);
    if (filterMatch) {
      const spec = URLManager.parseFilterSpec(filterMatch[1]);
      FilterManager.state.selectedTags = new Set(spec.tags.map(t => t.toLowerCase()));
      FilterManager.state.searchQuery = spec.query;
      FilterManager.state.monthKey = spec.monthKey;

      FilterUI.renderSelectedTags();
      AppState.updateFilteredEvents();
      return true;
    }

    return false;
  },

  updateURL: (event = null) => {
    if (event) {
      // Event-Modal
      const hash = URLManager.buildEventHash(event);
      history.pushState(null, '', hash);
    } else {
      // Filter-Zustand
      const hash = URLManager.buildFilterHash();
      if (location.hash !== hash) {
        history.replaceState(null, '', hash);
      }
    }
  }
};
```

## Responsive Design

### Breakpoint-System
```css
/* Responsive Breakpoints */
:root {
  --breakpoint-xs: 320px;   /* Kleine Smartphones */
  --breakpoint-sm: 576px;   /* Standard Smartphones */
  --breakpoint-md: 768px;   /* Tablets */
  --breakpoint-lg: 992px;   /* Kleine Desktops */
  --breakpoint-xl: 1200px;  /* Standard Desktops */
  --breakpoint-xxl: 1600px; /* Große Desktops */
}

/* Container Queries */
@container (max-width: 768px) {
  .filter-toolbar {
    flex-direction: column;
    gap: var(--space-sm);
  }

  .filter-row {
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  .field {
    flex: 1 1 100%;
    min-width: 100%;
  }
}
```

### Mobile-First Ansatz
```css
/* Basis: Mobile */
.event-wall {
  grid-template-columns: 1fr;
  gap: var(--space-md);
}

/* Tablet */
@media (min-width: 768px) {
  .event-wall {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop */
@media (min-width: 1200px) {
  .event-wall {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  }
}

/* Large Desktop */
@media (min-width: 1600px) {
  .event-wall {
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  }
}
```

### Adaptive Komponenten
```css
/* Responsive Filter-Toolbar */
.filter-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: center;
}

@media (max-width: 768px) {
  .filter-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-row {
    justify-content: center;
  }

  .result-info {
    text-align: center;
    margin: 0;
  }
}

/* Responsive Event-Tiles */
.event-tile {
  min-height: 400px;
}

@media (max-width: 480px) {
  .event-tile {
    min-height: 350px;
  }

  .tile-header {
    height: 150px;
  }

  .tile-body {
    padding: var(--space-sm);
  }
}
```

## View-System

### Einheitliche View-Verwaltung
```javascript
const ViewManager = {
  currentView: 'list',

  switchTo: (viewName) => {
    ViewManager.currentView = viewName;
    renderCurrentView();
    updateURL();
  },

  render: () => {
    switch (ViewManager.currentView) {
      case 'list':
        return renderEventWall(AppState.filteredEvents);
      case 'calendar':
        return renderCalendarView(AppState.filteredEvents);
      default:
        return renderEventWall(AppState.filteredEvents);
    }
  }
};
```

### View-spezifische Renderer
```javascript
const renderEventWall = (events) => {
  const container = document.getElementById('edu-event-wall');
  container.innerHTML = '';

  if (!events || events.length === 0) {
    container.innerHTML = '<div id="no-events">Keine Treffer für die gewählten Filter.</div>';
    return;
  }

  events.forEach(event => {
    const tile = createEventTile(event);
    container.appendChild(tile);
  });
};

const renderCalendarView = (events) => {
  const container = document.getElementById('calendar-days');
  // Kalender-spezifische Rendering-Logik
  renderCalendarGrid(events);
};
```

## Error Handling

### Einheitliches Fehler-Management
```javascript
const ErrorManager = {
  show: (message, type = 'error') => {
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.textContent = message;
    alert.setAttribute('role', 'alert');

    // Entfernen nach 5 Sekunden
    setTimeout(() => {
      if (alert.parentNode) {
        alert.parentNode.removeChild(alert);
      }
    }, 5000);

    // In DOM einfügen
    const container = document.querySelector('.filter-toolbar') || document.body;
    container.insertBefore(alert, container.firstChild);
  },

  handleAPIError: (error) => {
    console.error('API-Fehler:', error);
    ErrorManager.show('Fehler beim Laden der Termine. Bitte versuchen Sie es später erneut.', 'error');
  },

  handleNetworkError: (error) => {
    console.error('Netzwerk-Fehler:', error);
    ErrorManager.show('Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.', 'error');
  }
};
```

## Performance-Optimierung

### Event-Delegation
```javascript
const EventDelegator = {
  init: () => {
    // Tag-Buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('.tag-badge')) {
        e.stopPropagation();
        const tag = decodeURIComponent(e.target.getAttribute('data-tag'));
        FilterManager.addTag(tag);
      }
    });

    // Modal-Close
    document.addEventListener('click', (e) => {
      if (e.target.matches('#close-modal') || e.target.matches('#event-modal')) {
        ModalManager.hide();
      }
    });

    // Keyboard-Events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && AppState.modalOpen) {
        ModalManager.hide();
      }
    });
  }
};
```

### Lazy Loading für Bilder
```javascript
const LazyImageLoader = {
  load: (img) => {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove('lazy');
            observer.unobserve(img);
          }
        });
      });
      observer.observe(img);
    } else {
      // Fallback für ältere Browser
      img.src = img.dataset.src;
    }
  }
};
```

## Testing-Strategie

### Unit-Tests für Kernfunktionen
```javascript
describe('EventManager', () => {
  test('buildEvent normalisiert Daten korrekt', () => {
    const rawEvent = {
      title: 'Test Event',
      start: '2025-01-01T10:00:00Z',
      tags: 'test1, test2, test3'
    };

    const event = buildEvent(rawEvent);
    expect(event.tagsArr).toEqual(['test1', 'test2', 'test3']);
    expect(event.tagsLower).toEqual(['test1', 'test2', 'test3']);
  });

  test('normalizeTags handhabt verschiedene Eingaben', () => {
    expect(normalizeTags('a, b, c')).toEqual(['a', 'b', 'c']);
    expect(normalizeTags(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(normalizeTags('')).toEqual([]);
  });
});
```

### Integration-Tests
```javascript
describe('FilterManager', () => {
  test('applyFilters filtert nach Tags korrekt', () => {
    const events = [
      buildEvent({ title: 'Event 1', tags: 'tag1, tag2' }),
      buildEvent({ title: 'Event 2', tags: 'tag2, tag3' }),
      buildEvent({ title: 'Event 3', tags: 'tag3, tag4' })
    ];

    FilterManager.state.selectedTags = new Set(['tag1']);
    const filtered = FilterManager.applyFilters(events);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Event 1');
  });
});
```

## Deployment & Build

### Asset-Management
```javascript
const AssetManager = {
  loadCSS: (theme) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `themes/${theme}.css`;
    document.head.appendChild(link);
  },

  loadJS: (src) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
};
```

### Environment-Konfiguration
```javascript
const Environment = {
  isDevelopment: window.location.hostname === 'localhost',
  isProduction: window.location.hostname.includes('rpi-virtuell.de'),

  getAPIEndpoint: () => {
    if (Environment.isDevelopment) {
      return 'http://localhost:3000/webhook/nostre_termine';
    }
    return 'https://n8n.rpi-virtuell.de/webhook/nostre_termine';
  }
};
```

## Utility Functions

### Gemeinsame Hilfsfunktionen
```javascript
const EventUtils = {
  // Datum-Formatierung
  toMonthKey: (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,'0');
    return y + '-' + m;
  },

  monthKeyToLabel: (key) => {
    const [y,m] = key.split('-').map(Number);
    const date = new Date(y, m-1, 1);
    return new Intl.DateTimeFormat('de-DE', { month:'long', year:'numeric' }).format(date);
  },

  formatEventTimeSpan: (start, end) => {
    const isSameDay = start.toDateString() === end.toDateString();
    if (isSameDay) {
      const dateFormat = new Intl.DateTimeFormat('de-DE', { day:'numeric', month:'long', year:'numeric' });
      const startTimeFormat = new Intl.DateTimeFormat('de-DE', { hour:'2-digit', minute:'2-digit' });
      const endTimeFormat = new Intl.DateTimeFormat('de-DE', { hour:'2-digit', minute:'2-digit' });
      return `${dateFormat.format(start)}, ${startTimeFormat.format(start)} - ${endTimeFormat.format(end)} Uhr`;
    } else {
      const fullFormat = new Intl.DateTimeFormat('de-DE', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
      return `${fullFormat.format(start)} Uhr - ${fullFormat.format(end)} Uhr`;
    }
  },

  // Text-Verarbeitung
  toPlainText: (html) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return (div.textContent || div.innerText || '').replace(/\s+/g,' ').trim();
  },

  truncateWords: (text, limit) => {
    if (!text) return '';
    const words = text.split(' ');
    if (words.length <= limit) return text;
    return words.slice(0, limit).join(' ') + '…';
  },

  // Tag-Verarbeitung
  normalizeTags: (raw) => {
    const arr = Array.isArray(raw) ? raw : (raw ? String(raw).split(',') : []);
    return arr.map(t => t.trim()).filter(Boolean);
  },

  getAllTagsWithCounts: (events) => {
    const map = new Map();
    events.forEach(e => e.tagsArr.forEach(tag => {
      const key = tag.toLowerCase();
      const entry = map.get(key) || { label: tag, count: 0 };
      if (tag.length > entry.label.length) entry.label = tag;
      entry.count++;
      map.set(key, entry);
    }));
    return Array.from(map.entries())
      .sort((a,b) => b[1].count - a[1].count)
      .map(([key, val]) => ({ key, label: val.label, count: val.count }));
  },

  getAllMonths: (events) => {
    const set = new Set(events.map(e => e.monthKey));
    return Array.from(set).sort();
  }
};
```

## Event Listeners

### Einheitliche Event-Handler
```javascript
const EventHandlers = {
  // Tag-Click Handler
  onTagClick: (tag, event) => {
    event.stopPropagation();
    FilterManager.addTag(tag);
  },

  // Modal-Close Handler
  onModalClose: () => {
    ModalManager.hide();
  },

  // Keyboard Handler
  onKeyDown: (event) => {
    if (event.key === 'Escape' && AppState.modalOpen) {
      ModalManager.hide();
    }
  },

  // Filter-Change Handler
  onFilterChange: (type, value) => {
    switch (type) {
      case 'tag':
        FilterManager.addTag(value);
        break;
      case 'search':
        FilterManager.setSearch(value);
        break;
      case 'month':
        FilterManager.setMonth(value);
        break;
      case 'reset':
        FilterManager.reset();
        break;
    }
  },

  // View-Switch Handler
  onViewSwitch: (viewName) => {
    ViewManager.switchTo(viewName);
  }
};
```

## Animation System

### Einheitliche Animationen
```css
/* Modal Animationen */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideIn {
  from { transform: translateY(-50px); }
  to { transform: translateY(0); }
}

@keyframes slideUp {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

/* Hover Animationen */
.event-tile {
  transition: all var(--duration-normal) var(--easing-default);
}

.event-tile:hover {
  transform: translateY(-2px);
}

/* Loading Animationen */
.loading-spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
```

## Accessibility Features

### Einheitliche A11y-Features
```javascript
const AccessibilityManager = {
  // Screen Reader Announcements
  announce: (message, priority = 'polite') => {
    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    announcer.textContent = message;

    document.body.appendChild(announcer);

    setTimeout(() => {
      document.body.removeChild(announcer);
    }, 1000);
  },

  // Focus Management
  manageFocus: () => {
    // Skip Links
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.className = 'skip-link';
    skipLink.textContent = 'Zum Hauptinhalt springen';
    document.body.insertBefore(skipLink, document.body.firstChild);

    // Focus Trap für Modals
    const focusableElements = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const modal = document.getElementById('event-modal');

    if (modal) {
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          const focusable = modal.querySelectorAll(focusableElements);
          const firstFocusable = focusable[0];
          const lastFocusable = focusable[focusable.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstFocusable) {
              lastFocusable.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastFocusable) {
              firstFocusable.focus();
              e.preventDefault();
            }
          }
        }
      });
    }
  },

  // ARIA Updates
  updateAria: (element, state) => {
    Object.keys(state).forEach(key => {
      element.setAttribute(`aria-${key}`, state[key]);
    });
  }
};
```

## Performance Monitoring

### Gemeinsame Performance-Überwachung
```javascript
const PerformanceMonitor = {
  // Ladezeiten messen
  measureLoadTime: (label, startTime) => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(`${label}: ${duration.toFixed(2)}ms`);

    // Performance API nutzen
    if ('performance' in window && 'measure' in performance) {
      performance.measure(label, 'start', label);
    }
  },

  // Memory Usage überwachen
  monitorMemory: () => {
    if ('memory' in performance) {
      const memory = performance.memory;
      console.log('Memory Usage:', {
        used: Math.round(memory.usedJSHeapSize / 1048576) + 'MB',
        total: Math.round(memory.totalJSHeapSize / 1048576) + 'MB',
        limit: Math.round(memory.jsHeapSizeLimit / 1048576) + 'MB'
      });
    }
  },

  // Intersection Observer für Lazy Loading
  setupIntersectionObserver: () => {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target;
            if (element.dataset.src) {
              element.src = element.dataset.src;
              element.classList.remove('lazy');
            }
            observer.unobserve(element);
          }
        });
      }, {
        rootMargin: '50px'
      });

      return observer;
    }
    return null;
  }
};
```

## Internationalization

### Gemeinsame i18n-Strategie
```javascript
const I18nManager = {
  locale: 'de-DE',
  messages: {
    'de-DE': {
      'loading': 'Lade Termine...',
      'noEvents': 'Keine Treffer für die gewählten Filter.',
      'errorLoading': 'Fehler beim Laden der Termine.',
      'networkError': 'Netzwerkfehler. Bitte prüfen Sie Ihre Internetverbindung.',
      'resultsCount': (count) => `${count} ${count === 1 ? 'Treffer' : 'Treffer'}`,
      'filterByTag': 'Nach Tag filtern',
      'removeTag': 'Tag entfernen',
      'closeModal': 'Schließen',
      'editEvent': 'Bearbeiten',
      'viewDetails': 'Details ansehen',
      'noSummary': 'Keine Zusammenfassung vorhanden.',
      'noLocation': 'Kein Ort angegeben.',
      'noTags': 'Keine'
    },
    'en-US': {
      'loading': 'Loading events...',
      'noEvents': 'No results for the selected filters.',
      'errorLoading': 'Error loading events.',
      'networkError': 'Network error. Please check your internet connection.',
      'resultsCount': (count) => `${count} ${count === 1 ? 'result' : 'results'}`,
      'filterByTag': 'Filter by tag',
      'removeTag': 'Remove tag',
      'closeModal': 'Close',
      'editEvent': 'Edit',
      'viewDetails': 'View details',
      'noSummary': 'No summary available.',
      'noLocation': 'No location specified.',
      'noTags': 'None'
    }
  },

  t: (key, params) => {
    const localeMessages = I18nManager.messages[I18nManager.locale] || I18nManager.messages['de-DE'];
    let message = localeMessages[key] || key;

    if (typeof message === 'function') {
      message = message(params);
    }

    return message;
  },

  setLocale: (locale) => {
    I18nManager.locale = locale;
    document.documentElement.setAttribute('lang', locale);
  }
};
```

## Integration Guidelines

### Event Wall Integration
```javascript
// In index.html oder event-wall.js
const EventWallApp = {
  init: async () => {
    // 1. Environment prüfen
    const endpoint = Environment.getAPIEndpoint();

    // 2. Daten laden
    AppState.allEvents = await fetchEvents();

    // 3. UI initialisieren
    FilterUI.renderTagSelector();
    FilterUI.renderMonthSelector();

    // 4. Event-Listener binden
    EventDelegator.init();
    AccessibilityManager.manageFocus();

    // 5. Initial render
    renderEventWall(AppState.allEvents);

    // 6. Performance-Monitoring starten
    PerformanceMonitor.monitorMemory();
  }
};
```

### Calendar Integration
```javascript
// In calendar-view.html
const CalendarApp = {
  init: async () => {
    // 1. Gleiche Environment-Konfiguration
    const endpoint = Environment.getAPIEndpoint();

    // 2. Gleiche Daten-Laden-Logik
    AppState.allEvents = await fetchEvents();

    // 3. Kalender-spezifische Initialisierung
    CalendarRenderer.init();
    CalendarNavigation.init();

    // 4. Gleiche Event-Handler
    EventDelegator.init();
    AccessibilityManager.manageFocus();

    // 5. Gleiche Performance-Überwachung
    PerformanceMonitor.monitorMemory();
  }
};
```

## Best Practices

### Code Organization
1. **Modularität**: Halten Sie Funktionen klein und fokussiert
2. **Wiederverwendung**: Nutzen Sie gemeinsame Utilities in beiden Apps
3. **Konsistenz**: Verwenden Sie die gleichen Naming-Conventions
4. **Error Handling**: Implementieren Sie einheitliches Fehler-Management
5. **Performance**: Nutzen Sie Lazy Loading und Performance-Monitoring

### Styling Guidelines
1. **Design Tokens**: Verwenden Sie die definierten CSS-Variablen
2. **Responsive Design**: Implementieren Sie Mobile-First Ansatz
3. **Accessibility**: Befolgen Sie WCAG-Richtlinien
4. **Theme Support**: Unterstützen Sie Hell/Dunkel-Modi
5. **Animationen**: Nutzen Sie einheitliche Animationen

### Testing Strategy
1. **Unit Tests**: Testen Sie einzelne Funktionen isoliert
2. **Integration Tests**: Testen Sie die Zusammenarbeit zwischen Komponenten
3. **E2E Tests**: Testen Sie komplette User Journeys
4. **Performance Tests**: Überwachen Sie Ladezeiten und Memory Usage
5. **Accessibility Tests**: Verwenden Sie Screen Reader und Tastatur-Navigation