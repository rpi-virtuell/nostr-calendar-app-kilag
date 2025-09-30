import { Config } from './config.js';
import { client } from './nostr.js';
window.nostrClient = client; // Debug-Haken für die Konsole
import { renderGrid, buildMonthOptions } from './views/list.js';
import { initDetailSystem } from './views/detail.js';
import { fillFormFromEvent, clearForm, getFormData, setupMdToolbar, setupTagInput, setEditableChips } from './views/form.js';
import { mdToHtml } from './utils.js';
import { MonthView } from './views/calendar.js';
import { uploadToBlossom, listBlossom, deleteFromBlossom } from './blossom.js';
import { uploadWithNip96 } from './nip96.js';
import { on, chip } from './utils.js';
import { setupBunkerEvents, initNip46FromUrl, connectBunker, autoReconnectBunker } from './bunker.js';
import { setupBlossomUI, refreshBlossom, renderBlossom, blossomState } from './blossom.js';
import { setupICSExport, setupICSImport } from './ics-import-export.js';
import { FilterManager } from './filter.js';
import { Subscriptions } from './subscriptions.js';

// New Plugin-based Authentication System
import { AuthManager } from './auth/AuthManager.js';
import { authRegistry } from './auth/AuthPluginInterface.js';
import { NostrAuthPlugin } from './auth/NostrAuthPlugin.js';

// Initialize Auth Manager
const authManager = new AuthManager();
window.authManager = authManager; // Debug access

const state = {
  events: [],
  filtered: [],
  selectedTags: new Set(),
  month: '',
  textSearch: ''
};

let els = {};
let currentView = localStorage.getItem('view') || 'cards';
let monthView;

function initEls() {
    els = {
      grid: document.getElementById('event-wall'), // Updated to use event-wall container
      info: document.getElementById('result-info'),
     monthSelect: document.getElementById('month-select'),
     tagSearch: document.getElementById('tag-input'), // Updated to new filter system
     selectedTags: document.getElementById('selected-tags'),
     textSearch: document.getElementById('search-input'), // Updated to new filter system
     btnNew: document.getElementById('btn-new'),
     btnRefresh: document.getElementById('btn-refresh'),
     modal: document.getElementById('event-modal'),
     btnCloseModal: document.getElementById('close-modal'),
     btnSave: document.getElementById('btn-save'),
     btnCancelEvent: document.getElementById('btn-cancel-event'),
     btnDelete: document.getElementById('btn-delete'),
     whoami: document.getElementById('whoami'),
     btnLogout: document.getElementById('btn-logout'),
    
    // New Sidebar Elements
    sidebarToggle: document.getElementById('sidebar-toggle'),
    sidebar: document.getElementById('sidebar'),
    sidebarClose: document.getElementById('sidebar-close'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    sidebarIcon: document.getElementById('sidebar-icon'),
    
    // Auth buttons in sidebar
    authNostr: document.getElementById('auth-nostr'),
    authExtension: document.getElementById('auth-extension'),
    authBunker: document.getElementById('auth-bunker'),
    
    // Settings in sidebar
    sidebarThemeSelect: document.getElementById('sidebar-theme-select'),
    sidebarIcsImport: document.getElementById('sidebar-ics-import'),
    sidebarIcsExport: document.getElementById('sidebar-ics-export'),

  // Subscriptions in sidebar
  subsList: document.getElementById('subscriptions-list'),
  subsInput: document.getElementById('subscription-input'),
  subsAdd: document.getElementById('subscription-add'),
  subsListSelect: document.getElementById('subs-list-select'),
  subsShareLink: document.getElementById('subs-share-link'),
  subsSaveAsOwn: document.getElementById('subs-save-as-own'),
    
    // Theme and other elements  
    monthGrid: document.getElementById('month-grid'),
    btnViewCards: document.getElementById('btn-view-cards'),
    btnViewMonth: document.getElementById('btn-view-month'),
    btnMedia: document.getElementById('btn-media'),
    blossomModal: document.getElementById('blossom-modal'),
    blossomClose: document.getElementById('close-blossom'),
    blossomTable: document.getElementById('blossom-table'),
    blossomInfo: document.getElementById('blossom-info'),
    blossomRefresh: document.getElementById('btn-blossom-refresh'),
    blossomFilterType: document.getElementById('blossom-filter-type'),
    blossomSizeMin: document.getElementById('blossom-size-min'),
    blossomSizeMax: document.getElementById('blossom-size-max'),
    blossomPrev: document.getElementById('blossom-prev'),
    blossomNext: document.getElementById('blossom-next'),
    blossomPageInfo: document.getElementById('blossom-pageinfo'),
    blossomPageSize: document.getElementById('blossom-pagesize'),
    blossomDrop: document.getElementById('blossom-drop'),
    previewModal: document.getElementById('preview-modal'),
    previewBody: document.getElementById('preview-body'),
    previewClose: document.getElementById('close-preview'),
    progressModal: document.getElementById('progress-modal'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    toolbar: document.getElementById('toolbar'),
    filterRow: document.getElementById('filter-row'),
  };

  // Create hidden buttons for ICS functionality (needed by setupICSImport/Export)
  const createHiddenButton = (id) => {
    let btn = document.getElementById(id);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = id;
      btn.style.display = 'none';
      document.body.appendChild(btn);
    }
    return btn;
  };
  
  els.btnICSImport = createHiddenButton('btn-ics-import');
  els.btnICSExport = createHiddenButton('btn-ics-export');
  
  // Create hidden theme selector (functionality moved to sidebar)
  els.themeSelect = createHiddenButton('theme-select');

  // Legacy buttons removed - using direct plugin architecture
}

// SIDEBAR
function setupSidebar() {
  const { sidebar, sidebarToggle, sidebarClose, sidebarOverlay, sidebarIcon } = els;
  
  const openSidebar = () => {
    sidebar.classList.remove('hidden');
    sidebarOverlay.classList.remove('hidden');
    setTimeout(() => {
      sidebar.classList.add('open');
      sidebarOverlay.classList.add('open');
    }, 10);
  };
  
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
    setTimeout(() => {
      sidebar.classList.add('hidden');
      sidebarOverlay.classList.add('hidden');
    }, 300);
  };
  
  // Toggle sidebar
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', openSidebar);
  }
  
  // Close sidebar
  if (sidebarClose) {
    sidebarClose.addEventListener('click', closeSidebar);
  }
  
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }
  
  // Escape key closes sidebar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && !sidebar.classList.contains('hidden')) {
      closeSidebar();
    }
  });
  
  return { openSidebar, closeSidebar };
}

