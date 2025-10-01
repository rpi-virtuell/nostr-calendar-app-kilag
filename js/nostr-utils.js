// js/nostr-utils.js

// ---- hex helpers (browser-safe)
export function hexToBytes(hex) { const a = []; for (let i = 0; i < hex.length; i += 2) { a.push(parseInt(hex.substr(i, 2), 16)); } return new Uint8Array(a); }
export function bytesToHex(arr) { return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(''); }

// --- bech32 / npub helpers (minimal, ohne externe deps)
const __CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function __b32Polymod(values) { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let chk = 1; for (let p = 0; p < values.length; ++p) { const top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ values[p]; for (let i = 0; i < 5; ++i) if ((top >> i) & 1) chk ^= G[i]; } return chk; }
function __b32HrpExpand(hrp) { const out = []; for (let i = 0; i < hrp.length; ++i) out.push(hrp.charCodeAt(i) >> 5); out.push(0); for (let i = 0; i < hrp.length; ++i) out.push(hrp.charCodeAt(i) & 31); return out; }
function __b32Decode(bech) { try { const lower = bech.toLowerCase(); const pos = lower.lastIndexOf('1'); if (pos < 1 || pos + 7 > lower.length) return null; const hrp = lower.slice(0, pos); const data = []; for (let i = pos + 1; i < lower.length; ++i) { const c = lower.charAt(i); const v = __CHARSET.indexOf(c); if (v === -1) return null; data.push(v); } if (__b32Polymod(__b32HrpExpand(hrp).concat(data)) !== 1) return null; return { hrp, data: data.slice(0, data.length - 6) }; } catch (e) { return null; } }
function __fromWords(words) { let acc = 0, bits = 0; const out = []; for (let i = 0; i < words.length; ++i) { acc = (acc << 5) | words[i]; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } } return out; }
export function npubToHex(npub) { if (!npub || typeof npub !== 'string') return null; if (/^[0-9a-f]{64}$/i.test(npub)) return npub.toLowerCase(); const dec = __b32Decode(npub); if (!dec || (dec.hrp !== 'npub' && dec.hrp !== 'nprofile')) return null; const bytes = __fromWords(dec.data); if (!bytes || !bytes.length) return null; return bytes.map(b => ('0' + b.toString(16)).slice(-2)).join(''); }
export function hexToNpub(hex) { if (!hex || typeof hex !== 'string') return null; if (/^[0-9a-f]{64}$/i.test(hex)) hex = hex.toLowerCase(); const bytes = hexToBytes(hex); if (!bytes || !bytes.length) return null; const words = []; for (let i = 0; i < bytes.length; ++i) { words.push((bytes[i] >> 5) & 0x1f); words.push(bytes[i] & 0x1f); } const hrp = 'npub'; const chk = __b32Polymod(words); const ret = hrp + '1' + words.map(w => __CHARSET.charAt(w)).join('') + Array(6).fill(0).map((_, i) => __CHARSET.charAt((chk >> (5 * (5 - i))) & 31)).join(''); return ret; }
window.hexToNpub = hexToNpub; // global export

export function nsecToHex(nsec) {
  if (!nsec || typeof nsec !== 'string') return null;
  if (/^[0-9a-f]{64}$/i.test(nsec)) return nsec.toLowerCase(); // fallback für hex
  const dec = __b32Decode(nsec);
  if (!dec || dec.hrp !== 'nsec') return null;
  const bytes = __fromWords(dec.data);
  if (!bytes || bytes.length !== 32) return null; // Secret Key muss 32 Bytes sein
  return bytesToHex(bytes);
}

// ---- „Fastest relay“ ermitteln (kurzer open-Race, 1200ms cap)
export async function pickFastestRelay(relays, { capMs = 1200, fastRelay, fastProbeAt, fastProbeTTL }) {
  const now = Date.now();
  if (fastRelay && (now - fastProbeAt) < fastProbeTTL) return fastRelay || relays[0];

  const candidates = (relays || []).slice(0, 4); // nicht zu viele
  if (!candidates.length) return 'wss://relay.damus.io';

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
  return winner || candidates[0];
}

