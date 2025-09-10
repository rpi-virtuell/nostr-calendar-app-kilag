import { mdToHtml, secsToLocalInput, localInputToSecs, uid } from '../utils.js';

export function fillFormFromEvent(e){
  const get = (k)=> e.tags.find(t=>t[0]===k)?.[1];
  document.getElementById('f-title').value = get('title') || '';
  document.getElementById('f-starts').value = secsToLocalInput(Number(get('starts')||0));
  document.getElementById('f-ends').value = secsToLocalInput(Number(get('ends')||0));
  document.getElementById('f-status').value = get('status') || 'planned';
  document.getElementById('f-location').value = get('location') || '';
  document.getElementById('f-image').value = get('image') || '';
  document.getElementById('f-summary').value = get('summary') || '';
  document.getElementById('f-content').value = e.content || '';
  document.getElementById('f-dtag').value = get('d') || '';
  document.getElementById('f-id').value = e.id || '';

  // tags
  const tags = e.tags.filter(t=>t[0]==='t').map(t=>t[1]);
  setEditableChips(tags);
}

// Debug-Helfer: füllt das Formular mit Zufallsdaten für Tests
export function fill_form_for_debugging(){
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const randInt = (min,max) => Math.floor(Math.random()*(max-min+1))+min;
  const now = Math.floor(Date.now()/1000);
  const startSecs = now + randInt(60, 60*60*24*7); // in 1min..7d
  const endsSecs = startSecs + randInt(30*60, 3*60*60); // 30min..3h

  const titles = ['Testtermin','Demo-Meeting','Probe-Event','Lunch','Sitzung'];
  const title = `${pick(titles)} ${randInt(1,999)}`;

  const statuses = ['planned','cancelled','movedOnline'];
  const status = pick(statuses);

  const locations = ['Zoom: https://zoom.us/j/123456789','Haus A, Raum 1','Online','Ort: Stadthalle'];
  const location = pick(locations);

  const imageUrl = `https://picsum.photos/seed/${uid()}/800/450`;
  const summary = `Kurze Beschreibung ${randInt(1,999)}.`;
  const content = `**${title}**\n\n${summary}\n\nWeitere Details hier.`;

  const possibleTags = ['BNE','Interreligiöses','Workshop','Community','Test','Demo'];
  const tags = [];
  const tagCount = randInt(1, Math.min(4, possibleTags.length));
  while(tags.length < tagCount){
    const t = pick(possibleTags);
    if(!tags.includes(t)) tags.push(t);
  }

  const dtag = `d${uid()}`;
  const id = uid();

  document.getElementById('f-title').value = title;
  document.getElementById('f-starts').value = secsToLocalInput(startSecs);
  document.getElementById('f-ends').value = secsToLocalInput(endsSecs);
  document.getElementById('f-status').value = status;
  document.getElementById('f-location').value = location;
  document.getElementById('f-image').value = imageUrl;
  document.getElementById('f-summary').value = summary;
  document.getElementById('f-content').value = content;
  document.getElementById('f-dtag').value = dtag;
  document.getElementById('f-id').value = id;
  setEditableChips(tags);

  return {
    title, starts: startSecs, ends: endsSecs, status, location, image: imageUrl, summary, content, tags, d: dtag, id
  };
}

window.fill_form_for_debugging = fill_form_for_debugging; // Debug-Helfer global verfügbar machen 

export function clearForm(){
  for(const id of ['f-title','f-starts','f-ends','f-status','f-location','f-image','f-summary','f-content','f-dtag','f-id']){
    const el = document.getElementById(id);
    el.value = '';
  }
  setEditableChips([]);
}

export function setEditableChips(tags){
  const box = document.getElementById('chips-edit');
  box.innerHTML = '';
  for(const t of tags){
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = t;
    const x = document.createElement('button');
    x.textContent='✕';
    x.title='Entfernen';
    x.addEventListener('click', ()=>{ chip.remove(); });
    chip.appendChild(x);
    box.appendChild(chip);
  }
}

export function getFormData(){
  const chips = [...document.querySelectorAll('#chips-edit .chip')].map(c=>c.childNodes[0].nodeValue.trim());
  return {
    title: document.getElementById('f-title').value.trim(),
    starts: localInputToSecs(document.getElementById('f-starts').value),
    ends: localInputToSecs(document.getElementById('f-ends').value),
    status: document.getElementById('f-status').value,
    location: document.getElementById('f-location').value.trim(),
    image: document.getElementById('f-image').value.trim(),
    summary: document.getElementById('f-summary').value.trim(),
    content: document.getElementById('f-content').value,
    tags: chips,
    d: document.getElementById('f-dtag').value.trim() || null,
    id: document.getElementById('f-id').value.trim() || null,
  };
}

export function setupMdToolbar(){
  const textarea = document.getElementById('f-content');
  const preview = document.getElementById('md-preview');
  document.querySelectorAll('.md-toolbar [data-md]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cmd = btn.dataset.md;
      const start = textarea.selectionStart, end = textarea.selectionEnd;
      const sel = textarea.value.slice(start,end);
      let wrapStart='', wrapEnd='';
      if(cmd==='bold'){ wrapStart='**'; wrapEnd='**'; }
      if(cmd==='italic'){ wrapStart='*'; wrapEnd='*'; }
      if(cmd==='link'){ wrapStart='['; wrapEnd='](https://)'; }
      if(cmd==='image'){ wrapStart='!['; wrapEnd='](https://)'; }
      textarea.setRangeText(wrapStart+sel+wrapEnd, start, end, 'end');
      textarea.focus();
    });
  });
  document.getElementById('btn-preview').addEventListener('click', ()=>{
    if(preview.classList.contains('hidden')){
      preview.innerHTML = mdToHtml(textarea.value);
      preview.classList.remove('hidden');
    } else {
      preview.classList.add('hidden');
    }
  });
}

export function setupTagInput(){
  const input = document.getElementById('f-tags');
  input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      const v = input.value.trim();
      if(!v) return;
      const chip = document.createElement('span');
      chip.className='chip';
      chip.textContent=v;
      const x = document.createElement('button'); x.textContent='✕'; x.addEventListener('click', ()=>chip.remove());
      chip.appendChild(x);
      document.getElementById('chips-edit').appendChild(chip);
      input.value='';
    }
  });
}