// AUTHENTICATION (Direct Plugin Calls)
async function setupAuthButtons() {
  const { authNostr, authExtension, authBunker } = els;
  
  // Update sidebar auth button states
  const updateAuthButtons = async () => {
    const activePlugin = await authManager.getActivePlugin();
    const activeName = activePlugin?.name;
    
    // Update active state
    [authNostr, authExtension, authBunker].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    
    if (activeName === 'nostr' && authNostr) authNostr.classList.add('active');
    
    // Update sidebar visibility based on login state
    const authSection = document.querySelector('.sidebar-section.auth');
    const logoutSection = document.querySelector('.sidebar-section.logout-section');
    
    if (activePlugin) {
      // User is logged in - hide auth section, show logout
      if (authSection) authSection.style.display = 'none';
      if (logoutSection) logoutSection.classList.remove('hidden');
    } else {
      // User is not logged in - show auth section, hide logout
      if (authSection) authSection.style.display = '';
      if (logoutSection) logoutSection.classList.add('hidden');
    }
    
    // Update sidebar toggle icon
    // if (els.sidebarIcon) {
    //   els.sidebarIcon.textContent = activePlugin ? '👤' : '≡';
    // }
  };
  
  // Nostr Key Login
  if (authNostr) {
    authNostr.addEventListener('click', async () => {
      const nsec = prompt('Nostr Private Key (nsec) eingeben:');
      if (!nsec) return;
      
      try {
        const nostrPlugin = authManager.getPlugin('nostr');
        if (nostrPlugin) {
          await nostrPlugin.login({ method: 'manual', nsec });
          await updateAuthButtons();
          els.sidebar && setupSidebar().closeSidebar();
          showNotification('Nostr Login erfolgreich', 'success');
        }
      } catch (error) {
        console.error('Nostr login failed:', error);
        showNotification('Nostr Login fehlgeschlagen: ' + error.message, 'error');
      }
    });
  }
  
  // Browser Extension Login
  if (authExtension) {
    authExtension.addEventListener('click', async () => {
      try {
        const nostrPlugin = authManager.getPlugin('nostr');
        if (nostrPlugin) {
          await nostrPlugin.login({ method: 'nip07' });
          await updateAuthButtons();
          els.sidebar && setupSidebar().closeSidebar();
          showNotification('Extension Login erfolgreich', 'success');
        }
      } catch (error) {
        console.error('Extension login failed:', error);
        showNotification('Extension Login fehlgeschlagen: ' + error.message, 'error');
      }
    });
  }
  
  // Bunker Login
  if (authBunker) {
    authBunker.addEventListener('click', async () => {
      try {
        // Use existing bunker UI system
        const res = await connectBunker('', { target: authBunker });
        if (res && res.pubkey) {
          await updateAuthButtons();
          els.sidebar && setupSidebar().closeSidebar();
          showNotification('Bunker Login erfolgreich', 'success');
        }
      } catch (error) {
        console.error('Bunker login failed:', error);
        showNotification('Bunker Login fehlgeschlagen: ' + error.message, 'error');
      }
    });
  }
  
  
  return { updateAuthButtons };
}

