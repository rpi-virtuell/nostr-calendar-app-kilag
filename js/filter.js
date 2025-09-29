/**
 * Filter Management System
 * Verwaltet die Filter-UI und Tag-Suggestions
 */

class FilterManager {
  constructor() {
    this.tagInput = null;
    this.tagSuggest = null;
    this.searchInput = null;
    this.monthSelect = null;
    this.resetButton = null;
    this.resultInfo = null;
    this.selectedTagsContainer = null;

    this.allTags = new Map();
    this.filteredTags = [];
    this.selectedTags = new Set();
    this.currentQuery = '';
    this.highlightedIndex = -1;
  this.tagLabels = new Map();

    this.init();
  }

  /**
   * Initialisiert das Filter-System
   */
  init() {
    this.bindElements();
    this.bindEvents();
    this.loadTags();
  }

  /**
   * Bindet DOM-Elemente
   */
  bindElements() {
    this.tagInput = document.getElementById('tag-input');
    this.tagSuggest = document.getElementById('tag-suggest');
    this.searchInput = document.getElementById('search-input');
    this.monthSelect = document.getElementById('month-select');
    this.resetButton = document.getElementById('reset-filters');
    this.resultInfo = document.getElementById('result-info');
    this.selectedTagsContainer = document.getElementById('selected-tags');
  }

