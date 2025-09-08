import { client } from './nostr.js';
import { on } from './utils.js';

/*
  Secure storage helpers (WebCrypto):
  - Wir verschlüsseln den nsec-Key mit einem passwortbasierten Schlüssel (PBKDF2 -> AES-GCM).
  - Gespeichert wird ein JSON: { v: base64(ciphertext), iv: base64(iv), salt: base64(salt) }
  - Speicherung erfolgt sowohl als Cookie (für UX) als auch als localStorage-Fallback.
  - Beim Lesen wird zuerst Cookie geprüft, dann localStorage.
*/

function setCookie(name, value, days) {
  // setCookie setzt NUR das Cookie. Schreibt nicht in localStorage,
  // um versehentliche Speicherung unverschlüsselter Werte zu vermeiden.
  try {
    const enc = encodeURIComponent(value);
    let s = name + '=' + enc + '; path=/; SameSite=Lax';
    if (days && Number(days) > 0) {
      const d = new Date();
      d.setTime(d.getTime() + (Number(days) * 24 * 60 * 60 * 1000));
      s += '; expires=' + d.toUTCString();
    }
    if (location.protocol === 'https:') s += '; Secure';
    document.cookie = s;
  } catch (e) { /* ignore cookie failures */ }
}

// setPersistentEncrypted speichert bewusst NUR bereits verschlüsselte Werte
// sowohl als Cookie als auch als localStorage-Fallback.
function setPersistentEncrypted(name, encryptedValue, days) {
  try { setCookie(name, encryptedValue, days); } catch (e) { /* ignore */ }
  try { localStorage.setItem(name, encryptedValue); } catch (e) { /* ignore */ }
}

function getCookie(name) {
  // getCookie liefert zuerst das Cookie, falls vorhanden; sonst localStorage
  try {
    const m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    if (m) return decodeURIComponent(m[1]);
  } catch (e) { /* ignore */ }
  try { return localStorage.getItem(name); } catch (e) { return null; }
}
function deleteCookie(name) {
  try {
    document.cookie = name + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  } catch (e) { /* ignore */ }
  try { localStorage.removeItem(name); } catch (e) { /* ignore */ }
}

// --- WebCrypto helpers ---