// THEME
function applyTheme(name){
  document.body.classList.remove('theme-light','theme-dark','theme-custom');
  document.body.classList.add(`theme-${name}`);
  localStorage.setItem('calendar_theme', name);
}

// FILTERS
function createTagChip(label) {
  return chip(label, (tag) => {
    state.selectedTags.delete(tag);
    applyFilters();
  });
}

// CRUD
function openModalForNew(){
  clearForm();
  els.btnCancelEvent.classList.add('hidden');
  els.btnDelete.classList.add('hidden');
  document.getElementById('modal-title').textContent = 'Neuer Termin';
  els.modal.showModal();
}
async function openModalForEdit(evt){
  // Check if user is allowed to edit this event
  try {
    // Check current authentication status
    const activePlugin = await authManager.getActivePlugin();
    
    if (activePlugin && await activePlugin.isLoggedIn()) {
      // Get user's public key from active auth plugin
      const userPubKey = await activePlugin.getPublicKey();
      console.log('[DEBUG AUTH] User pubkey from active plugin:', userPubKey); 
      if (evt.pubkey && evt.pubkey !== userPubKey) {
        alert('Bearbeiten nicht möglich: Sie sind nicht der Autor dieses Termins.');
        return;
      }
    } else if (client && client.signer) {
      // Fallback to direct Nostr authentication
      const userPubKey = await client.signer.getPublicKey();
      if (evt.pubkey && evt.pubkey !== userPubKey) {
        alert('Bearbeiten nicht möglich: Sie sind nicht der Autor dieses Termins.');
        return;
      }
    } else {
      alert('Bearbeiten nicht möglich: Bitte zuerst einloggen.');
      return;
    }
  } catch (error) {
    console.error('Error checking edit permissions:', error);
    alert('Fehler beim Überprüfen der Berechtigung.');
    return;
  }

  fillFormFromEvent(evt);
  els.btnCancelEvent.classList.remove('hidden');
  els.btnDelete.classList.remove('hidden');
  document.getElementById('modal-title').textContent = 'Termin bearbeiten';
  els.modal.showModal();
}

// Upload stub (NIP‑96 if configured)
function setupUpload() {
  const uploadBtn = document.getElementById('btn-upload');
  if (uploadBtn) on(uploadBtn, 'click', async ()=>{
    const fileEl = document.getElementById('f-image-file');
    const file = fileEl?.files?.[0];
    if(!file){ alert('Bitte zuerst eine Bilddatei wählen.'); return; }
    try{
      const up = await uploadToBlossom(file);
      document.getElementById('f-image').value = up.url;
      return;
    }catch(e){ console.warn('Blossom upload failed, trying NIP-96', e); }
    try{
      // Try to get signer from active auth plugin
      let signer = null;
      const activePlugin = await authManager.getActivePlugin();
      if (activePlugin && activePlugin.getSigner) {
        signer = await activePlugin.getSigner();
      }
      if (!signer) {
        // Fallback to client login if no plugin signer available
        signer = client.signer || await client.login();
      }
      const up2 = await uploadWithNip96(file, signer);
      document.getElementById('f-image').value = up2.url;
      return;
    }catch(e){ console.warn('NIP-96 upload failed, falling back to DataURL', e); }
    if(!Config.mediaUploadEndpoint){
      // Fallback: inline DataURL (nur Demo)
      const reader = new FileReader();
      reader.onload = ()=>{ document.getElementById('f-image').value = reader.result; }
      reader.readAsDataURL(file);
      return;
    }
    try{
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(Config.mediaUploadEndpoint, { method:'POST', body: fd });
      const json = await res.json();
      const url = json.url || json.data?.url || json.location;
      if(url){ document.getElementById('f-image').value = url; }
      else alert('Upload ok, aber keine URL gefunden. Prüfen Sie den Endpoint.');
    }catch(err){
      console.error(err);
      alert('Upload fehlgeschlagen.');
    }
  });
}

