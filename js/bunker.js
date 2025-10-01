import { client } from './nostr.js';
import { getAuthorMeta } from './author.js';

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
