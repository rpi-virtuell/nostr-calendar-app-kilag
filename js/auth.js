import { client } from './nostr.js';
import { on } from './utils.js';

export function isLoggedIn() {
  return !!(client && client.signer);
}

export async function login() {
  const res = await client.login();
  return res;
}

export function updateAuthUI(els) {
  els.btnNew.disabled = !isLoggedIn();
  els.btnNew.title = isLoggedIn() ? 'Neuen Termin anlegen' : 'Bitte zuerst einloggen';

  // Falls ein Dropdown-Trigger übergeben wurde, steuere dessen Sichtbarkeit ebenfalls
  if (isLoggedIn()) {
    if (els.btnBunker) els.btnBunker.classList.add('hidden');
    if (els.btnLogout) els.btnLogout.classList.remove('hidden');
    if (els.btnLogin) els.btnLogin.classList.add('hidden');
    if (els.btnManual) els.btnManual.classList.add('hidden');
    if (els.btnNip07) els.btnNip07.classList.add('hidden');
    if (els.btnLoginMenu) els.btnLoginMenu.classList.add('hidden'); // Dropdown ausblenden wenn eingeloggt
  } else {
    if (els.btnBunker) els.btnBunker.classList.remove('hidden');
    if (els.btnLogout) els.btnLogout.classList.add('hidden');
    if (els.btnLogin) els.btnLogin.classList.remove('hidden');
    if (els.btnManual) els.btnManual.classList.remove('hidden');
    if (els.btnNip07) els.btnNip07.classList.remove('hidden');
    if (els.btnLoginMenu) els.btnLoginMenu.classList.remove('hidden'); // Dropdown sichtbar wenn nicht eingeloggt
  }
}

export async function logout(els, whoami) {
  await client.logout();
  localStorage.removeItem('nostr_sk_hex');
  localStorage.removeItem('nip46_connect_uri');
  localStorage.removeItem('nip46_client_sk_hex');
  if (whoami) whoami.textContent = '';
  if (els && els.btnLogin) els.btnLogin.classList.remove('hidden');
  if (els && els.btnLogout) els.btnLogout.classList.add('hidden');
  updateAuthUI(els || {});

  // Robust: falls Aufrufer nicht alle Buttons übergeben, entferne hidden direkt an den DOM-Elementen
  try {
    const ensureVisible = (id) => { try { const el = document.getElementById(id); if (el) el.classList.remove('hidden'); } catch(e){} };
    ensureVisible('btn-login');
    ensureVisible('btn-manual');
    ensureVisible('btn-nip07');
    ensureVisible('btn-login-menu');
  } catch (e) { /* ignore */ }
}

export function setupAuthUI(btnLogin, btnLogout, btnBunker, btnManual, btnNip07, whoami, btnNew, onUpdate) {
  on(btnLogin, 'click', async () => {
    try {
      const res = await login();
      if (whoami) whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (${res.method})`;
      updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker });
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Login fehlgeschlagen:', err);
    }
  });

  on(btnManual, 'click', async () => {
    if (isLoggedIn()) return; // Bereits eingeloggt
    const nsec = prompt('Geben Sie Ihren nsec-Key ein (nsec1... oder Hex):');
    if (!nsec) return;
    try {
      const res = await client.loginWithNsec(nsec);
      if (whoami) whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (manual)`;
      updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker });
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Manueller Login fehlgeschlagen:', err);
      alert('Fehler beim Login: ' + err.message);
    }
  });

  on(btnNip07, 'click', async () => {
    if (isLoggedIn()) return;
    try {
      const res = await login(); // Ruft NIP-07 auf, falls verfügbar
      if (res.method !== 'nip07') {
        alert('NIP-07 Extension (z.B. nos2x-fox) nicht erkannt. Bitte installieren und Seite neu laden.');
        return;
      }
      if (whoami) whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (${res.method})`;
      updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker });
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('NIP-07 Login fehlgeschlagen:', err);
      alert('Fehler beim NIP-07 Login: ' + err.message);
    }
  });

  on(btnLogout, 'click', async () => {
    logout({ btnNew, btnLogin, btnLogout, btnBunker }, whoami);
  });

  // Initial UI-Update
  updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker, btnManual, btnNip07 });
}