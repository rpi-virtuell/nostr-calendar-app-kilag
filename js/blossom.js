// Blossom uploader with local cache and NIP-94 file metadata support
// Supports multiple upload services and local tracking of uploaded files
import { Config } from './config.js';
import { client } from './nostr.js';

// Local storage key for uploaded files cache
const STORAGE_KEY = 'blossom-uploads';

// Get cached uploads from localStorage
function getCachedUploads() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn('Failed to read upload cache:', e);
    return [];
  }
}

// Save upload to cache
function cacheUpload(uploadData) {
  try {
    const cached = getCachedUploads();
    cached.unshift(uploadData); // Add to beginning
    // Keep only last 500 uploads
    if (cached.length > 500) cached.splice(500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (e) {
    console.warn('Failed to cache upload:', e);
  }
}

// Remove from cache
function removeCachedUpload(url) {
  try {
    const cached = getCachedUploads();
    const filtered = cached.filter(item => item.url !== url);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to remove from cache:', e);
  }
}

// Create authorization header for Blossom (NIP-98)
async function createBlossomAuth(method, url, action = 'upload') {
  try {
    // Check if user is logged in
    if (!client.signer || !client.pubkey) {
      console.warn('Not logged in, trying anonymous upload...');
      return null;
    }

    // Create NIP-98 auth event
    const authEvent = {
      kind: 24242, // Blossom Auth (based on NIP-98)
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', url],
        ['method', method],
        ['t', action], // Action type: 'upload', 'list', 'get', or 'delete'
        ['expiration', String(Math.floor(Date.now() / 1000) + 60)] // Valid for 60 seconds
      ],
      content: ''
    };

    // NIP-46 (Bunker) kann SEHR lange dauern für kind 24242 - erhöhtes Timeout
    // Erste Signatur nach Connect kann 30-60 Sekunden dauern!
    const timeout = client.signer?.type === 'nip46' ? 60000 : 8000;
    console.debug('[Blossom] Signing auth event (kind 24242) with timeout:', timeout, 'ms, signer type:', client.signer?.type);
    
    if (client.signer?.type === 'nip46') {
      console.warn('[Blossom] NIP-46 Bunker detected. This may take up to 60 seconds. Please approve the signature request in your Bunker app!');
    }
    
    const signed = await client.signEventWithTimeout(authEvent, timeout);
    
    // Create authorization header
    const authHeader = 'Nostr ' + btoa(JSON.stringify(signed));
    return authHeader;
  } catch (error) {
    console.error('[Blossom] Failed to create auth header:', error);
    
    // Spezielle Fehlerbehandlung für NIP-46
    if (client.signer?.type === 'nip46') {
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('timeout')) {
        throw new Error('NIP-46 Bunker Signatur-Timeout für kind 24242. Bitte stellen Sie sicher, dass:\n1. Sie die Permission für kind 24242 (NIP-98 Auth) im Bunker freigegeben haben\n2. Sie die Signaturanfrage im Bunker bestätigen\n3. Die Bunker-Verbindung aktiv ist');
      }
      throw new Error(`NIP-46 Bunker Signatur fehlgeschlagen: ${errorMsg}\n\nBitte prüfen Sie, ob kind 24242 (NIP-98 Auth) im Bunker erlaubt ist.`);
    }
    
    // Generischer Fehler für andere Signer-Typen
    throw new Error(`Auth-Header konnte nicht erstellt werden: ${error?.message || error}`);
  }
}

// Upload file to Blossom server
export async function uploadToBlossom(file) {
  // Get servers from config
  const servers = Config.mediaServers || [
    { url: 'https://files.sovbit.host', protocol: 'nip96' }
  ];

  let lastError = null;

  for (const server of servers) {
    try {
      if (server.protocol === 'nip96') {
        // NIP-96 upload (multipart/form-data)
        return await uploadToNip96(file, server.url);
      } else {
        // Blossom upload (PUT with file body)
        return await uploadToBlossom_internal(file, server.url);
      }
    } catch (error) {
      console.warn(`Upload to ${server.url} failed:`, error.message);
      lastError = error;
      continue;
    }
  }

  // All servers failed
  throw new Error(`Alle Upload-Server fehlgeschlagen. Letzter Fehler: ${lastError?.message || 'Unbekannt'}`);
}

