import { Config } from './config.js';
import { client } from './nostr.js';
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
};

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
  els.btnLogin.classList.add('hidden');
  els.btnLogout.classList.remove('hidden');
});

els.btnBunker.addEventListener('click', async ()=>{
  const uri = prompt('NIP-46 Connect-URI (bunker://… oder nostrconnect://…):', (localStorage.getItem('nip46_connect_uri')||''));
  if(!uri) return;
  localStorage.setItem('nip46_connect_uri', uri);
  try{
    const res = await client.connectBunker(uri);
    els.whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (nip46)`;
    els.btnLogin.classList.add('hidden');
    els.btnLogout.classList.remove('hidden');
  }catch(err){
    console.error(err);
    alert('Bunker-Verbindung fehlgeschlagen. Details in Konsole.');
  }
});


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

els.btnNew.addEventListener('click', openModalForNew);
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
document.getElementById('btn-upload').addEventListener('click', async ()=>{
  const fileEl = document.getElementById('f-image-file');
  const file = fileEl.files?.[0];
  if(!file){ alert('Bitte zuerst eine Bilddatei wählen.'); return; }
  // Try Blossom first
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
  renderGrid(els.grid, out);
}

async function refresh(){
  els.info.textContent = 'Lade…';
  const events = await client.fetchEvents({ sinceDays: 540 });
  state.events = events;
  buildMonthOptions(els.monthSelect, events);
  applyFilters();
}

setupMdToolbar();
const monthView = new MonthView(els.monthGrid);
function setView(name){
  if(name==='month'){
    els.grid.classList.add('hidden');
    els.monthGrid.classList.remove('hidden');
    // set month from filter if chosen
    if(state.month) monthView.setMonth(state.month);
    monthView.render(state.filtered.length? state.filtered : state.events);
    localStorage.setItem('view','month');
  } else {
    els.monthGrid.classList.add('hidden');
    els.grid.classList.remove('hidden');
    localStorage.setItem('view','cards');
  }
}
els.btnViewCards.addEventListener('click', ()=> setView('cards'));
els.btnViewMonth.addEventListener('click', ()=> setView('month'));
setView(localStorage.getItem('view') || 'cards');

setupTagInput();
refresh();
