// js/nostr.js

// Nostr helpers: auth, fetch, publish (NIP-52: kind 31923)
import { Config } from './config.js';
import { uid, b64 } from './utils.js';


let tools = null;
let poolMod = null;
let nip46Mod = null;

// ---- hex helpers (browser-safe)
function hexToBytes(hex) { const a = []; for (let i = 0; i < hex.length; i += 2) { a.push(parseInt(hex.substr(i, 2), 16)); } return new Uint8Array(a); }
function bytesToHex(arr) { return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''); }

// --- bech32 / npub helpers (minimal, ohne externe deps)
const __CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function __b32Polymod(values) { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let chk = 1; for (let p = 0; p < values.length; ++p) { const top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ values[p]; for (let i = 0; i < 5; ++i) if ((top >> i) & 1) chk ^= G[i]; } return chk; }
function __b32HrpExpand(hrp) { const out = []; for (let i = 0; i < hrp.length; ++i) out.push(hrp.charCodeAt(i) >> 5); out.push(0); for (let i = 0; i < hrp.length; ++i) out.push(hrp.charCodeAt(i) & 31); return out; }
function __b32Decode(bech) { try { const lower = bech.toLowerCase(); const pos = lower.lastIndexOf('1'); if (pos < 1 || pos + 7 > lower.length) return null; const hrp = lower.slice(0, pos); const data = []; for (let i = pos + 1; i < lower.length; ++i) { const c = lower.charAt(i); const v = __CHARSET.indexOf(c); if (v === -1) return null; data.push(v); } if (__b32Polymod(__b32HrpExpand(hrp).concat(data)) !== 1) return null; return { hrp, data: data.slice(0, data.length - 6) }; } catch (e) { return null; } }
function __fromWords(words) { let acc = 0, bits = 0; const out = []; for (let i = 0; i < words.length; ++i) { acc = (acc << 5) | words[i]; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } } return out; }
function npubToHex(npub) { if (!npub || typeof npub !== 'string') return null; if (/^[0-9a-f]{64}$/i.test(npub)) return npub.toLowerCase(); const dec = __b32Decode(npub); if (!dec || (dec.hrp !== 'npub' && dec.hrp !== 'nprofile')) return null; const bytes = __fromWords(dec.data); if (!bytes || !bytes.length) return null; return bytes.map(b => ('0' + b.toString(16)).slice(-2)).join(''); }
function hexToNpub(hex) { if (!hex || typeof hex !== 'string') return null; if (/^[0-9a-f]{64}$/i.test(hex)) hex = hex.toLowerCase(); const bytes = hexToBytes(hex); if (!bytes || !bytes.length) return null; const words = []; for (let i = 0; i < bytes.length; ++i) { words.push((bytes[i] >> 5) & 0x1f); words.push(bytes[i] & 0x1f); } const hrp = 'npub'; const chk = __b32Polymod(words); const ret = hrp + '1' + words.map(w => __CHARSET.charAt(w)).join('') + Array(6).fill(0).map((_, i) => __CHARSET.charAt((chk >> (5 * (5 - i))) & 31)).join(''); return ret; }  
window.hexToNpub = hexToNpub; // global export

function nsecToHex(nsec) {
  if (!nsec || typeof nsec !== 'string') return null;
  if (/^[0-9a-f]{64}$/i.test(nsec)) return nsec.toLowerCase(); // fallback für hex
  const dec = __b32Decode(nsec);
  if (!dec || dec.hrp !== 'nsec') return null;
  const bytes = __fromWords(dec.data);
  if (!bytes || bytes.length !== 32) return null; // Secret Key muss 32 Bytes sein
  return bytesToHex(bytes);
}



// ---- dyn. load
async function loadTools() {
  // Try primary CDN (esm.sh). If it fails (network/CORS), fall back to alternative CDN URLs.
  const cdnAlternatives = {
    pure: [
      'https://esm.sh/nostr-tools@2.8.1/pure',
      'https://cdn.jsdelivr.net/npm/nostr-tools@2.8.1/esm/pure.js',
      'https://unpkg.com/nostr-tools@2.8.1/esm/pure.js'

      
    ],
    pool: [
      'https://esm.sh/nostr-tools@2.8.1/pool',
      'https://cdn.jsdelivr.net/npm/nostr-tools@2.8.1/esm/pool.js',
      'https://unpkg.com/nostr-tools@2.8.1/esm/pool.js'
    ],
    nip46: [
      'https://esm.sh/nostr-tools@2.8.1/nip46',
      'https://cdn.jsdelivr.net/npm/nostr-tools@2.8.1/esm/nip46.js',
      'https://unpkg.com/nostr-tools@2.8.1/esm/nip46.js'
    ]
  };

  async function tryImport(list, validate) {
    let lastErr = null;
    for (const url of list) {
      try {
        const mod = await import(url);
        try { mod.__srcURL = url; } catch {}
        if (validate) {
          const ok = validate(mod);
          if (!ok) {
            console.warn('[loadTools] imported module missing expected shape for', url);
            lastErr = new Error('module missing expected exports');
            continue;
          }
        }
        console.info('[loadTools] loaded module from', url);
        return mod;
      } catch (e) {
        lastErr = e;
        console.debug('[loadTools] import failed for', url, e && (e.message || e));
        // try next
      }
    }
    // throw the last error for visibility
    throw lastErr || new Error('dynamic import failed for all candidates');
  }

  if (!tools) {
    try {
      tools = await tryImport(cdnAlternatives.pure);
    } catch (e) {
      console.error('[loadTools] failed to load nostr-tools pure module:', e);
      throw e;
    }
  }

  if (!poolMod) {
    try {
      poolMod = await tryImport(cdnAlternatives.pool);
    } catch (e) {
      console.error('[loadTools] failed to load nostr-tools pool module:', e);
      throw e;
    }
  }

  if (!nip46Mod) {
    try {
      nip46Mod = await tryImport(cdnAlternatives.nip46, (mod) => {
        if (!mod || !mod.BunkerSigner) return false;
        const bs = mod.BunkerSigner;
        return typeof bs.fromBunker === 'function' || bs.length >= 2;
      });
      console.debug('[loadTools] nip46 module loaded successfully');
    } catch (e) {
      console.error('[loadTools] nip46 module not available (all candidates failed):', e);
      console.error('[loadTools] Available nip46 alternatives:', cdnAlternatives.nip46);
      nip46Mod = null;
    }
  }

  return { tools, poolMod, nip46Mod };
}