// Internal: Blossom protocol upload (PUT)
async function uploadToBlossom_internal(file, endpoint) {
  const url = endpoint.replace(/\/$/, '') + '/upload';
  console.info(`Trying Blossom upload to: ${endpoint}`);

  // Try to get auth header
  const authHeader = await createBlossomAuth('PUT', url, 'upload');

  const headers = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  
  // Set Content-Type for the file
  if (file.type) {
    headers['Content-Type'] = file.type;
  }

  // Blossom uses PUT with file body (not FormData)
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: file
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${errorText}`);
  }

  const json = await res.json().catch(() => ({}));

  // Heuristics for common fields
  const outUrl = json.url || json.location || json.blossom_url || json.href || json.download_url;
  if (!outUrl) {
    throw new Error('Upload erfolgreich, aber keine URL in der Antwort gefunden.');
  }

  console.info(`✅ Upload successful: ${endpoint}`);

  // Create upload record
  const uploadData = {
    url: outUrl,
    size: file.size,
    type: file.type,
    name: file.name,
    created: Date.now() / 1000,
    id: json.sha256 || json.hash || json.id || outUrl,
    server: endpoint,
    meta: json
  };

  // Cache the upload
  cacheUpload(uploadData);

  return { url: outUrl, meta: json };
}

// Internal: NIP-96 protocol upload (POST multipart/form-data)
async function uploadToNip96(file, endpoint) {
  const url = endpoint.replace(/\/$/, '') + '/api/v2/media';
  console.info(`Trying NIP-96 upload to: ${endpoint}`);

  // Create auth header for NIP-96
  const authHeader = await createBlossomAuth('POST', url, 'upload');

  // NIP-96 uses multipart/form-data
  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadtype', 'media');

  const headers = {};
  if (authHeader) {
    headers['Authorization'] = authHeader;
  }
  // Don't set Content-Type - let browser set it with boundary for FormData

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${res.statusText} - ${errorText}`);
  }

  const json = await res.json().catch(() => ({}));
  
  // Debug: Log server response to understand what we're getting
  console.debug('[NIP-96] Upload response:', json);

  // NIP-96 response format
  let outUrl = null;
  let originalUrl = null; // Separate URL for original file
  
  // Check processing_url for original file (NIP-96 creates multiple versions)
  if (json.processing_url) {
    // Extract original file from processing_url (not WebP conversion)
    const origMatch = json.processing_url.match(/(https?:\/\/[^\s]+?\.(jpg|jpeg|png|gif|svg))/);
    if (origMatch && origMatch[1]) {
      originalUrl = origMatch[1];
    }
  }
  
  // Check nip94_event tags for URL
  if (json.nip94_event && json.nip94_event.tags) {
    const urlTag = json.nip94_event.tags.find(t => t[0] === 'url');
    if (urlTag && urlTag[1]) {
      outUrl = urlTag[1];
    }
  }
  
  // Fallback to direct fields
  if (!outUrl) {
    outUrl = json.url || json.location || json.download_url;
  }

  // Prefer original URL over converted versions (WebP, etc.)
  if (originalUrl) {
    console.info('Using original file URL instead of processed version:', originalUrl);
    outUrl = originalUrl;
  }

  if (!outUrl) {
    throw new Error('Upload erfolgreich, aber keine URL in der Antwort gefunden.');
  }

  console.info(`✅ Upload successful: ${endpoint}`);

  // Extract hash from nip94_event
  let hash = null;
  if (json.nip94_event && json.nip94_event.tags) {
    const xTag = json.nip94_event.tags.find(t => t[0] === 'x');
    const oxTag = json.nip94_event.tags.find(t => t[0] === 'ox');
    hash = (xTag && xTag[1]) || (oxTag && oxTag[1]);
  }

  // Create upload record
  const uploadData = {
    url: outUrl,
    size: file.size,
    type: file.type,
    name: file.name,
    created: Date.now() / 1000,
    id: hash || outUrl,
    server: endpoint,
    meta: json
  };

  // Cache the upload
  cacheUpload(uploadData);

  return { url: outUrl, meta: json };
}