  /**
   * Bindet Event-Listener
   */
  bindEvents() {
    // Tag Input Events
    if (this.tagInput) {
      this.tagInput.addEventListener('input', (e) => this.onTagInput(e));
      this.tagInput.addEventListener('keydown', (e) => this.onTagKeydown(e));
      this.tagInput.addEventListener('focus', () => {
        // Suggestions anzeigen wenn Query vorhanden ist oder wenn keine Query aber Tags verfügbar sind
        if (this.currentQuery || this.allTags.size > 0) {
          this.updateSuggestions();
          this.showSuggestions();
        }
      });
      this.tagInput.addEventListener('blur', () => {
        // Verzögere das Ausblenden, damit Klicks auf Suggestions noch funktionieren
        setTimeout(() => {
          this.hideSuggestions();
        }, 200);
      });
    }

    // Suggestion Clicks
    if (this.tagSuggest) {
      this.tagSuggest.addEventListener('click', (e) => {
        const item = e.target.closest('.suggest-item');
        if (item) {
          const key = item.dataset.key;
          const label = item.dataset.label || item.textContent.trim();
          this.selectTag(key, label);
        }
      });
    }

    // Search Input Events
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.onSearchInput(e));
    }

    // Month Select Events
    if (this.monthSelect) {
      this.monthSelect.addEventListener('change', (e) => this.onMonthChange(e));
    }

    // Reset Button
    if (this.resetButton) {
      this.resetButton.addEventListener('click', () => this.resetFilters());
    }

    // Global Events
    document.addEventListener('filter-by-tag', (e) => this.addTag(e.detail.tag));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tagbox')) {
        this.hideSuggestions();
      }
    });
  }

  /**
   * Lädt alle verfügbaren Tags
   */
  async loadTags() {
    try {
      // Sammle alle Tags aus den Events
      const events = window.allEvents || [];
  const tagCounts = new Map();

      events.forEach(event => {
        if (event.tags) {
          event.tags.forEach(tag => {
            if (tag[0] === 't' && tag[1]) {
              const rawTag = String(tag[1]);
              const tagKey = rawTag.toLowerCase();
              const entry = tagCounts.get(tagKey);

              if (entry) {
                entry.count += 1;
                if (rawTag !== rawTag.toLowerCase() && entry.label === entry.label.toLowerCase()) {
                  entry.label = rawTag;
                }
              } else {
                tagCounts.set(tagKey, { count: 1, label: rawTag });
              }
            }
          });
        }
      });

      // Sortiere nach Häufigkeit
      this.allTags = new Map([...tagCounts.entries()].sort((a, b) => b[1].count - a[1].count));
      this.tagLabels = new Map(Array.from(this.allTags.entries()).map(([key, info]) => [key, info.label]));
      this.updateSuggestions();
    } catch (error) {
      console.error('Fehler beim Laden der Tags:', error);
    }
  }

  /**
   * Behandelt Tag-Input
   */
  onTagInput(e) {
    this.currentQuery = e.target.value.toLowerCase().trim();
    this.updateSuggestions();

    // Nur Suggestions anzeigen wenn Query vorhanden ist
    if (this.currentQuery) {
      this.showSuggestions();
    } else {
      this.hideSuggestions();
    }
  }

  /**
   * Behandelt Tastendrücke im Tag-Input
   */
  onTagKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.highlightNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.highlightPrevious();
        break;
      case 'Enter':
        e.preventDefault();
        if (this.highlightedIndex >= 0 && this.filteredTags[this.highlightedIndex]) {
          const item = this.filteredTags[this.highlightedIndex];
          this.selectTag(item.key, item.label);
        } else if (this.currentQuery) {
          const typedLabel = this.tagInput ? this.tagInput.value.trim() : this.currentQuery;
          this.selectTag(this.currentQuery, typedLabel);
        }
        break;
      case 'Escape':
        this.hideSuggestions();
        this.tagInput.blur();
        break;
    }
  }

  /**
   * Behandelt Such-Input
   */
  onSearchInput(e) {
    const query = e.target.value;
    this.emitFilterChange('search', query);
  }

  /**
   * Behandelt Monats-Änderung
   */
  onMonthChange(e) {
    const month = e.target.value;
    this.emitFilterChange('month', month);
  }

  /**
   * Aktualisiert die Tag-Suggestions
   */
  updateSuggestions() {
    if (!this.tagSuggest) return;

    this.filteredTags = [];

    if (this.currentQuery) {
      // Filtere Tags nach Query
      for (const [key, info] of this.allTags) {
        if (key.includes(this.currentQuery)) {
          this.filteredTags.push({ key, label: info.label, count: info.count });
        }
      }
    } else {
      // Zeige die häufigsten Tags nur wenn Input fokussiert ist
      if (this.tagInput && document.activeElement === this.tagInput) {
        let i = 0;
        for (const [key, info] of this.allTags) {
          if (i >= 20) break; // Max 20 Vorschläge
          this.filteredTags.push({ key, label: info.label, count: info.count });
          i++;
        }
      }
    }

    this.renderSuggestions();
  }

  /**
   * Rendert die Tag-Suggestions
   */
  renderSuggestions() {
    if (!this.tagSuggest) return;

    this.tagSuggest.innerHTML = '';

    if (this.filteredTags.length === 0) {
      this.tagSuggest.style.display = 'none';
      return;
    }

    this.filteredTags.forEach((tag, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `suggest-item ${index === this.highlightedIndex ? 'highlighted' : ''}`;
      item.setAttribute('data-key', tag.key);
      item.setAttribute('data-label', tag.label);

      const label = document.createElement('span');
      label.textContent = tag.label;

      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `(${tag.count})`;

      item.appendChild(label);
      item.appendChild(count);

      item.addEventListener('mouseenter', () => {
        this.highlightedIndex = index;
        this.updateHighlight();
      });

      this.tagSuggest.appendChild(item);
    });

    this.tagSuggest.style.display = 'block';
  }

  /**
   * Zeigt die Suggestions nur bei Focus und wenn Query vorhanden
   */
  showSuggestions() {
    if (this.filteredTags.length > 0 && this.currentQuery) {
      console.log('[FilterManager] Zeige Suggestions:', this.filteredTags.length);
      if (this.tagSuggest) {
        this.tagSuggest.style.display = 'block';
        this.tagSuggest.classList.add('open');
      }
    }
  }

  /**
   * Versteckt die Suggestions
   */
  hideSuggestions() {
    console.log('[FilterManager] Verstecke Suggestions');
    if (this.tagSuggest) {
      this.tagSuggest.classList.remove('open');
      this.tagSuggest.style.display = 'none';
    }
    this.highlightedIndex = -1;
  }

  /**
   * Hebt den nächsten Vorschlag hervor
   */
  highlightNext() {
    this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredTags.length - 1);
    this.updateHighlight();
  }

  /**
   * Hebt den vorherigen Vorschlag hervor
   */
  highlightPrevious() {
    this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1);
    this.updateHighlight();
  }

  /**
   * Aktualisiert die Hervorhebung
   */
  updateHighlight() {
    const items = this.tagSuggest.querySelectorAll('.suggest-item');
    items.forEach((item, index) => {
      item.classList.toggle('highlighted', index === this.highlightedIndex);
    });

    if (this.highlightedIndex >= 0) {
      items[this.highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Wählt einen Tag aus
   */
  selectTag(tagKey, displayLabel) {
    const normalizedKey = (tagKey || '').toLowerCase().trim();
    if (!normalizedKey) return;

    const rawLabel = (displayLabel || tagKey || '').replace(/\s*\(\d+\)\s*$/, '').trim();
    const cleanLabel = rawLabel || normalizedKey;

    console.log('[FilterManager] Tag ausgewählt:', { key: normalizedKey, label: cleanLabel });

    this.addTag(normalizedKey, cleanLabel);
    this.clearTagInput();
    this.hideSuggestions();
  }

  /**
   * Fügt einen Tag hinzu
   */
  addTag(tag, label = null) {
    const normalizedTag = (tag || '').toLowerCase().trim();
    if (!normalizedTag || this.selectedTags.has(normalizedTag)) return;

    const displayLabel = (label || this.tagLabels.get(normalizedTag) || tag || '').trim() || normalizedTag;
    this.tagLabels.set(normalizedTag, displayLabel);

    console.log('[FilterManager] Tag hinzugefügt:', normalizedTag, 'Label:', displayLabel);
    this.selectedTags.add(normalizedTag);
    this.renderSelectedTags();
    this.emitFilterChange('tag', normalizedTag);
  }

  /**
   * Entfernt einen Tag
   */
  removeTag(tag) {
    const normalizedTag = (tag || '').toLowerCase().trim();
    if (this.selectedTags.has(normalizedTag)) {
      this.selectedTags.delete(normalizedTag);
      this.renderSelectedTags();
      this.emitFilterChange('tag', normalizedTag);
    }
  }

  /**
   * Rendert die ausgewählten Tags
   */
  renderSelectedTags() {
    if (!this.selectedTagsContainer) return;

    this.selectedTagsContainer.innerHTML = '';

    if (this.selectedTags.size === 0) return;

    this.selectedTags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'chip';

      const label = document.createElement('span');
      label.textContent = this.tagLabels.get(tag) || tag;

      const removeBtn = document.createElement('button');
      removeBtn.setAttribute('aria-label', 'Tag entfernen');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.removeTag(tag);
      });

      chip.appendChild(label);
      chip.appendChild(removeBtn);
      this.selectedTagsContainer.appendChild(chip);
    });
  }

  /**
   * Leert das Tag-Input
   */
  clearTagInput() {
    if (this.tagInput) {
      this.tagInput.value = '';
      this.currentQuery = '';
    }
  }

  /**
   * Setzt alle Filter zurück
   */
  resetFilters() {
    this.selectedTags.clear();
    this.renderSelectedTags();

    if (this.tagInput) this.tagInput.value = '';
    if (this.searchInput) this.searchInput.value = '';
    if (this.monthSelect) this.monthSelect.value = '';

    this.currentQuery = '';
    this.hideSuggestions();

    this.emitFilterChange('reset', null);
  }

  /**
   * Sendet Filter-Änderungen
   */
  emitFilterChange(type, value) {
    console.log('[FilterManager] Emit filter-change:', { type, value, selectedTags: Array.from(this.selectedTags) });
    const event = new CustomEvent('filter-change', {
      detail: { type, value, selectedTags: Array.from(this.selectedTags) }
    });
    window.dispatchEvent(event);
  }

  /**
   * Aktualisiert die Ergebnis-Anzeige
   */
  updateResultCount(count) {
    if (this.resultInfo) {
      this.resultInfo.textContent = `${count} Treffer`;
    }
  }
}

// Initialisiere Filter-Manager wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
  window.filterManager = new FilterManager();
});

// Exportiere für andere Module
export { FilterManager };