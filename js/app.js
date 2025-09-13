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
import { setupAuthUI, updateAuthUI, logout, isLoggedIn, updateWhoami, setAuthManager } from './auth.js';
import { setupBunkerUI, autoReconnectBunker, setupBunkerEvents, initNip46FromUrl } from './bunker.js';
import { setupBlossomUI, refreshBlossom, renderBlossom, blossomState } from './blossom.js';
import { setupICSExport, setupICSImport } from './ics-import-export.js';
import { wpSSO } from './wp-sso.js';

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
// Helper: element used to trigger Bunker connect (may be legacy btn or dropdown menu entry)
let bunkerTrigger = null;
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
    btnLogin: document.getElementById('btn-login'),
    btnManual: document.getElementById('btn-manual'),
    btnNip07: document.getElementById('btn-nip07'),
    btnLogout: document.getElementById('btn-logout'),
    // new dropdown/menu elements
    btnLoginMenu: document.getElementById('btn-login-menu'),
    loginMenu: document.getElementById('login-menu'),
    loginMenuNostr: document.getElementById('login-menu-nostr'),
    loginMenuExtension: document.getElementById('login-menu-extension'),
    loginMenuBunker: document.getElementById('login-menu-bunker'),
    // Theme and other elements
    themeSelect: document.getElementById('theme-select'),
    btnICSImport: document.getElementById('btn-ics-import'),
    btnICSExport: document.getElementById('btn-ics-export'),
    btnBunker: document.getElementById('btn-bunker'),
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

  // Kompatibilitäts-Glue: Falls die alten "legacy" Buttons (auf die bestehende
  // Event-Handler in js/auth.js hören) nicht im DOM vorhanden sind, erzeugen
  // wir sie versteckt zur Laufzeit und hängen sie in die auth-Box.
  // So funktionieren sowohl die Dropdown-Menüs (die .click() auf diese IDs
  // weiterleiten) als auch bestehende Tests ohne weitere Code-Anpassungen.
  try {
    const authBox = document.getElementById('auth-box') || document.body;
    // Helper: create button only if missing
    const ensureBtn = (id, text, hidden = true) => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('button');
        el.id = id;
        el.className = 'btn btn-ghost';
        el.type = 'button';
        el.style.display = hidden ? 'none' : '';
        el.textContent = text;
        authBox.appendChild(el);
      }
      return el;
    };

    // Legacy IDs expected by auth.js
    els.btnLogin = els.btnLogin || ensureBtn('btn-login', 'Login (legacy)');
    els.btnManual = els.btnManual || ensureBtn('btn-manual', 'Manual Login (legacy)');
    els.btnNip07 = els.btnNip07 || ensureBtn('btn-nip07', 'NIP-07 Login (legacy)');
    // Erzeuge den legacy Bunker-Button ebenfalls versteckt, damit er die UI nicht stört.
    els.btnBunker = els.btnBunker || ensureBtn('btn-bunker', 'Bunker (legacy)', true);
  } catch (e) {
    console.warn('[initEls] could not create legacy buttons:', e);
  }
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
    // For WordPress SSO users, check against WordPress identity
    const wpStatus = await wpSSO.checkSSO();
    if (wpStatus && wpSSO.isAuthenticated) {
      // WordPress SSO: Events created by this identity can be edited
      const wpIdentity = wpStatus.calendar_identity.pubkey;
      if (evt.pubkey && evt.pubkey !== wpIdentity) {
        alert('Bearbeiten nicht möglich: Sie sind nicht der Autor dieses Termins.');
        return;
      }
    } else if (client && client.signer) {
      // Normal Nostr authentication
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

// WordPress SSO Integration
async function checkWordPressSSO() {
  try {
    console.log('[WP-SSO] Checking for WordPress SSO...');
    
    // Check URL parameters for wp_sso success
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('wp_sso') === 'success') {
      console.log('[WP-SSO] Success parameter detected');
      
      // Show user notification
      showWPSSONotification(urlParams.get('user'));
      
      // Clean URL
      const url = new URL(window.location);
      url.searchParams.delete('wp_sso');
      url.searchParams.delete('user');
      window.history.replaceState({}, '', url);
    }
    
    // Check WordPress SSO status
    const ssoStatus = await wpSSO.checkSSO();
    if (ssoStatus) {
      console.log('[WP-SSO] WordPress user authenticated:', ssoStatus.wp_user);
      
      // Update UI to show WordPress user ONLY if SSO is active
      updateWPSSOAuthUI(ssoStatus);
      
      // Auto-refresh events
      await refresh();
      
      return true;
    } else {
      console.log('[WP-SSO] No WordPress SSO session found');
      return false;
    }
  } catch (error) {
    console.error('[WP-SSO] Check failed:', error);
    return false;
  }
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

// Show WordPress SSO notification
function showWPSSONotification(username) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 10000;
    background: #4CAF50; color: white; padding: 15px 20px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: system-ui, sans-serif; font-size: 14px;
  `;
  notification.innerHTML = `
    ✅ <strong>WordPress SSO erfolgreich!</strong><br>
    Angemeldet als: ${username || 'WordPress User'}
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 5000);
}

