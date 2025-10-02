import { secsToLocalInput, localInputToSecs, uid } from '../utils.js';

const QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block'],
  ['link', 'image'],
  ['clean']
];

const TURNDOWN_CONFIG = {
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  br: ''
};

let quillEditor = null;
let turndownService = null;
const getTextarea = () => document.getElementById('f-content');
const getEditorContainer = () => document.getElementById('quill-editor');

const parseMarkdownToHtml = (markdown = '') => {
  if (typeof window === 'undefined') return markdown;
  const marked = window.marked;
  if (!marked) return markdown;
  if (typeof marked.parse === 'function') return marked.parse(markdown);
  if (typeof marked === 'function') return marked(markdown);
  return markdown;
};

const quillToMarkdown = () => {
  const textarea = getTextarea();
  if (!textarea) return '';
  if (!quillEditor || !turndownService) {
    return textarea.value || '';
  }
  const html = quillEditor.root.innerHTML || '';
  let markdown = turndownService.turndown(html);
  if (html === '<p><br></p>' || markdown.replace(/[\s​]+/g, '') === '') {
    markdown = '';
  }
  textarea.value = markdown;
  return markdown;
};

const setQuillContent = (markdown = '') => {
  const textarea = getTextarea();
  if (textarea) {
    textarea.value = markdown || '';
  }
  if (!quillEditor) return;
  const html = parseMarkdownToHtml(markdown || '');
  quillEditor.setContents([]);
  quillEditor.clipboard.dangerouslyPasteHTML(html);
  quillEditor.setSelection(0);
  quillToMarkdown();
};

const ensureHiddenTextarea = () => {
  const textarea = getTextarea();
  if (!textarea) return;
  textarea.style.display = 'none';
};

const showTextareaFallback = () => {
  const textarea = getTextarea();
  const editor = getEditorContainer();
  if (textarea) {
    textarea.style.display = '';
  }
  if (editor) {
    editor.classList.remove('quill-editor');
  }
};

export function fillFormFromEvent(e){
  const get = (k)=> e.tags.find(t=>t[0]===k)?.[1];
  document.getElementById('f-title').value = get('title') || '';
  document.getElementById('f-start').value = secsToLocalInput(Number(get('start')||0));
  document.getElementById('f-end').value = secsToLocalInput(Number(get('end')||0));
  document.getElementById('f-status').value = get('status') || 'planned';
  document.getElementById('f-location').value = get('location') || '';
  document.getElementById('f-image').value = get('image') || '';
  document.getElementById('f-summary').value = get('summary') || '';
  const content = e.content || '';
  document.getElementById('f-content').value = content;
  document.getElementById('f-dtag').value = get('d') || '';
  document.getElementById('f-id').value = e.id || '';

  setQuillContent(content);

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
  const content = `**${title}**

${summary}

Weitere Details hier.`;

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
  document.getElementById('f-start').value = secsToLocalInput(startSecs);
  document.getElementById('f-end').value = secsToLocalInput(endsSecs);
  document.getElementById('f-status').value = status;
  document.getElementById('f-location').value = location;
  document.getElementById('f-image').value = imageUrl;
  document.getElementById('f-summary').value = summary;
  document.getElementById('f-content').value = content;
  document.getElementById('f-dtag').value = dtag;
  document.getElementById('f-id').value = id;
  setEditableChips(tags);
  setQuillContent(content);

  return {
    title, start: startSecs, end: endsSecs, status, location, image: imageUrl, summary, content, tags, d: dtag, id
  };
}

window.fill_form_for_debugging = fill_form_for_debugging; // Debug-Helfer global verfügbar machen 

export function clearForm(){
  for(const id of ['f-title','f-start','f-end','f-status','f-location','f-image','f-summary','f-content','f-dtag','f-id']){
    const el = document.getElementById(id);
    el.value = '';
  }
  setQuillContent('');
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
    x.textContent='x';
    x.title='Entfernen';
    x.addEventListener('click', ()=>{ chip.remove(); });
    chip.appendChild(x);
    box.appendChild(chip);
  }
}

