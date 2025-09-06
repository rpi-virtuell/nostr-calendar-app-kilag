// Nostr helpers: auth, fetch, publish (NIP-52: kind 31923)
import { Config } from './config.js';
import { uid, b64 } from './utils.js';

// Load nostr-tools via ESM CDN on demand
// pure: finalizeEvent, generateSecretKey, getPublicKey
// pool: SimplePool
const pureUrl = 'https://esm.sh/nostr-tools/pure';
const poolUrl = 'https://esm.sh/nostr-tools/pool';
const nip46Url = 'https://esm.sh/nostr-tools/nip46';

let tools = null;
let poolMod = null;
let nip46Mod = null;

async function loadTools(){
  if(!tools){ tools = await import(pureUrl); }
  if(!poolMod){ poolMod = await import(poolUrl); }
  if(!nip46Mod){ try{ nip46Mod = await import(nip46Url); }catch(e){ console.warn('NIP-46 module not available', e);} }
  return { tools, poolMod, nip46Mod };
}

export class NostrClient{
  constructor(){
    this.pool = null;
    this.signer = null; // { type: 'nip07' | 'local' | 'nip46', getPublicKey, signEvent }
    this.pubkey = null;
  }

  async connectBunker(connectURI){
    await this.initPool();
    await loadTools();
    if(!nip46Mod){ throw new Error('nip46 module not available'); }
    // We create a local client key (demo) to talk to the bunker
    let sk = localStorage.getItem('nip46_client_sk');
    if(!sk){
      const s = tools.generateSecretKey();
      sk = tools.bytesToHex ? tools.bytesToHex(s) : Buffer.from(s).toString('hex');
      localStorage.setItem('nip46_client_sk', sk);
    }
    const skBytes = tools.hexToBytes ? tools.hexToBytes(sk) : Uint8Array.from(Buffer.from(sk,'hex'));
    const clientPub = tools.getPublicKey(skBytes);

    // nip46 helper (best-effort): create remote signer from connect URI
    const signer = await nip46Mod?.NostrConnectSigner?.init?.({ secretKey: skBytes, target: connectURI, relay: (Config.relays[0]||'wss://relay.damus.io') }).catch(()=>null)
                  || await nip46Mod?.createNostrConnectSigner?.({ secretKey: skBytes, target: connectURI }).catch(()=>null);

    if(!signer) throw new Error('Failed to init NIP-46 signer (API mismatch).');

    this.signer = {
      type: 'nip46',
      getPublicKey: async ()=> await signer.getPublicKey(),
      signEvent: async (evt)=> await signer.signEvent(evt),
    };
    this.pubkey = await this.signer.getPublicKey();
    return { method:'nip46', pubkey: this.pubkey, clientPub };
  }

  async initPool(){
    if(!this.pool){
      await loadTools();
      this.pool = new poolMod.SimplePool();
    }
  }

  async login(){
    await this.initPool();
    // Prefer NIP-07 (NOS2X etc.)
    if(window.nostr && window.nostr.getPublicKey){
      this.pubkey = await window.nostr.getPublicKey();
      this.signer = {
        type: 'nip07',
        getPublicKey: async ()=> this.pubkey,
        signEvent: async (evt)=> window.nostr.signEvent(evt)
      };
      return { method:'nip07', pubkey: this.pubkey };
    }
    // Fallback: local keypair in localStorage
    await loadTools();
    let sk = localStorage.getItem('nostr_sk_hex');
    if(!sk){
      const s = tools.generateSecretKey();
      sk = tools.bytesToHex ? tools.bytesToHex(s) : Buffer.from(s).toString('hex');
      localStorage.setItem('nostr_sk_hex', sk);
    }
    const skBytes = tools.hexToBytes ? tools.hexToBytes(sk) : Uint8Array.from(Buffer.from(sk,'hex'));
    this.pubkey = tools.getPublicKey(skBytes);
    this.signer = {
      type:'local',
      getPublicKey: async ()=> this.pubkey,
      signEvent: async (evt)=> tools.finalizeEvent(evt, skBytes)
    };
    return { method:'local', pubkey: this.pubkey };
  }

  async logout(){
    this.signer = null;
    this.pubkey = null;
  }

  async fetchEvents({sinceDays=365, authors=Config.allowedAuthors}){
    await this.initPool();
    const since = Math.floor(Date.now()/1000) - (sinceDays*86400);
    const filter = { kinds:[31923], since };
    if(authors && authors.length) filter.authors = authors;
    const relays = Config.relays;
    const events = await this.pool.list(relays, [filter]);
    // reduce by 'd' tag (latest wins)
    const latest = new Map();
    for(const e of events){
      const d = e.tags.find(t=>t[0]==='d')?.[1] || e.id;
      const prev = latest.get(d);
      if(!prev || e.created_at > prev.created_at) latest.set(d, e);
    }
    return [...latest.values()].sort((a,b)=> a.created_at - b.created_at);
  }

  toEventTemplate(data){
    // data: {title, starts, ends, status, summary, location, image, tags[], content, d?}
    const tags = [
      ['title', data.title],
      ['starts', String(data.starts)],
      ['ends', String(data.ends)],
      ['status', data.status||'planned'],
    ];
    if(data.summary) tags.push(['summary', data.summary]);
    if(data.location) tags.push(['location', data.location]);
    if(data.image) tags.push(['image', data.image]);
    for(const t of (data.tags||[])){
      const v = String(t).trim();
      if(v) tags.push(['t', v]);
    }
    // parameterized replaceable id
    const d = data.d || b64(data.url || data.title + '|' + data.starts);
    tags.push(['d', d]);

    // include app/client tag for provenance
    if(Array.isArray(Config.appTag)) tags.push(Config.appTag);

    const evt = {
      kind: 31923,
      created_at: Math.floor(Date.now()/1000),
      tags,
      content: data.content || ''
    };
    return { evt, d };
  }

  async publish(data){
    await this.login(); // ensure signer
    await this.initPool();
    await loadTools();

    // Build event + sign
    const { evt, d } = this.toEventTemplate(data);

    // If signer === local, finalizeEvent returns signed event already
    let signed;
    if(this.signer.type==='nip07'){
      signed = await this.signer.signEvent(evt);
    } else {
      signed = await this.signer.signEvent(evt); // finalizeEvent(evt, sk)
    }

    // Publish
    const pubs = this.pool.publish(Config.relays, signed);
    // Wait for at least one ack
    await Promise.race(pubs.map(p=>p.onseen || new Promise(res=>setTimeout(res,800))));

    return { signed, d };
  }
}

export const client = new NostrClient();