// Update Auth UI for WordPress SSO
function updateWPSSOAuthUI(ssoStatus) {
  if (els.whoami) {
    const wpUser = ssoStatus.wp_user;
    const identity = ssoStatus.calendar_identity;
    
    els.whoami.innerHTML = `
      <div style="text-align: left;">
        <div><strong>📅 Calendar Identity:</strong> ${identity.name}</div>
        <div style="font-size: 0.85em; color: #666;">WordPress User: ${wpUser.display_name || wpUser.username}</div>
        <div style="font-size: 0.75em; color: #999;">${identity.pubkey.slice(0, 16)}...</div>
      </div>
    `;
  }
  
  // Hide login buttons and dropdown, show logout
  if (els.btnLoginMenu) els.btnLoginMenu.style.display = 'none';
  if (els.btnLogin) els.btnLogin.style.display = 'none';
  if (els.btnLogout) {
    els.btnLogout.style.display = 'inline-block';
    els.btnLogout.classList.remove('hidden');
    // Replace logout handler for WordPress SSO
    els.btnLogout.onclick = async () => {
      console.log('[WP-SSO] Logging out via WordPress SSO...');
      await wpSSO.logout();
      // Refresh page to reset UI state
      window.location.reload();
    };
  }
  
  // Show new event button and enable it
  if (els.btnNew) {
    els.btnNew.style.display = 'inline-block';
    els.btnNew.disabled = false;
    els.btnNew.title = 'Neuen Termin anlegen';
  }
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
    const wpPlugin = new WordPressAuthPlugin(wpSSO);
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
  
  // Theme
  applyTheme(localStorage.getItem('calendar_theme') || Config.defaultTheme);
  on(els.themeSelect, 'change', ()=> applyTheme(els.themeSelect.value));
  
  // WordPress SSO Check (before other auth setup)
  await checkWordPressSSO();
  
  // Initialize Auth Plugins
  await initializeAuthPlugins();
  
  // Setup AuthManager UI
  authManager.setupUI(els, () => {
    console.log('[Auth] Auth state changed, updating UI...');
  });
  
  // Connect AuthManager to legacy auth functions
  setAuthManager(authManager);
  
  // Module Setup
  setupAuthUI(els.btnLogin, els.btnLogout, els.btnBunker, els.btnManual, els.btnNip07, els.whoami, els.btnNew, () => {
    updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker, btnManual: els.btnManual, btnNip07: els.btnNip07, btnLoginMenu: els.btnLoginMenu, whoami: els.whoami });
  });

  // Determine the element that should trigger Bunker connection.
  // The legacy #btn-bunker may be removed from the DOM; prefer it if present,
  // otherwise use the dropdown menu item (#login-menu-bunker) as the trigger.
  bunkerTrigger = els.btnBunker || els.loginMenuBunker || null;

  if (bunkerTrigger) {
    setupBunkerUI(bunkerTrigger, async (res) => {
      if (res && res.pubkey && els.whoami) {
        await updateWhoami(els.whoami, res.method || 'nip46', res.pubkey);
      }
      updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker, btnManual: els.btnManual, btnNip07: els.btnNip07, btnLoginMenu: els.btnLoginMenu, whoami: els.whoami });
    });
  } else {
    console.debug('[App] kein Bunker-Trigger im DOM gefunden; Bunker-Connect disabled');
  }

  setupBunkerEvents(els.whoami, () => updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker, btnManual: els.btnManual, btnNip07: els.btnNip07, btnLoginMenu: els.btnLoginMenu, whoami: els.whoami }));

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
    
    // Check authentication type and validate accordingly
    try {
      const wpStatus = await wpSSO.checkSSO();
      if (wpStatus && wpSSO.isAuthenticated) {
        // WordPress SSO is active - no need to check client.signer
        console.log('[WP-SSO] New event via WordPress SSO');
      } else if (client && client.signer) {
        // Normal Nostr authentication - validate signer
        const userPubKey = await client.signer.getPublicKey();
        console.log('[Nostr] New event via normal auth:', userPubKey);
      } else {
        alert('Authentifizierung nicht verfügbar.');
        return;
      }
    } catch (error) {
      console.error('Error checking authentication:', error);
      alert('Fehler bei der Authentifizierung.');
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


  // Auto-Reconnect
  autoReconnectBunker(els.whoami, () => updateAuthUI({
    btnNew: els.btnNew,
    btnLogin: els.btnLogin,
    btnLogout: els.btnLogout,
    btnBunker: els.btnBunker,
    btnManual: els.btnManual,
    btnNip07: els.btnNip07,
    btnLoginMenu: els.btnLoginMenu,
    whoami: els.whoami
  }));
  initNip46FromUrl(els.whoami, () => updateAuthUI({
    btnNew: els.btnNew,
    btnLogin: els.btnLogin,
    btnLogout: els.btnLogout,
    btnBunker: els.btnBunker,
    btnManual: els.btnManual,
    btnNip07: els.btnNip07,
    btnLoginMenu: els.btnLoginMenu,
    whoami: els.whoami
  }));
  
  // Dropdown behavior: toggle menu and forward menu item clicks to existing legacy buttons
  if (els.btnLoginMenu && els.loginMenu) {
    // make handler async so we can await isLoggedIn()
    on(els.btnLoginMenu, 'click', async () => {
      // Wenn bereits eingeloggt: Dropdown verbergen (soll nicht sichtbar sein)
      try {
        if (await authManager.isLoggedIn()) {
          els.loginMenu.classList.add('hidden');
          return;
        }
      } catch (e) {
        // If isLoggedIn throws, fall through to toggle menu
        console.debug('[App] authManager.isLoggedIn check failed:', e);
      }
      // Toggle visibility
      els.loginMenu.classList.toggle('hidden');
 
      // Position correction: stelle sicher, dass das Menü nicht aus dem Viewport rechts herausragt.
      try {
        els.loginMenu.style.left = ''; // reset
        els.loginMenu.style.right = '';
        const btnRect = els.btnLoginMenu.getBoundingClientRect();
        const menuRect = els.loginMenu.getBoundingClientRect();
        const viewportW = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        // Default menu left is btn.left; wenn menu über den Rand hinausgeht, setze right:0 und linksunset.
        if (btnRect.left + menuRect.width > viewportW - 8) { // 8px margin
          els.loginMenu.style.left = 'auto';
          // positioniere so, dass das Menü am rechten Rand des Viewports anliegt
          els.loginMenu.style.right = '8px';
        } else {
          // sichere Positionierung nahe am Button (falls CSS verändert wurde)
          els.loginMenu.style.left = `${btnRect.left}px`;
          els.loginMenu.style.right = 'auto';
        }
      } catch (e) {
        // ignore positioning errors
      }
    });
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!els.btnLoginMenu.contains(e.target) && !els.loginMenu.contains(e.target)) {
        els.loginMenu.classList.add('hidden');
      }
    });
    // Menu item handlers: trigger the (hidden) legacy buttons to preserve logic
    // Use a dispatched MouseEvent first (better with hidden elements / frameworks)
    const triggerClick = (btn) => {
      try {
        if (!btn) return;
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        btn.dispatchEvent(ev);
      } catch (e) {
        try { btn?.click?.(); } catch {}
      }
    };

    if (els.loginMenuNostr) on(els.loginMenuNostr, 'click', () => { els.loginMenu.classList.add('hidden'); triggerClick(els.btnManual); });
    if (els.loginMenuExtension) on(els.loginMenuExtension, 'click', () => { els.loginMenu.classList.add('hidden'); triggerClick(els.btnNip07); });
    if (els.loginMenuBunker) on(els.loginMenuBunker, 'click', () => {
      els.loginMenu.classList.add('hidden');
      // Avoid recursive clicks: only forward to a different trigger element.
      if (bunkerTrigger && bunkerTrigger !== els.loginMenuBunker) {
        try { triggerClick(bunkerTrigger); } catch(e){ console.warn('bunkerTrigger click failed', e); }
      } else if (els.btnBunker) {
        // Fallback to legacy button if present
        try { triggerClick(els.btnBunker); } catch(e){ console.warn('btnBunker click failed', e); }
      } else {
        console.debug('[App] Kein separater Bunker-Trigger gefunden; Bunker connect nicht ausgeführt.');
      }
    });
  }

  // Initial Setup
  setupMdToolbar();
  // setupTagInput();

  refresh().catch(console.error);
});
