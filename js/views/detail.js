/**
 * Event Detail Modal System
 * Zeigt den vollständigen Inhalt eines Terminbeitrags in einem Modal an
 */

/**
 * Modal-Manager für Event-Details
 */
const DetailModalManager = {
  modal: null,
  currentEvent: null,

  /**
   * Initialisiert das Detail-Modal
   */
  init() {
    this.modal = document.getElementById('event-detail-modal');
    if (!this.modal) {
      console.error('Event Detail Modal nicht gefunden');
      return;
    }

    // Stelle sicher, dass das Modal geschlossen ist
    this.modal.style.display = 'none';
    this.modal.open = false;

    // Event-Listener für Modal-Interaktionen
    this.bindEvents();
  },

  /**
   * Bindet Event-Listener
   */
  bindEvents() {
    // Modal schließen
    const closeBtn = document.getElementById('close-detail-modal');
    const closeDetailBtn = document.getElementById('btn-close-detail');

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hide();
      });
    }

    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hide();
      });
    }

    // Bearbeiten Button
    const editBtn = document.getElementById('btn-edit-from-detail');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.currentEvent) {
          const tags = this.currentEvent.tags || [];
          const editEvent = new CustomEvent('edit-event', {
            detail: {
              event: this.currentEvent,
              d: tags.find(t=>t[0]==='d')?.[1]
            }
          });
          window.dispatchEvent(editEvent);
          this.hide();
        }
      });
    }

    // Keyboard Events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.hide();
      }
    });

    // Klick außerhalb des Modals
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        e.preventDefault();
        this.hide();
      }
    });
  },

  /**
   * Zeigt das Detail-Modal für ein Event
   * @param {Object} event - Event-Objekt
   */
  show(event) {
    if (!this.modal || !event) return;

    this.currentEvent = event;
    this.updateContent(event);
    this.modal.style.display = 'flex';
    this.modal.showModal();
    this.updateURL(event);

    // Focus-Management für Accessibility
    setTimeout(() => {
      const firstButton = this.modal.querySelector('button');
      if (firstButton) firstButton.focus();
    }, 100);
  },

  /**
   * Versteckt das Detail-Modal
   */
  hide() {
    if (this.modal) {
      this.modal.close();
      this.modal.style.display = 'none';
      this.modal.open = false;
      this.restoreURL();
    }
  },

  /**
   * Prüft ob das Modal geöffnet ist
   * @returns {boolean}
   */
  isOpen() {
    return this.modal && this.modal.open && this.modal.style.display !== 'none';
  },

  /**
   * Aktualisiert den Modal-Inhalt
   * @param {Object} event - Event-Objekt
   */
  updateContent(event) {
    if (!event) return;

    // Stelle sicher, dass tags existiert
    const tags = event.tags || [];
    const evPubkey = (event.pubkey || '').toLowerCase();

    // Helper: check if current user may edit
    const canEditEvent = async () => {
      try {
        if (window.authManager) {
          const plugin = await window.authManager.getActivePlugin();
          if (plugin && await plugin.isLoggedIn()) {
            const userPk = ((await plugin.getPublicKey()) || '').toLowerCase();
            return !!(evPubkey && userPk && evPubkey === userPk);
          }
        }
        if (window.nostrClient && window.nostrClient.signer && typeof window.nostrClient.signer.getPublicKey === 'function') {
          const userPk = ((await window.nostrClient.signer.getPublicKey()) || '').toLowerCase();
          return !!(evPubkey && userPk && evPubkey === userPk);
        }
      } catch (err) {
        console.warn('[detail] canEditEvent check failed:', err);
      }
      return false;
    };

    // Titel
    const titleEl = document.getElementById('detail-modal-title');
    if (titleEl) {
      titleEl.textContent = tags.find(t=>t[0]==='title')?.[1] || 'Unbenanntes Event';
    }

    // Bild
    const imgContainer = document.getElementById('detail-modal-image-container');
    if (imgContainer) {
      imgContainer.innerHTML = '';
      const image = tags.find(t=>t[0]==='image')?.[1];
      if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.alt = `Bild für ${tags.find(t=>t[0]==='title')?.[1] || 'Event'}`;
        img.style.width = '100%';
        img.style.maxHeight = '300px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = 'var(--radius-lg)';
        imgContainer.appendChild(img);
        imgContainer.style.display = 'block';
      } else {
        imgContainer.style.display = 'none';
      }
    }

    // Zusammenfassung
    const summaryEl = document.getElementById('detail-modal-summary');
    if (summaryEl) {
      const summary = tags.find(t=>t[0]==='summary')?.[1];
      summaryEl.textContent = summary || 'Keine Zusammenfassung vorhanden.';
    }

    // Ort
    const locationEl = document.getElementById('detail-modal-location');
    if (locationEl) {
      const location = tags.find(t=>t[0]==='location')?.[1];
      if (location) {
        if (location.startsWith('http')) {
          locationEl.innerHTML = `<span style="opacity: 0.8;">📍</span> <a href="${location}" target="_blank" rel="noopener noreferrer">${location}</a>`;
        } else {
          locationEl.innerHTML = `<span style="opacity: 0.8;">📍</span> ${location}`;
        }
      } else {
        locationEl.textContent = 'Kein Ort angegeben.';
      }
    }

    // Datum
    const dateEl = document.getElementById('detail-modal-date');
    if (dateEl) {
      const startS = Number(tags.find(t=>t[0]==='starts')?.[1]||tags.find(t=>t[0]==='start')?.[1]||0);
      const endS = Number(tags.find(t=>t[0]==='ends')?.[1]||tags.find(t=>t[0]==='end')?.[1]||startS);

      if (startS) {
        const startDate = new Date(startS * 1000);
        const endDate = new Date(endS * 1000);
        const isSameDay = startDate.toDateString() === endDate.toDateString();

        if (isSameDay) {
          const dateFormat = new Intl.DateTimeFormat('de-DE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          });
          const startTimeFormat = new Intl.DateTimeFormat('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const endTimeFormat = new Intl.DateTimeFormat('de-DE', {
            hour: '2-digit',
            minute: '2-digit'
          });
          dateEl.innerHTML = `<span style="opacity: 0.8;">🕐</span> ${dateFormat.format(startDate)}, ${startTimeFormat.format(startDate)} - ${endTimeFormat.format(endDate)} Uhr`;
        } else {
          const fullFormat = new Intl.DateTimeFormat('de-DE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          dateEl.innerHTML = `<span style="opacity: 0.8;">🕐</span> ${fullFormat.format(startDate)} Uhr - ${fullFormat.format(endDate)} Uhr`;
        }
      } else {
        dateEl.textContent = 'Kein Datum angegeben.';
      }
    }

    // Tags
    const tagsContainer = document.getElementById('detail-modal-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      const tagList = tags.filter(t=>t[0]==='t').map(t=>t[1]);

      if (tagList.length > 0) {
        tagList.forEach(tag => {
          const tagButton = document.createElement('button');
          tagButton.className = 'tag-badge';
          tagButton.textContent = tag;
          tagButton.style.cursor = 'pointer';
          tagButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const tagEvent = new CustomEvent('filter-by-tag', { detail: { tag } });
            window.dispatchEvent(tagEvent);
            this.hide();
          });
          tagsContainer.appendChild(tagButton);
        });
      } else {
        tagsContainer.textContent = 'Keine Tags';
      }
    }

    // Content
    const contentEl = document.getElementById('detail-modal-content');
    if (contentEl) {
      const content = event.content;
      if (content) {
        contentEl.innerHTML = content;
      } else {
        contentEl.textContent = 'Keine detaillierte Beschreibung verfügbar.';
      }
    }

    // Edit-Button Sichtbarkeit steuern
    const editBtn = document.getElementById('btn-edit-from-detail');
    if (editBtn) {
      // Standard: ausblenden bis Berechtigung bestätigt
      editBtn.style.display = 'none';
      canEditEvent().then((ok) => {
        editBtn.style.display = ok ? '' : 'none';
      });
    }
  },

  /**
   * Aktualisiert die URL mit Event-ID
   * @param {Object} event - Event-Objekt
   */
  updateURL(event) {
    const tags = event.tags || [];
    const eventId = tags.find(t=>t[0]==='d')?.[1] || event.id || '';
    if (eventId) {
      const url = new URL(window.location);
      url.hash = `id=${encodeURIComponent(eventId)}`;
      history.pushState(null, '', url);
    }
  },

  /**
   * Stellt die ursprüngliche URL wieder her
   */
  restoreURL() {
    const url = new URL(window.location);
    url.hash = '';
    history.pushState(null, '', url);
  }
};

/**
 * Initialisiert das Detail-System
 */
export function initDetailSystem() {
  DetailModalManager.init();

  // Event-Listener für Detail-Ansicht
  window.addEventListener('view-event-detail', (e) => {
    const event = e.detail?.event;
    if (event && event.tags) {
      DetailModalManager.show(event);
    } else {
      console.warn('Event detail view called with invalid event:', event);
    }
  });

  // URL-basierte Initialisierung
  window.addEventListener('load', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#id=')) {
      const eventId = decodeURIComponent(hash.substring(4));
      // Hier würde normalerweise das Event aus den Daten geladen werden
      // Für jetzt lassen wir es beim Event-Handler
    }
  });
}

/**
 * Zeigt Event-Details an
 * @param {Object} event - Event-Objekt
 */
export function showEventDetail(event) {
  DetailModalManager.show(event);
}

/**
 * Versteckt Event-Details
 */
export function hideEventDetail() {
  DetailModalManager.hide();
}