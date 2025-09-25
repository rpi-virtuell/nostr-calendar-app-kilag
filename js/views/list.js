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

  // Tile Header (Bild)
  const header = document.createElement('div');
  header.className = 'tile-header';
  if(image){
    header.style.backgroundImage = `url(${image})`;
  } else {
    // Placeholder für Events ohne Bild
    header.style.background = 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))';
    header.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 2rem;">📅</div>';
  }

  // Tile Body (Inhalt)
  const body = document.createElement('div');
  body.className = 'tile-body';

  const title = document.createElement('h3');
  title.className = 'tile-title';
  title.textContent = titleTag;
  title.style.fontSize = 'var(--tile-title-size)';
  title.style.margin = '0 0 var(--space-sm) 0';
  title.style.fontWeight = '600';

  const meta = document.createElement('div');
  meta.className = 'tile-meta';
  meta.style.fontSize = 'var(--tile-meta-size)';
  meta.style.color = 'rgba(255,255,255,0.9)';
  meta.style.marginBottom = 'var(--space-sm)';

  const metaWhen = document.createElement('div');
  metaWhen.className = 'meta-when';
  metaWhen.textContent = formatDateRange(startS, endS);

  const metaWhere = document.createElement('div');
  metaWhere.className = 'meta-where';
  if(where) {
    metaWhere.innerHTML = `<span style="opacity: 0.8;">📍</span> ${where}`;
  }

  meta.appendChild(metaWhen);
  if(where) meta.appendChild(metaWhere);

  const tileSummary = document.createElement('div');
  tileSummary.className = 'tile-summary';
  tileSummary.textContent = summary || 'Keine Beschreibung verfügbar.';
  tileSummary.style.fontSize = '0.9rem';
  tileSummary.style.lineHeight = '1.4';
  tileSummary.style.marginBottom = 'var(--space-sm)';
  tileSummary.style.opacity = '0.9';

  // Tags
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tile-tags';
  tagsContainer.style.display = 'flex';
  tagsContainer.style.flexWrap = 'wrap';
  tagsContainer.style.gap = 'var(--space-xs)';

  tagList.forEach(t => {
    const tagBadge = document.createElement('span');
    tagBadge.className = 'tag-badge';
    tagBadge.textContent = t;
    tagBadge.style.fontSize = 'var(--tag-badge-size)';
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
    const statusBadge = document.createElement('span');
    statusBadge.className = 'tag-badge';
    statusBadge.textContent = status;
    statusBadge.style.backgroundColor = 'var(--color-warning)';
    tagsContainer.appendChild(statusBadge);
  }

  body.appendChild(title);
  body.appendChild(meta);
  body.appendChild(tileSummary);
  body.appendChild(tagsContainer);

  // Tile Toolbar (Footer)
  const toolbar = document.createElement('div');
  toolbar.className = 'tile-toolbar';

  const toolbarLeft = document.createElement('div');
  toolbarLeft.className = 'tile-toolbar-left';

  const toolbarRight = document.createElement('div');
  toolbarRight.className = 'tile-toolbar-right';

  // Bearbeiten Button
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-primary';
  editBtn.textContent = 'Bearbeiten';
  editBtn.style.fontSize = '0.9rem';
  editBtn.style.padding = '8px 12px';
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const ev = new CustomEvent('edit-event', { detail: { event: e, d: dtag } });
    window.dispatchEvent(ev);
  });

  // Details Button
  const detailsBtn = document.createElement('button');
  detailsBtn.className = 'btn btn-ghost';
  detailsBtn.textContent = 'Details ansehen';
  detailsBtn.style.fontSize = '0.9rem';
  detailsBtn.style.padding = '8px 12px';
  detailsBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const detailEvent = new CustomEvent('view-event-detail', { detail: { event: e } });
    window.dispatchEvent(detailEvent);
  });

  toolbarRight.appendChild(editBtn);
  toolbarRight.appendChild(detailsBtn);

  toolbar.appendChild(toolbarLeft);
  toolbar.appendChild(toolbarRight);

  // Event-Tile zusammensetzen
  tile.appendChild(header);
  tile.appendChild(body);
  tile.appendChild(toolbar);

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