// LIST + FILTER
function applyFilters(){
   console.log('[App] ApplyFilters aufgerufen mit:', {
     events: state.events.length,
     selectedTags: Array.from(state.selectedTags),
     textSearch: state.textSearch,
     month: state.month
   });

   let out = [...state.events];

   if(state.month){
     console.log('[App] Filtere nach Monat:', state.month);
     out = out.filter(e=>{
       const startS = Number(e.tags.find(t=>t[0]==='starts')?.[1]||e.tags.find(t=>t[0]==='start')?.[1] || 0);
       const d = new Date(startS*1000);
       const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
       return key===state.month;
     });
   }
   if(state.selectedTags.size){
     console.log('[App] Filtere nach Tags:', Array.from(state.selectedTags));
     out = out.filter(e=>{
       const evTags = e.tags.filter(t=>t[0]==='t').map(t=>t[1].toLowerCase());
       return [...state.selectedTags].every(t=> evTags.includes(t.toLowerCase()));
     });
   }
   if(state.textSearch){
     console.log('[App] Filtere nach Text:', state.textSearch);
     out = out.filter(e=>{
       const title = e.tags.find(t=>t[0]==='title')?.[1].toLowerCase() || '';
       const tags = e.tags.filter(t=>t[0]==='t').map(t=>t[1].toLowerCase()).join(' ');
       return (title+' '+tags).includes(state.textSearch);
     });
   }

   console.log('[App] Gefilterte Events:', out.length);
   state.filtered = out;

   // FilterManager über Ergebnisse informieren
   if (window.filterManager) {
     window.filterManager.updateResultCount(out.length);
   }

   if (els.info) els.info.textContent = `${out.length} Treffer`;
   renderCurrentView();
 }

function renderCurrentView(){
   // Wähle die Datenquelle: gefiltert, sonst alle
   const data = state.filtered.length ? state.filtered : state.events;
   console.log('[App] RenderCurrentView mit Daten:', data.length, 'Events (gefiltert aus', state.events.length, 'total)');

   if(currentView === 'month'){
     console.log('[App] Zeige Monatsansicht');
     // Monatsansicht: Grid verstecken, Month zeigen
     if (els.grid) els.grid.classList.add('hidden');
     if (els.monthGrid) els.monthGrid.classList.remove('hidden');
     // (Toolbar/Filter in der Monatsansicht ausblenden)
     if (els.toolbar) els.toolbar.classList.add('hidden');
     // Falls ein spezieller Monat gewählt wurde, anwenden
     if(state.month && monthView?.setMonth) monthView.setMonth(state.month);
     if (monthView) monthView.render(data);
   } else {
     console.log('[App] Zeige Kartenansicht mit', data.length, 'Events');
     data.sort((a,b)=> {
       const aS = Number(a.tags.find(t=>t[0]==='start'||t[0]==='starts')?.[1] || 0);
       const bS = Number(b.tags.find(t=>t[0]==='start'||t[0]==='starts')?.[1] || 0);
       return aS - bS;
     });
     // Kartenansicht: Month verstecken, Grid zeigen
     if (els.monthGrid) els.monthGrid.classList.add('hidden');
     if (els.grid) els.grid.classList.remove('hidden');
     // Filter in Kartenansicht sichtbar
     if (els.toolbar) els.toolbar.classList.remove('hidden');
     renderGrid(els.grid, data);
   }
 }

