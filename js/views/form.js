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
