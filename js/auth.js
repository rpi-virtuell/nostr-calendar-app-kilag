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

  if (isLoggedIn()) {
    if (els.btnBunker) els.btnBunker.classList.add('hidden');
    if (els.btnLogout) els.btnLogout.classList.remove('hidden');
    if (els.btnLogin) els.btnLogin.classList.add('hidden');
  } else {
    if (els.btnBunker) els.btnBunker.classList.remove('hidden');
    if (els.btnLogout) els.btnLogout.classList.add('hidden');
    if (els.btnLogin) els.btnLogin.classList.remove('hidden');
  }
}

export async function logout(els, whoami) {
  await client.logout();
  if (whoami) whoami.textContent = '';
  if (els.btnLogin) els.btnLogin.classList.remove('hidden');
  if (els.btnLogout) els.btnLogout.classList.add('hidden');
  updateAuthUI(els);
}

export function setupAuthUI(btnLogin, btnLogout, btnBunker, whoami, btnNew, onUpdate) {
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

  on(btnLogout, 'click', async () => {
    logout({ btnNew, btnLogin, btnLogout, btnBunker }, whoami);
  });

  // Initial UI-Update
  updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker });
}