export class NostrClient {
  constructor() {
    this.pool = null;
    this.signer = null; // { type: 'nip07' | 'local' | 'nip46', getPublicKey, signEvent }
    this.pubkey = null;

    // Runtime state
    this._nip46Connecting = false; // Guard: vermeidet parallele Bunker-Connects

    // Speed helpers (memo)
    this.fastRelay = null;         // gemessener schnellster Relay
    this.fastProbeAt = 0;          // timestamp der letzten Messung
    this.fastProbeTTL = 5 * 60e3;  // 5 Minuten Cache

    // Serialize remote sign ops (NIP-46) to prevent overlapping requests
    this._signQueue = Promise.resolve();
    this._signQueueSize = 0;
  }

  // ---- Small queue to serialize sign_event calls for nip46
  _withSignLock(taskFn) {
    const run = async () => {
      try { this._signQueueSize++; console.debug('[signLock] enter, size=', this._signQueueSize); } catch {}
      try { return await taskFn(); }
      finally { this._signQueueSize = Math.max(0, this._signQueueSize - 1); try { console.debug('[signLock] leave, size=', this._signQueueSize); } catch {} }
    };
    const p = this._signQueue.then(run, run);
    // keep chain going regardless of outcome
    this._signQueue = p.catch(() => {});
    return p;
  }

  // ---- Pool init (versch. Export-Namen unterstützen)
  async initPool() {
    if (!this.pool) {
      await loadTools();
      const PoolCls = poolMod.SimplePool || poolMod.default || poolMod.SimplePoolClass || poolMod.Simplepool || poolMod.Pool;
      if (!PoolCls) throw new Error('SimplePool class not found in nostr-tools/pool');
      this.pool = new PoolCls();
    }
  }

