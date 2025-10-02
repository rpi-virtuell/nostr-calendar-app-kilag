import { formatDateRange } from '../utils.js';

/**
 * Erstellt die Monatsoptionen für das Filter-Dropdown
 * @param {HTMLSelectElement} selectEl - Das Select-Element für die Monate
 * @param {Array} events - Array von Event-Objekten
 */
export function buildMonthOptions(selectEl, events){
  // collect months from events
  const months = new Set();
  for(const e of events){
    const startS = Number(e.tags.find(t=>t[0]==='starts')?.[1]||e.tags.find(t=>t[0]==='start')?.[1]||0);
    if(!startS) continue;
    const d = new Date(startS*1000);
    months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const values = [...months].sort();
  selectEl.innerHTML = '<option value="">Alle Monate</option>' +
    values.map(v=>`<option value="${v}">${v}</option>`).join('');
}

/**
 * Rendert die Event-Wall mit dem neuen Design-System
 * @param {HTMLElement} container - Container für die Event-Tiles
 * @param {Array} events - Array von Event-Objekten
 */
export function renderGrid(container, events){
  container.innerHTML = '';

  if (!events || events.length === 0) {
    container.innerHTML = '<div class="no-events">Keine Treffer für die gewählten Filter.</div>';
    return;
  }

  for(const e of events){
    const tile = createEventTile(e);
    container.appendChild(tile);
  }
}

/**
 * Erstellt ein Event-Tile entsprechend dem Design-System
 * @param {Object} e - Event-Objekt
 * @returns {HTMLElement} Event-Tile Element
 */
function createEventTile(e) {
  // Stelle sicher, dass tags existiert
  const tags = e.tags || [];
  const evPubkey = (e.pubkey || '').toLowerCase();

  // Hilfsfunktion: Darf aktueller User dieses Event bearbeiten?
  async function canEditEvent() {
    try {
      if (window.authManager) {
        const plugin = await window.authManager.getActivePlugin();
        if (plugin && await plugin.isLoggedIn()) {
          const userPk = ((await plugin.getPublicKey()) || '').toLowerCase();
          return !!(evPubkey && userPk && evPubkey === userPk);
        }
      }
      // Fallback über direkten Nostr-Client
      if (window.nostrClient && window.nostrClient.signer && typeof window.nostrClient.signer.getPublicKey === 'function') {
        const userPk = ((await window.nostrClient.signer.getPublicKey()) || '').toLowerCase();
        return !!(evPubkey && userPk && evPubkey === userPk);
      }
    } catch (err) {
      console.warn('[list] canEditEvent check failed:', err);
    }
    return false;
  }

  // Event-Daten extrahieren
  const titleTag = tags.find(t=>t[0]==='title')?.[1] || '(ohne Titel)';
  const image = tags.find(t=>t[0]==='image')?.[1];
  const startS = Number(tags.find(t=>t[0]==='starts')?.[1]||tags.find(t=>t[0]==='start')?.[1]||0);
  const endS = Number(tags.find(t=>t[0]==='ends')?.[1]||tags.find(t=>t[0]==='end')?.[1]||startS);
  const where = tags.find(t=>t[0]==='location')?.[1] || '';
  const status = tags.find(t=>t[0]==='status')?.[1] || 'planned';
  const summary = tags.find(t=>t[0]==='summary')?.[1] || '';
  const dtag = tags.find(t=>t[0]==='d')?.[1];
  const tagList = tags.filter(t=>t[0]==='t').map(t=>t[1]);

  // Event-Tile erstellen
  const tile = document.createElement('article');
  tile.className = 'event-tile';
  tile.setAttribute('tabindex', '0');
  tile.setAttribute('role', 'button');
  tile.setAttribute('aria-label', `Event: ${titleTag}`);

  // Tile Tags (oben rechts, außerhalb des wrappers)
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tile-tags';

  tagList.forEach(t => {
    const tagBadge = document.createElement('button');
    tagBadge.className = 'tag-badge';
    tagBadge.textContent = t;
    tagBadge.setAttribute('data-tag', t);
    tagBadge.setAttribute('title', 'Nach Tag filtern');
    tagBadge.addEventListener('click', (event) => {
      event.stopPropagation();
      // Event für Tag-Filter auslösen
      const tagEvent = new CustomEvent('filter-by-tag', { detail: { tag: t } });
      window.dispatchEvent(tagEvent);
    });
    tagsContainer.appendChild(tagBadge);
  });

  // Status-Badge
  if(status !== 'planned'){
    const statusBadge = document.createElement('button');
    statusBadge.className = 'tag-badge';
    statusBadge.textContent = status;
    statusBadge.setAttribute('data-tag', status);
    statusBadge.setAttribute('title', 'Status: ' + status);
    statusBadge.style.backgroundColor = 'var(--color-warning)';
    tagsContainer.appendChild(statusBadge);
  }

  // Event Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'event-wrapper';

  // Tile Header mit Date Bubble
  const header = document.createElement('div');
  header.className = 'tile-header';

  if(image){
    header.style.backgroundImage = `url(${image})`;
  } else {
    // Placeholder für Events ohne Bild
    header.style.background = 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))';
  }

  // Tile Overlay
  const overlay = document.createElement('div');
  overlay.className = 'tile-overlay';

  // Date Bubble
  const dateBubble = document.createElement('div');
  dateBubble.className = 'date-bubble';
  dateBubble.setAttribute('aria-hidden', 'true');

  if (startS) {
    const startDate = new Date(startS * 1000);
    const year = startDate.getFullYear();
    const day = startDate.getDate();
    const month = startDate.toLocaleDateString('de-DE', { month: 'short' });

    dateBubble.innerHTML = `
      <div class="date-bubble-year">${year}</div>
      <div class="date-bubble-day">${day}</div>
      <div class="date-bubble-month">${month}</div>
    `;
  }

  overlay.appendChild(dateBubble);
  header.appendChild(overlay);

  // Tile Body
  const body = document.createElement('div');
  body.className = 'tile-body';

  // Title
  const title = document.createElement('h3');
  title.className = 'tile-title';
  title.textContent = titleTag;

  // Meta Information
  const meta = document.createElement('div');
  meta.className = 'tile-meta';

  // Zeit
  if (startS) {
    const metaTime = document.createElement('p');
    const timeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"></path></svg>';
    metaTime.innerHTML = `${timeIcon}<span>${formatDateRange(startS, endS)}</span>`;
    meta.appendChild(metaTime);
  }

  // Ort
  if (where) {
    const metaLocation = document.createElement('p');
    const locationIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>';
    if (where.startsWith('http')) {
      metaLocation.innerHTML = `${locationIcon}<span><a href="${where}" target="_blank" rel="noopener noreferrer">${where}</a></span>`;
    } else {
      metaLocation.innerHTML = `${locationIcon}<span>${where}</span>`;
    }
    meta.appendChild(metaLocation);
  }

  // Autor (falls verfügbar)
  const author = tags.find(t=>t[0]==='p')?.[1];
  if (author) {
    const metaAuthor = document.createElement('p');
    const authorIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg>';
    metaAuthor.innerHTML = `${authorIcon}<span>${author}</span>`;
    meta.appendChild(metaAuthor);
  }

  // Ghost für Layout
  const ghost = document.createElement('div');
  ghost.className = 'tile-ghost';
  ghost.setAttribute('aria-hidden', 'true');

  // Summary
  const tileSummary = document.createElement('p');
  tileSummary.className = 'tile-summary';
  tileSummary.textContent = summary || 'Keine Beschreibung verfügbar.';

  body.appendChild(title);
  body.appendChild(meta);
  body.appendChild(ghost);
  body.appendChild(tileSummary);

  // Tile Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'tile-toolbar';

  const toolbarLeft = document.createElement('div');
  toolbarLeft.className = 'tile-toolbar-left';

  const toolbarRight = document.createElement('div');
  toolbarRight.className = 'tile-toolbar-right';

  // Bearbeiten Button
  // Bearbeiten-Button nur anzeigen, wenn aktueller User = Event-Autor
  const editBtn = document.createElement('button');
  editBtn.className = 'btn secondary edit-btn';
  editBtn.textContent = 'Bearbeiten';
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const ev = new CustomEvent('edit-event', { detail: { event: e, d: dtag } });
    window.dispatchEvent(ev);
  });
  // Button erst anhängen, wenn Berechtigung bestätigt wurde
  canEditEvent().then((ok) => {
    if (ok) toolbarLeft.appendChild(editBtn);
  });

  // Details Button
  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn primary show-btn';
  detailsBtn.textContent = 'Details ansehen';
  detailsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const detailEvent = new CustomEvent('view-event-detail', { detail: { event: e } });
    window.dispatchEvent(detailEvent);
  });

  toolbarRight.appendChild(detailsBtn);

  toolbar.appendChild(toolbarLeft);
  toolbar.appendChild(toolbarRight);

  // Event-Tile zusammensetzen
  tile.appendChild(tagsContainer); // Tags zuerst, damit sie über dem wrapper liegen
  tile.appendChild(wrapper);

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  wrapper.appendChild(toolbar);

  // Klick auf Tile für Detail-Ansicht
  tile.addEventListener('click', (event) => {
    // Verhindere, dass Klicks auf Buttons das Tile-Event auslösen
    if (event.target.closest('button')) return;
    const detailEvent = new CustomEvent('view-event-detail', { detail: { event: e } });
    window.dispatchEvent(detailEvent);
  });

  // Keyboard Navigation
  tile.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tile.click();
    }
  });

  return tile;
}