export function getFormData(){
  const chips = [...document.querySelectorAll('#chips-edit .chip')].map(c=>c.childNodes[0].nodeValue.trim());
  const content = quillToMarkdown();
  // generate random d-tag if not present
  const dtag = `d${uid()}`;
  if(!document.getElementById('f-dtag').value.trim()) document.getElementById('f-dtag').value = dtag;

  return {
    title: document.getElementById('f-title').value.trim(),
    start: localInputToSecs(document.getElementById('f-start').value),
    end: localInputToSecs(document.getElementById('f-end').value),
    status: document.getElementById('f-status').value,
    location: document.getElementById('f-location').value.trim(),
    image: document.getElementById('f-image').value.trim(),
    summary: document.getElementById('f-summary').value.trim(),
    content,
    tags: chips,
    d: document.getElementById('f-dtag').value.trim() || null,
    id: document.getElementById('f-id').value.trim() || null,
  };
}

export function setupMdToolbar(){
  const textarea = getTextarea();
  const editorContainer = getEditorContainer();
  if (!textarea || !editorContainer) return;

  const hasQuill = typeof window !== 'undefined' && window.Quill;
  const hasTurndown = typeof window !== 'undefined' && window.TurndownService;
  const hasMarked = typeof window !== 'undefined' && window.marked;

  if (!hasQuill || !hasTurndown || !hasMarked) {
    console.warn('[form] Quill Initialisierung übersprungen – fehlende Abhängigkeiten.');
    showTextareaFallback();
    return;
  }

  if (quillEditor) {
    setQuillContent(textarea.value);
    ensureHiddenTextarea();
    return;
  }

  quillEditor = new window.Quill(editorContainer, {
    theme: 'snow',
    modules: { toolbar: QUILL_TOOLBAR },
    placeholder: textarea.getAttribute('placeholder') || 'Inhalt hier eingeben…',
  });

  turndownService = new window.TurndownService(TURNDOWN_CONFIG);
  if (window.QuillMarkdown) {
    new window.QuillMarkdown(quillEditor, {});
  }

  ensureHiddenTextarea();
  setQuillContent(textarea.value);

  quillEditor.on('text-change', () => {
    quillToMarkdown();
  });
}

// Globaler Formular-Submit-Handler, der verhindert, dass das Formular abgesendet wird,
// wenn der Fokus im Tag-Eingabefeld ist
export function setupFormSubmitHandler() {
  const form = document.getElementById('event-form');
  const tagInput = document.getElementById('f-tags');
  
  if (!form || !tagInput) {
    console.warn('[form] Form oder Tag-Input nicht gefunden');
    return;
  }
  
  form.addEventListener('submit', (e) => {
    // Prüfen, ob der Fokus im Tag-Eingabefeld ist
    if (document.activeElement === tagInput) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[form] Formular-Submit verhindert, da Fokus im Tag-Eingabefeld');
      return false;
    }
  });
}

export function setupTagInput(){
  const input = document.getElementById('f-tags');
  if (!input) {
    console.warn('[form] Tag input element not found');
    return;
  }
  
  input.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const v = input.value.trim();
      if(!v) return;
      
      const chip = document.createElement('span');
      chip.className='chip';
      chip.textContent=v;
      const x = document.createElement('button');
      x.textContent='x';
      x.title='Entfernen';
      x.addEventListener('click', ()=>chip.remove());
      chip.appendChild(x);
      
      const chipsContainer = document.getElementById('chips-edit');
      if (chipsContainer) {
        chipsContainer.appendChild(chip);
      } else {
        console.warn('[form] Chips container not found');
      }
      
      input.value='';
      input.focus(); // Fokus zurück zum Eingabefeld
      
      return false; // Zusätzliche Sicherheit
    }
  });
  
  // Verhindere auch das Formular-Submit, wenn das Input-Field Teil eines Formulars ist
  input.addEventListener('keypress', (e)=>{
    if(e.key==='Enter'){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  });
}