// List uploaded files (from cache, as server /list endpoint requires auth and pubkey)
export async function listBlossom() {
  // Get first server from config (NIP-96 servers support listing)
  const servers = Config.mediaServers || [{ url: 'https://files.sovbit.host', protocol: 'nip96' }];
  const primaryServer = servers.find(s => s.protocol === 'nip96') || servers[0];
  const endpoint = primaryServer ? primaryServer.url : 'https://files.sovbit.host';
  const protocol = primaryServer ? primaryServer.protocol : 'nip96';
  
  // Try server list endpoint with auth (requires pubkey)
  try {
    if (client.signer && client.pubkey) {
      const pubkey = client.pubkey;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
      
      let url, headers;
      
      if (protocol === 'nip96') {
        // NIP-96: GET /api/v2/media?page=0&count=100
        url = endpoint.replace(/\/$/, '') + '/api/v2/media?page=0&count=100';
        headers = { 'Accept': 'application/json' };
        
        const authHeader = await createBlossomAuth('GET', url, 'list');
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }
      } else {
        // Blossom: GET /list/<pubkey>
        url = endpoint.replace(/\/$/, '') + '/list/' + pubkey;
        headers = { 'Accept': 'application/json' };
        
        const authHeader = await createBlossomAuth('GET', url, 'list');
        if (authHeader) {
          headers['Authorization'] = authHeader;
        }
      }
      
      const res = await fetch(url, { 
        signal: controller.signal,
        headers
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        let serverItems = [];
        
        if (protocol === 'nip96' && json.files) {
          // NIP-96 response format
          const allFiles = json.files.map((file) => {
            // Extract URL from tags
            const urlTag = file.tags?.find(t => t[0] === 'url');
            const sizeTag = file.tags?.find(t => t[0] === 'size');
            const xTag = file.tags?.find(t => t[0] === 'x');
            const oxTag = file.tags?.find(t => t[0] === 'ox');
            const mTag = file.tags?.find(t => t[0] === 'm');
            
            const url = urlTag ? urlTag[1] : '';
            const size = sizeTag ? parseInt(sizeTag[1]) : 0;
            const hash = (xTag && xTag[1]) || (oxTag && oxTag[1]) || '';
            const type = mTag ? mTag[1] : '';
            
            return {
              url,
              size,
              created: file.created_at || Date.now() / 1000,
              name: url ? url.split('/').pop() : 'file',
              id: hash || url,
              type,
              server: endpoint
            };
          });
          
          // Filter out WebP duplicates created by server
          // NIP-96 servers often create both original + .webp version
          // We only want to show originals (files with readable names, not hash-only .webp)
          const seen = new Set();
          serverItems = allFiles.filter((file) => {
            // Skip WebP files that have hash-only filenames (server-generated conversions)
            const fileName = file.name || '';
            const isHashWebP = fileName.match(/^[a-f0-9]{64}\.webp$/i);
            
            if (isHashWebP) {
              console.debug('Filtering out server-generated WebP duplicate:', fileName);
              return false; // Skip this file
            }
            
            // Deduplicate by URL
            if (seen.has(file.url)) {
              return false;
            }
            seen.add(file.url);
            return true;
          });
        } else if (Array.isArray(json)) {
          // Blossom response format
          serverItems = json.map((it) => ({
            url: it.url || it.href || it.download_url || it.path || '',
            size: it.size || it.bytes || 0,
            created: it.created || it.created_at || it.time || Date.now() / 1000,
            name: it.name || it.filename || (it.url ? it.url.split('/').pop() : 'file'),
            id: it.id || it.hash || it.sha256 || it.uid || it.url || '',
            type: it.type || it.mime_type || it.content_type || '',
            server: endpoint
          }));
        }
        
        console.info(`📋 Loaded ${serverItems.length} files from server (${protocol})`);
        
        // Merge with cached items (prefer server data)
        const cached = getCachedUploads();
        const serverUrls = new Set(serverItems.map(i => i.url));
        const cachedOnly = cached.filter(c => !serverUrls.has(c.url));
        
        return [...serverItems, ...cachedOnly];
      }
    } else {
      console.info('Not logged in, using cache only');
    }
  } catch (error) {
    console.warn('Server list unavailable, using cache:', error.message);
  }
  
  // Fallback to cached uploads
  const cached = getCachedUploads();
  console.info(`📋 Loaded ${cached.length} files from cache`);
  return cached;
}

