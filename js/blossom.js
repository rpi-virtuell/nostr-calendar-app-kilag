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
