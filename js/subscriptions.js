import { Config } from './config.js';
import { getAuthorMeta } from './author.js';

// Minimal Bech32 helpers
const __CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function __b32Polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (let p = 0; p < values.length; ++p) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[p];
    for (let i = 0; i < 5; ++i) if ((top >> i) & 1) chk ^= G[i];
  }
  return chk;
}
function __b32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; ++i) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; ++i) out.push(hrp.charCodeAt(i) & 31);
  return out;
}
function __b32Decode(bech) {
  try {
    const lower = bech.toLowerCase();
    const pos = lower.lastIndexOf('1');
    if (pos < 1 || pos + 7 > lower.length) return null;
    const hrp = lower.slice(0, pos);
    const data = [];
    for (let i = pos + 1; i < lower.length; ++i) {
      const c = lower.charAt(i);
      const v = __CHARSET.indexOf(c);
      if (v === -1) return null;
      data.push(v);
    }
    if (__b32Polymod(__b32HrpExpand(hrp).concat(data)) !== 1) return null;
    return { hrp, data: data.slice(0, data.length - 6) };
  } catch (e) { return null; }
}
function __fromWords(words) {
  let acc = 0, bits = 0;
  const out = [];
  for (let i = 0; i < words.length; ++i) {
    acc = (acc << 5) | words[i];
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return out;
}
function __toWords(bytes) {
  let acc = 0, bits = 0;
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  return words;
}
function __b32CreateChecksum(hrp, data) {
  const values = __b32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = __b32Polymod(values) ^ 1;
  const res = [];
  for (let p = 0; p < 6; ++p) res.push((polymod >> (5 * (5 - p))) & 31);
  return res;
}
function __b32Encode(hrp, data) {
  const combined = data.concat(__b32CreateChecksum(hrp, data));
  let out = hrp + '1';
  for (let i = 0; i < combined.length; i++) out += __CHARSET.charAt(combined[i]);
  return out;
}
function toHexOrNull(npubOrHex) {
  if (!npubOrHex || typeof npubOrHex !== 'string') return null;
  const s = npubOrHex.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  const dec = __b32Decode(s);
  if (!dec || (dec.hrp !== 'npub' && dec.hrp !== 'nprofile')) return null;
  const bytes = __fromWords(dec.data);
  if (!bytes || !bytes.length) return null;
  return bytes.map(b => ('0' + b.toString(16)).slice(-2)).join('');
}
function hexToNpub(hex) {
  try {
    if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return null;
    const bytes = hex.match(/.{1,2}/g).map(h => parseInt(h, 16));
    const words = __toWords(bytes);
    return __b32Encode('npub', words);
  } catch { return null; }
}

const STORAGE_KEY = 'nostr_calendar_subscriptions';

class SubscriptionsManager {
  constructor() {
    this.items = [];
    this.listEl = null;
    this.inputEl = null;
    this.addBtn = null;
    this.initialized = false;
    this.tooltipEl = null;
    this.tooltipOwner = null;
    this._tooltipCleanup = null;
  }

  loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.filter(x => x && x.key).map(i => {
          const cached = localStorage.getItem('author_name:' + i.key);
          if (cached && cached !== 'null') return { ...i, name: cached };
          return i;
        });
      }
      return [];
    } catch { return []; }
  }

  saveToStorage() {
    try {
      const minimal = this.items.map(i => ({ key: i.key, name: i.name || null }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
      for (const i of this.items) if (i.name) localStorage.setItem('author_name:' + i.key, i.name);
    } catch {}
  }

  seedFromConfigIfEmpty() {
    const existing = this.loadFromStorage();
    if (existing.length > 0) return existing;
    const seeds = (Config.allowedAuthors || []).map(k => ({ key: k, name: null }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(seeds)); } catch {}
    return seeds;
  }

  async resolveNames(items) {
    const delay = (ms) => new Promise(res => setTimeout(res, ms));
    let lastReq = 0;
    for (const it of items) {
      if (it.name) continue;
      const cached = localStorage.getItem('author_name:' + it.key);
      if (cached && cached !== 'null') { it.name = cached; continue; }
      const now = Date.now();
      if (now - lastReq < 100) await delay(100 - (now - lastReq));
      lastReq = Date.now();
      try {
        const meta = await getAuthorMeta(it.key);
        if (meta && (meta.display_name || meta.name)) {
          it.name = meta.display_name || meta.name;
          localStorage.setItem('author_name:' + it.key, it.name);
        } else { it.name = null; }
      } catch { it.name = null; }
    }
  }

  async init({ listEl = null, inputEl = null, addBtn = null } = {}) {
    if (this.initialized) return;
    this.initialized = true;
    this.listEl = listEl || document.getElementById('subscriptions-list');
    this.inputEl = inputEl || document.getElementById('subscription-input');
    this.addBtn = addBtn || document.getElementById('subscription-add');

    let stored = this.seedFromConfigIfEmpty();
    await this.resolveNames(stored);
    this.items = stored.map(i => ({ ...i, hex: toHexOrNull(i.key) }));
    this.render();

    if (this.addBtn && this.inputEl) {
      this.addBtn.addEventListener('click', () => this.handleAdd());
      this.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.handleAdd(); }
      });
    }

    // URL param subscribe
    try {
      const p = new URLSearchParams(location.search);
      const v = p.get('subscripe') || p.get('subscribe');
      if (v) {
        const ok = confirm(`Möchten Sie dieses Profil abonnieren?\n${v}`);
        if (ok) {
          await this.add(v);
          try {
            p.delete('subscripe'); p.delete('subscribe');
            const newUrl = `${location.pathname}?${p.toString()}${location.hash || ''}`;
            history.replaceState(null, '', newUrl);
          } catch {}
        }
      }
    } catch {}
  }

  dedupe(arr) {
    const seen = new Set();
    const out = [];
    for (const it of arr) {
      const h = toHexOrNull(it.key) || it.key.toLowerCase();
      if (seen.has(h)) continue;
      seen.add(h);
      out.push({ ...it, hex: toHexOrNull(it.key) });
    }
    return out;
  }

  async add(npubOrHex) {
    const key = (npubOrHex || '').trim();
    if (!key) return;
    const hex = toHexOrNull(key);
    if (!hex) { alert('Bitte gültigen npub oder 64-stelligen Hex-Key eingeben.'); return; }
    const exists = this.items.some(i => (i.hex && i.hex === hex) || i.key.toLowerCase() === key.toLowerCase());
    if (exists) { alert('Dieses Profil ist bereits abonniert.'); return; }
    let name = null;
    try { const meta = await getAuthorMeta(key); name = meta && (meta.display_name || meta.name) || null; } catch {}
    this.items.push({ key, hex, name });
    this.items = this.dedupe(this.items);
    this.saveToStorage();
    this.render();
    this.emitChanged();
    if (this.inputEl) this.inputEl.value = '';
  }

  remove(hexOrKey) {
    const h = toHexOrNull(hexOrKey) || (hexOrKey || '').toLowerCase();
    const before = this.items.length;
    this.items = this.items.filter(i => (i.hex || i.key.toLowerCase()) !== h);
    if (this.items.length !== before) { this.saveToStorage(); this.render(); this.emitChanged(); }
  }

  getAuthors() { return this.items.map(i => i.key); }
  getAuthorsHex() {
    const set = new Set();
    for (const i of this.items) { const h = toHexOrNull(i.key); if (h) set.add(h); }
    return Array.from(set);
  }

  async handleAdd() { const v = this.inputEl ? this.inputEl.value : ''; await this.add(v); }

  render() {
    if (!this.listEl) return;
    if (!this.items.length) { this.listEl.innerHTML = '<div class="muted">Keine Abonnements vorhanden.</div>'; return; }
    const html = this.items.map(i => {
      const npubOrKey = i.key || '';
      const hex = i.hex || npubOrKey;
      const displayName = i.name || (npubOrKey.startsWith('npub') ? npubOrKey.slice(0, 16) + '…' : (hex.slice(0, 8) + '…'));
      const nameTitle = `hex: ${hex}`;
      return `
        <div class="subscription-item" data-hex="${hex}" data-key="${npubOrKey}">
          <div class="subscription-info">
            <div class="subscription-name">${displayName}</div>
          </div>
          <button class="btn btn-ghost subscription-remove" title="Entfernen" aria-label="Abo entfernen">✕</button>
        </div>`;
    }).join('');
    this.listEl.innerHTML = html;
    this.listEl.querySelectorAll('.subscription-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.currentTarget.closest('.subscription-item');
        const hex = item?.getAttribute('data-hex');
        if (!hex) return;
        if (confirm('Dieses Abo entfernen?')) this.remove(hex);
      });
    });
    this.listEl.querySelectorAll('.subscription-item').forEach(it => {
      it.addEventListener('click', (e) => { e.preventDefault(); this.openTooltip(it); });
    });
  }

  openTooltip(itemEl) {
    try { this.closeTooltip(); } catch {}
    if (!itemEl) return;
    const hex = itemEl.getAttribute('data-hex') || '';
    const key = itemEl.getAttribute('data-key') || '';
    const rect = itemEl.getBoundingClientRect();
  const npub = key && key.startsWith('npub') ? key : (hexToNpub(hex) || '');
    let nip05 = '';
    try { const metaRaw = localStorage.getItem('author_meta:' + key); if (metaRaw) { const meta = JSON.parse(metaRaw); if (meta && meta.nip05) nip05 = meta.nip05; } } catch {}

    const el = document.createElement('div');
    el.className = 'sub-tooltip';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'false');
    el.innerHTML = `
      <div class="sub-tooltip-content">
        <div class="sub-tip-row"><span class="tip-label">hex:</span> <code>${hex}</code></div>
        ${npub ? `<div class="sub-tip-row"><span class="tip-label">npub:</span> <code>${npub}</code></div>` : ''}
        ${nip05 ? `<div class="sub-tip-row"><span class="tip-label">nip-05:</span> <code>${nip05}</code></div>` : ''}
      </div>`;
    document.body.appendChild(el);

    const margin = 6;
    const vw = window.innerWidth, vh = window.innerHeight;
    const elRect = el.getBoundingClientRect();
    let top = rect.bottom + margin + window.scrollY;
    let left = rect.left + window.scrollX;
    if (left + elRect.width > vw + window.scrollX - 8) left = vw + window.scrollX - elRect.width - 8;
    if (top + elRect.height > vh + window.scrollY - 8) top = rect.top - elRect.height - margin + window.scrollY;
    el.style.top = `${top}px`;
    el.style.left = `${Math.max(8, left)}px`;

    const onDocClick = (ev) => { if (el.contains(ev.target) || itemEl.contains(ev.target)) return; this.closeTooltip(); };
    const onEsc = (ev) => { if (ev.key === 'Escape') this.closeTooltip(); };
    const onScroll = () => this.closeTooltip();
    setTimeout(() => document.addEventListener('click', onDocClick), 0);
    document.addEventListener('keydown', onEsc);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    this.tooltipEl = el;
    this.tooltipOwner = itemEl;
    this._tooltipCleanup = () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onEsc);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }

  closeTooltip() {
    if (this.tooltipEl && this.tooltipEl.parentNode) this.tooltipEl.parentNode.removeChild(this.tooltipEl);
    if (this._tooltipCleanup) this._tooltipCleanup();
    this.tooltipEl = null;
    this.tooltipOwner = null;
    this._tooltipCleanup = null;
  }

  emitChanged() { window.dispatchEvent(new CustomEvent('subscriptions-changed', { detail: { authors: this.getAuthors() } })); }
}

export const Subscriptions = new SubscriptionsManager();
window.Subscriptions = Subscriptions;
