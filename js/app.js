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
import { setupAuthUI, updateAuthUI, logout, isLoggedIn } from './auth.js';
import { setupBunkerUI, autoReconnectBunker, setupBunkerEvents } from './bunker.js';
import { setupBlossomUI, refreshBlossom, renderBlossom, blossomState } from './blossom.js';
import { setupICSExport, setupICSImport } from './ics-import-export.js';

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
    btnDelete: document.getElementById('btn-delete'),
    whoami: document.getElementById('whoami'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
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
  els.btnDelete.classList.add('hidden');
  document.getElementById('modal-title').textContent = 'Neuer Termin';
  els.modal.showModal();
}
async function openModalForEdit(evt){
  // check evt.pubkey against logged-in user
  const userPubKey = await client.signer.getPublicKey();
  if(evt.pubkey && client && client.signer && evt.pubkey !== userPubKey){
    alert('Bearbeiten nicht möglich: Sie sind nicht der Autor dieses Termins.');
    return;
  }
  fillFormFromEvent(evt);
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
      const up2 = await uploadWithNip96(file, client.signer || await client.login());
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
  const events = await client.fetchEvents({ sinceDays: 1000 });
  console.log(`[DEBUG] Loaded ${events.length} events`);
  state.events = events;
  buildMonthOptions(els.monthSelect, events);
  applyFilters();
}

// DOM ready und Setup
document.addEventListener('DOMContentLoaded', () => {
  initEls();
  
  // MonthView initialisieren (vor View-Setup)
  monthView = new MonthView(els.monthGrid);
  
  // Theme
  applyTheme(localStorage.getItem('calendar_theme') || Config.defaultTheme);
  on(els.themeSelect, 'change', ()=> applyTheme(els.themeSelect.value));
  
  // Module Setup
  setupAuthUI(els.btnLogin, els.btnLogout, els.btnBunker, els.whoami, els.btnNew, () => updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker }));
  setupBunkerUI(els.btnBunker, (res) => {
    els.whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (nip46)`;
    updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker });
  });
  setupBunkerEvents(els.whoami, () => updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker }));

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
    if(!isLoggedIn()){
      alert('Bitte zuerst einloggen (NIP-07 oder Bunker).');
      return;
    }
    // isLoggedIn() ist true, signer existiert
    const userPubKey = await client.signer.getPublicKey();
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
      const { signed, d } = await client.publish(data);
      els.modal.close();
      await refresh();
    }catch(err){
      console.error(err);
      alert('Veröffentlichen fehlgeschlagen. Details in der Konsole.');
    }
  });
  on(els.btnDelete, 'click', async ()=>{
    const data = getFormData();
    data.status = 'cancelled';
    try{
      await client.publish(data);
      els.modal.close();
      await refresh();
    }catch(err){
      console.error(err);
      alert('Update fehlgeschlagen.');
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
  autoReconnectBunker(els.whoami, () => updateAuthUI({ btnNew: els.btnNew, btnLogin: els.btnLogin, btnLogout: els.btnLogout, btnBunker: els.btnBunker }));

  // Initial Setup
  setupMdToolbar();
  // setupTagInput();

  refresh().catch(console.error);
});
