import { Config } from './config.js';
import { client } from './nostr.js';
window.nostrClient = client; // Debug-Haken für die Konsole
import { renderGrid, buildMonthOptions } from './views/list.js';
import { fillFormFromEvent, clearForm, getFormData, setupMdToolbar, setupTagInput, setEditableChips } from './views/form.js';
import { mdToHtml } from './utils.js';
import { eventsToICS, importICS } from './ics.js';
import { MonthView } from './views/calendar.js';
import { uploadToBlossom, listBlossom, deleteFromBlossom } from './blossom.js';
import { uploadWithNip96 } from './nip96.js';

const state = {
  events: [],
  filtered: [],
  selectedTags: new Set(),
  month: '',
  textSearch: ''
};

function on(el, evt, fn){ if(el && el.addEventListener) el.addEventListener(evt, fn); }

const els = {
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
let currentView = localStorage.getItem('view') || 'cards';

// THEME
function applyTheme(name){
  document.body.classList.remove('theme-light','theme-dark','theme-custom');
  document.body.classList.add(`theme-${name}`);
  localStorage.setItem('calendar_theme', name);
}
els.themeSelect.addEventListener('change', ()=> applyTheme(els.themeSelect.value));
applyTheme(localStorage.getItem('calendar_theme') || Config.defaultTheme);

// AUTH
els.btnLogin.addEventListener('click', async ()=>{
  const res = await client.login();
  els.whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (${res.method})`;
  updateAuthUI();
  // els.btnLogin.classList.add('hidden');
  // els.btnLogout.classList.remove('hidden');
});

// Bunker
// ---- Bunker Connect Modal (ersetzt prompt) ----
function ensureBunkerModal(){
  if (document.getElementById('bunker-modal')) return;

  const dlg = document.createElement('dialog');
  dlg.id = 'bunker-modal';
  dlg.className = 'modal';
  dlg.innerHTML = `
    <form method="dialog" style="padding:16px; min-width: min(560px, 96vw)">
      <header class="modal-header">
        <h2 style="margin:0">Bunker verbinden</h2>
        <button class="btn btn-ghost" value="cancel" title="Schließen">✕</button>
      </header>
      <div class="p-16" style="display:grid; gap:10px">
        <label for="bunker-uri">NIP-46 Connect-URI (bunker://… oder nostrconnect://…)</label>
        <input id="bunker-uri" placeholder="bunker://… / nostrconnect://…" style="padding:10px;border:1px solid var(--border);border-radius:10px" />
        <div style="display:flex; gap:8px">
          <button id="bunker-paste" type="button" class="btn">Aus Zwischenablage einfügen</button>
          <span class="muted" id="bunker-hint"></span>
        </div>
      </div>
      <footer class="modal-footer">
        <div></div>
        <div>
          <button class="btn" value="cancel">Abbrechen</button>
          <button class="btn btn-primary" id="bunker-ok" value="default">Verbinden</button>
        </div>
      </footer>
    </form>
  `;
  document.body.appendChild(dlg);

  // Paste-Button
  dlg.querySelector('#bunker-paste').addEventListener('click', async ()=>{
    try{
      const t = await navigator.clipboard.readText();
      if(t){ dlg.querySelector('#bunker-uri').value = t.trim(); }
    }catch(e){
      dlg.querySelector('#bunker-hint').textContent = 'Zwischenablage nicht verfügbar.';
    }
  });
}

// Promise-basierte Abfrage
function getBunkerURIInteractive({preset='' } = {}){
  ensureBunkerModal();
  const dlg = document.getElementById('bunker-modal');
  const input = dlg.querySelector('#bunker-uri');
  const hint  = dlg.querySelector('#bunker-hint');
  input.value = preset || '';

  return new Promise((resolve)=>{
    const onClose = (ev)=>{
      dlg.removeEventListener('close', onClose);
      const v = (dlg.returnValue === 'default') ? input.value.trim() : '';
      resolve(v || '');
    };
    dlg.addEventListener('close', onClose);
    hint.textContent = preset ? 'Gespeicherte URI vorausgefüllt.' : '';
    dlg.showModal();
  });
}



// Bunker verbinden (robust, mit Fallback & Alt-Klick zum Ändern)
// Bunker verbinden – robust ohne prompt()
els.btnBunker.addEventListener('click', async (ev)=>{
  const stored = localStorage.getItem('nip46_connect_uri') || '';

  // ALT-Klick erzwingt Eingabedialog; sonst: wenn nichts gespeichert → Dialog, sonst gespeicherte URI
  let uri = stored;
  if (!stored || ev.altKey) {
    uri = await getBunkerURIInteractive({ preset: stored });
    if (!uri) {
      if (!stored) alert('Abgebrochen — es ist noch keine Connect-URI gespeichert.');
      return;
    }
    localStorage.setItem('nip46_connect_uri', uri);
  }

  // UI-Feedback während des Verbindens
  els.btnBunker.disabled = true;
  const oldTxt = els.btnBunker.textContent;
  els.btnBunker.textContent = 'Verbinde…';

  // Safety-Recover nach 13s
  let safety = setTimeout(()=>{
    els.btnBunker.disabled = false;
    els.btnBunker.textContent = oldTxt;
  }, 13000);

  try {
    const res = await client.connectBunker(uri, { openAuth: false });
    els.whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (nip46)`;
  } catch (err) {
    console.error('[Bunker] connect error:', err);
    alert('Bunker-Verbindung fehlgeschlagen.');
  } finally {
    clearTimeout(safety);
    els.btnBunker.disabled = false;
    els.btnBunker.textContent = oldTxt;
    if (typeof updateAuthUI === 'function') updateAuthUI();
  }
});





function isLoggedIn(){ return !!(client && client.signer); }

function updateAuthUI(){
  els.btnNew.disabled = !isLoggedIn();
  els.btnNew.title = isLoggedIn() ? 'Neuen Termin anlegen' : 'Bitte zuerst einloggen';

  if (isLoggedIn()) {
    els.btnBunker.classList.add('hidden');
    els.btnLogout.classList.remove('hidden');
    els.btnLogin.classList.add('hidden');
  } else {
    els.btnBunker.classList.remove('hidden');
    els.btnLogout.classList.add('hidden');
    els.btnLogin.classList.remove('hidden');
  }
}

// direkt beim Start einmal setzen
updateAuthUI();

async function autoReconnectBunker(){
  const uri = localStorage.getItem('nip46_connect_uri');
  if (!uri || (window.nostrClient && window.nostrClient.signer)) {
    updateAuthUI();
    return;
  }
  try {
    // wichtig: diesmal openAuth: true, damit wir die auth_url sehen
    const res = await window.nostrClient.connectBunker(uri, { openAuth: true });
    els.whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (nip46)`;
  } catch (e) {
    console.warn('autoReconnectBunker:', e);
  } finally {
    updateAuthUI();
  }
}




const blossomState = { items: [], page:1, size:25, type:'', sMin:0, sMax:Infinity };
function detectType(url){
  const u = url.toLowerCase();
  if(u.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/)) return 'image';
  if(u.match(/\.(mp4|webm|mov|mkv)(\?|$)/)) return 'video';
  if(u.match(/\.(mp3|wav|ogg)(\?|$)/)) return 'audio';
  return 'other';
}
function renderBlossom(){
  const type = blossomState.type;
  const smin = blossomState.sMin;
  const smax = blossomState.sMax;
  const filtered = blossomState.items.filter(it=>{
    if(type && detectType(it.url)!==type) return false;
    const kb = (it.size||0)/1024;
    if(smin && kb < smin) return false;
    if(isFinite(smax) && smax && kb > smax) return false;
    return true;
  });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / blossomState.size));
  blossomState.page = Math.min(blossomState.page, pages);
  const start = (blossomState.page-1) * blossomState.size;
  const pageItems = filtered.slice(start, start + blossomState.size);

  const tb = els.blossomTable.querySelector('tbody');
  tb.innerHTML = '';
  for(const it of pageItems){
    const isImg = detectType(it.url)==='image';
    const preview = isImg ? `<img src="${it.url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px" />` : '–';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${preview}</td>
      <td><a href="${it.url}" target="_blank" rel="noopener">${it.name}</a></td>
      <td>${(it.size/1024).toFixed(1)} KB</td>
      <td>${new Date((it.created*1000) || Date.now()).toLocaleString()}</td>
      <td>
        <button class="btn btn-small preview">Preview</button>
        <button class="btn btn-small copy">Copy</button>
        <button class="btn btn-small btn-danger del">Delete</button>
      </td>`;
    tr.querySelector('.copy').addEventListener('click', ()=> navigator.clipboard.writeText(it.url));
    tr.querySelector('.del').addEventListener('click', async ()=>{
      if(!confirm('Datei wirklich löschen?')) return;
      try{ await deleteFromBlossom(it); tr.remove(); }catch(e){ alert('Löschen fehlgeschlagen'); }
    });
    tr.querySelector('.preview').addEventListener('click', ()=>{
      els.previewBody.innerHTML = isImg ? `<img class="preview-img" src="${it.url}" />`
        : `<iframe class="preview-iframe" src="${it.url}"></iframe>`;
      els.previewModal.showModal();
    });
    tb.appendChild(tr);
  }
  els.blossomPageInfo.textContent = `${blossomState.page}/${pages}`;
  els.blossomInfo.textContent = `${total} Dateien (gefiltert)`;
}
async function refreshBlossom(){
  els.blossomInfo.textContent = 'Lade…';
  try{
    blossomState.items = await listBlossom();
    renderBlossom();
  }catch(e){ console.error(e); els.blossomInfo.textContent = 'Fehler beim Laden'; }
}
// paging + filters
els.blossomPrev.addEventListener('click', ()=>{ if(blossomState.page>1){ blossomState.page--; renderBlossom(); }});
els.blossomNext.addEventListener('click', ()=>{ blossomState.page++; renderBlossom(); });
els.blossomPageSize.addEventListener('change', ()=>{ blossomState.size = Number(els.blossomPageSize.value); renderBlossom(); });
els.blossomFilterType.addEventListener('change', ()=>{ blossomState.type = els.blossomFilterType.value; blossomState.page=1; renderBlossom(); });
els.blossomSizeMin.addEventListener('input', ()=>{ blossomState.sMin = Number(els.blossomSizeMin.value||0); blossomState.page=1; renderBlossom(); });
els.blossomSizeMax.addEventListener('input', ()=>{ blossomState.sMax = Number(els.blossomSizeMax.value||0) || Infinity; blossomState.page=1; renderBlossom(); });
on(els.previewClose, 'click', ()=> els.previewModal.close());

// Drag & Drop upload
function wireDropZone(el){
  const fileInput = document.createElement('input'); fileInput.type='file'; fileInput.multiple = true; fileInput.style.display='none';
  el.after(fileInput);
  el.addEventListener('click', ()=> fileInput.click());
  el.addEventListener('dragover', (e)=>{ e.preventDefault(); el.classList.add('drag'); });
  el.addEventListener('dragleave', ()=> el.classList.remove('drag'));
  el.addEventListener('drop', async (e)=>{
    e.preventDefault(); el.classList.remove('drag');
    const files = [...e.dataTransfer.files];
    if(!files.length) return;
    for(const f of files){
      try{ await uploadToBlossom(f); }catch(e){ console.warn('Upload failed', e); }
    }
    refreshBlossom();
  });
  fileInput.addEventListener('change', async ()=>{
    const files = [...fileInput.files];
    for(const f of files){
      try{ await uploadToBlossom(f); }catch(e){ console.warn('Upload failed', e); }
    }
    fileInput.value='';
    refreshBlossom();
  });
}
if(els.blossomDrop) wireDropZone(els.blossomDrop);

els.btnMedia.addEventListener('click', ()=>{ els.blossomModal.showModal(); refreshBlossom(); });
els.blossomClose.addEventListener('click', ()=> els.blossomModal.close());
els.blossomRefresh.addEventListener('click', refreshBlossom);
els.btnLogout.addEventListener('click', async ()=>{
  await client.logout();
  els.whoami.textContent = '';
  els.btnLogin.classList.remove('hidden');
  els.btnLogout.classList.add('hidden');
  updateAuthUI();
});

window.addEventListener('nip46-connected', (e)=>{
  const pk = e.detail?.pubkey || '';
  if (pk) els.whoami.textContent = `pubkey: ${pk.slice(0,8)}… (nip46)`;
  updateAuthUI();
});
// Auto-Reconnect braucht ggf. eine Auth-URL -> Tab gezielt öffnen
window.addEventListener('nip46-auth-url', (e)=>{
  const url = e.detail?.url;
  if (!url) return;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    navigator.clipboard?.writeText(url).catch(()=>{});
    alert('Bitte Autorisierungs-URL manuell öffnen (Link in Zwischenablage):\n' + url);
  }
});

