import { formatDateRange } from '../utils.js';

function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth()+1, 0);
}
function addDays(d, n){
  const x = new Date(d); x.setDate(x.getDate()+n); return x;
}

export class MonthView{
  constructor(root){
    this.root = root;
    this.current = startOfMonth(new Date());
  }

  setMonth(yyyyMM){
    if(!yyyyMM) return;
    const [Y,M] = yyyyMM.split('-').map(Number);
    this.current = new Date(Y, M-1, 1);
  }

  render(events){
    if (!this.root) {
      console.error('MonthView: root element is null, cannot render calendar');
      return;
    }
    this.root.innerHTML='';
    const header = document.createElement('div');
    header.className='cal-header';
    const title = document.createElement('div');
    title.textContent = this.current.toLocaleDateString(undefined,{month:'long', year:'numeric'});
    const nav = document.createElement('div'); nav.className='cal-nav';
    const prev = document.createElement('button'); prev.className='btn btn-ghost'; prev.textContent='←';
    const next = document.createElement('button'); next.className='btn btn-ghost'; next.textContent='→';
    prev.addEventListener('click', ()=>{ this.current = new Date(this.current.getFullYear(), this.current.getMonth()-1, 1); this.render(events);} );
    next.addEventListener('click', ()=>{ this.current = new Date(this.current.getFullYear(), this.current.getMonth()+1, 1); this.render(events);} );
    nav.append(prev, next);
    header.append(title, nav);

    const grid = document.createElement('div');
    grid.className='calendar';

    // find grid start (Mon) and end (Sun)
    const first = startOfMonth(this.current);
    const last = endOfMonth(this.current);
    const weekStart = new Date(first); // Monday
    const wday = (weekStart.getDay()+6)%7; // 0=Mon
    weekStart.setDate(weekStart.getDate() - wday);

    const days = [];
    for(let i=0;i<42;i++){ days.push(addDays(weekStart,i)); }

    const evsByDay = new Map();
    for(const e of events){
      const s = Number(e.tags.find(t=>t[0]==='starts')?.[1]||e.tags.find(t=>t[0]==='start')?.[1]||0);
      if(!s) continue;
      const d = new Date(s*1000);
      if(d.getMonth()!==this.current.getMonth() || d.getFullYear()!==this.current.getFullYear()){
        // also show cross-month items if within overlay days
      }
      const key = d.toDateString();
      if(!evsByDay.has(key)) evsByDay.set(key, []);
      evsByDay.get(key).push(e);
    }

    for(const day of days){
      const cell = document.createElement('div');
      cell.className='cell';
      const dayEl = document.createElement('div');
      dayEl.className='day';
      dayEl.textContent = day.toLocaleDateString(undefined, {weekday:'short', day:'2-digit', month: day.getMonth()===this.current.getMonth()? undefined : 'short'});
      const items = document.createElement('div'); items.className='items';

      const key = day.toDateString();
      const list = evsByDay.get(key)||[];
      for(const e of list){
        const t = e.tags.find(x=>x[0]==='title')?.[1] || '(ohne Titel)';
        const s = Number(e.tags.find(x=>x[0]==='starts')?.[1]||e.tags.find(x=>x[0]==='start')?.[1]||0);
        const h = new Date(s*1000).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
        const a = document.createElement('a');
        a.href='#'; a.className='ev';
        a.innerHTML = `<span class="t">${t}</span><span class="h">${h}</span>`;
        a.addEventListener('click', (ev)=>{
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent('edit-event', { detail: { event: e } }));
        });
        items.appendChild(a);
      }

      cell.append(dayEl, items);
      grid.appendChild(cell);
    }

    this.root.append(header, grid);
  }
}
