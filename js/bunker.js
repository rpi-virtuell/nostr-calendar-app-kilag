import { client } from './nostr.js';

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
        <input id="bunker-uri" placeholder="bunker://… / nostrconnect://…" style="padding:10px;border:1px solid var(--border);border-radius:10px" />
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
  btnBunker.disabled = true;
  const oldTxt = btnBunker.textContent;
  btnBunker.textContent = 'Verbinde…';

  // Safety-Recover nach 13s
  let safety = setTimeout(() => {
    btnBunker.disabled = false;
    btnBunker.textContent = oldTxt;
  }, 13000);

  try {
    const res = await client.connectBunker(uriToUse, { openAuth: false });
    return res;
  } catch (err) {
    console.error('[Bunker] connect error:', err);
    alert('Bunker-Verbindung fehlgeschlagen.');
    return null;
  } finally {
    clearTimeout(safety);
    btnBunker.disabled = false;
    btnBunker.textContent = oldTxt;
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
  if (!uri || (client && client.signer)) {
    if (onUpdate) onUpdate();
    return;
  }
  try {
    const res = await client.connectBunker(uri, { openAuth: true });
    if (whoami) whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (nip46)`;
  } catch (e) {
    console.warn('autoReconnectBunker:', e);
  } finally {
    if (onUpdate) onUpdate();
  }
}

// Global Event-Listener für NIP-46-Events
export function setupBunkerEvents(whoami, onUpdate) {
  window.addEventListener('nip46-connected', (e) => {
    const pk = e.detail?.pubkey || '';
    if (pk && whoami) whoami.textContent = `pubkey: ${pk.slice(0,8)}… (nip46)`;
    if (onUpdate) onUpdate();
  });

  window.addEventListener('nip46-auth-url', (e) => {
    const url = e.detail?.url;
    if (!url) return;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) {
      navigator.clipboard?.writeText(url).catch(() => {});
      alert('Bitte Autorisierungs-URL manuell öffnen (Link in Zwischenablage):\n' + url);
    }
  });
}