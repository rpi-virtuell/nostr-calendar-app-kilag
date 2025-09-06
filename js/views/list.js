import { formatDateRange } from '../utils.js';

export function buildMonthOptions(selectEl, events){
  // collect months from events
  const months = new Set();
  for(const e of events){
    const startS = Number(e.tags.find(t=>t[0]==='starts')?.[1]||0);
    if(!startS) continue;
    const d = new Date(startS*1000);
    months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const values = [...months].sort();
  selectEl.innerHTML = '<option value="">Alle Monate</option>' +
    values.map(v=>`<option value="${v}">${v}</option>`).join('');
}

export function renderGrid(container, events){
  container.innerHTML = '';
  const tpl = document.getElementById('card-tpl');
  for(const e of events){
    const node = tpl.content.cloneNode(true);
    const cover = node.querySelector('.card-cover');
    const badge = node.querySelector('.card-badge');
    const title = node.querySelector('.card-title');
    const metaWhen = node.querySelector('.when');
    const metaWhere = node.querySelector('.where');
    const summary = node.querySelector('.summary');
    const tagsBox = node.querySelector('.tags');
    const editBtn = node.querySelector('.edit');

    const titleTag = e.tags.find(t=>t[0]==='title')?.[1] || '(ohne Titel)';
    const image = e.tags.find(t=>t[0]==='image')?.[1];
    const startS = Number(e.tags.find(t=>t[0]==='starts')?.[1]||0);
    const endS = Number(e.tags.find(t=>t[0]==='ends')?.[1]||startS);
    const where = e.tags.find(t=>t[0]==='location')?.[1] || '';
    const status = e.tags.find(t=>t[0]==='status')?.[1] || 'planned';
    const dtag = e.tags.find(t=>t[0]==='d')?.[1];

    if(image){ cover.style.backgroundImage = `url(${image})`; }
    badge.textContent = new Date(startS*1000).toLocaleDateString(undefined,{day:'2-digit',month:'short'}).toUpperCase();
    title.textContent = titleTag;
    metaWhen.textContent = formatDateRange(startS, endS);
    metaWhere.textContent = where;
    summary.textContent = e.tags.find(t=>t[0]==='summary')?.[1] || '';

    const tagList = e.tags.filter(t=>t[0]==='t').map(t=>t[1]);
    tagList.forEach(t=>{
      const span = document.createElement('span');
      span.className='tag';
      span.textContent=t;
      tagsBox.appendChild(span);
    });

    if(status!=='planned'){
      const st = document.createElement('span');
      st.className='tag';
      st.textContent = status;
      tagsBox.appendChild(st);
    }

    editBtn.addEventListener('click', ()=>{
      const ev = new CustomEvent('edit-event', { detail: { event: e, d: dtag } });
      window.dispatchEvent(ev);
    });

    container.appendChild(node);
  }
}
