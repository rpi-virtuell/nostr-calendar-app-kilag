import { unb64 } from './utils.js';
import { client } from './nostr.js';

// ICS Helper-Funktionen (aus ics.js migriert)
function pad(n){ return String(n).padStart(2,'0'); }
function toICSDate(secs){
  const d = new Date(secs*1000);
  return d.getUTCFullYear() +
    pad(d.getUTCMonth()+1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z';
}

export function eventsToICS(events){
  let out = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Nostr Calendar//EN'];
  for(const e of events){
    const title = e.tags.find(t=>t[0]==='title')?.[1] || '';
    const starts = Number(e.tags.find(t=>t[0]==='starts')?.[1]||0);
    const ends = Number(e.tags.find(t=>t[0]==='ends')?.[1]||starts);
    const loc = e.tags.find(t=>t[0]==='location')?.[1] || '';
    const sum = e.tags.find(t=>t[0]==='summary')?.[1] || '';
    const dtag = e.tags.find(t=>t[0]==='d')?.[1] || e.id;
    const uid = dtag + '@nostr';
    const desc = (e.content || sum || '').replace(/\n/g,'\\n');
    out.push('BEGIN:VEVENT');
    out.push('UID:'+uid);
    out.push('DTSTAMP:'+toICSDate(e.created_at||Math.floor(Date.now()/1000)));
    out.push('DTSTART:'+toICSDate(starts));
    out.push('DTEND:'+toICSDate(ends));
    out.push('SUMMARY:'+title);
    if(loc) out.push('LOCATION:'+loc);
    if(desc) out.push('DESCRIPTION:'+desc);
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n');
}

function parseICSDate(v){
  // Expect Zulu format
  let m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if(m){ const [_,Y,M,D,h,mn,s] = m; const d=new Date(Date.UTC(+Y,+M-1,+D,+h,+mn,+s)); return Math.floor(d.getTime()/1000); }
  // Local naive (no Z) -> treat as local
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if(m){ const [_,Y,M,D,h,mn,s] = m; const d=new Date(+Y, +M-1, +D, +h, +mn, +s); return Math.floor(d.getTime()/1000); }
  // All-day VALUE=DATE (YYYYMMDD)
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m){ const [_,Y,M,D] = m; const d=new Date(+Y, +M-1, +D, 0,0,0); return Math.floor(d.getTime()/1000); }
  return null;
}

function parseRRule(str){
  const parts = Object.fromEntries(str.split(';').map(s=>{
    const [k,v] = s.split('=');
    return [k.toUpperCase(), v];
  }));
  if(parts.BYDAY){ parts.BYDAY = parts.BYDAY.split(','); }
  if(parts.BYMONTHDAY){ parts.BYMONTHDAY = parts.BYMONTHDAY.split(',').map(Number); }
  if(parts.INTERVAL){ parts.INTERVAL = Number(parts.INTERVAL)||1; } else { parts.INTERVAL = 1; }
  return parts;
}

function dayCodeToIndex(dc){ return {MO:1,TU:2,WE:3,TH:4,FR:5,SA:6,SU:0}[dc]; }
function addDays(d, n){ const x=new Date(d*1000); x.setDate(x.getDate()+n); return Math.floor(x.getTime()/1000); }
function addMonths(d, n){ const x=new Date(d*1000); x.setMonth(x.getMonth()+n); return Math.floor(x.getTime()/1000); }

function expandRRule({starts, ends, rrule, limit=400}){
  const out = [];
  const freq = (rrule.FREQ||'').toUpperCase();
  const interval = rrule.INTERVAL||1;
  const until = rrule.UNTIL ? parseICSDate(rrule.UNTIL) : null;
  let count = rrule.COUNT ? Number(rrule.COUNT) : null;

  let cursorS = starts, cursorE = ends;
  const pushIf = (s,e)=>{
    if(until && s>until) return false;
    out.push([s,e]);
    if(count!=null) count--; 
    return !(count===0 || out.length>=limit);
  };

  if(freq==='DAILY'){
    while(true){
      if(!pushIf(cursorS, cursorE)) break;
      cursorS = addDays(cursorS, interval);
      cursorE = addDays(cursorE, interval);
    }
  } else if(freq==='WEEKLY'){
    const base = new Date(starts*1000);
    const baseMonday = new Date(base); const wday=(baseMonday.getDay()+6)%7; baseMonday.setDate(baseMonday.getDate()-wday);
    const by = (rrule.BYDAY && rrule.BYDAY.length) ? rrule.BYDAY : [ ['SU','MO','TU','WE','TH','FR','SA'][base.getDay()] ];
    let weekStart = Math.floor(baseMonday.getTime()/1000);
    let i=0;
    while(true){
      for(const dc of by){
        const idx = dayCodeToIndex(dc);
        const s = addDays(weekStart, idx);
        const e = s + (ends-starts);
        if(s >= starts){ if(!pushIf(s,e)) return out; }
      }
      i += interval;
      weekStart = addDays(Math.floor(baseMonday.getTime()/1000), 7*i);
      if(out.length>=limit) break;
    }
  } else if(freq==='MONTHLY'){
    const bymd = (rrule.BYMONTHDAY && rrule.BYMONTHDAY.length) ? rrule.BYMONTHDAY : [ new Date(starts*1000).getDate() ];
    let i=0;
    while(true){
      const baseMonth = addMonths(starts, i*interval);
      const bd = new Date(baseMonth*1000);
      for(const md of bymd){
        const s = Math.floor(new Date(bd.getFullYear(), bd.getMonth(), md,  bd.getHours(), bd.getMinutes(), bd.getSeconds()).getTime()/1000);
        const e = s + (ends-starts);
        if(s >= starts){ if(!pushIf(s,e)) return out; }
      }
      if(out.length>=limit) break;
      i++;
    }
  } else {
    out.push([starts, ends]);
  }
  return out;
}

export async function importICS(file){
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const events = [];
  let cur = null;
  for(let ln of lines){
    if(ln==='BEGIN:VEVENT'){ cur = {}; continue; }
    if(ln==='END:VEVENT'){ if(cur) events.push(cur); cur=null; continue; }
    if(!cur) continue;
    const idx = ln.indexOf(':');
    if(idx<0) continue;
    const key = ln.slice(0, idx);
    const val = ln.slice(idx+1);
    cur[key] = val;
  }
  // Map to Nostr-ish objects
  return events.map(v=>{
    const starts = parseICSDate(v['DTSTART']);
    const ends = parseICSDate(v['DTEND']) || starts;
    const title = v['SUMMARY'] || '';
    const location = v['LOCATION'] || '';
    const description = v['DESCRIPTION'] ? v['DESCRIPTION'].replace(/\\n/g,'\n') : '';
    const d = (v['UID']||'').replace(/@.*$/,'') || undefined;
    return {
      title,
      starts, ends,
      status: 'planned',
      summary: description.slice(0,280),
      location,
      image: '',
      tags: [],
      content: description,
      d
    };
  });
}

// UI-Handler aus app.js ausgelagert
export function setupICSExport(btnExport, getState) {
  btnExport.addEventListener('click', ()=>{
    const currentState = getState();
    const ics = eventsToICS(currentState.filtered.length ? currentState.filtered : currentState.events);
    const blob = new Blob([ics], {type:'text/calendar'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nostr-calendar.ics';
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function setupICSImport(btnImport, client, onFormFill, progressModal, progressBar, progressText, modal, clearForm, setEditableChips) {
  btnImport.addEventListener('click', async ()=>{
    const inp = document.createElement('input');
    inp.type='file'; 
    inp.accept='.ics,text/calendar';
    inp.onchange = async () => {
      const file = inp.files?.[0]; 
      if(!file) return;
      const items = await importICS(file);
      if(!items.length){ alert('Keine VEVENTs gefunden.'); return; }
      if(items.length>1 && confirm(`Es wurden ${items.length} Events gefunden. Alle jetzt veröffentlichen?`)){
        let ok=0, fail=0; 
        const total = items.length;
        progressBar.style.width = '0%'; 
        progressText.textContent = '0%'; 
        progressModal.showModal();
        for(let i=0;i<items.length;i++){
          const d = items[i];
          try{ await client.publish(d); ok++; }
          catch(e){ console.warn('Publish failed', e); fail++; }
          const pct = Math.round(((i+1)/total)*100);
          progressBar.style.width = pct+'%'; 
          progressText.textContent = `${pct}% — ${ok} ok / ${fail} Fehler`;
        }
        progressModal.close();
        alert(`Fertig: ${ok} veröffentlicht, ${fail} Fehler.`);
        // Refresh würde in app.js erfolgen
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
      modal.showModal();
      if(onFormFill) onFormFill(d); // Callback für zusätzliche Logik
    };
    inp.click();
  });
}