import { client } from './nostr.js';
import { getAuthorMeta } from './author.js';
import { loadNip46Module, preflightRelay, createBunkerSigner, wrapBunkerPoolPublish, wrapBunkerSendRequest } from './nostr-utils.js';
import { hexToBytes, bytesToHex } from './nostr-utils.js';

function ensureBunkerModal() {
  if (document.getElementById('bunker-modal')) return;

  const dlg = document.createElement('dialog');
  dlg.id = 'bunker-modal';
  dlg.className = 'modal';
  dlg.innerHTML = `
    <form method="dialog" style="padding:16px; min-width: min(560px, 96vw)">
      <header class="modal-header">
        <h2 style="margin:0">Bunker verbinden</h2>
        <button class="btn btn-ghost" value="cancel" title="Schließen">✕</button>
      </header>
      <div class="p-16" style="display:grid; gap:10px">
        <label for="bunker-uri">NIP-46 Connect-URI (bunker://… oder nostrconnect://…)</label>
        <input id="bunker-uri" autocomplete="off" type="text" placeholder="bunker://… / nostrconnect://…" style="padding:10px;border:1px solid var(--border);border-radius:10px" />
        <div style="display:flex; gap:8px">
          <button id="bunker-paste" type="button" class="btn">Aus Zwischenablage einfügen</button>
          <span class="muted" id="bunker-hint"></span>
        </div>
      </div>
      <footer class="modal-footer">
        <div></div>
        <div>
          <button class="btn" value="cancel">Abbrechen</button>
          <button class="btn btn-primary" id="bunker-ok" value="default">Verbinden</button>
        </div>
      </footer>
    </form>
  `;
  document.body.appendChild(dlg);

  // Paste-Button
  dlg.querySelector('#bunker-paste').addEventListener('click', async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { dlg.querySelector('#bunker-uri').value = t.trim(); }
    } catch (e) {
      dlg.querySelector('#bunker-hint').textContent = 'Zwischenablage nicht verfügbar.';
    }
  });
}

function getBunkerURIInteractive({ preset = '' } = {}) {
  ensureBunkerModal();
  const dlg = document.getElementById('bunker-modal');
  const input = dlg.querySelector('#bunker-uri');
  const hint = dlg.querySelector('#bunker-hint');
  input.value = preset || '';

  return new Promise((resolve) => {
    const onClose = (ev) => {
      dlg.removeEventListener('close', onClose);
      const v = (dlg.returnValue === 'default') ? input.value.trim() : '';
      resolve(v || '');
    };
    dlg.addEventListener('close', onClose);
    hint.textContent = preset ? 'Gespeicherte URI vorausgefüllt.' : '';
    dlg.showModal();
  });
}

export async function connectBunker(uri, ev) {
  const stored = localStorage.getItem('nip46_connect_uri') || '';

  let uriToUse = stored;
  if (!stored || ev.altKey) {
    uriToUse = await getBunkerURIInteractive({ preset: stored });
    if (!uriToUse) {
      if (!stored) alert('Abgebrochen — es ist noch keine Connect-URI gespeichert.');
      return;
    }
    localStorage.setItem('nip46_connect_uri', uriToUse);
  }

  // UI-Feedback während des Verbindens
  const btnBunker = ev.target;
  // Verhindere parallele Verbindungsversuche (Button + Auto-Reconnect)
  if (client && client._nip46Connecting) {
    console.warn('[Bunker] connect skipped — another connect is in progress');
    return;
  }
  btnBunker.disabled = true;
  const oldTxt = btnBunker.textContent;
  btnBunker.textContent = 'Verbinde…';

  // Safety-Recover nach 50s
  let safety = setTimeout(() => {
    btnBunker.disabled = false;
    btnBunker.textContent = oldTxt;
  }, 50000);

  // Additional debug: mark start
  console.debug('[Bunker] connectBunker start - uriToUse=', uriToUse);

  // Extra diagnostics: listen for lifecycle events from nostr client and
  // surface them to the console so we can see if connect() started but
  // never resolved/triggered getPublicKey.
  try {
    const onStarted = (e) => {
      console.debug('[Bunker] event nip46-connect-started received:', e?.detail || {});
    };
    const onConnected = (e) => {
      console.debug('[Bunker] event nip46-connected received:', e?.detail || {});
    };
    const onError = (e) => {
      console.error('[Bunker] event nip46-connect-error received:', e?.detail || {});
    };
    window.addEventListener('nip46-connect-started', onStarted);
    window.addEventListener('nip46-connected', onConnected);
    window.addEventListener('nip46-connect-error', onError);

    // Remove listeners once connectBunker finishes (cleanup in finally block also exists)
    // We'll store them on the button element so finally can remove if needed.
    try { btnBunker._bunkerDiagListeners = { onStarted, onConnected, onError }; } catch(e){}
  } catch(e) {}

  try {
    const res = await client.connectBunker(uriToUse, { openAuth: true });
    console.debug('[Bunker] connectBunker success - res=', res);
    return res;
  } catch (err) {
    // Detailed error logging for debugging
    try { console.error('[Bunker] connect error:', err && (err.stack || err)); } catch(e) {}
    // Dispatch a global event so UI or tests can react
    try { window.dispatchEvent(new CustomEvent('nip46-connect-error', { detail: { error: String(err) } })); } catch(e){}
    // Visible UI feedback: temporary error state
    try {
      btnBunker.textContent = 'Fehler';
      setTimeout(() => { if (btnBunker) btnBunker.textContent = oldTxt; }, 3500);
    } catch (e) {}
    alert('Bunker-Verbindung fehlgeschlagen. Details siehe Konsole.');
    return null;
  } finally {
    clearTimeout(safety);
    btnBunker.disabled = false;
    // Ensure button text is restored if not already
    try { if (btnBunker.textContent !== oldTxt) btnBunker.textContent = oldTxt; } catch(e){}
    console.debug('[Bunker] connectBunker end');
  }
}