  // ---- „Fastest relay“ ermitteln (kurzer open-Race, 1200ms cap)
  async pickFastestRelay(relays = Config.relays, capMs = 1200) {
    const now = Date.now();
    if (this.fastRelay && (now - this.fastProbeAt) < this.fastProbeTTL) return this.fastRelay || relays[0];

    const candidates = (relays || []).slice(0, 4); // nicht zu viele
    if (!candidates.length) return (this.fastRelay = null), (this.fastRelay = 'wss://relay.damus.io');

    const aborts = [];
    const winner = await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(candidates[0]); } }, capMs);

      candidates.forEach(url => {
        try {
          const ws = new WebSocket(url);
          aborts.push(() => { try { ws.close(); } catch { } });
          ws.addEventListener('open', () => {
            if (!settled) { settled = true; clearTimeout(timer); resolve(url); }
            try { ws.close(); } catch { }
          });
          ws.addEventListener('error', () => { /* ignore */ });
        } catch { /* ignore */ }
      });
    }).catch(() => candidates[0]);

    aborts.forEach(fn => fn());
    this.fastRelay = winner || candidates[0];
    this.fastProbeAt = Date.now();
    return this.fastRelay;
  }

  

  // ---- Listen über Pool (robust, mit Timeout + API-Varianten)
  async listFromPool(relays, filter, timeoutMs = 3500) {
    const f = Array.isArray(filter) ? filter : [filter];
    const p = this.pool;
    if (!p) throw new Error('Pool not initialized');
    const timeout = new Promise((resolve) => setTimeout(() => resolve('__TIMEOUT__'), timeoutMs));

    // A) SimplePool#list(relays, filters[])
    if (typeof p.list === 'function') {
      try {
        const res = await Promise.race([p.list(relays, f), timeout]);
        if (res === '__TIMEOUT__') throw new Error('pool.list timeout');
        return res || [];
      } catch (e) { console.warn('pool.list failed', e); }
    }

    // B) SimplePool#query(relays, filter) → async iterator
    if (typeof p.query === 'function') {
      try {
        const out = [];
        const it = p.query(relays, f.length === 1 ? f[0] : f);
        const gather = (async () => { if (it && typeof it[Symbol.asyncIterator] === 'function') { for await (const ev of it) { out.push(ev); } } return out; })();
        const res = await Promise.race([gather, timeout]);
        try { it?.close?.(); } catch { }
        return Array.isArray(res) ? res : out;
      } catch (e) { console.warn('pool.query failed', e); }
    }

    // C) subscribeMany-Fallback
    if (typeof p.subscribeMany === 'function') {
      return await new Promise((resolve) => {
        const out = []; const seen = new Set(); let eoseCount = 0; const target = relays.length; let resolved = false;
        const sub = p.subscribeMany(relays, f, {
          onevent: (ev) => { if (ev?.id && !seen.has(ev.id)) { seen.add(ev.id); out.push(ev); } },
          oneose: () => { eoseCount++; if (!resolved && eoseCount >= target) { resolved = true; try { sub.close(); } catch { } resolve(out); } }
        });
        setTimeout(() => { if (!resolved) { resolved = true; try { sub.close(); } catch { } resolve(out); } }, timeoutMs);
      });
    }

    throw new Error('Unsupported pool API: no list/query/subscribeMany');
  }

  // ---- RAW-WebSocket: sammelt Events aus N Relays, löst erst wenn alle zu sind
  async listByWebSocket(relays, filter, timeoutMs = 4000) {
    return await new Promise((resolve) => {
      const subId = 'sub-' + Math.random().toString(36).slice(2, 10);
      const byId = new Map(); let openCount = 0; let done = false;
      const timer = setTimeout(() => finish(), timeoutMs);
      function finish() { if (done) return; done = true; clearTimeout(timer); resolve([...byId.values()]); }
      (relays || []).forEach((url) => {
        try {
          const ws = new WebSocket(url);
          ws.addEventListener('open', () => { openCount++; ws.send(JSON.stringify(['REQ', subId, filter])); });
          ws.addEventListener('message', (ev) => {
            let msg; try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg[0] === 'EVENT' && msg[1] === subId) { const e = msg[2]; if (e && e.id && !byId.has(e.id)) byId.set(e.id, e); }
            else if (msg[0] === 'EOSE' && msg[1] === subId) { try { ws.close(); } catch { } }
          });
          const closeLike = () => { openCount = Math.max(0, openCount - 1); if (openCount === 0) finish(); };
          ws.addEventListener('close', closeLike);
          ws.addEventListener('error', closeLike);
        } catch (e) { /* ignore bad relay url */ }
      });
    });
  }

  // ---- RAW-WebSocket: „first-EOSE“-Variante (nur 1 Relay → super schnell)
  async listByWebSocketOne(relay, filter, timeoutMs = 3000) {
    return await new Promise((resolve) => {
      let done = false;
      const subId = 'sub-' + Math.random().toString(36).slice(2, 10);
      let ws = null; const byId = new Map();
      const finish = () => { if (done) return; done = true; try { ws?.close(); } catch { } resolve([...byId.values()]); };
      const timer = setTimeout(finish, timeoutMs);
      try {
        ws = new WebSocket(relay);
        ws.addEventListener('open', () => ws.send(JSON.stringify(['REQ', subId, filter])));
        ws.addEventListener('message', (ev) => {
          let msg; try { msg = JSON.parse(ev.data); } catch { return; }
          if (msg[0] === 'EVENT' && msg[1] === subId) { const e = msg[2]; if (e && e.id && !byId.has(e.id)) byId.set(e.id, e); }
          else if (msg[0] === 'EOSE' && msg[1] === subId) { clearTimeout(timer); finish(); }
        });
        ws.addEventListener('error', finish);
        ws.addEventListener('close', finish);
      } catch { finish(); }
    });
  }

  // ---- Auth: NIP-07/NOS2X, sonst Local Key (Demo)
  async login() {
      await this.initPool();
      if (window.nostr && window.nostr.getPublicKey) {
        this.pubkey = await window.nostr.getPublicKey();
        this.signer = {
          type: 'nip07',
          getPublicKey: async () => this.pubkey,
          signEvent: async (evt) => window.nostr.signEvent(evt)
        };
        return { method: 'nip07', pubkey: this.pubkey };
      }
      await loadTools();
      let sk = localStorage.getItem('nostr_sk_hex');
      if (!sk) {
        const s = tools.generateSecretKey();
        sk = bytesToHex(s);
        localStorage.setItem('nostr_sk_hex', sk);
      }
      const skBytes = hexToBytes(sk);
      this.pubkey = tools.getPublicKey(skBytes);
      this.signer = {
        type: 'local',
        getPublicKey: async () => this.pubkey,
        signEvent: async (evt) => tools.finalizeEvent(evt, skBytes)
      };
      return { method: 'local', pubkey: this.pubkey };
    }
  
    async loginWithNsec(nsec) {
      await this.initPool();
      await loadTools();
      const skHex = nsecToHex(nsec);
      if (!skHex) {
        throw new Error('Ungültiger nsec-Key: Muss gültiges Bech32-Format (nsec1...) oder 64-stelliger Hex sein.');
      }
      const skBytes = hexToBytes(skHex);
      if (skBytes.length !== 32) {
        throw new Error('Ungültiger Secret Key: Muss genau 32 Bytes lang sein.');
      }
      this.pubkey = tools.getPublicKey(skBytes);
      this.signer = {
        type: 'manual',
        getPublicKey: async () => this.pubkey,
        signEvent: async (evt) => tools.finalizeEvent(evt, skBytes)
      };
      this.manualSkBytes = skBytes; // Im Speicher halten für Logout
      return { method: 'manual', pubkey: this.pubkey };
    }

  async logout() {
      this.signer = null;
      this.pubkey = null;
      if (this.manualSkBytes) {
        this.manualSkBytes = null; // Manuellen Key aus Speicher löschen
      }
      try { window.dispatchEvent(new CustomEvent('nip46-disconnected')); } catch { }
    }


  // ---- NIP-46 (Bunker) – mit onauth-Callback und optional silent-Mode
 async connectBunker(connectURI, { openAuth = true } = {}) {
   // Verhindere parallele Verbindungsversuche (Button + Auto-Reconnect)
   if (this._nip46Connecting) {
     console.warn('[Bunker] connectBunker skipped — another connect is in progress');
     throw new Error('NIP-46 connect already in progress');
   }
   this._nip46Connecting = true;
   await this.initPool();
   await loadTools();

   try {
     // Check if nip46 module is available
     if (!nip46Mod) {
       throw new Error('NIP-46 module not available. Please check your internet connection and try again.');
     }

    const { BunkerSigner, parseBunkerInput, toBunkerURL } = (nip46Mod || {});
    try {
      console.debug('[Bunker] nip46Mod keys:', Object.keys(nip46Mod || {}));
      console.debug('[Bunker] BunkerSigner typeof:', typeof BunkerSigner);
      if (BunkerSigner) {
        console.debug('[Bunker] BunkerSigner own props:', Object.getOwnPropertyNames(BunkerSigner));
      }
    } catch {}
    if (!BunkerSigner || !parseBunkerInput) {
      console.error('[Bunker] nip46Mod contents:', Object.keys(nip46Mod || {}));
      throw new Error('nip46 build lacks BunkerSigner/parseBunkerInput. Check if nip46 module loaded correctly.');
    }

    // 1) URI normalisieren + parsen
    let raw = String(connectURI || '').trim();
    if (!raw) throw new Error('No connect URI provided');

    let pointer = null;
    try { pointer = await parseBunkerInput(raw); } catch {}
    if (!pointer && typeof toBunkerURL === 'function') {
      try {
        const bunkerUrl = await toBunkerURL(raw);
        pointer = await parseBunkerInput(bunkerUrl);
      } catch {}
    }
    if (!pointer) throw new Error('Invalid bunker/NIP-46 URI');

    // 2) lokalen Client-Secret laden/erzeugen
    let skHex = localStorage.getItem('nip46_client_sk_hex');
    if (!skHex) {
      const skBytesInit = tools.generateSecretKey(); // Uint8Array
      skHex = Array.from(skBytesInit).map(b => b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem('nip46_client_sk_hex', skHex);
    }
    const skBytes = new Uint8Array(skHex.match(/.{1,2}/g).map(h => parseInt(h,16)));

    // ---- Preflight: schnelles Relay aus Pointer finden ----
    async function preflightRelay(relays = [], capMs = 1500) {
      const list = Array.isArray(relays) && relays.length ? relays : [];
      if (!list.length) return null;
      const tryOne = (url) => new Promise((resolve) => {
        let ws, done = false;
        const timer = setTimeout(() => {
          if (!done) {
            done = true;
            try { ws?.close(); } catch {}
            resolve(null);
          }
        }, capMs);
        try {
          ws = new WebSocket(url);
          ws.addEventListener('open', () => {
            if (!done) {
              done = true;
              clearTimeout(timer);
              try { ws.close(); } catch {}
              resolve(url);
            }
          });
          ws.addEventListener('error', () => {
            if (!done) {
              done = true;
              clearTimeout(timer);
              resolve(null);
            }
          });
          ws.addEventListener('close', () => {
            if (!done) {
              done = true;
              clearTimeout(timer);
              resolve(url);
            }
          });
        } catch {
          resolve(null);
        }
      });
      for (const r of list) {
        const ok = await tryOne(r);
        if (ok) return ok;
      }
      return null;
    }

    // 3) Flags/Utils
    let authTriggered = false;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const MAX_WAIT_MS = 45000; // Gesamtzeit zum Polling von getPublicKey()

    // 4) BunkerSigner + onauth
    let bunker;
    let chosenRelay = null;
    try {
      const pointerRelays = Array.isArray(pointer?.relays) ? pointer.relays.filter(Boolean) : [];
      chosenRelay = await preflightRelay(pointerRelays, 1500) || pointerRelays[0] || 'wss://relay.nsec.app';

    // Helper: (Re)Create the BunkerSigner with current settings
    const createBunker = () => {
      try {
        console.debug('[Bunker] Creating BunkerSigner with relay:', chosenRelay);
        const pointerForSigner = (() => {
          const base = { ...(pointer || {}) };
          const mergedRelays = Array.isArray(pointerRelays) && pointerRelays.length
            ? pointerRelays.slice() : [];
          if (chosenRelay && !mergedRelays.includes(chosenRelay)) mergedRelays.unshift(chosenRelay);
          if (mergedRelays.length) base.relays = mergedRelays;
          return base;
        })();
        console.debug('[Bunker] pointer for signer:', pointerForSigner);
        const signerOptions = {
          onauth: (url) => {
            console.debug('[Bunker] Auth URL received:', url);
            authTriggered = true;
            try { localStorage.setItem('nip46_last_auth_url', url); } catch {}
            if (openAuth) {
              try {
                const w = window.open(url, '_blank', 'noopener,noreferrer');
                if (!w) {
                  navigator.clipboard?.writeText(url).catch(()=>{});
                  console.warn('[Bunker] Popup blocked, URL copied to clipboard');
                  // try { alert('Bitte diese Autorisierungs-URL öffnen:\n' + url); } catch {}
                }
              } catch (e) {
                navigator.clipboard?.writeText(url).catch(()=>{});
                console.warn('[Bunker] Failed to open auth URL:', e);
                // alert('Bitte diese Autorisierungs-URL öffnen:\n' + url);
              }
            } else {
              try { localStorage.setItem('nip46_last_auth_url', url); } catch {}
              window.dispatchEvent(new CustomEvent('nip46-auth-url', { detail: { url } }));
            }
          },
          onnotice: (msg) => console.log('[NIP-46 notice]', msg),
          onerror:  (err) => console.warn('[NIP-46 error]', err)
        };

        let signer;
        if (BunkerSigner && typeof BunkerSigner.fromBunker === 'function') {
          signerOptions.pool = this.pool;
          signer = BunkerSigner.fromBunker(skBytes, pointerForSigner, signerOptions);
        } else {
          const legacyOptions = { ...signerOptions, relay: chosenRelay };
          signer = new BunkerSigner(skBytes, pointerForSigner, legacyOptions);
        }
        try {
          // Wrap core calls for better visibility
          try {
            if (signer && typeof signer.getPublicKey === 'function' && !signer._wrappedGetPk) {
              const __getPk = signer.getPublicKey.bind(signer);
              signer.getPublicKey = async (...a) => {
                const t0 = Date.now();
                console.debug('[Bunker] getPublicKey() called');
                try { const r = await __getPk(...a); console.debug('[Bunker] getPublicKey() ok in', Date.now()-t0, 'ms'); return r; }
                catch (e) { console.warn('[Bunker] getPublicKey() error', e && (e.message||e)); throw e; }
              };
              signer._wrappedGetPk = true;
            }
            if (signer && typeof signer.signEvent === 'function' && !signer._wrappedSign) {
              const __sign = signer.signEvent.bind(signer);
              signer.signEvent = async (ev) => {
                const t0 = Date.now();
                try { console.debug('[Bunker] signEvent() called kind=', ev && ev.kind); } catch {}
                try { const r = await __sign(ev); console.debug('[Bunker] signEvent() ok in', Date.now()-t0, 'ms'); return r; }
                catch (e) { console.warn('[Bunker] signEvent() error', e && (e.message||e)); throw e; }
              };
              signer._wrappedSign = true;
            }
          } catch (e) { console.warn('[Bunker] wrap methods failed', e); }

          if (signer && signer.pool && !signer.pool._bunkerWrapped) {
            const origPublish = signer.pool.publish?.bind(signer.pool);
            if (origPublish) {
              signer.pool.publish = (...args) => {
                console.debug('[Bunker] pool.publish', args[0], args[1]);
                const res = origPublish(...args);
                try {
                  if (Array.isArray(res)) {
                    res.forEach((p, idx) => {
                      if (p && typeof p.then === 'function') {
                        p.then(() => console.debug('[Bunker] pool.publish resolved', idx))
                         .catch(err => console.warn('[Bunker] pool.publish rejected', idx, err));
                      }
                    });
                  }
                } catch (e) {
                  console.warn('[Bunker] pool.publish monitor failed', e);
                }
                return res;
              };
              signer.pool._bunkerWrapped = true;
            }
          }
          const origSendRequest = signer.sendRequest.bind(signer);
          signer.sendRequest = async (...args) => {
            console.debug('[Bunker] sendRequest call', args[0], args[1]);
            try {
              const res = await origSendRequest(...args);
              console.debug('[Bunker] sendRequest result', args[0], res);
              return res;
            } catch (err) {
              console.warn('[Bunker] sendRequest error', args[0], err);
              throw err;
            }
          };
        } catch (e) {
          console.warn('[Bunker] failed to wrap sendRequest', e);
        }
        console.debug('[Bunker] BunkerSigner created successfully');
        return signer;
      } catch (e) {
        console.error('[Bunker] Failed to create BunkerSigner:', e);
        throw new Error('Failed to create BunkerSigner: ' + (e.message || String(e)));
      }
    };

  bunker = createBunker();
  // Keep a handle for later reconnect attempts during signing
  try { this._bunker = bunker; } catch {}

    // Starten, aber NICHT awaiten – manche Builds resolven nie zuverlässig
    // Fehler werden geloggt, aber wir verlassen uns auf getPublicKey()-Polling unten.
    try {
      console.debug('[Bunker] calling bunker.connect() (background start)');
      bunker.connect()
        .then(() => {
          try { console.debug('[Bunker] bunker.connect() resolved successfully'); } catch(e){}
        })
        .catch(e => {
          try { console.warn('bunker.connect error (ignored, using polling):', e); } catch(e){}
        });
      try { window.dispatchEvent(new CustomEvent('nip46-connect-started', { detail: { relay: chosenRelay } })); } catch(e){}
    } catch(e) {
      console.warn('bunker.connect invocation failed:', e);
    }

    } catch (e) {
      console.warn('BunkerSigner init failed:', e, 'pointer.relays=', pointer?.relays);
      throw new Error('Failed to init NIP-46 signer');
    }

    // 5) Warten, bis Pubkey abrufbar (nach Genehmigung)
    let pk = null;
    const start = Date.now();
    const TRY_TIMEOUT_MS = 1200; // vermeidet Hänger, falls getPublicKey() nie resolved/rejected
    let attempts = 0;
    console.debug('[Bunker] begin getPublicKey polling (max ms=', MAX_WAIT_MS, 'relay=', chosenRelay, 'pointer.relays=', pointer && pointer.relays);

    while ((Date.now() - start) < MAX_WAIT_MS) {
      attempts++;
      try {
        // Validate bunker object before calling getPublicKey
        if (!bunker || typeof bunker.getPublicKey !== 'function') {
          throw new Error('Bunker object not properly initialized');
        }

        const res = await Promise.race([
          bunker.getPublicKey(),
          sleep(TRY_TIMEOUT_MS).then(() => '__TIMEOUT__')
        ]);

        if (res !== '__TIMEOUT__') {
          pk = res;
          console.debug('[Bunker] getPublicKey attempt', attempts, '->', pk);
        } else {
          console.debug('[Bunker] getPublicKey attempt', attempts, '→ timeout after', TRY_TIMEOUT_MS, 'ms');
          // Recovery: Wenn Auth ausgelöst wurde, aber keine Antwort kommt,
          // versuche periodisch, den Signer neu zu initialisieren und erneut zu verbinden.
          if (authTriggered && (attempts % 6 === 0)) {
            try {
              console.warn('[Bunker] no pubkey yet after', attempts, 'attempts — recreating signer and reconnecting…');
              try { await bunker.close?.(); } catch {}
              bunker = createBunker();
              bunker.connect().catch(e => console.warn('bunker.connect retry error:', e));
              try { window.dispatchEvent(new CustomEvent('nip46-connect-started', { detail: { relay: chosenRelay, retry: true } })); } catch(e){}
            } catch (e) {
              console.warn('[Bunker] recreate signer failed:', e);
            }
          }
        }

        if (pk && /^[0-9a-f]{64}$/i.test(pk)) {
          console.debug('[Bunker] valid pubkey received after', attempts, 'attempts:', pk);
          break;
        }
      } catch (e) {
        // noch nicht autorisiert / noch nicht bereit
        console.debug('[Bunker] getPublicKey attempt', attempts, 'threw:', e && (e.message || e));
      }
      await sleep(500);
    }
    console.debug('[Bunker] polling finished after', attempts, 'attempts, elapsed ms=', (Date.now() - start));
    if (!pk) {
      // Wenn onauth nie kam, ist es meist ein Relay-/Routing-Problem; sonst: User hat evtl. nicht bestätigt
      const why = authTriggered ? 'authorization not completed' : 'no auth_url received';
      console.warn('[Bunker] connect timeout reason=', why, 'authTriggered=', authTriggered);

      // Provide more detailed error information
      let errorMsg = 'NIP-46 connect timeout (' + why + ')';
      if (!authTriggered) {
        errorMsg += '\n\nPossible causes:';
        errorMsg += '\n- Invalid bunker URI format';
        errorMsg += '\n- Bunker service not available';
        errorMsg += '\n- Network connectivity issues';
        errorMsg += '\n- Relay connection problems';
      } else {
        errorMsg += '\n\nPlease check if you approved the authorization request in your bunker app.';
      }

      throw new Error(errorMsg);
    }

    // 6) Signer & Pubkey übernehmen
    if (!bunker || typeof bunker.getPublicKey !== 'function' || typeof bunker.signEvent !== 'function') {
      throw new Error('Bunker object not properly initialized - missing required methods');
    }

    this.signer = {
      type: 'nip46',
      getPublicKey: async () => await bunker.getPublicKey(),
      signEvent:    async (evt) => await bunker.signEvent(evt),
      close:        async () => { try { await bunker.close?.(); } catch {} }
    };
    this.pubkey = pk;

    // Persistenz + UI-Event
    try {
      localStorage.setItem('nip46_connected', '1');
      localStorage.setItem('nip46_connected_pubkey', this.pubkey);
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('nip46-connected', { detail: { pubkey: this.pubkey } }));
    } catch {}

    // Preflight sign_event entfernt: kein automatischer Signaturversuch beim Laden

    // Convenience helper to open last auth URL again (debug)
    try {
      window.nip46 = window.nip46 || {};
      window.nip46.openLastAuth = () => {
        try {
          const url = localStorage.getItem('nip46_last_auth_url');
          if (url) {
            const w = window.open(url, '_blank', 'noopener,noreferrer');
            if (!w) alert('Autorisierungs-URL:\n' + url);
            return true;
          } else {
            alert('Keine gespeicherte Autorisierungs-URL gefunden.');
            return false;
          }
        } catch (e) {
          console.warn('openLastAuth failed:', e);
          return false;
        }
      };
      window.nip46.testSign = async (kind = 1) => client._diagSign(kind);
      window.nip46.testSignKinds = async (...kinds) => {
        const list = kinds.length ? kinds : [1, 3, 30000];
        const out = [];
        for (const k of list) out.push(await client._diagSign(k));
        return out;
      };
    } catch {}

    return { method: 'nip46', pubkey: this.pubkey, relay: (chosenRelay || pointer?.relays?.[0] || null) };
   } finally {
     this._nip46Connecting = false;
   }
}



  // ---- Event-Vorlage (Kind 31923)
  toEventTemplate(data) {
    const tags = [
      ['title', data.title],
      ['start', String(data.start)],
      ['end', String(data.end)],
      ['status', data.status || 'planned'],
    ];
    if (data.summary) tags.push(['summary', data.summary]);
    if (data.location) tags.push(['location', data.location]);
    if (data.image) tags.push(['image', data.image]);
    for (const t of (data.tags || [])) { const v = String(t).trim(); if (v) tags.push(['t', v]); }
    const d = data.d || b64((data.url || '') + '|' + data.title + '|' + data.start);
    tags.push(['d', d]);
    if (Array.isArray(Config.appTag)) tags.push(Config.appTag);
    return { evt: { kind: 31923, created_at: Math.floor(Date.now() / 1000), tags, content: data.content || '' }, d };
  }

  // ---- Diagnostics: probe signing capabilities for current signer
  async _diagSign(kind) {
    const evt = { kind, content: kind === 1 ? 'diag' : '', tags: [], created_at: Math.floor(Date.now() / 1000) };
    const t0 = Date.now();
    try {
      const signed = await this.signEventWithTimeout(evt, 7000);
      console.info('[diagSign] kind', kind, 'ok in', Date.now() - t0, 'ms');
      return { ok: true, kind, ms: Date.now() - t0, id: signed && signed.id };
    } catch (e) {
      console.warn('[diagSign] kind', kind, 'failed:', e && (e.message || e));
      return { ok: false, kind, error: (e && (e.message || String(e))) };
    }
  }

  // ---- Publish
  async publish(data) {
    if (!this.signer) await this.login();
    await this.initPool();
    await loadTools();
    const { evt } = this.toEventTemplate(data);
    const signed = await this.signer.signEvent(evt);
  
    // publish zu allen Relays; robust gegenüber verschiedenen pool-APIs und
    // verhindert unhandled promise rejections, indem wir alle relevanten
    // Events (ok/failed/seen/error) abonnieren und Promise niemals ablehnen.
    let pubs = [];
    try {
      console.debug('[publish] pool.publish', Config.relays, signed);
      pubs = this.pool.publish ? this.pool.publish(Config.relays, signed) : [];
    } catch (e) { console.warn('pool.publish sync error', e); pubs = []; }
  
    const makePubPromise = (p, timeout = 1200) => {
      if (!p) return new Promise(res => setTimeout(() => res({ ok: null }), timeout));
      // Wenn p ein thenable ist (Promise)
      if (typeof p.then === 'function') {
        return Promise.race([
          p.then(() => ({ ok: true })).catch(err => ({ ok: false, err })),
          new Promise(res => setTimeout(() => res({ ok: null }), timeout))
        ]);
      }
      // Wenn p ein Event-Emitter-ähnliches Publish-Objekt ist
      if (typeof p.on === 'function') {
        return new Promise(res => {
          let settled = false;
          const cleanup = () => {
            settled = true;
            try { p.off && p.off('ok', onOk); } catch {}
            try { p.off && p.off('failed', onFailed); } catch {}
            try { p.off && p.off('seen', onSeen); } catch {}
            try { p.off && p.off('error', onFailed); } catch {}
            clearTimeout(timer);
          };
          const onOk = () => { if (!settled) { cleanup(); res({ ok: true }); } };
          const onFailed = (msg) => { if (!settled) { cleanup(); res({ ok: false, msg }); } };
          const onSeen = () => { if (!settled) { cleanup(); res({ ok: true, seen: true }); } };
          const timer = setTimeout(() => { if (!settled) { cleanup(); res({ ok: null }); } }, timeout);
          try {
            p.on('ok', onOk);
            p.on('failed', onFailed);
            p.on('seen', onSeen);
            p.on('error', onFailed);
          } catch (e) {
            // defensiv: falls on()/off() nicht verfügbar oder Fehler werfen
            if (!settled) { cleanup(); res({ ok: null }); }
          }
        });
      }
      // Fallback: warte kurz
      return new Promise(res => setTimeout(() => res({ ok: null }), timeout));
    };
  
    try {
      if (Array.isArray(pubs) && pubs.length) {
        const pPromises = pubs.map(p => makePubPromise(p, 800));
        // Wartet darauf, dass mindestens eine Relay-Antwort kommt (oder Timeout)
        await Promise.race(pPromises);
        // kleine Grace-Periode: alle Promises sauber auflösen/ablehnen (ohne throw)
        await Promise.allSettled(pPromises);
      } else {
        await new Promise(res => setTimeout(res, 200));
      }
    } catch (e) {
      console.warn('publish wait error', e);
    }
  
    return { signed };
  }
  // ---- Events holen (FAST-PATH → 1 Relay, kleines limit) + Fallback
  async fetchEvents({ sinceDays = 365, authors = Config.allowedAuthors }) {
    try {
      const since = Math.floor(Date.now() / 1000) - (sinceDays * 86400);
      const baseLimit = 1000;

      await this.initPool();

      // Autoren normalisieren (npub→hex, hex passt durch)
      let authorsHex = Array.isArray(authors) ? authors.map(a => npubToHex(a) || a).filter(Boolean) : [];
      const filter = { kinds: [31923], since, limit: baseLimit };
      if (authorsHex && authorsHex.length) filter.authors = authorsHex;

      // -------- FAST PATH --------
      // 1) schnellsten Relay messen
      const fastRelay = await this.pickFastestRelay(Config.relays).catch(() => Config.relays[0]);
      // console.debug('[fetchEvents] fastRelay:', fastRelay);
      // 2) kleines Limit für schnellen „first paint“
      const fastFilter = { ...filter, limit: Math.min(250, filter.limit || 250) };
      // console.debug('[fetchEvents] fastFilter:', fastFilter);
      // 3) Single-relay REQ (EOSE) → in der Praxis ~wie dein Test
      let fast = [];
      try { fast = await this.listByWebSocketOne(fastRelay, fastFilter, 2500); } catch { fast = []; }
      // console.debug('[fetchEvents] fast path got', (fast || []));
      if (fast.length) {
        // dedupe + sorten und direkt zurückgeben (spürbar schneller)
        const latest = new Map();
        for (const e of fast) {
          const d = e.tags?.find(t => t[0] === 'd')?.[1] || e.id;
          const prev = latest.get(d);
          if (!prev || e.created_at > prev.created_at) latest.set(d, e);
        }
        return [...latest.values()].sort((a, b) => a.created_at - b.created_at);
      }

      // -------- Fallback (robust) --------
      const TIMEOUT = 6000;
      const poolP = this.listFromPool(Config.relays, filter, TIMEOUT).catch(() => []);
      const wsP = this.listByWebSocket(Config.relays, filter, TIMEOUT).catch(() => []);
      const both = await Promise.race([
        Promise.allSettled([poolP, wsP]),
        new Promise(res => setTimeout(() => res([
          { status: 'fulfilled', value: [] },
          { status: 'fulfilled', value: [] }
        ]), TIMEOUT + 200))
      ]);

      let events = [];
      if (Array.isArray(both)) {
        const [pRes, wRes] = both;
        const pOk = pRes?.status === 'fulfilled' ? (pRes.value || []) : [];
        const wOk = wRes?.status === 'fulfilled' ? (wRes.value || []) : [];
        events = pOk.length ? pOk : wOk;
        if (!events.length) events = pOk.concat(wOk);
      }

      const latest = new Map();
      for (const e of (events || [])) {
        const d = e.tags?.find(t => t[0] === 'd')?.[1] || e.id;
        const prev = latest.get(d);
        if (!prev || e.created_at > prev.created_at) latest.set(d, e);
      }
      return [...latest.values()].sort((a, b) => a.created_at - b.created_at);
    } catch (err) {
      console.error('fetchEvents failed:', err);
      return [];
    }
  }

  // ---- Robustes Publish eines bereits signierten Events zu mehreren Relays
  async publishToRelays(relays, signedEvent, timeoutMs = 1500) {
    await this.initPool();
  try { console.info('[publishToRelays] relays=', relays, 'kind=', signedEvent?.kind, 'created_at=', signedEvent?.created_at); } catch {}
    let pubs = [];
    try {
      if (this.pool && typeof this.pool.publish === 'function') {
        pubs = this.pool.publish(relays, signedEvent) || [];
      }
    } catch (e) {
      console.warn('[publishToRelays] pool.publish failed:', e);
      pubs = [];
    }

    const makePubPromise = (p, timeout = 1200) => {
      if (!p) return new Promise(res => setTimeout(() => res({ ok: null }), timeout));
      if (typeof p.then === 'function') {
        return Promise.race([
          p.then(() => ({ ok: true })).catch(err => ({ ok: false, err })),
          new Promise(res => setTimeout(() => res({ ok: null }), timeout))
        ]);
      }
      if (typeof p.on === 'function') {
        return new Promise(res => {
          let settled = false;
          const cleanup = () => {
            settled = true; try { p.off && p.off('ok', onOk); } catch {}
            try { p.off && p.off('failed', onFailed); } catch {}
            try { p.off && p.off('seen', onSeen); } catch {}
            try { p.off && p.off('error', onFailed); } catch {}
            clearTimeout(timer);
          };
          const onOk = () => { if (!settled) { cleanup(); res({ ok: true }); } };
          const onFailed = (msg) => { if (!settled) { cleanup(); res({ ok: false, msg }); } };
          const onSeen = () => { if (!settled) { cleanup(); res({ ok: true, seen: true }); } };
          const timer = setTimeout(() => { if (!settled) { cleanup(); res({ ok: null }); } }, timeout);
          try { p.on('ok', onOk); p.on('failed', onFailed); p.on('seen', onSeen); p.on('error', onFailed); } catch (e) { if (!settled) { cleanup(); res({ ok: null }); } }
        });
      }
      return new Promise(res => setTimeout(() => res({ ok: null }), timeout));
    };

    if (Array.isArray(pubs) && pubs.length) {
      const pPromises = pubs.map(p => makePubPromise(p, Math.min(1200, timeoutMs)));
      await Promise.race(pPromises);
      await Promise.allSettled(pPromises);
      return true;
    }

    // Fallback: RAW-WebSocket EVENT senden
    try {
      await new Promise((resolve) => {
        let remaining = (relays || []).length;
        if (!remaining) return resolve(false);
        const payload = JSON.stringify(['EVENT', signedEvent]);
        (relays || []).forEach(url => {
          let done = false; let ws;
          const finish = () => { if (done) return; done = true; remaining--; if (remaining <= 0) resolve(true); };
          const to = setTimeout(() => { finish(); try { ws && ws.close(); } catch {} }, timeoutMs);
          try {
            ws = new WebSocket(url);
            ws.addEventListener('open', () => { try { console.info('[publishToRelays][raw] send EVENT to', url); ws.send(payload); } catch {} setTimeout(finish, 100); });
            ws.addEventListener('error', finish);
            ws.addEventListener('close', finish);
          } catch { finish(); }
        });
      });
      return true;
    } catch (e) {
      console.warn('[publishToRelays] raw publish failed:', e);
      return false;
    }
  }

  // ---- Signatur mit Timeout (sichtbares Logging, um NIP‑46 Hänger zu erkennen)
  async signEventWithTimeout(evt, timeoutMs = 8000) {
    if (!this.signer) await this.login();
    const signer = this.signer;

    // Event vorbereiten: viele Remote-Signer (NIP-46/Bunker) erwarten pubkey & created_at bereits gesetzt
    const prepared = { ...(evt || {}) };
    if (!prepared.kind && evt?.kind == null) {
      throw new Error('signEvent: missing kind');
    }
    if (!Array.isArray(prepared.tags)) prepared.tags = Array.isArray(evt?.tags) ? [...evt.tags] : [];
  if (!prepared.created_at) prepared.created_at = Math.floor(Date.now() / 1000);
  if (typeof prepared.content !== 'string') prepared.content = prepared.content ? String(prepared.content) : '';
    // id/sig niemals mitsenden – das macht der Signer
    if ('id' in prepared) try { delete prepared.id; } catch {}
    if ('sig' in prepared) try { delete prepared.sig; } catch {}

    try {
      const pkLocal = this.pubkey || (typeof signer.getPublicKey === 'function' ? await signer.getPublicKey() : null);
      if (signer?.type === 'nip46') {
        // Für NIP-46: pubkey sowohl im Event als auch temporär speichern
        // Wir probieren später mit und ohne pubkey
        const pk = pkLocal || this.pubkey;
        if (pk) {
          prepared.pubkey = pk;
          prepared._nip46_pubkey = pk;
        }
      } else {
        if (pkLocal && !prepared.pubkey) prepared.pubkey = pkLocal;
        if (prepared.pubkey && this.pubkey && prepared.pubkey !== this.pubkey) {
          console.warn('[signEventWithTimeout] pubkey mismatch: prepared.pubkey != this.pubkey');
        }
      }
    } catch (e) {
      // Wenn getPublicKey fehlschlägt, trotzdem versuchen zu signieren
      console.debug('[signEventWithTimeout] getPublicKey failed (non-fatal):', e && (e.message || e));
    }

  // NIP-46: wir probieren zwei Varianten schnell hintereinander (mit/ohne pubkey)
  const isNip46 = signer?.type === 'nip46';
  // Für kind 24242 (Blossom Auth) und 24133 (File Metadata) SEHR lange warten
  // NIP-46 Bunker kann bis zu 30+ Sekunden brauchen für erste Signatur
  const maxTimeout = (prepared?.kind === 24242 || prepared?.kind === 24133) ? 45000 : 15000;
  const effectiveTimeout = isNip46 ? Math.max(8000, Math.min(timeoutMs, maxTimeout)) : timeoutMs;
  try { console.info('[signEventWithTimeout] start kind=', prepared?.kind, 'timeoutMs=', effectiveTimeout, 'hasPubkey=', !!prepared?.pubkey, 'signerType=', signer?.type); } catch {}

    const attemptSign = async (toMs, evObj) => {
      const exec = () => signer.signEvent(evObj);
      return await Promise.race([
        exec(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('signEvent timeout after ' + toMs + 'ms')), toMs))
      ]);
    };

    try {
      let res;
      try {
        // 1) erster Versuch: bei NIP‑46 MIT pubkey (neue Bunker erwarten oft gesetzten pubkey)
        if (isNip46) {
          const pubkeyToUse = prepared._nip46_pubkey || this.pubkey || prepared.pubkey;
          const { _nip46_pubkey, ...cleanEvent } = prepared;
          const ev1 = { ...cleanEvent, pubkey: pubkeyToUse };
          res = await attemptSign(effectiveTimeout, ev1);
        } else {
          res = await attemptSign(effectiveTimeout, prepared);
        }
      } catch (e) {
        if (signer?.type === 'nip46') console.warn('[signEventWithTimeout] nip46 signEvent threw before timeout:', e && (e.message || e));
        // 2) zweiter Versuch (nur NIP‑46): OHNE pubkey
        if (isNip46) {
          try {
            const { pubkey: _pk, _nip46_pubkey, ...rest } = prepared;
            const ev2 = { ...rest };
            console.debug('[signEventWithTimeout] nip46 retry with event without pubkey');
            res = await attemptSign(effectiveTimeout, ev2);
          } catch (e2) {
            throw e2;
          }
        } else {
          throw e;
        }
      }
      try { console.info('[signEventWithTimeout] done kind=', prepared?.kind); } catch {}
      return res;
    } catch (err) {
      // Zielgerichteter Retry für NIP-46: kurze Pubkey-Abfrage + längeres Timeout
      const msg = err && (err.message || String(err));
      if (signer?.type === 'nip46') {
        try {
          // console.warn('[signEventWithTimeout] first attempt failed on nip46:', msg, '→ retrying…');
          // // Hinweis/Prompt: Nutzer kann jetzt die Bunker-Auth-URL öffnen, um Signing zu erlauben
          // try {
          //   const hint = localStorage.getItem('nip46_last_auth_url');
          //   if (hint && typeof window !== 'undefined') {
          //     // Nur einmal pro Retry höflich fragen
          //     try {
          //       const open = window.confirm('Die Signatur muss ggf. im Bunker bestätigt werden. Jetzt Bunker-Auth öffnen?');
          //       if (open) {
          //         const w = window.open(hint, '_blank', 'noopener,noreferrer');
          //         if (!w) {
          //           navigator.clipboard?.writeText(hint).catch(()=>{});
          //           alert('Popup blockiert. Die Bunker-URL wurde in die Zwischenablage kopiert. Bitte manuell öffnen.');
          //         }
          //       }
          //     } catch {}
          //   }
          // } catch {}
          // // poke signer to keep connection alive
          try {
            const resPk = await Promise.race([
              signer.getPublicKey?.(),
              new Promise((resolve) => setTimeout(() => resolve('__TIMEOUT__'), 1500))
            ]);
            console.debug('[signEventWithTimeout] nip46 getPublicKey after failure →', resPk);
          } catch {}
          // try reconnecting bunker transport if available
          try {
            if (this._bunker && typeof this._bunker.connect === 'function') {
              console.debug('[signEventWithTimeout] trying bunker.connect() before retry…');
              this._bunker.connect().catch(e => console.warn('bunker.connect() during retry failed:', e));
            }
          } catch {}
          // 3) letzter Versuch mit SEHR langem Timeout: erst mit pubkey, dann ohne
          const longTimeout = Math.max(effectiveTimeout * 2, 45000); // Mindestens 45 Sekunden
          const pubkeyToUse = prepared._nip46_pubkey || this.pubkey || prepared.pubkey;
          const { _nip46_pubkey: _npk, ...cleanPrepared } = prepared;
          const ev3a = { ...cleanPrepared, pubkey: pubkeyToUse };
          console.warn('[signEventWithTimeout] Final retry with long timeout:', longTimeout, 'ms. Please approve in Bunker app!');
          try {
            const res2 = await attemptSign(longTimeout, ev3a);
            try { console.info('[signEventWithTimeout] retry done kind=', prepared?.kind, '(with pubkey)'); } catch {}
            return res2;
          } catch (_) {
            const { pubkey: _pk3, ...rest3 } = cleanPrepared; 
            const ev3b = { ...rest3 };
            const res2b = await attemptSign(longTimeout, ev3b);
            try { console.info('[signEventWithTimeout] retry done kind=', prepared?.kind, '(without pubkey)'); } catch {}
            return res2b;
          }
        } catch (err2) {
          console.warn('[signEventWithTimeout] retry failed:', err2 && (err2.message || err2));
          // Hinweis für manuellen Auth-Open, falls verfügbar
          try {
            const hint = localStorage.getItem('nip46_last_auth_url');
            if (hint) console.info('[signEventWithTimeout] You may need to approve signing in bunker. Last auth URL is in localStorage[nip46_last_auth_url].');
          } catch {}
          // Zusatz-Diagnose: probiere eine schnelle kind-1-Signatur, um Policy-Probleme einzugrenzen
          try {
            const probe = await Promise.race([
              this._diagSign(1),
              new Promise(resolve => setTimeout(() => resolve({ ok:false, kind:1, error:'probe timeout'}), 3000))
            ]);
            console.info('[signEventWithTimeout] probe kind=1 →', probe);
            if (probe && probe.ok) {
              const k = prepared?.kind;
              if (k === 30000 || k === 3) {
                console.warn('[signEventWithTimeout] Hinweis: Bunker scheint kind 1 zu erlauben, aber', k, 'nicht. Bitte in der Bunker-UI die Signatur für diese Event-Kinds erlauben (Contacts=3, People List=30000).');
              } else if (k === 24242 || k === 24133) {
                console.warn('[signEventWithTimeout] Hinweis: Bunker scheint kind 1 zu erlauben, aber', k, 'nicht. Bitte in der Bunker-UI die Signatur für diese Event-Kinds erlauben (NIP-98 Auth=24242, NIP-94 File Metadata=24133). Diese Permissions werden für Blossom/NIP-96 Uploads benötigt.');
              } else if (k === 31923) {
                console.warn('[signEventWithTimeout] Hinweis: Bunker scheint kind 1 zu erlauben, aber', k, 'nicht. Bitte in der Bunker-UI die Signatur für kind 31923 (Calendar Events) erlauben.');
              } else {
                console.warn('[signEventWithTimeout] Hinweis: Bunker scheint kind 1 zu erlauben, aber', k, 'nicht. Bitte in der Bunker-UI die Signatur für diese Event-Kinds erlauben.');
              }
            }
          } catch {}
          throw err2;
        }
      }
      throw err;
    }
  }
}

export const client = new NostrClient();

