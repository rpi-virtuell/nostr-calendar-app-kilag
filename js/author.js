import { client } from './nostr.js';
import { Config } from './config.js';

// Bech32 / npub helpers (dupliziert aus nostr.js für Unabhängigkeit)
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
function npubToHex(npub) {
  if (!npub || typeof npub !== 'string') return null;
  if (/^[0-9a-f]{64}$/i.test(npub)) return npub.toLowerCase();
  const dec = __b32Decode(npub);
  if (!dec || (dec.hrp !== 'npub' && dec.hrp !== 'nprofile')) return null;
  const bytes = __fromWords(dec.data);
  if (!bytes || !bytes.length) return null;
  return bytes.map(b => ('0' + b.toString(16)).slice(-2)).join('');
}

/**
 * Holt die Metadaten (Profil-Event kind 0) für einen npub.
 * @param {string} npub - Der npub des Authors.
 * @returns {Promise<object|null>} Die geparsten Metadaten oder null, falls nicht gefunden.
 */
export async function getAuthorMeta(npub) {
  try {
    const hex = npubToHex(npub);
    if (!hex) {
      console.warn('Ungültiger npub:', npub);
      return null;
    }

    await client.initPool();

    // Verwende breitere Relays 
    const relays = [
      'wss://relay.damus.io',
      'wss://relay.snort.social',
      'wss://nostr.wine',
      'wss://nos.lol'
    ];
    const event = await client.pool.get(relays, {
      authors: [hex],
      kinds: [0], // Kind 0 = Metadaten (Profil)
    });

    if (event) {
      return JSON.parse(event.content);
    } else {
      console.warn('Kein Profil-Event für npub gefunden:', npub);
      return null;
    }
  } catch (error) {
    console.error('Fehler beim Holen der Author-Meta:', error);
    return null;
  }
}