// Delete file from Blossom server
export async function deleteFromBlossom(item) {
  // Use server from item, or fallback to first configured server
  const servers = Config.mediaServers || [{ url: 'https://files.sovbit.host', protocol: 'nip96' }];
  const fallbackServer = servers[0];
  const serverUrl = item.server || (fallbackServer ? fallbackServer.url : 'https://files.sovbit.host');
  
  // Determine protocol from server config or item
  const server = servers.find(s => s.url === serverUrl) || fallbackServer;
  const protocol = server?.protocol || 'blossom';
  
  // Remove from cache immediately (optimistic update)
  removeCachedUpload(item.url);
  
  // Extract SHA256 hash from item
  let sha256 = item.id || item.hash || item.sha256;
  
  // Try to extract hash from URL if not found in metadata
  if (!sha256 || sha256.startsWith('http')) {
    // Extract from URL: either filename hash or path hash
    // Pattern: /abc123...xyz.webp or /media/abc123...xyz or /abc123...xyz
    const hashMatch = item.url.match(/\/([a-f0-9]{64})(?:\.\w+)?(?:\?|$)/i);
    if (hashMatch && hashMatch[1]) {
      sha256 = hashMatch[1];
      console.debug('Extracted hash from URL:', sha256);
    }
  }
  
  if (!sha256 || sha256.startsWith('http')) {
    console.warn('No valid hash found for deletion, removed from cache only. Item:', item);
    return true;
  }
  
  // Build delete URL based on protocol
  let deleteUrl;
  if (protocol === 'nip96') {
    // NIP-96: DELETE /api/v2/media/<sha256>
    deleteUrl = serverUrl.replace(/\/$/, '') + '/api/v2/media/' + sha256;
  } else {
    // Blossom: DELETE /<sha256>
    deleteUrl = serverUrl.replace(/\/$/, '') + '/' + sha256;
  }
  
  console.info(`Deleting file (${protocol}):`, deleteUrl);
  
  // Try DELETE with authentication
  try {
    const authHeader = await createBlossomAuth('DELETE', deleteUrl, 'delete');
    
    if (!authHeader) {
      console.warn('No auth available for deletion, removed from cache only');
      return true;
    }
    
    const res = await fetch(deleteUrl, { 
      method: 'DELETE',
      headers: {
        'Authorization': authHeader
      }
    });
    
    if (res.ok) {
      console.info('✅ File deleted from server');
      return true;
    } else {
      const errorText = await res.text().catch(() => '');
      console.warn(`Server delete failed (${protocol}):`, res.status, res.statusText, errorText);
    }
  } catch (e) {
    console.warn('DELETE request failed:', e);
  }
  
  // Even if server delete fails, we removed it from cache
  console.info('Removed from local cache');
  return true;
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
    const preview = isImg ? `<img src="${it.url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;cursor:pointer" />` : '–';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${preview}</td>
      <td><a href="${it.url}" target="_blank" rel="noopener" title="${it.url}">${it.name}</a></td>
      <td>${(it.size/1024).toFixed(1)} KB</td>
      <td>${new Date((it.created*1000) || Date.now()).toLocaleString('de-DE', {dateStyle: 'short', timeStyle: 'short'})}</td>
      <td class="actions">
        ${isImg ? '<button class="btn btn-small use-image" title="Als Event-Bild verwenden">Verwenden</button>' : ''}
        <button class="btn btn-small preview" title="Vorschau anzeigen">Preview</button>
        <button class="btn btn-small copy" title="URL kopieren">Copy</button>
        <button class="btn btn-small btn-danger del" title="Datei löschen">Delete</button>
      </td>`;
    
    // Copy URL to clipboard
    tr.querySelector('.copy').addEventListener('click', ()=> {
      navigator.clipboard.writeText(it.url).then(() => {
        if(window.showNotification) {
          window.showNotification('URL in Zwischenablage kopiert', 'success');
        }
      });
    });
    
    // Delete file
    tr.querySelector('.del').addEventListener('click', async ()=>{
      if(!confirm(`Datei "${it.name}" wirklich löschen?`)) return;
      try{ 
        await deleteFromBlossom(it); 
        tr.remove();
        info.textContent = `${filtered.length - 1} Dateien (gefiltert)`;
        if(window.showNotification) {
          window.showNotification('Datei gelöscht', 'success');
        }
      }catch(e){ 
        console.error('Delete failed:', e);
        if(window.showNotification) {
          window.showNotification('Löschen fehlgeschlagen: ' + e.message, 'error');
        } else {
          alert('Löschen fehlgeschlagen');
        }
      }
    });
    
    // Preview file
    tr.querySelector('.preview').addEventListener('click', ()=>{
      if (previewBody && previewModal) {
        const mediaType = detectType(it.url);
        let content = '';
        
        if (mediaType === 'image') {
          content = `<img class="preview-img" src="${it.url}" alt="${it.name}" />`;
        } else if (mediaType === 'video') {
          content = `<video class="preview-video" controls src="${it.url}"></video>`;
        } else if (mediaType === 'audio') {
          content = `<audio class="preview-audio" controls src="${it.url}"></audio>`;
        } else {
          content = `<iframe class="preview-iframe" src="${it.url}"></iframe>`;
        }
        
        previewBody.innerHTML = content;
        previewModal.showModal();
      }
    });
    
    // Use image in event form
    if (isImg) {
      const useBtn = tr.querySelector('.use-image');
      if (useBtn) {
        useBtn.addEventListener('click', ()=>{
          const imageInput = document.getElementById('f-image');
          if (imageInput) {
            imageInput.value = it.url;
            // Trigger input event to update any listeners
            imageInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Close blossom modal
            const blossomModal = document.getElementById('blossom-modal');
            if (blossomModal) blossomModal.close();
            
            if(window.showNotification) {
              window.showNotification('Bild als Event-Bild gesetzt', 'success');
            }
          }
        });
      }
    }
    
    tb.appendChild(tr);
  }
  pageInfo.textContent = `${state.page}/${pages}`;
  info.textContent = `${total} Dateien (gefiltert)`;
}

export async function refreshBlossom(infoEl, state = blossomState){
  infoEl.textContent = 'Lade…';
  try{
    state.items = await listBlossom();
    infoEl.textContent = `${state.items.length} Dateien geladen`;
    // renderBlossom muss separat aufgerufen werden
  }catch(e){ 
    console.error('Blossom refresh error:', e); 
    infoEl.textContent = 'Fehler beim Laden: ' + e.message;
    // Even on error, show cached items
    state.items = getCachedUploads();
  }
}

export function wireDropZone(dropEl, onUploadSuccess){
  const fileInput = document.createElement('input');
  fileInput.type='file';
  fileInput.multiple = true;
  fileInput.accept = 'image/*,video/*,audio/*'; // Limit to media files
  fileInput.style.display='none';
  dropEl.after(fileInput);
  dropEl.addEventListener('click', ()=> fileInput.click());
  dropEl.addEventListener('dragover', (e)=>{ e.preventDefault(); dropEl.classList.add('drag'); });
  dropEl.addEventListener('dragleave', ()=> dropEl.classList.remove('drag'));
  dropEl.addEventListener('drop', async (e)=>{
    e.preventDefault(); dropEl.classList.remove('drag');
    const files = [...e.dataTransfer.files];
    if(!files.length) return;
    
    let successCount = 0;
    let errorCount = 0;
    
    for(const f of files){
      try{ 
        await uploadToBlossom(f); 
        successCount++;
      }catch(e){ 
        console.warn('Upload failed', f.name, e); 
        errorCount++;
      }
    }
    
    if(successCount > 0 && onUploadSuccess) onUploadSuccess();
    
    // Show notification
    const msg = `${successCount} Datei(en) hochgeladen` + (errorCount > 0 ? `, ${errorCount} fehlgeschlagen` : '');
    if(window.showNotification) {
      window.showNotification(msg, errorCount > 0 ? 'warning' : 'success');
    }
  });
  fileInput.addEventListener('change', async ()=>{
    const files = [...fileInput.files];
    let successCount = 0;
    let errorCount = 0;
    
    for(const f of files){
      try{ 
        await uploadToBlossom(f); 
        successCount++;
      }catch(e){ 
        console.warn('Upload failed', f.name, e); 
        errorCount++;
      }
    }
    
    fileInput.value='';
    if(successCount > 0 && onUploadSuccess) onUploadSuccess();
    
    // Show notification
    const msg = `${successCount} Datei(en) hochgeladen` + (errorCount > 0 ? `, ${errorCount} fehlgeschlagen` : '');
    if(window.showNotification) {
      window.showNotification(msg, errorCount > 0 ? 'warning' : 'success');
    }
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

// Cache management utilities
export function clearUploadCache() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.info('Upload cache cleared');
    return true;
  } catch (e) {
    console.warn('Failed to clear cache:', e);
    return false;
  }
}

export function getCacheStats() {
  const cached = getCachedUploads();
  const totalSize = cached.reduce((sum, item) => sum + (item.size || 0), 0);
  return {
    count: cached.length,
    totalSize,
    totalSizeKB: (totalSize / 1024).toFixed(2),
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    oldestDate: cached.length > 0 ? new Date(Math.min(...cached.map(i => (i.created || 0) * 1000))) : null,
    newestDate: cached.length > 0 ? new Date(Math.max(...cached.map(i => (i.created || 0) * 1000))) : null
  };
}

// Debug-Tool: Teste ob Bunker kind 24242 signieren kann
export async function testBlossomAuthSigning() {
  if (!client.signer || !client.pubkey) {
    console.error('[Blossom Test] Nicht angemeldet!');
    return { ok: false, error: 'Nicht angemeldet' };
  }

  const signerType = client.signer?.type || 'unknown';
  console.info(`[Blossom Test] Teste kind 24242 Signatur mit ${signerType}...`);

  try {
    const testUrl = 'https://files.sovbit.host/upload';
    const testEvent = {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['u', testUrl],
        ['method', 'PUT'],
        ['t', 'upload'],
        ['expiration', String(Math.floor(Date.now() / 1000) + 60)]
      ],
      content: ''
    };

    const timeout = signerType === 'nip46' ? 60000 : 8000;
    console.warn(`[Blossom Test] Testing with ${timeout}ms timeout. For NIP-46, please approve in Bunker when prompted!`);
    
    const signed = await client.signEventWithTimeout(testEvent, timeout);

    if (signed && signed.id && signed.sig) {
      console.info('[Blossom Test] ✅ kind 24242 Signatur erfolgreich!', { id: signed.id });
      return { 
        ok: true, 
        signerType, 
        eventId: signed.id,
        message: `✅ Bunker kann kind 24242 signieren! Event ID: ${signed.id.substring(0, 16)}...`
      };
    } else {
      console.warn('[Blossom Test] ⚠ Signatur zurückgegeben, aber unvollständig:', signed);
      return { 
        ok: false, 
        error: 'Signatur unvollständig',
        message: '⚠ Signatur unvollständig - bitte prüfen Sie die Bunker-Logs'
      };
    }
  } catch (error) {
    console.error('[Blossom Test] ❌ kind 24242 Signatur fehlgeschlagen:', error);
    const errorMsg = error?.message || String(error);
    
    let helpText = '';
    if (signerType === 'nip46') {
      if (errorMsg.includes('timeout')) {
        helpText = '\n\n💡 TIMEOUT - Mögliche Ursachen:\n' +
          '1. ❌ kind 24242 Permission fehlt im Bunker\n' +
          '2. ❌ Sie haben die Signatur-Anfrage nicht bestätigt\n' +
          '3. ❌ Bunker-Relay ist nicht erreichbar\n' +
          '4. ❌ Bunker-App ist nicht geöffnet/aktiv\n\n' +
          '🔧 Lösung:\n' +
          '1. Öffnen Sie Ihre Bunker-App (z.B. nsec.app)\n' +
          '2. Gehen Sie zu den App-Permissions für "nostr-calendar"\n' +
          '3. Fügen Sie kind 24242 (NIP-98 Auth) hinzu\n' +
          '4. Speichern und erneut testen\n\n' +
          '📝 Tipp: Führen Sie aus: window.nip46.testSignKinds(1, 24242)\n' +
          'um zu sehen welche Kinds funktionieren';
      } else {
        helpText = '\n\n💡 Lösung:\n' +
          '1. Öffnen Sie Ihre Bunker-App (z.B. nsec.app)\n' +
          '2. Gehen Sie zu den App-Permissions\n' +
          '3. Fügen Sie kind 24242 (NIP-98 Auth) hinzu\n' +
          '4. Optional: auch kind 24133 (NIP-94 File Metadata)\n' +
          '5. Speichern und erneut versuchen';
      }
    }

    return { 
      ok: false, 
      signerType,
      error: errorMsg,
      message: `❌ kind 24242 Signatur fehlgeschlagen: ${errorMsg}${helpText}`
    };
  }
}

// Expose test function globally for console debugging
if (typeof window !== 'undefined') {
  window.testBlossomAuth = testBlossomAuthSigning;
  console.info('[Blossom] Debug-Tool verfügbar: window.testBlossomAuth()');
}


// Debug helpers (available in console)
if (typeof window !== 'undefined') {
  window.blossomDebug = {
    getCachedUploads,
    clearUploadCache,
    getCacheStats,
    uploadToBlossom,
    listBlossom,
    deleteFromBlossom
  };
}