// ---- Diagnostics: probe signing capabilities for current signer
export async function diagSign(kind, signEventWithTimeout) {
  const evt = { kind, content: kind === 1 ? 'diag' : '', tags: [], created_at: Math.floor(Date.now() / 1000) };
  const t0 = Date.now();
  try {
    const signed = await signEventWithTimeout(evt, 7000);
    console.info('[diagSign] kind', kind, 'ok in', Date.now() - t0, 'ms');
    return { ok: true, kind, ms: Date.now() - t0, id: signed && signed.id };
  } catch (e) {
    console.warn('[diagSign] kind', kind, 'failed:', e && (e.message || e));
    return { ok: false, kind, error: (e && (e.message || String(e))) };
  }
}

// ---- Bunker-spezifische Utility-Funktionen ----

// NIP-46 Modul laden mit CDN-Fallback
export async function loadNip46Module() {
  const cdnAlternatives = {
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
            console.warn('[loadNip46Module] imported module missing expected shape for', url);
            lastErr = new Error('module missing expected exports');
            continue;
          }
        }
        console.info('[loadNip46Module] loaded module from', url);
        return mod;
      } catch (e) {
        lastErr = e;
        console.debug('[loadNip46Module] import failed for', url, e && (e.message || e));
      }
    }
    throw lastErr || new Error('dynamic import failed for all candidates');
  }

  try {
    const nip46Mod = await tryImport(cdnAlternatives.nip46, (mod) => {
      if (!mod || !mod.BunkerSigner) return false;
      const bs = mod.BunkerSigner;
      return typeof bs.fromBunker === 'function' || bs.length >= 2;
    });
    console.debug('[loadNip46Module] nip46 module loaded successfully');
    return nip46Mod;
  } catch (e) {
    console.error('[loadNip46Module] nip46 module not available (all candidates failed):', e);
    console.error('[loadNip46Module] Available nip46 alternatives:', cdnAlternatives.nip46);
    return null;
  }
}

// Preflight: schnellen Relay aus Pointer finden
export async function preflightRelay(relays = [], capMs = 1500) {
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

// BunkerSigner mit Debug-Wrappern erstellen
export function createBunkerSigner(skBytes, pointer, options, BunkerSigner, pool) {
  try {
    let signer;
    if (BunkerSigner && typeof BunkerSigner.fromBunker === 'function') {
      options.pool = pool;
      signer = BunkerSigner.fromBunker(skBytes, pointer, options);
    } else {
      signer = new BunkerSigner(skBytes, pointer, options);
    }
    
    // Debug-Wrapper für getPublicKey
    if (signer && typeof signer.getPublicKey === 'function' && !signer._wrappedGetPk) {
      const __getPk = signer.getPublicKey.bind(signer);
      signer.getPublicKey = async (...a) => {
        const t0 = Date.now();
        console.debug('[Bunker] getPublicKey() called');
        try {
          const r = await __getPk(...a);
          console.debug('[Bunker] getPublicKey() ok in', Date.now()-t0, 'ms');
          return r;
        }
        catch (e) {
          console.warn('[Bunker] getPublicKey() error', e && (e.message||e));
          throw e;
        }
      };
      signer._wrappedGetPk = true;
    }
    
    // Debug-Wrapper für signEvent
    if (signer && typeof signer.signEvent === 'function' && !signer._wrappedSign) {
      const __sign = signer.signEvent.bind(signer);
      signer.signEvent = async (ev) => {
        const t0 = Date.now();
        try {
          console.debug('[Bunker] signEvent() called kind=', ev && ev.kind);
        } catch {}
        try {
          const r = await __sign(ev);
          console.debug('[Bunker] signEvent() ok in', Date.now()-t0, 'ms');
          return r;
        }
        catch (e) {
          console.warn('[Bunker] signEvent() error', e && (e.message||e));
          throw e;
        }
      };
      signer._wrappedSign = true;
    }
    
    return signer;
  } catch (e) {
    console.error('[createBunkerSigner] Failed to create BunkerSigner:', e);
    throw new Error('Failed to create BunkerSigner: ' + (e.message || String(e)));
  }
}

// Bunker Pool publish mit Debug-Wrapper
export function wrapBunkerPoolPublish(signer) {
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
}

// Bunker sendRequest mit Debug-Wrapper
export function wrapBunkerSendRequest(signer) {
  if (signer && typeof signer.sendRequest === 'function') {
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
  }
}