export function setupBunkerUI(btnBunker, onConnected) {
  btnBunker.addEventListener('click', async (ev) => {
    const res = await connectBunker(ev.target, ev);
    if (res && res.pubkey) {
      // UI-Update via onConnected-Callback
      onConnected(res);
    }
  });
}

export async function autoReconnectBunker(whoami, onUpdate) {
  const uri = localStorage.getItem('nip46_connect_uri');
  // Skip, wenn kein URI, bereits ein Signer aktiv ist, oder ein Connect läuft
  if (!uri || (client && client.signer) || (client && client._nip46Connecting)) {
    if (onUpdate) onUpdate();
    return;
  }
  try {
    const res = await client.connectBunker(uri, { openAuth: true });
    let meta = null;
    try {
      meta = await getAuthorMeta(res.pubkey);
    } catch (e) {
      console.warn('getAuthorMeta in autoReconnectBunker failed:', e);
    }
    if (meta && meta.name && whoami) {
      whoami.innerHTML = `<span title="pubkey: ${res.pubkey.slice(0,8)}…(nip46)">${meta.name}</span>`;
    } else
    if (whoami) whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (nip46)`;
  } catch (e) {
    console.warn('autoReconnectBunker:', e);
  } finally {
    if (onUpdate) onUpdate();
  }
}

// Global Event-Listener für NIP-46-Events
export async function setupBunkerEvents(whoami, onUpdate) {
  window.addEventListener('nip46-connected', (e) => {
    const pk = e.detail?.pubkey || '';
    //korrigiere await geht nicht in event listener
    (async () => {
      try {
        if (!pk) return;
        const res = { pubkey: pk };
        let meta = null;
        try {
          meta = await getAuthorMeta(res.pubkey);
        } catch (e) {
          console.warn('getAuthorMeta in nip46-connected listener failed:', e);
        }
        if (meta && meta.name && whoami) {
          whoami.innerHTML = `<span title="pubkey: ${pk.slice(0,8)}… (nip46)">${meta.name}</span>`;
        } else if (meta && whoami) {
          whoami.innerHTML = `<span title="pubkey: ${pk.slice(0,8)}… (nip46)">@${meta.name}</span>`;
        } else if (pk && whoami) {
          whoami.innerHTML = `<span title="pubkey: ${pk.slice(0,8)}… (nip46)">pubkey: ${pk.slice(0,8)}…</span>  (nip46)`;
        }
        if (onUpdate) onUpdate();
      } catch (err) {
        console.error('nip46-connected listener error:', err);
      }
    })();
  });

  

  window.addEventListener('nip46-auth-url', (e) => {
    const url = e.detail?.url;
    if (!url) return;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      // Popup blocked — copy the URL to clipboard and warn in console (non-blocking).
      navigator.clipboard?.writeText(url).catch(() => {});
      console.warn('Popup blocked; authorization URL copied to clipboard:', url);
    }
  });
}

// wordpress bunker deeplink handling

export async function initNip46FromUrl(whoami, onUpdate) {
  try {
    const p = new URLSearchParams(location.search);
    const uri = p.get('nip46') || p.get('connect');
    const npub = p.get('npub') || p.get('nprofile') || p.get('nip05');

    if (uri) {
      try { localStorage.setItem('nip46_connect_uri', uri); } catch {}
      // URL aufräumen, damit Refresh nicht erneut auslöst
      try { history.replaceState({}, '', location.pathname); } catch {}
      // Sofort verbinden (euer connectBunker wirft Events & aktualisiert signer)
      try {
        const res = await client.connectBunker(uri, { openAuth: true });
        window.dispatchEvent(new CustomEvent('nip46-connected', { detail: { pubkey: res?.pubkey || '' } }));
      } catch (e) {
        console.warn('[NIP-46 deeplink] connect failed:', e);
      }
    }

    if (npub && whoami) {
      // Einfaches WhoAmI-Vorfüllen (echte Metadaten nachladen)
      (async () => {
        const meta = await getAuthorMeta(npub).catch(() => null);
        if (meta?.name) {
          whoami.innerHTML = `<span title="pubkey: ${npub.slice(0,8)}… (deeplink)">${meta.name}</span>`;
        } else {
          whoami.textContent = `pubkey: ${npub.slice(0,8)}…`;
        }
        if (onUpdate) onUpdate();
      })();
    } else if (onUpdate) onUpdate();
  } catch (e) {
    console.warn('[NIP-46 deeplink] init error:', e);
    if (onUpdate) onUpdate();
  }
}

// ---- BunkerManager Klasse für Bunker-spezifische Logik ----
export class BunkerManager {
  constructor(nostrClient) {
    this.client = nostrClient;
    
    // Bunker-spezifische Properties aus NostrClient übernehmen
    this._nip46Connecting = false; // Guard: vermeidet parallele Bunker-Connects
    this._signQueue = Promise.resolve(); // Serialize remote sign ops (NIP-46)
    this._signQueueSize = 0;
    this._bunker = null; // Handle für Reconnect während Signierung
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

  // ---- NIP-46 (Bunker) – mit onauth-Callback und optional silent-Mode
  async connectBunker(connectURI, { openAuth = true } = {}) {
    // Verhindere parallele Verbindungsversuche (Button + Auto-Reconnect)
    if (this._nip46Connecting) {
      console.warn('[Bunker] connectBunker skipped — another connect is in progress');
      throw new Error('NIP-46 connect already in progress');
    }
    this._nip46Connecting = true;
    await this.client.initPool();

    try {
      // Check if nip46 module is available
      const nip46Mod = await loadNip46Module();
      if (!nip46Mod) {
        throw new Error('NIP-46 module not available. Please check your internet connection and try again.');
      }

      const { BunkerSigner, parseBunkerInput, toBunkerURL } = nip46Mod;
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
        const { tools } = await this.client._loadTools();
        const skBytesInit = tools.generateSecretKey(); // Uint8Array
        skHex = Array.from(skBytesInit).map(b => b.toString(16).padStart(2,'0')).join('');
        localStorage.setItem('nip46_client_sk_hex', skHex);
      }
      const skBytes = new Uint8Array(skHex.match(/.{1,2}/g).map(h => parseInt(h,16)));

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
                    }
                  } catch (e) {
                    navigator.clipboard?.writeText(url).catch(()=>{});
                    console.warn('[Bunker] Failed to open auth URL:', e);
                  }
                } else {
                  try { localStorage.setItem('nip46_last_auth_url', url); } catch {}
                  window.dispatchEvent(new CustomEvent('nip46-auth-url', { detail: { url } }));
                }
              },
              onnotice: (msg) => console.log('[NIP-46 notice]', msg),
              onerror:  (err) => console.warn('[NIP-46 error]', err)
            };

            const signer = createBunkerSigner(skBytes, pointerForSigner, signerOptions, BunkerSigner, this.client.pool);
            
            // Pool publish wrapper
            wrapBunkerPoolPublish(signer);
            
            // sendRequest wrapper
            wrapBunkerSendRequest(signer);
            
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

      this.client.signer = {
        type: 'nip46',
        getPublicKey: async () => await bunker.getPublicKey(),
        signEvent:    async (evt) => await bunker.signEvent(evt),
        close:        async () => { try { await bunker.close?.(); } catch {} }
      };
      this.client.pubkey = pk;

      // Persistenz + UI-Event
      try {
        localStorage.setItem('nip46_connected', '1');
        localStorage.setItem('nip46_connected_pubkey', this.client.pubkey);
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('nip46-connected', { detail: { pubkey: this.client.pubkey } }));
      } catch {}

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
        window.nip46.testSign = async (kind = 1) => this.client._diagSign(kind);
        window.nip46.testSignKinds = async (...kinds) => {
          const list = kinds.length ? kinds : [1, 3, 30000];
          const out = [];
          for (const k of list) out.push(await this.client._diagSign(k));
          return out;
        };
      } catch {}

      return { method: 'nip46', pubkey: this.client.pubkey, relay: (chosenRelay || pointer?.relays?.[0] || null) };
    } finally {
      this._nip46Connecting = false;
    }
  }

  // ---- NIP-46 spezifische signEventWithTimeout Logik
  async signEventWithTimeoutBunker(evt, timeoutMs = 8000) {
    const signer = this.client.signer;
    if (!signer || signer.type !== 'nip46') {
      throw new Error('Bunker signEventWithTimeout called with non-NIP-46 signer');
    }

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
      const pkLocal = this.client.pubkey || (typeof signer.getPublicKey === 'function' ? await signer.getPublicKey() : null);
      // Für NIP-46: pubkey sowohl im Event als auch temporär speichern
      const pk = pkLocal || this.client.pubkey;
      if (pk) {
        prepared.pubkey = pk;
        prepared._nip46_pubkey = pk;
      }
    } catch (e) {
      console.debug('[signEventWithTimeoutBunker] getPublicKey failed (non-fatal):', e && (e.message || e));
    }

    // NIP-46: wir probieren zwei Varianten schnell hintereinander (mit/ohne pubkey)
    const maxTimeout = (prepared?.kind === 24242 || prepared?.kind === 24133) ? 45000 : 15000;
    const effectiveTimeout = Math.max(8000, Math.min(timeoutMs, maxTimeout));
    try { console.info('[signEventWithTimeoutBunker] start kind=', prepared?.kind, 'timeoutMs=', effectiveTimeout, 'hasPubkey=', !!prepared?.pubkey); } catch {}

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
        // 1) erster Versuch: MIT pubkey (neue Bunker erwarten oft gesetzten pubkey)
        const pubkeyToUse = prepared._nip46_pubkey || this.client.pubkey || prepared.pubkey;
        const { _nip46_pubkey, ...cleanEvent } = prepared;
        const ev1 = { ...cleanEvent, pubkey: pubkeyToUse };
        res = await attemptSign(effectiveTimeout, ev1);
      } catch (e) {
        console.warn('[signEventWithTimeoutBunker] nip46 signEvent threw before timeout:', e && (e.message || e));
        // 2) zweiter Versuch: OHNE pubkey
        try {
          const { pubkey: _pk, _nip46_pubkey, ...rest } = prepared;
          const ev2 = { ...rest };
          console.debug('[signEventWithTimeoutBunker] nip46 retry with event without pubkey');
          res = await attemptSign(effectiveTimeout, ev2);
        } catch (e2) {
          throw e2;
        }
      }
      try { console.info('[signEventWithTimeoutBunker] done kind=', prepared?.kind); } catch {}
      return res;
    } catch (err) {
      // Zielgerichteter Retry für NIP-46: kurze Pubkey-Abfrage + längeres Timeout
      const msg = err && (err.message || String(err));
      try {
        // poke signer to keep connection alive
        try {
          const resPk = await Promise.race([
            signer.getPublicKey?.(),
            new Promise((resolve) => setTimeout(() => resolve('__TIMEOUT__'), 1500))
          ]);
          console.debug('[signEventWithTimeoutBunker] nip46 getPublicKey after failure →', resPk);
        } catch {}
        // try reconnecting bunker transport if available
        try {
          if (this._bunker && typeof this._bunker.connect === 'function') {
            console.debug('[signEventWithTimeoutBunker] trying bunker.connect() before retry…');
            this._bunker.connect().catch(e => console.warn('bunker.connect() during retry failed:', e));
          }
        } catch {}
        // 3) letzter Versuch mit SEHR langem Timeout: erst mit pubkey, dann ohne
        const longTimeout = Math.max(effectiveTimeout * 2, 45000); // Mindestens 45 Sekunden
        const pubkeyToUse = prepared._nip46_pubkey || this.client.pubkey || prepared.pubkey;
        const { _nip46_pubkey: _npk, ...cleanPrepared } = prepared;
        const ev3a = { ...cleanPrepared, pubkey: pubkeyToUse };
        console.warn('[signEventWithTimeoutBunker] Final retry with long timeout:', longTimeout, 'ms. Please approve in Bunker app!');
        try {
          const res2 = await attemptSign(longTimeout, ev3a);
          try { console.info('[signEventWithTimeoutBunker] retry done kind=', prepared?.kind, '(with pubkey)'); } catch {}
          return res2;
        } catch (_) {
          const { pubkey: _pk3, ...rest3 } = cleanPrepared;
          const ev3b = { ...rest3 };
          const res2b = await attemptSign(longTimeout, ev3b);
          try { console.info('[signEventWithTimeoutBunker] retry done kind=', prepared?.kind, '(without pubkey)'); } catch {}
          return res2b;
        }
      } catch (err2) {
        console.warn('[signEventWithTimeoutBunker] retry failed:', err2 && (err2.message || err2));
        // Hinweis für manuellen Auth-Open, falls verfügbar
        try {
          const hint = localStorage.getItem('nip46_last_auth_url');
          if (hint) console.info('[signEventWithTimeoutBunker] You may need to approve signing in bunker. Last auth URL is in localStorage[nip46_last_auth_url].');
        } catch {}
        throw err2;
      }
    }
  }
}