async function refresh(){
   console.log('[App] Refresh aufgerufen');
   if (els.info) els.info.textContent = 'Lade…';
   let events = [];
   try {
     // Load events from Nostr relays
     console.log('[App] Lade Events von Nostr Relays');
     // Build authors list: subscriptions + current logged-in user (if any)
     let authors = [];
     let userPk = null;
     let hasSubscriptions = false;
     
     // 1. Check if user is logged in and get their public key
     try {
       const activePlugin = await authManager.getActivePlugin();
       if (activePlugin && await activePlugin.isLoggedIn()) {
         userPk = await activePlugin.getPublicKey();
       } else if (client && client.signer && typeof client.signer.getPublicKey === 'function') {
         userPk = await client.signer.getPublicKey();
       }
       console.log('[App] Aktuell angemeldeter User:', userPk);
     } catch (e) {
       console.warn('[App] Fehler beim Ermitteln des angemeldeten Users:', e);
     }
     
     // 2. Get authors from subscriptions (if any)
     try {
       const subsAuthors = Subscriptions.getAuthors();
       if (subsAuthors && subsAuthors.length > 0) {
         authors = [...subsAuthors];
         hasSubscriptions = true;
         console.log('[App] Subscription Autoren:', authors);
       }
     } catch (e) {
       console.warn('[App] Fehler beim Laden der Subscription-Autoren:', e);
     }
     
     // 3. Always add logged-in user to authors list (if available)
     if (userPk) {
       authors = Array.from(new Set([...(authors||[]), userPk]));
       console.log('[App] User zur Autorenliste hinzugefügt:', userPk);
     }
     
     // 4. Check for URL parameter ?d= (subscription list ID)
     let hasSubscriptionListParam = false;
     try {
       const urlParams = new URLSearchParams(location.search);
       const listD = urlParams.get('list') || urlParams.get('d');
       if (listD) {
         hasSubscriptionListParam = true;
         console.log('[App] Subscription Liste aus URL Parameter:', listD);
       }
     } catch {}
     
     // 5. Fallback to Config.allowedAuthors only if:
     //    - No user is logged in AND
     //    - No subscriptions are available AND 
     //    - No subscription list parameter in URL
     if (!userPk && !hasSubscriptions && !hasSubscriptionListParam) {
       if (!authors || authors.length === 0) {
         authors = (Config.allowedAuthors || []).slice();
         console.log('[App] Verwende Config.allowedAuthors als Fallback:', authors);
       }
     }
     
     // 6. Final check - ensure we have at least some authors
     if (!authors || authors.length === 0) {
       authors = (Config.allowedAuthors || []).slice();
       console.log('[App] Finale Fallback-Autoren:', authors);
     }
     
     console.log('[App] fetchEvents finale Autorenliste:', authors);
     events = await client.fetchEvents({ sinceDays: 1000, authors });
     console.log('[App] Events geladen:', events.length);

     // Load WordPress events if authenticated via WordPress SSO
     const activePlugin = await authManager.getActivePlugin();

   } catch (err) {
     console.error('refresh failed:', err);
     if (els.info) els.info.textContent = 'Fehler beim Laden.';
   }
   console.log('[App] UpdateData mit Events:', events.length);
   updateData(events);
 }

