import { Config } from './config.js';
import { client } from './nostr.js';
window.nostrClient = client; // Debug-Haken für die Konsole
import { renderGrid, buildMonthOptions } from './views/list.js';
import { fillFormFromEvent, clearForm, getFormData, setupMdToolbar, setupTagInput, setEditableChips } from './views/form.js';
import { mdToHtml } from './utils.js';
import { MonthView } from './views/calendar.js';
import { uploadToBlossom, listBlossom, deleteFromBlossom } from './blossom.js';
import { uploadWithNip96 } from './nip96.js';
import { on, chip } from './utils.js';
import { setupBunkerEvents, initNip46FromUrl, connectBunker } from './bunker.js';
import { setupBlossomUI, refreshBlossom, renderBlossom, blossomState } from './blossom.js';
import { setupICSExport, setupICSImport } from './ics-import-export.js';

// New Plugin-based Authentication System
import { AuthManager } from './auth/AuthManager.js';
import { authRegistry } from './auth/AuthPluginInterface.js';
import { NostrAuthPlugin } from './auth/NostrAuthPlugin.js';
import { WordPressAuthPlugin } from './auth/WordPressAuthPlugin.js';

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
    grid: document.getElementById('grid'),
    info: document.getElementById('result-info'),
    monthSelect: document.getElementById('month-select'),
    tagSearch: document.getElementById('tag-search'),
    selectedTags: document.getElementById('selected-tags'),
    textSearch: document.getElementById('text-search'),
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
    authWordPress: document.getElementById('auth-wordpress'),
    
    // Settings in sidebar
    sidebarThemeSelect: document.getElementById('sidebar-theme-select'),
    sidebarIcsImport: document.getElementById('sidebar-ics-import'),
    sidebarIcsExport: document.getElementById('sidebar-ics-export'),
    
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
  const { authNostr, authExtension, authBunker, authWordPress } = els;
  
  // Update sidebar auth button states
  const updateAuthButtons = async () => {
    const activePlugin = await authManager.getActivePlugin();
    const activeName = activePlugin?.name;
    
    // Update active state
    [authNostr, authExtension, authBunker, authWordPress].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
    
    if (activeName === 'nostr' && authNostr) authNostr.classList.add('active');
    if (activeName === 'wordpress' && authWordPress) authWordPress.classList.add('active');
    
    // Update sidebar toggle icon
    if (els.sidebarIcon) {
      els.sidebarIcon.textContent = activePlugin ? '👤' : '≡';
    }
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
  
  // WordPress SSO Login
  if (authWordPress) {
    authWordPress.addEventListener('click', () => {
      // Redirect to WordPress SSO
      window.location.href = 'http://localhost:8787/wp-login-redirect';
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
    const activePlugin = authManager.getActivePlugin();
    
    if (activePlugin && await activePlugin.isLoggedIn()) {
      // Get user's public key from active auth plugin
      const userPubKey = await activePlugin.getPublicKey();
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
  let out = [...state.events];

  if(state.month){
    out = out.filter(e=>{
      const startS = Number(e.tags.find(t=>t[0]==='starts')?.[1] || 0);
      const d = new Date(startS*1000);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      return key===state.month;
    });
  }
  if(state.selectedTags.size){
    out = out.filter(e=>{
      const evTags = e.tags.filter(t=>t[0]==='t').map(t=>t[1].toLowerCase());
      return [...state.selectedTags].every(t=> evTags.includes(t.toLowerCase()));
    });
  }
  if(state.textSearch){
    out = out.filter(e=>{
      const title = e.tags.find(t=>t[0]==='title')?.[1].toLowerCase() || '';
      const tags = e.tags.filter(t=>t[0]==='t').map(t=>t[1].toLowerCase()).join(' ');
      return (title+' '+tags).includes(state.textSearch);
    });
  }

  state.filtered = out;
  if (els.info) els.info.textContent = `${out.length} Treffer`;
  renderCurrentView();
}

function renderCurrentView(){
  // Wähle die Datenquelle: gefiltert, sonst alle
  const data = state.filtered.length ? state.filtered : state.events;

  if(currentView === 'month'){
    // Monatsansicht: Grid verstecken, Month zeigen
    if (els.grid) els.grid.classList.add('hidden');
    if (els.monthGrid) els.monthGrid.classList.remove('hidden');
    // (Toolbar/Filter in der Monatsansicht ausblenden)
    if (els.toolbar) els.toolbar.classList.add('hidden');
    // Falls ein spezieller Monat gewählt wurde, anwenden
    if(state.month && monthView?.setMonth) monthView.setMonth(state.month);
    if (monthView) monthView.render(data);
  } else {
    data.sort((a,b)=> {
      const aS = Number(a.tags.find(t=>t[0]==='starts')?.[1] || 0);
      const bS = Number(b.tags.find(t=>t[0]==='starts')?.[1] || 0);
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
  if (els.info) els.info.textContent = 'Lade…';
  console.log('[DEBUG] Loading events...');
  let events = [];
  try {
    events = await client.fetchEvents({ sinceDays: 1000 });
  } catch (err) {
    console.error('refresh failed:', err);
    if (els.info) els.info.textContent = 'Fehler beim Laden.';
  }
  console.log(`[DEBUG] Loaded ${events.length} events`);
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
    position: fixed; top: 20px; right: 20px; z-index: 10000;
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
  state.events = events;
  buildMonthOptions(els.monthSelect, events);
  applyFilters();
}

// Initialize Auth Plugin System
async function initializeAuthPlugins() {
  try {
    console.log('[Auth] Initializing auth plugin system...');
    
    // Register Nostr Auth Plugin (standard Nostr authentication)
    const nostrPlugin = new NostrAuthPlugin(client);
    authRegistry.register('nostr', nostrPlugin);
    
    // Register WordPress Auth Plugin (SSO authentication)
    const wpPlugin = new WordPressAuthPlugin();
    authRegistry.register('wordpress', wpPlugin);
    
    // Initialize the AuthManager
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
  authManager.setupUI({
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

  // Filter Events
  on(els.tagSearch, 'keydown', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const v = els.tagSearch.value.trim();
      if(!v) return;
      if(!state.selectedTags.has(v)){
        state.selectedTags.add(v);
        els.selectedTags.appendChild(createTagChip(v));
        applyFilters();
      }
      els.tagSearch.value='';
    }
  });
  on(els.textSearch, 'input', ()=>{ state.textSearch = els.textSearch.value.toLowerCase(); applyFilters(); });
  on(els.monthSelect, 'change', ()=>{ state.month = els.monthSelect.value; applyFilters(); });

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
    if(!data.title || !data.starts || !data.ends){
      alert('Titel, Beginn und Ende sind Pflichtfelder.');
      return;
    }
    try{
      // Use AuthManager for event creation
      console.log('[App] Creating event via AuthManager...');
      const result = await authManager.createEvent(data);
      console.log('[App] Event created:', result);
      
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
  
  initNip46FromUrl(els.whoami, async () => {
    await authControls.updateAuthButtons();
  });

  // Initial Setup
  setupMdToolbar();

  refresh().catch(console.error);
});