// FILTERS
function chip(label){
  const c = document.createElement('span');
  c.className='chip';
  c.innerHTML = `<span>${label}</span>`;
  const x = document.createElement('button'); x.textContent='✕';
  x.addEventListener('click', ()=>{
    state.selectedTags.delete(label);
    c.remove();
    applyFilters();
  });
  c.appendChild(x);
  return c;
}

els.tagSearch.addEventListener('keydown', (e)=>{
  if(e.key==='Enter'){
    e.preventDefault();
    const v = els.tagSearch.value.trim();
    if(!v) return;
    if(!state.selectedTags.has(v)){
      state.selectedTags.add(v);
      els.selectedTags.appendChild(chip(v));
      applyFilters();
    }
    els.tagSearch.value='';
  }
});
els.textSearch.addEventListener('input', ()=>{ state.textSearch = els.textSearch.value.toLowerCase(); applyFilters(); });
els.monthSelect.addEventListener('change', ()=>{ state.month = els.monthSelect.value; applyFilters(); });

// CRUD
function openModalForNew(){
  clearForm();
  els.btnDelete.classList.add('hidden');
  document.getElementById('modal-title').textContent = 'Neuer Termin';
  els.modal.showModal();
}
function openModalForEdit(evt){
  fillFormFromEvent(evt);
  els.btnDelete.classList.remove('hidden');
  document.getElementById('modal-title').textContent = 'Termin bearbeiten';
  els.modal.showModal();
}

