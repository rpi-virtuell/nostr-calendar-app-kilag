// Simple Blossom uploader (best-effort).
// Tested endpoint: https://blossom.band (may change).
// If server supports CORS + simple upload, we POST /upload with FormData { file }.
import { Config } from './config.js';

export async function uploadToBlossom(file){
  const endpoint = (Config.blossom && Config.blossom.endpoint) || 'https://blossom.band';
  const url = endpoint.replace(/\/$/,'') + '/upload';
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(url, { method:'POST', body: fd });
  if(!res.ok) throw new Error('Blossom upload failed: '+res.status);
  const json = await res.json().catch(()=> ({}));
  // Heuristics for common fields
  const outUrl = json.url || json.location || json.blossom_url || json.href;
  if(!outUrl) throw new Error('Upload ok, aber keine URL in Antwort.');
  return { url: outUrl, meta: json };
}


export async function listBlossom(){
  const endpoint = (Config.blossom && Config.blossom.endpoint) || 'https://blossom.band';
  const url = endpoint.replace(/\/$/,'') + '/list';
  const res = await fetch(url);
  if(!res.ok) throw new Error('Blossom list failed: '+res.status);
  const json = await res.json().catch(()=>[]);
  // Normalize to [{url,size,created,name,id}]
  return json.map((it)=> ({
    url: it.url || it.href || it.download_url || it.path || '',
    size: it.size || it.bytes || 0,
    created: it.created || it.created_at || it.time || Date.now()/1000,
    name: it.name || it.filename || (it.url? it.url.split('/').pop(): 'file'),
    id: it.id || it.hash || it.sha256 || it.uid || it.url || ''
  }));
}

export async function deleteFromBlossom(item){
  const endpoint = (Config.blossom && Config.blossom.endpoint) || 'https://blossom.band';
  // try DELETE ?url=
  let url = endpoint.replace(/\/$/,'') + '/delete?url=' + encodeURIComponent(item.url);
  let res = await fetch(url, { method:'DELETE' });
  if(res.ok) return true;
  // fallback POST /delete {url}
  url = endpoint.replace(/\/$/,'') + '/delete';
  res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: item.url, id: item.id }) });
  if(res.ok) return true;
  throw new Error('Delete failed');
}

// UI-Funktionen aus app.js ausgelagert
export const blossomState = { items: [], page:1, size:25, type:'', sMin:0, sMax:Infinity };

export function detectType(url){
  const u = url.toLowerCase();
  if(u.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/)) return 'image';
  if(u.match(/\.(mp4|webm|mov|mkv)(\?|$)/)) return 'video';
  if(u.match(/\.(mp3|wav|ogg)(\?|$)/)) return 'audio';
  return 'other';
}

export function renderBlossom(table, pageInfo, info, previewModal, previewBody, previewClose, state = blossomState){
  const type = state.type;
  const smin = state.sMin;
  const smax = state.sMax;
  const filtered = state.items.filter(it=>{
    if(type && detectType(it.url)!==type) return false;
    const kb = (it.size||0)/1024;
    if(smin && kb < smin) return false;
    if(isFinite(smax) && smax && kb > smax) return false;
    return true;
  });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / state.size));
  state.page = Math.min(state.page, pages);
  const start = (state.page-1) * state.size;
  const pageItems = filtered.slice(start, start + state.size);

  const tb = table.querySelector('tbody');
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
      if (previewBody && previewModal) {
        previewBody.innerHTML = isImg ? `<img class="preview-img" src="${it.url}" />`
          : `<iframe class="preview-iframe" src="${it.url}"></iframe>`;
        previewModal.showModal();
      }
    });
    tb.appendChild(tr);
  }
  pageInfo.textContent = `${state.page}/${pages}`;
  info.textContent = `${total} Dateien (gefiltert)`;
}

export async function refreshBlossom(infoEl, state = blossomState){
  infoEl.textContent = 'Lade…';
  try{
    state.items = await listBlossom();
    // renderBlossom muss separat aufgerufen werden
  }catch(e){ console.error(e); infoEl.textContent = 'Fehler beim Laden'; }
}

export function wireDropZone(dropEl, onUploadSuccess){
  const fileInput = document.createElement('input');
  fileInput.type='file';
  fileInput.multiple = true;
  fileInput.style.display='none';
  dropEl.after(fileInput);
  dropEl.addEventListener('click', ()=> fileInput.click());
  dropEl.addEventListener('dragover', (e)=>{ e.preventDefault(); dropEl.classList.add('drag'); });
  dropEl.addEventListener('dragleave', ()=> dropEl.classList.remove('drag'));
  dropEl.addEventListener('drop', async (e)=>{
    e.preventDefault(); dropEl.classList.remove('drag');
    const files = [...e.dataTransfer.files];
    if(!files.length) return;
    for(const f of files){
      try{ await uploadToBlossom(f); }catch(e){ console.warn('Upload failed', e); }
    }
    if(onUploadSuccess) onUploadSuccess();
  });
  fileInput.addEventListener('change', async ()=>{
    const files = [...fileInput.files];
    for(const f of files){
      try{ await uploadToBlossom(f); }catch(e){ console.warn('Upload failed', e); }
    }
    fileInput.value='';
    if(onUploadSuccess) onUploadSuccess();
  });
}

export function setupBlossomUI(modal, closeBtn, refreshBtn, prevBtn, nextBtn, pageSizeEl, filterTypeEl, sizeMinEl, sizeMaxEl, pageInfoEl, infoEl, table, dropEl, btnMedia, previewModal, previewBody, previewClose, state = blossomState){
  btnMedia.addEventListener('click', ()=>{
    modal.showModal();
    refreshBlossom(infoEl, state).then(() => renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state));
  });
  closeBtn.addEventListener('click', ()=> modal.close());
  refreshBtn.addEventListener('click', () => refreshBlossom(infoEl, state).then(() => renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state)));
  
  prevBtn.addEventListener('click', ()=>{ if(state.page>1){ state.page--; renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state); }});
  nextBtn.addEventListener('click', ()=>{ state.page++; renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state); });
  pageSizeEl.addEventListener('change', ()=>{ state.size = Number(pageSizeEl.value); renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state); });
  filterTypeEl.addEventListener('change', ()=>{ state.type = filterTypeEl.value; state.page=1; renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state); });
  sizeMinEl.addEventListener('input', ()=>{ state.sMin = Number(sizeMinEl.value||0); state.page=1; renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state); });
  sizeMaxEl.addEventListener('input', ()=>{ state.sMax = Number(sizeMaxEl.value||0) || Infinity; state.page=1; renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state); });
  
  if (previewClose && previewModal) previewClose.addEventListener('click', ()=> previewModal.close());
  
  if(dropEl) wireDropZone(dropEl, () => refreshBlossom(infoEl, state).then(() => renderBlossom(table, pageInfoEl, infoEl, previewModal, previewBody, previewClose, state)));
}
