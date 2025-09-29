import { Config } from './config.js';
import { getAuthorMeta } from './author.js';
import { client } from './nostr.js';

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

    // NIP-51 (People Lists, kind 30000) & Contacts (kind 3) Sync-Status
    this._listCreatedAt = 0;
    this._listSub = null;
    this._listPollTimer = null;
    this._contactsCreatedAt = 0;
    this._contactsSub = null;
    this._contactsPollTimer = null;
    this._saveTimer = null;
    this._watching = false;

    // Aktive NIP‑51-Liste (d) und optionale Metadaten
    this._activeListD = null;
    this._listName = null;
    this._listDescription = null;
    this._listsCache = [];
    this._pendingURLListD = null;
    this._listOwnerHex = null;
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
      const listD = p.get('list') || p.get('d');
      if (listD) {
        this._pendingURLListD = listD;
        try { localStorage.setItem('nostr_calendar_list_d', listD); } catch {}
      }
      const ownerParam = p.get('owner') || p.get('author');
      if (ownerParam) {
        const ownerHex = toHexOrNull(ownerParam);
        if (ownerHex) {
          this._listOwnerHex = ownerHex.toLowerCase();
          try { localStorage.setItem('nostr_calendar_list_owner', this._listOwnerHex); } catch {}
        }
      }
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

  // ---------- Kontakte (NIP-51 kind 3) Integration ----------
  canUseContacts() {
    return !!(client && client.signer && client.pubkey);
  }

  async handleAuthChange() {
    // Wenn eingeloggt → Kontakte laden + beobachten; sonst: Beobachtung stoppen
    try {
      if (this.canUseContacts()) {
        // gewünschtes d aus URL/Storage/Config übernehmen
        let desired = this._pendingURLListD;
        if (!desired) { try { desired = localStorage.getItem('nostr_calendar_list_d'); } catch {} }
        if (!desired) desired = ((Config.subscriptionsList && Config.subscriptionsList.nip51 && Config.subscriptionsList.nip51.d) || 'nostr-calendar:subscriptions');
        if (desired) this._activeListD = desired;
        // Owner bestimmen (für geteilte Listen)
        let owner = this._listOwnerHex || client.pubkey;
        // 1) Präferiere NIP-51 People List (kind 30000, d)
        const ok51 = await this.loadFromNip51(owner).catch(() => false);
        if (ok51) {
          this.startWatchingNip51(owner);
        } else {
          // 2) Fallback auf Contacts (kind 3)
          // Nur sinnvoll, wenn owner der eigene Key ist
          if (!this._listOwnerHex || this._listOwnerHex === client.pubkey) {
            await this.loadFromContacts(client.pubkey);
            this.startWatchingContacts(client.pubkey);
          }
        }
        // verfügbare Listen für UI ermitteln (nur für eigenen Key sinnvoll)
        const who = (!this._listOwnerHex || this._listOwnerHex === client.pubkey) ? client.pubkey : client.pubkey;
        this.listAllNip51Lists(who).catch(() => {});
      } else {
        this.stopWatchingAll();
      }
    } catch (e) {
      console.warn('[Subscriptions] handleAuthChange failed:', e);
    }
  }

  async setActiveListD(d, { name = null, description = null } = {}) {
    if (!d || typeof d !== 'string') return false;
    this._activeListD = d;
    if (name != null) this._listName = name;
    if (description != null) this._listDescription = description;
    try { localStorage.setItem('nostr_calendar_list_d', d); } catch {}
    // Watcher neu starten und Liste laden
    try { this.stopWatchingNip51(); } catch {}
    const ok = await this.loadFromNip51(client.pubkey).catch(() => false);
    if (ok) this.startWatchingNip51(client.pubkey);
    // Wenn es die Liste noch nicht gibt, ggf. anlegen (bei vorhandenen Metadaten)
    if (!ok && (name || description)) {
      try { await this.saveToNip51(); } catch {}
    }
    // Alle Listen aktualisieren
    this.listAllNip51Lists(client.pubkey).catch(() => {});
    return true;
  }

  async listAllNip51Lists(pubkeyHex) {
    try {
      if (!pubkeyHex || !/^[0-9a-f]{64}$/i.test(pubkeyHex)) return [];
      await client.initPool();
      const kind = (this.listConfig.kind || 30000);
      const filter = { kinds: [kind], authors: [pubkeyHex] };
      // Bevorzugt über alle Relays sammeln, damit frisch publizierte Events (Bunker/NIP-46) sicher gefunden werden
      let events = [];
      try { events = await client.listFromPool(Config.relays, filter, 3500); } catch {
        // Fallback: schnellstes Relay
        try {
          const relay = await client.pickFastestRelay(Config.relays).catch(() => Config.relays[0]);
          events = await client.listByWebSocketOne(relay, filter, 2500);
        } catch { events = []; }
      }
      const byD = new Map();
      (events || []).forEach(ev => {
        const d = ev.tags?.find(t => t[0] === 'd')?.[1];
        if (!d) return;
        const name = ev.tags?.find(t => t[0] === 'name')?.[1] || null;
        const description = ev.tags?.find(t => t[0] === 'description')?.[1] || null;
        const created_at = ev.created_at || 0;
        const prev = byD.get(d);
        if (!prev || created_at > prev.created_at) byD.set(d, { d, name, description, created_at });
      });
      this._listsCache = Array.from(byD.values()).sort((a,b) => (b.created_at||0) - (a.created_at||0));
      try { window.dispatchEvent(new CustomEvent('subscriptions-lists-updated', { detail: { lists: this._listsCache } })); } catch {}
      return this._listsCache;
    } catch (e) { console.warn('[Subscriptions] listAllNip51Lists failed:', e); return []; }
  }

  // ---------- NIP-51 (people list, kind 30000) ----------
  get listConfig() {
    const base = (Config.subscriptionsList && Config.subscriptionsList.nip51) || { kind: 30000, d: 'nostr-calendar:subscriptions' };
    let stored = null;
    try { stored = localStorage.getItem('nostr_calendar_list_d'); } catch {}
    const d = this._activeListD || this._pendingURLListD || stored || base.d;
    return { ...base, d, name: (this._listName || base.name || null), description: (this._listDescription || base.description || null) };
  }

  async loadFromNip51(pubkeyHex) {
    try {
      if (!pubkeyHex || !/^[0-9a-f]{64}$/i.test(pubkeyHex)) return false;
      await client.initPool();
      const d = this.listConfig.d;
      const relay = await client.pickFastestRelay(Config.relays).catch(() => Config.relays[0]);
      const filter = { kinds: [this.listConfig.kind || 30000], authors: [pubkeyHex], '#d': [d], limit: 1 };
      let events = [];
      try { events = await client.listByWebSocketOne(relay, filter, 2500); } catch { try { events = await client.listFromPool(Config.relays, filter, 3500); } catch { events = []; } }
      if (!events || !events.length) {
        this._listCreatedAt = 0;
        return false;
      }
      const ev = events.sort((a,b) => (b.created_at||0) - (a.created_at||0))[0];
      this._listCreatedAt = ev.created_at || 0;
      const ps = (ev.tags || []).filter(t => t && t[0] === 'p');
      const list = ps.map(t => {
        const hex = (t[1] || '').toLowerCase();
        const pet = t[3] || null;
        const key = hexToNpub(hex) || hex;
        return { key, hex, name: pet };
      }).filter(x => x.hex);
      if (!list.length) return false;
      await this.resolveNames(list);
      this.items = this.dedupe(list);
      this.saveToStorage();
      this.render();
      this.emitChanged();
      return true;
    } catch (e) {
      console.warn('[Subscriptions] loadFromNip51 failed:', e);
      return false;
    }
  }

  startWatchingNip51(pubkeyHex) {
    // Beende bestehende Watches
    try { this.stopWatchingNip51(); } catch {}
    if (!this.canUseContacts() || !pubkeyHex) return;
    this._watching = true;

    const d = this.listConfig.d;
    const setupSub = () => {
      try {
        if (!client.pool || typeof client.pool.subscribeMany !== 'function') return false;
        const since = (this._listCreatedAt || 0) + 1;
        const f = [{ kinds: [this.listConfig.kind || 30000], authors: [pubkeyHex], '#d': [d], since }];
        const sub = client.pool.subscribeMany(Config.relays, f, {
          onevent: async (ev) => {
            if (!ev) return;
            if ((ev.created_at || 0) <= (this._listCreatedAt || 0)) return;
            this._listCreatedAt = ev.created_at || this._listCreatedAt;
            try {
              const ps = (ev.tags || []).filter(t => t && t[0] === 'p');
              const list = ps.map(t => ({
                hex: (t[1] || '').toLowerCase(),
                key: hexToNpub((t[1] || '').toLowerCase()) || (t[1] || ''),
                name: t[3] || null
              })).filter(x => x.hex);
              if (!list.length) return;
              await this.resolveNames(list);
              this.items = this.dedupe(list);
              this.saveToStorage();
              this.render();
              this.emitChanged();
            } catch (e) { console.warn('[Subscriptions] nip51 update parse failed', e); }
          },
          oneose: () => { /* keep open */ }
        });
        this._listSub = sub;
        return true;
      } catch (e) { console.warn('[Subscriptions] subscribeMany nip51 failed:', e); return false; }
    };

    const ok = setupSub();
    if (!ok) {
      const poll = async () => {
        if (!this._watching) return;
        try { await this.loadFromNip51(pubkeyHex); } catch {}
        this._listPollTimer = setTimeout(poll, 30000);
      };
      poll();
    }
  }

  stopWatchingNip51() {
    try { if (this._listSub && typeof this._listSub.close === 'function') this._listSub.close(); } catch {}
    this._listSub = null;
    if (this._listPollTimer) { try { clearTimeout(this._listPollTimer); } catch {}; this._listPollTimer = null; }
  }

  async saveToNip51() {
    if (!this.canUseContacts()) return false;
    // Bei geteilten Listen (owner != self) nicht speichern
    if (this._listOwnerHex && this._listOwnerHex !== client.pubkey) return false;
    try {
      await client.initPool();
      const now = Math.floor(Date.now() / 1000);
      const d = this.listConfig.d;
  const tags = [['d', d]];
      const seen = new Set();
      for (const it of this.items) {
        const hex = toHexOrNull(it.hex || it.key);
        if (!hex || seen.has(hex)) continue;
        seen.add(hex);
        const pet = it.name ? String(it.name).slice(0, 100) : undefined;
        const arr = pet ? ['p', hex, '', pet] : ['p', hex];
        tags.push(arr);
      }
  // Optional: name/description Tags aus Config
      if (this.listConfig.name) tags.push(['name', this.listConfig.name]);
      if (this.listConfig.description) tags.push(['description', this.listConfig.description]);
  // Optional: App-Tag für Policy/Client-Erkennung
  if (Array.isArray(Config.appTag)) tags.push(Config.appTag);
  const evt = { kind: this.listConfig.kind || 30000, content: '', tags, created_at: now };
  console.info('[Subscriptions] saveToNip51 signing', { relays: Config.relays, evt });
  const signed = await client.signEventWithTimeout(evt, 10000);
  console.info('[Subscriptions] saveToNip51 publish', { relays: Config.relays, evt });
      await client.publishToRelays(Config.relays, signed, 1600);
      // Nach erfolgreichem Publish: Listen neu laden, damit Dropdown sofort aktualisiert
      try {
        if (client && client.pubkey) {
          await this.listAllNip51Lists(client.pubkey).catch(()=>{});
          // Owner ist ab jetzt sicher der eigene Key
          this._listOwnerHex = client.pubkey;
        }
      } catch {}
      return true;
    } catch (e) { console.warn('[Subscriptions] saveToNip51 failed:', e); return false; }
  }

  async loadFromContacts(pubkeyHex) {
    try {
      if (!pubkeyHex || !/^[0-9a-f]{64}$/i.test(pubkeyHex)) return false;
      await client.initPool();
      // Schnellster Relay für first-paint
      const relay = await client.pickFastestRelay(Config.relays).catch(() => Config.relays[0]);
      const filter = { kinds: [3], authors: [pubkeyHex], limit: 1 };
      let events = [];
      try {
        events = await client.listByWebSocketOne(relay, filter, 2500);
      } catch {
        try { events = await client.listFromPool(Config.relays, filter, 3500); } catch { events = []; }
      }
      if (!events || !events.length) {
        this._contactsCreatedAt = 0;
        // Früher: automatische Veröffentlichung der lokalen Liste.
        // Das führte bei NIP-46/Bunker zu ungewollten Hintergrund-Signaturversuchen.
        // Jetzt kein Auto-Publish mehr – nur noch auf explizite Nutzeraktionen (add/remove/save-as-own).
        if (this.items && this.items.length) {
          console.info('[Subscriptions] Kontakte leer auf Relays – Auto-Publish unterdrückt (nur bei Nutzeraktion).');
        }
        return false;
      }
      // Neueste nehmen
      const ev = events.sort((a,b) => (b.created_at||0) - (a.created_at||0))[0];
      this._contactsCreatedAt = ev.created_at || 0;

      // p-Tags parsen
      const ps = (ev.tags || []).filter(t => t && t[0] === 'p');
      const list = ps.map(t => {
        const hex = (t[1] || '').toLowerCase();
        const pet = t[3] || null;
        const key = hexToNpub(hex) || hex;
        return { key, hex, name: pet };
      }).filter(x => x.hex);

      // Falls leer: lokale Seeds nutzen
      const final = list.length ? list : this.seedFromConfigIfEmpty();
      await this.resolveNames(final);
      this.items = this.dedupe(final);
      this.saveToStorage(); // lokal spiegeln
      this.render();
      this.emitChanged();
      return true;
    } catch (e) {
      console.warn('[Subscriptions] loadFromContacts failed:', e);
      return false;
    }
  }

  startWatchingContacts(pubkeyHex) {
    try { this.stopWatchingContacts(); } catch {}
    if (!this.canUseContacts() || !pubkeyHex) return;
    this._watching = true;

    // subscribeMany, falls verfügbar, sonst Polling als Fallback
    const setupSub = () => {
      try {
        if (!client.pool || typeof client.pool.subscribeMany !== 'function') return false;
        const since = (this._contactsCreatedAt || 0) + 1;
        const f = [{ kinds: [3], authors: [pubkeyHex], since }];
        const sub = client.pool.subscribeMany(Config.relays, f, {
          onevent: async (ev) => {
            if (!ev) return;
            if ((ev.created_at || 0) <= (this._contactsCreatedAt || 0)) return;
            this._contactsCreatedAt = ev.created_at || this._contactsCreatedAt;
            try {
              const ps = (ev.tags || []).filter(t => t && t[0] === 'p');
              const list = ps.map(t => ({
                hex: (t[1] || '').toLowerCase(),
                key: hexToNpub((t[1] || '').toLowerCase()) || (t[1] || ''),
                name: t[3] || null
              })).filter(x => x.hex);
              await this.resolveNames(list);
              this.items = this.dedupe(list);
              this.saveToStorage();
              this.render();
              this.emitChanged();
            } catch (e) { console.warn('[Subscriptions] contacts update parse failed', e); }
          },
          oneose: () => { /* keep open */ }
        });
        this._contactsSub = sub;
        return true;
      } catch (e) {
        console.warn('[Subscriptions] subscribeMany not available or failed:', e);
        return false;
      }
    };

    const ok = setupSub();
    if (!ok) {
      // Fallback: alle 30s poll
      const poll = async () => {
        if (!this._watching) return;
        try { await this.loadFromContacts(pubkeyHex); } catch {}
        this._contactsPollTimer = setTimeout(poll, 30000);
      };
      poll();
    }
  }

  stopWatchingContacts() {
    this._watching = false;
    try { if (this._contactsSub && typeof this._contactsSub.close === 'function') this._contactsSub.close(); } catch {}
    this._contactsSub = null;
    if (this._contactsPollTimer) { try { clearTimeout(this._contactsPollTimer); } catch {}; this._contactsPollTimer = null; }
  }

  stopWatchingAll() {
    this._watching = false;
    this.stopWatchingNip51();
    this.stopWatchingContacts();
  }

  _debouncedSaveAll(delay = 400) {
    if (!this.canUseContacts()) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      // Bei geteilten Listen (owner != self) nicht speichern
      const isOwn = (!this._listOwnerHex || this._listOwnerHex === client.pubkey);
      if (isOwn) {
        try { await this.saveToNip51(); } catch (e) { console.warn('saveToNip51 debounced failed', e); }
        try { await this.saveToContacts(); } catch (e) { console.warn('saveToContacts debounced failed', e); }
      }
    }, delay);
  }

  async saveToContacts() {
    if (!this.canUseContacts()) return false;
    // Bei geteilten Listen (owner != self) nicht speichern
    if (this._listOwnerHex && this._listOwnerHex !== client.pubkey) return false;
    try {
      await client.initPool();
      const now = Math.floor(Date.now() / 1000);
      // p-Tags bauen: ["p", hex, relayHint?, petname?]
      const tags = [];
      const seen = new Set();
      for (const it of this.items) {
        const hex = toHexOrNull(it.hex || it.key);
        if (!hex || seen.has(hex)) continue;
        seen.add(hex);
        const pet = it.name ? String(it.name).slice(0, 100) : undefined;
        const arr = pet ? ['p', hex, '', pet] : ['p', hex];
        tags.push(arr);
      }
  // Optional: App-Tag für Policy/Client-Erkennung
  if (Array.isArray(Config.appTag)) tags.push(Config.appTag);
  const evt = { kind: 3, content: '', tags, created_at: now };
  const signed = await client.signEventWithTimeout(evt, 10000);
      console.debug('[Subscriptions] saveToContacts publish', { relays: Config.relays, evt });
      await client.publishToRelays(Config.relays, signed, 1600);
      return true;
    } catch (e) {
      console.warn('[Subscriptions] saveToContacts failed:', e);
      return false;
    }
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
    this._debouncedSaveAll();
    if (this.inputEl) this.inputEl.value = '';
  }

  remove(hexOrKey) {
    const h = toHexOrNull(hexOrKey) || (hexOrKey || '').toLowerCase();
    const before = this.items.length;
    this.items = this.items.filter(i => (i.hex || i.key.toLowerCase()) !== h);
    if (this.items.length !== before) { this.saveToStorage(); this.render(); this.emitChanged(); this._debouncedSaveAll(); }
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
// Kleiner Helper global, um npub aus hex zu bilden (für Share-Links etc.)
window.hexToNpub = hexToNpub;