// Show general notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  const colors = {
    success: '#4CAF50',
    error: '#f44336', 
    warning: '#ff9800',
    info: '#2196F3'
  };
  
  notification.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 10000;
    background: ${colors[type] || colors.info}; color: white; padding: 15px 20px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: system-ui, sans-serif; font-size: 14px;
  `;
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  notification.innerHTML = `${icons[type] || icons.info} ${message}`;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
}

function updateData(events) {
   console.log('[App] UpdateData mit Events:', events.length);
   state.events = events;
   window.allEvents = events; // Für FilterManager verfügbar machen
   buildMonthOptions(els.monthSelect, events);

   // FilterManager über neue Events informieren
   if (window.filterManager) {
     console.log('[App] Lade Tags für FilterManager');
     window.filterManager.loadTags();
   }

   applyFilters();
  }

// Initialize Authentication Plugin System
async function initializeAuthPlugins() {
  try {
    console.log('[Auth] Initializing auth plugin system...');
    
    // Register Nostr Auth Plugin (standard Nostr authentication)
    const nostrPlugin = new NostrAuthPlugin(client);
    authRegistry.register('nostr', nostrPlugin);
    
    // Initialize the AuthManager (it will automatically detect and load WordPress plugin if available)
    await authManager.initialize();
    
    console.log('[Auth] Auth plugins registered successfully');
    console.log('[Auth] Available plugins:', authRegistry.getAll().map(p => p.name));
    
    // Check if any plugin is already authenticated
    const activePlugin = await authManager.getActivePlugin();
    if (activePlugin) {
      console.log('[Auth] Active plugin detected:', activePlugin.name);
    }
    
  } catch (error) {
    console.error('[Auth] Failed to initialize auth plugins:', error);
  }
}

// DOM ready und Setup
document.addEventListener('DOMContentLoaded', async () => {
   console.log('[App] DOMContentLoaded - Initialisiere App');
   initEls();

   // MonthView initialisieren (vor View-Setup)
   monthView = new MonthView(els.monthGrid);

   // Theme (only sidebar theme selector now)
   applyTheme(localStorage.getItem('calendar_theme') || Config.defaultTheme);

   // Initialize Auth Plugins (includes WordPress SSO check)
   await initializeAuthPlugins();
  
  // Setup New Sidebar System
  const sidebarControls = setupSidebar();
  const authControls = await setupAuthButtons();
  
  // Setup AuthManager UI (minimal - just whoami and logout)
  await authManager.setupUI({
    whoami: els.whoami,
    btnLogout: els.btnLogout,
    btnNew: els.btnNew
  }, async () => {
    console.log('[Auth] Auth state changed, updating UI...');
    await authControls.updateAuthButtons();
  });
  
  // Setup sidebar theme selector (only theme control now)
  if (els.sidebarThemeSelect) {
    els.sidebarThemeSelect.value = localStorage.getItem('calendar_theme') || Config.defaultTheme;
    els.sidebarThemeSelect.addEventListener('change', () => {
      applyTheme(els.sidebarThemeSelect.value);
    });
  }
  
  // Setup sidebar import/export buttons
  if (els.sidebarIcsImport && els.btnICSImport) {
    els.sidebarIcsImport.addEventListener('click', () => {
      els.btnICSImport.click();
      sidebarControls.closeSidebar();
    });
  }
  
  if (els.sidebarIcsExport && els.btnICSExport) {
    els.sidebarIcsExport.addEventListener('click', () => {
      els.btnICSExport.click();
      sidebarControls.closeSidebar();
    });
  }
  
  // Initial auth button state update
  await authControls.updateAuthButtons();

  // Initialize Subscriptions manager (after sidebar exists)
  await Subscriptions.init({
    listEl: els.subsList,
    inputEl: els.subsInput,
    addBtn: els.subsAdd
  });
  // Listen-Auswahl (Dropdown) füllen bei Updates
  window.addEventListener('subscriptions-lists-updated', (ev) => {
    const lists = ev.detail?.lists || [];
    const sel = els.subsListSelect;
    if (!sel) return;
    const currentD = Subscriptions.listConfig?.d;
    sel.innerHTML = '<option value="">–</option>' + lists.map(l => {
      const label = l.name || l.d;
      const selected = (l.d === currentD) ? ' selected' : '';
      return `<option value="${encodeURIComponent(l.d)}"${selected}>${label}</option>`;
    }).join('');
  });

  // Dropdown: Liste wechseln
  if (els.subsListSelect) {
    els.subsListSelect.addEventListener('change', async (e) => {
      const d = decodeURIComponent(e.target.value || '');
      if (!d) return;
      await Subscriptions.setActiveListD(d);
    });
  }

  // Teilen-Button: URL mit d & owner kopieren
  if (els.subsShareLink) {
    els.subsShareLink.addEventListener('click', async () => {
      try {
        const d = Subscriptions.listConfig?.d || 'nostr-calendar:subscriptions';
        // owner = Owner der aktuell ausgewählten Liste (foreign oder self)
        let ownerHex = Subscriptions?._listOwnerHex || client?.pubkey || null;
        let npub = null;
        if (ownerHex) {
          try { npub = window.hexToNpub ? window.hexToNpub(ownerHex) : null; } catch {}
        }
        const url = new URL(location.href);
        // Nur gewünschte Parameter setzen/ersetzen
        url.searchParams.set('d', d);
        if (npub) url.searchParams.set('owner', npub); else url.searchParams.delete('owner');
        await navigator.clipboard.writeText(url.toString());
        showNotification('Link kopiert', 'success');
      } catch (e) {
        console.warn('Share link failed:', e);
        showNotification('Konnte Link nicht kopieren', 'error');
      }
    });
  }

  // Als eigene Liste speichern: owner auf self setzen und publishen
  if (els.subsSaveAsOwn) {
    els.subsSaveAsOwn.addEventListener('click', async () => {
      try {
        if (!client?.pubkey) { alert('Bitte zuerst einloggen.'); return; }
        // owner zurücksetzen
        Subscriptions._listOwnerHex = null;
  try { localStorage.removeItem('nostr_calendar_list_owner'); } catch {}
        // optional: d und Name erfragen
        const currentD = Subscriptions.listConfig?.d || 'nostr-calendar:subscriptions';
        const d = prompt('Listen-ID (d) wählen/setzen:', currentD) || currentD;
        const name = prompt('Name der Liste (optional):', Subscriptions.listConfig?.name || 'Meine Liste');
        await Subscriptions.setActiveListD(d, { name: name || null });
        await Subscriptions.saveToNip51();
        // Nach Publish Dropdown aktualisieren
        try { await Subscriptions.listAllNip51Lists(client.pubkey); } catch {}
        showNotification('Liste als eigene gespeichert.', 'success');
      } catch (e) {
        console.warn('Save as own failed:', e);
        showNotification('Speichern fehlgeschlagen', 'error');
      }
    });
  }

  // Sync subscriptions with contacts when auth changes
  if (window.authManager) {
    try {
      window.authManager.onChange(async () => {
        try { await Subscriptions.handleAuthChange(); } catch (e) { console.warn('Subscriptions.handleAuthChange error', e); }
      });
      // Initial check in case already logged in
      try { await Subscriptions.handleAuthChange(); } catch {}
    } catch {}
  }

  // React on subscription changes -> refresh event list
  window.addEventListener('subscriptions-changed', async () => {
    try {
      await refresh();
    } catch (e) { console.warn('refresh after subscriptions-changed failed', e); }
  });

  setupBlossomUI(
    els.blossomModal, els.blossomClose, els.blossomRefresh,
    els.blossomPrev, els.blossomNext, els.blossomPageSize,
    els.blossomFilterType, els.blossomSizeMin, els.blossomSizeMax,
    els.blossomPageInfo, els.blossomInfo, els.blossomTable,
    els.blossomDrop, els.btnMedia,
    els.previewModal, els.previewBody, els.previewClose,
    blossomState
  );

  setupICSExport(els.btnICSExport, () => state);
  setupICSImport(els.btnICSImport, client, fillFormFromEvent, els.progressModal, els.progressBar, els.progressText, els.modal, clearForm, setEditableChips);

  // Filter Events - Integration mit dem neuen FilterManager
  window.addEventListener('filter-change', (e) => {
    console.log('[App] Filter-Change Event empfangen:', e.detail);
    const { type, value, selectedTags } = e.detail;

    // Update state basierend auf Filter-Änderungen
    switch (type) {
      case 'tag':
        // selectedTags enthält alle aktuell ausgewählten Tags
        state.selectedTags = new Set(selectedTags || []);
        console.log('[App] Tags aktualisiert:', Array.from(state.selectedTags));
        break;
      case 'search':
        state.textSearch = value.toLowerCase();
        console.log('[App] Suchtext aktualisiert:', state.textSearch);
        break;
      case 'month':
        state.month = value;
        console.log('[App] Monat aktualisiert:', state.month);
        break;
      case 'reset':
        state.selectedTags.clear();
        state.textSearch = '';
        state.month = '';
        console.log('[App] Filter zurückgesetzt');
        break;
    }

    console.log('[App] Apply Filters mit State:', {
      selectedTags: Array.from(state.selectedTags),
      textSearch: state.textSearch,
      month: state.month
    });
    applyFilters();
  });

  // CRUD Events
  window.addEventListener('edit-event', (e)=> openModalForEdit(e.detail.event));
  on(els.btnNew, 'click', async ()=>{
    const loggedIn = await authManager.isLoggedIn();
    if (!loggedIn) {
      alert('Bitte zuerst einloggen.');
      return;
    }
    
    openModalForNew();
  });
  on(els.btnRefresh, 'click', async ()=>{
    try{
      els.btnRefresh.disabled = true;
      els.btnRefresh.textContent = '⟳';
      els.info.textContent = 'Lade…';
      await refresh();
    } finally {
      els.btnRefresh.disabled = false;
      els.btnRefresh.textContent = '↻';
    }
  });
  on(els.btnCloseModal, 'click', ()=> els.modal.close());
  on(els.btnSave, 'click', async (e)=>{
    e.preventDefault();
    const data = getFormData();
    if(!data.title || !data.start || !data.end){
      alert('Titel, Beginn und Ende sind Pflichtfelder.');
      return;
    }
    try{
      // Create event using the active authentication plugin
      const result = await authManager.createEvent(data);
      
      els.modal.close();
      await refresh();
    }catch(err){
      console.error(err);
      alert('Veröffentlichen fehlgeschlagen. Details in der Konsole.');
    }
  });
  on(els.btnCancelEvent, 'click', async ()=>{
    const data = getFormData();
    data.status = 'cancelled';
    try{
      // Use AuthManager for event cancellation
      await authManager.createEvent(data);
      els.modal.close();
      try {
        await refresh();
      } catch (err) {
        console.error('Refresh after cancel failed:', err);
      }
    }catch(err){
      console.error(err);
      alert('Update fehlgeschlagen.');
    }
  });

  on(els.btnDelete, 'click', async ()=>{
    const id = document.getElementById('f-id').value.trim();
    if (!id) {
      alert('Kein Event zum Löschen.');
      return;
    }
    if (!confirm('Wirklich löschen? Dies entfernt den Termin dauerhaft aus Ihrem Kalender.')) return;

    try {
      // Use AuthManager to delete event through the active auth plugin
      if (authManager) {
        const result = await authManager.deleteEvent(id);
        if (result.success) {
          els.modal.close();
          try {
            await refresh();
            showNotification('Event erfolgreich gelöscht', 'success');
          } catch (err) {
            console.error('Refresh after delete failed:', err);
            showNotification('Event gelöscht, aber Aktualisierung fehlgeschlagen', 'warning');
          }
          return;
        } else {
          throw new Error(result.error || 'Delete failed through AuthManager');
        }
      }
    } catch (e) {
      console.warn('AuthManager delete failed, falling back to direct Nostr client:', e);
      // Don't show error notification here, let the fallback try first
    }

    // Fallback to direct Nostr client delete
    const evt = {
      kind: 5,
      content: '',
      tags: [['e', id]],
      created_at: Math.floor(Date.now() / 1000)
    };

    try {
      if (!client.signer) throw new Error('Nicht eingeloggt.');
      await client.initPool();
      const signed = await client.signer.signEvent(evt);

      const pubs = client.pool.publish(Config.relays, signed);
      if (Array.isArray(pubs)) {
        const timeout = 3000;
        const promises = pubs.map(pub => {
          if (!pub || typeof pub.on !== 'function') return Promise.resolve();
          return new Promise(resolve => {
            const timer = setTimeout(() => resolve(), timeout);
            const onOk = () => { clearTimeout(timer); resolve(true); };
            const onFailed = () => { clearTimeout(timer); resolve(false); };
            try {
              pub.on('ok', onOk);
              pub.on('failed', onFailed);
            } catch (e) {
              clearTimeout(timer);
              resolve();
            }
          });
        });
        await Promise.race(promises);
        await Promise.allSettled(promises);
      }

      els.modal.close();
      try {
        await refresh();
        showNotification('Event erfolgreich gelöscht', 'success');
      } catch (err) {
        console.error('Refresh after delete failed:', err);
        showNotification('Event gelöscht, aber Aktualisierung fehlgeschlagen', 'warning');
      }
      // alert('Termin gelöscht.');
    } catch (err) {
      console.error(err);
      showNotification('Löschen fehlgeschlagen: ' + (err.message || err), 'error');
    }
  });

  // Upload
  setupUpload();

  // View Events
  function setView(name){
    els.btnViewCards.classList.toggle('active', name === 'cards');
    els.btnViewMonth.classList.toggle('active', name === 'month');
    currentView = (name === 'month') ? 'month' : 'cards';
    localStorage.setItem('view', currentView);

    renderCurrentView();
  }
  on(els.btnViewCards, 'click', ()=> setView('cards'));
  on(els.btnViewMonth, 'click', ()=> setView('month'));
  setView(localStorage.getItem('view') || 'cards');

  // Auto-Reconnect for Bunker (simplified)
  setupBunkerEvents(els.whoami, async () => {
    await authControls.updateAuthButtons();
  });
  
  // Auto-reconnect existing bunker connections
  autoReconnectBunker(els.whoami, async () => {
    await authControls.updateAuthButtons();
  });
  
  initNip46FromUrl(els.whoami, async () => {
    await authControls.updateAuthButtons();
  });

  // Initial Setup
  setupMdToolbar();

  // Initialize Detail Modal System
  initDetailSystem();

  // Event Listener for Tag Filtering from Detail Modal
  window.addEventListener('filter-by-tag', (e) => {
    const tag = e.detail.tag;
    if (tag && !state.selectedTags.has(tag)) {
      state.selectedTags.add(tag);
      els.selectedTags.appendChild(createTagChip(tag));
      applyFilters();
    }
  });

  console.log('[App] Initialisierung abgeschlossen - starte Refresh');
  refresh().catch(console.error);
});