function _b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function _u8(s) { return new TextEncoder().encode(s); }
function _fromB64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function deriveKeyFromPassword(password, salt, iterations = 100000) {
  const pwKey = await crypto.subtle.importKey('raw', _u8(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
    pwKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Verschlüsseln: gibt JSON-String zurück
async function encryptWithPassword(password, plaintext) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKeyFromPassword(password, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, _u8(plaintext));
    const out = {
      v: _b64(ct),
      iv: _b64(iv),
      salt: _b64(salt)
    };
    return JSON.stringify(out);
  } catch (e) {
    throw new Error('Encryption failed: ' + (e && e.message));
  }
}

// Entschlüsseln: erwartet JSON-String, liefert Plaintext
async function decryptWithPassword(password, payloadJson) {
  try {
    const obj = JSON.parse(payloadJson);
    const ct = _fromB64(obj.v);
    const iv = _fromB64(obj.iv);
    const salt = _fromB64(obj.salt);
    const key = await deriveKeyFromPassword(password, salt);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(plainBuf);
  } catch (e) {
    throw new Error('Decryption failed: ' + (e && e.message));
  }
}

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
  // Entferne gespeicherten manuellen Key (Cookie) beim Logout
  deleteCookie('nostr_manual_nsec');
  // Entferne auch den entschlüsselten Key aus sessionStorage (falls gesetzt)
  try { sessionStorage.removeItem('nostr_manual_nsec_plain'); } catch (e) { /* ignore */ }

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

      // Komfort: immer den entschlüsselten Key in sessionStorage ablegen (nur aktuelle Tab‑Session)
      try { sessionStorage.setItem('nostr_manual_nsec_plain', nsec); } catch (e) { /* ignore */ }

      // Optional: Nutzer fragen, ob Key gespeichert werden soll (verschlüsselt, 30 Tage)
      try {
        const save = confirm('Schlüssel für 30 Tage im Browser speichern (verschlüsselt)? Nicht empfohlen auf gemeinsam genutzten Geräten.');
        if (save) {
          const pwd = prompt('Bitte wählen Sie ein Passwort zum Verschlüsseln des Schlüssels. Merken Sie sich dieses Passwort!');
          if (pwd) {
            try {
              const enc = await encryptWithPassword(pwd, nsec);
              // Speichere nur den bereits verschlüsselten Wert persistent (Cookie + localStorage)
              setPersistentEncrypted('nostr_manual_nsec', enc, 30);
            } catch (e) {
              console.error('Fehler beim Verschlüsseln/Speichern des Schlüssels:', e);
              alert('Fehler beim Speichern des Schlüssels.');
            }
          } else {
            alert('Kein Passwort angegeben — Schlüssel wird nicht gespeichert.');
          }
        } else {
          deleteCookie('nostr_manual_nsec');
        }
      } catch (e) { /* ignore */ }

      // Komfort: nach erfolgreichem manuellen Login speichern wir den entschlüsselten Key
      // für die aktuelle Tab‑Session, damit bei Reload kein Prompt nötig ist.
      try { sessionStorage.setItem('nostr_manual_nsec_plain', nsec); } catch (e) { /* ignore */ }

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

  // Auto-Login: Wenn ein manueller nsec-Key per Cookie/localStorage vorhanden ist,
  // versuchen wir den Login erst nach einer User-Geste (z.B. Klick).
  // Viele Browser blockieren prompt/alert bei automatischem Aufruf beim Laden.
  (function setupAutoManualLoginOnGesture() {
  // Prüfe zuerst, ob in dieser Tab-Session bereits der entschlüsselte Key vorliegt
  try {
    const sess = sessionStorage.getItem('nostr_manual_nsec_plain');
    if (sess) {
      console.debug('[auth] sessionStorage plain key found — attempting session auto-login');
      // Versuche direktes Login mit dem Session-Key (kein Prompt nötig)
      client.loginWithNsec(sess).then(res => {
        if (res && whoami) {
          whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (manual-session)`;
          updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker });
          if (onUpdate) onUpdate();
        }
      }).catch(e => { console.debug('[auth] session auto-login failed:', e && e.message); });
      return;
    }
  } catch (e) { /* ignore sessionStorage errors */ }

  const stored = getCookie('nostr_manual_nsec');
  console.debug('[auth] setupAutoManualLoginOnGesture - cookie/localStorage read:', stored ? '[REDACTED]' : null);
  if (!stored) return;

    async function doAutoLogin() {
      try {
        if (isLoggedIn()) return;
        // Passwort vom Nutzer abfragen (User‑Gesture gewährleistet, dass prompt nicht blockiert wird)
        const pwd = prompt('Passwort zum Entschlüsseln des gespeicherten Schlüssels eingeben:');
        if (!pwd) {
          console.debug('[auth] auto-login: kein Passwort eingegeben');
          return;
        }
        let nsecPlain = null;
        try {
          nsecPlain = await decryptWithPassword(pwd, stored);
        } catch (e) {
          console.debug('[auth] decrypt failed:', e && e.message);
          alert('Entschlüsselung fehlgeschlagen: Falsches Passwort oder beschädigte Daten.');
          return;
        }

        // Versuche Login mit entschlüsseltem Key
        const res = await client.loginWithNsec(nsecPlain).catch((err) => {
          console.debug('[auth] auto manual login failed:', err && err.message);
          return null;
        });
        if (res && whoami) {
          console.debug('[auth] auto manual login succeeded pubkey=', res.pubkey);
          whoami.textContent = `pubkey: ${res.pubkey.slice(0,8)}… (manual-auto)`;
          updateAuthUI({ btnNew, btnLogin, btnLogout, btnBunker });
          if (onUpdate) onUpdate();
        }
      } catch (e) {
        console.debug('[auth] auto-login unexpected error:', e && e.stack);
      }
    }

    // Versuche sofort, wenn eine User-Geste schon vorhanden ist (document.hasFocus() kann helfen),
    // sonst warte auf den nächsten Klick - einmalig
    let triggered = false;
    const triggerOnce = async () => {
      if (triggered) return;
      triggered = true;
      try { document.removeEventListener('click', triggerOnce); } catch (e) {}
      await doAutoLogin();
    };

    // Wenn die Seite bereits fokussiert ist, führe prompt direkt aus (häufig bereits User-Geste)
    try {
      if (document.hasFocus && document.hasFocus()) {
        // small timeout to allow other onload handlers to settle
        setTimeout(triggerOnce, 50);
      } else {
        document.addEventListener('click', triggerOnce, { once: true });
      }
    } catch (e) {
      // Fallback: registriere Click-Listener
      document.addEventListener('click', triggerOnce, { once: true });
    }
  })();
}