window.addEventListener('edit-event', (e)=> openModalForEdit(e.detail.event));

els.btnNew.addEventListener('click', ()=>{
  if(!isLoggedIn()){
    alert('Bitte zuerst einloggen (NIP-07 oder Bunker).');
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

els.btnCloseModal.addEventListener('click', ()=> els.modal.close());

els.btnSave.addEventListener('click', async (e)=>{
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


els.btnICSExport.addEventListener('click', ()=>{
  const ics = eventsToICS(state.filtered.length? state.filtered : state.events);
  const blob = new Blob([ics], {type:'text/calendar'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'nostr-calendar.ics'; a.click();
  URL.revokeObjectURL(url);
});
els.btnICSImport.addEventListener('click', async ()=>{
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='.ics,text/calendar';
  inp.onchange = async () => {
    const file = inp.files?.[0]; if(!file) return;
    const items = await importICS(file);
    if(!items.length){ alert('Keine VEVENTs gefunden.'); return; }
    if(items.length>1 && confirm(`Es wurden ${items.length} Events gefunden. Alle jetzt veröffentlichen?`)){
      let ok=0, fail=0; const total = items.length;
      els.progressBar.style.width = '0%'; els.progressText.textContent = '0%'; els.progressModal.showModal();
      for(let i=0;i<items.length;i++){
        const d = items[i];
        try{ await client.publish(d); ok++; }
        catch(e){ console.warn('Publish failed', e); fail++; }
        const pct = Math.round(((i+1)/total)*100);
        els.progressBar.style.width = pct+'%'; els.progressText.textContent = `${pct}% — ${ok} ok / ${fail} Fehler`;
      }
      els.progressModal.close();
      alert(`Fertig: ${ok} veröffentlicht, ${fail} Fehler.`);
      await refresh();
      return;
    }
    // Sonst ersten vorbefüllen
    clearForm();
    const d = items[0];
    document.getElementById('f-title').value = d.title;
    document.getElementById('f-starts').value = new Date(d.starts*1000).toISOString().slice(0,16);
    document.getElementById('f-ends').value = new Date(d.ends*1000).toISOString().slice(0,16);
    document.getElementById('f-status').value = d.status;
    document.getElementById('f-location').value = d.location;
    document.getElementById('f-image').value = d.image||'';
    document.getElementById('f-summary').value = d.summary||'';
    document.getElementById('f-content').value = d.content||'';
    setEditableChips(d.tags||[]);
    document.getElementById('f-dtag').value = d.d||'';
    els.modal.showModal();
  };
  inp.click();
});

els.btnDelete.addEventListener('click', async ()=>{
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

// Upload stub (NIP‑96 if configured)
const uploadBtn = document.getElementById('btn-upload');
if (uploadBtn) uploadBtn.addEventListener('click', async ()=>{
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


// LIST + FILTER
function applyFilters(){
  let out = [...state.events];

  if(state.month){
    out = out.filter(e=>{
      const startS = Number(e.tags.find(t=>t[0]==='starts')?.[1]||0);
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
  els.info.textContent = `${out.length} Treffer`;
  renderCurrentView();
}

function renderCurrentView(){
  // Wähle die Datenquelle: gefiltert, sonst alle
  const data = state.filtered.length ? state.filtered : state.events;

  if(currentView === 'month'){
    // Monatsansicht: Grid verstecken, Month zeigen
    els.grid.classList.add('hidden');
    els.monthGrid.classList.remove('hidden');
    // (Toolbar/Filter in der Monatsansicht ausblenden)
    els.toolbar?.classList.add('hidden');
    // Falls ein spezieller Monat gewählt wurde, anwenden
    if(state.month && monthView?.setMonth) monthView.setMonth(state.month);
    monthView.render(data);
  } else {
    // Kartenansicht: Month verstecken, Grid zeigen
    els.monthGrid.classList.add('hidden');
    els.grid.classList.remove('hidden');
    // Filter in Kartenansicht sichtbar
    els.toolbar?.classList.remove('hidden');
    renderGrid(els.grid, data);
  }
}

async function refresh(){
  els.info.textContent = 'Lade…';
  console.log('[DEBUG] Loading events...');
  const events = await client.fetchEvents({ sinceDays: 1000 });
  console.log(`[DEBUG] Loaded ${events.length} events`);
  state.events = events;
  buildMonthOptions(els.monthSelect, events);
  applyFilters();
}

setupMdToolbar();
const monthView = new MonthView(els.monthGrid);
function setView(name){
  currentView = (name === 'month') ? 'month' : 'cards';
  localStorage.setItem('view', currentView);
  renderCurrentView();
}
els.btnViewCards.addEventListener('click', ()=> setView('cards'));
els.btnViewMonth.addEventListener('click', ()=> setView('month'));
setView(localStorage.getItem('view') || 'cards');
autoReconnectBunker();   // <— NEU

// setupTagInput();
refresh().catch(console.error);

