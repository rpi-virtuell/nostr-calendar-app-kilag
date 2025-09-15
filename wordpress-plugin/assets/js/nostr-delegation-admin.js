(function () {
  // Simple boot log to verify script load
  try { console.log('[delegation-admin] script loaded'); } catch(e) {}

  // Helpers
  function toHex(buf) {
    return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function fromHex(hex) {
    return new Uint8Array((hex.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16)));
  }
  // Portable SHA-256 (WebCrypto first, fallback to nostr-tools if vorhanden)
  async function sha256Bytes(inputUint8) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      const digest = await window.crypto.subtle.digest('SHA-256', inputUint8);
      return new Uint8Array(digest);
    }
    const NT = window.NostrTools;
    if (NT && NT.utils && typeof NT.utils.sha256 === 'function') {
      return await NT.utils.sha256(inputUint8);
    }
    throw new Error('SHA-256 nicht verfügbar (WebCrypto/nostr-tools)');
  }

  // Lazy loader für nostr-tools (Fallback Import, falls window.NostrTools fehlt)
  async function getNT() {
    try { console.log('[delegation-admin] getNT()'); } catch(e) {}
    let NT = window.NostrTools;
    if (!NT) {
      try {
        // dynamischer Import als Fallback (gleiche URL wie inline ESM)
        NT = await import('https://esm.sh/nostr-tools@2.8.1');
        window.NostrTools = NT;
        try { console.log('[delegation-admin] nostr-tools loaded via dynamic import'); } catch(e) {}
      } catch (e) {
        console.warn('[delegation-admin] dynamic import failed', e);
        return null;
      }
    }
    // Manche Bundler liefern unter .default
    if (NT && NT.default && !NT.getPublicKey && NT.default.getPublicKey) {
      NT = NT.default;
      window.NostrTools = NT;
    }
    return NT;
  }

  // Liefert eine schnorr-Implementierung (aus nostr-tools oder @noble/curves)
  async function getSchnorr(NT) {
    // 1) Prüfe, ob nostr-tools bereits schnorr mit sign() mitliefert
    if (NT && NT.schnorr && typeof NT.schnorr.sign === 'function') {
      return NT.schnorr;
    }
    // 2) Fallback: direkt von @noble/curves laden
    try {
      const mod = await import('https://esm.sh/@noble/curves@1.4.0/secp256k1');
      // Module kann default-Export oder named export haben
      const secp = mod.secp256k1 || (mod.default && mod.default.secp256k1) || mod;
      // In neueren Versionen wird schnorr direkt exportiert
      const schnorr = mod.schnorr || (secp && secp.schnorr);
      if (schnorr && typeof schnorr.sign === 'function') {
        return schnorr;
      }
    } catch (e) {
      console.warn('[delegation-admin] noble schnorr import failed', e);
    }
    return null;
  }

  // Delegation admin helper
  function parseDelegation(text) {
    try {
      let arr = null;
      try { arr = JSON.parse(text); } catch (e) {
        const fixed = text.replace(/'/g, '"');
        arr = JSON.parse(fixed);
      }
      if (!Array.isArray(arr) || arr.length < 4 || arr[0] !== 'delegation') return { ok: false, error: 'Invalid delegation format' };
      const sig = arr[1];
      const cond = arr[2];
      const delegator = arr[3];
      const parts = cond.split('&').map(s => s.trim());
      const parsed = {};
      parts.forEach(p => {
        const m = p.match(/(\w+)([><=]+)(\d+)/);
        if (m) {
          const key = m[1], op = m[2], val = parseInt(m[3], 10);
          parsed[key] = parsed[key] || [];
          parsed[key].push({ op, val });
        }
      });
      return { ok: true, sig, delegator, cond, parsed };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function onValidate() {
    var txt = document.getElementById('delegation_blob').value.trim();
    var res = parseDelegation(txt);
    var out = document.getElementById('delegation-validation-result');
    if (!res.ok) {
      out.innerHTML = '<p style="color:red;">Ungültig: ' + res.error + '</p>';
      document.getElementById('save-delegation').disabled = true;
      return;
    }
    var html = '<p style="color:green;">Valid delegation</p>';
    html += '<p><strong>Delegator pubkey:</strong> ' + res.delegator + '</p>';
    html += '<p><strong>Conditions:</strong><pre>' + JSON.stringify(res.parsed, null, 2) + '</pre></p>';
    out.innerHTML = html;
    document.getElementById('save-delegation').disabled = false;
  }

  function onFileChange(e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      document.getElementById('delegation_blob').value = ev.target.result.trim();
    };
    reader.readAsText(f);
  }

  function saveDelegation() {
    var txt = document.getElementById('delegation_blob').value.trim();
    var data = new FormData();
    data.append('action', 'save_nostr_delegation');
    data.append('delegation', txt);
    data.append('_wpnonce', nostrDelegationAdmin.nonce);
    fetch(nostrDelegationAdmin.ajax_url, { method: 'POST', body: data })
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          alert('Delegation saved');
          location.reload();
        } else {
          alert('Error: ' + (j.error || 'unknown'));
        }
      })
      .catch(e => alert('Save failed: ' + e));
  }

  function removeDelegation() {
    if (!confirm('Delegation entfernen?')) return;
    var data = new FormData();
    data.append('action', 'remove_nostr_delegation');
    data.append('_wpnonce', nostrDelegationAdmin.nonce);
    fetch(nostrDelegationAdmin.ajax_url, { method: 'POST', body: data })
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          alert('Delegation removed');
          location.reload();
        } else {
          alert('Error: ' + (j.error || 'unknown'));
        }
      })
      .catch(e => alert('Remove failed: ' + e));
  }

  // Generator UI logic (in-browser NIP-26 creation)
  async function generateNewKeypair() {
    let NT = await getNT();
    if (!NT || !NT.getPublicKey || !NT.nip19) {
      alert('nostr-tools nicht geladen. Bitte Seite neu laden.');
      return;
    }
    console.log('[delegation-admin] generateNewKeypair');
    // Support both API names: generateSecretKey (v2.x) und generatePrivateKey (älter)
    const gen = NT.generateSecretKey || NT.generatePrivateKey;
    if (typeof gen !== 'function') {
      alert('nostr-tools: keine Keygen-Funktion gefunden (generateSecretKey/generatePrivateKey).');
      return;
    }
    const sk = gen(); // hex
    const nsec = NT.nip19.nsecEncode(sk);
    const pk = NT.getPublicKey(sk); // hex
    document.getElementById('gen_delegator_nsec').value = nsec;
    const npub = NT.nip19.npubEncode(pk);
    document.getElementById('gen_delegator_info').innerHTML = 'Delegator pubkey (hex): ' + pk + '<br>npub: ' + npub;
  }

  // Generate delegatee pair and fill only pubkey field, show npub for reference
  async function generateDelegateeKeypair() {
    let NT = await getNT();
    if (!NT || !NT.getPublicKey || !NT.nip19) {
      alert('nostr-tools nicht geladen. Bitte Seite neu laden.');
      return;
    }
    console.log('[delegation-admin] generateDelegateeKeypair');
    const gen = NT.generateSecretKey || NT.generatePrivateKey;
    if (typeof gen !== 'function') {
      alert('nostr-tools: keine Keygen-Funktion gefunden (generateSecretKey/generatePrivateKey).');
      return;
    }
    const sk = gen(); // hex
    const pk = NT.getPublicKey(sk); // hex
    const npub = NT.nip19.npubEncode(pk);
    const nsec = NT.nip19.nsecEncode(sk);
    // Fill pubkey input only; show secrets below with warning so admin can store securely
    const inp = document.getElementById('gen_delegatee_pub');
    if (inp) {
      inp.value = pk;
      console.log('[delegation-admin] delegatee pubkey filled');
    } else {
      console.warn('[delegation-admin] gen_delegatee_pub input not found');
    }
    const info = document.getElementById('gen_delegatee_info');
    if (info) {
      info.innerHTML = 'Delegatee pubkey (hex): ' + pk +
        '<br>npub: ' + npub +
        '<br><span style="color:#b00;">nsec (GEHEIM, sicher speichern!): ' + nsec + '</span>';
      console.log('[delegation-admin] delegatee info rendered');
    } else {
      console.warn('[delegation-admin] gen_delegatee_info container not found');
    }
  }

  function fillDefaultTimeRange() {
    console.log('[delegation-admin] fillDefaultTimeRange clicked'); 
    const now = Math.floor(Date.now() / 1000);
    const threeMonths = 60 * 60 * 24 * 90;
    const untilvalue = Number(document.getElementById('gen_until').value);
    const since = Number(document.getElementById('gen_since').value);
    const max = Number(now) + Number(threeMonths * 2); // max 4 Monate in die Zukunft
    if (untilvalue && parseInt(untilvalue,10) >= max) {
      alert('Der "until"-Wert ist zu weit in der Zukunft. Maximal 12 Monate erlaubt.');
      return;
    }
    if (untilvalue>since) {
      console.log('[delegation-admin] fillDefaultTimeRange using existing until value');
      
      document.getElementById('gen_since').value = now;
      document.getElementById('gen_until').value = Number(untilvalue) + threeMonths;
      

    } else {
      document.getElementById('gen_since').value = now - threeMonths;
      document.getElementById('gen_until').value = now;
    }
    const until = Number(document.getElementById('gen_until').value);
    document.getElementById('gen_until_info').innerText = '(bis ' + new Date((Number(until) + threeMonths) * 1000).toLocaleDateString() + ')';
  }


  async function createDelegationTag() {
    try {
      let NT = await getNT();
      if (!NT || !NT.utils || !NT.getPublicKey || !NT.nip19) {
        throw new Error('nostr-tools nicht verfügbar');
      }
      console.log('[delegation-admin] createDelegationTag start');

      // Read inputs
      const nsec = (document.getElementById('gen_delegator_nsec').value || '').trim();
      const delegatee = (document.getElementById('gen_delegatee_pub').value || '').trim();
      const kinds = (document.getElementById('gen_kinds').value || '').trim();
      const since = (document.getElementById('gen_since').value || '').trim();
      const until = (document.getElementById('gen_until').value || '').trim();

      if (!nsec || !delegatee) {
        throw new Error('Bitte nsec und Delegatee Pubkey angeben.');
      }
      // Decode nsec -> private key hex
      let skHex;
      try {
        const dec = NT.nip19.decode(nsec);
        if (dec.type !== 'nsec') throw new Error('Kein nsec');
        skHex = dec.data;
      } catch (e) {
        throw new Error('Ungültiger nsec.');
      }

      // Derive delegator pubkey
      const delegator = NT.getPublicKey(skHex); // hex

      // Build conditions string
      const condParts = [];
      if (since) condParts.push('created_at>' + parseInt(since, 10));
      if (until) condParts.push('created_at<' + parseInt(until, 10));
      if (kinds) {
        const normalized = kinds.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
        if (normalized.length) {
          condParts.push('kind=' + normalized.join(','));
        }
      }
      const conds = condParts.join('&');

      // NIP-26 signing:
      // message = sha256( UTF8("nostr:delegation:" + delegatee + ":" + conds) )
      const enc = new TextEncoder();
      const preimage = enc.encode(`nostr:delegation:${delegatee}:${conds}`);
      const hash = await sha256Bytes(preimage); // Uint8Array
      // schnorr.sign expects 32-byte message and 32-byte private key
      // Hole schnorr entweder aus nostr-tools oder aus @noble/curves
      const schnorr = await getSchnorr(NT);
      if (!schnorr || typeof schnorr.sign !== 'function') {
        throw new Error('schnorr.sign nicht verfügbar (nostr-tools/@noble/curves).');
      }
      const sigBytes = await schnorr.sign(hash, skHex);
      const sig = typeof sigBytes === 'string' ? sigBytes : toHex(sigBytes);

      // Compose tag array in plugin-Format: ['delegation','<sig>','<conds>','<delegator_pubkey>']
      const arr = ['delegation', sig, conds, delegator];
      const raw = JSON.stringify(arr);

      // Show result and enable copy-to-textarea button
      const out = document.getElementById('gen_result');
      out.textContent = raw;
      // Also pre-fill textarea for validation
      const txt = document.getElementById('delegation_blob');
      if (txt) txt.value = raw;
      // Auto-validate
      onValidate();

    } catch (e) {
      alert('Fehler beim Erzeugen der Delegation: ' + (e.message || e));
    }
  }

  function copyGeneratedToTextarea() {
    const out = document.getElementById('gen_result');
    const txt = document.getElementById('delegation_blob');
    if (out && out.textContent && txt) {
      txt.value = out.textContent.trim();
      onValidate();
      window.scrollTo({ top: txt.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    }
  }

  function bindUiEvents() {
    try { console.log('[delegation-admin] binding UI events'); } catch(e) {}
    var vbtn = document.getElementById('validate-delegation');
    if (vbtn) vbtn.addEventListener('click', onValidate);
    var file = document.getElementById('delegation_file');
    if (file) file.addEventListener('change', onFileChange);
    var save = document.getElementById('save-delegation');
    if (save) save.addEventListener('click', saveDelegation);
    var rem = document.getElementById('remove-delegation');
    console.log('[delegation-admin] remove button:', rem);
    if (rem) rem.addEventListener('click', removeDelegation);

    // Generator events
    var btnNew = document.getElementById('gen_btn_new_nsec');
    if (btnNew) btnNew.addEventListener('click', generateNewKeypair);
    var btnDefaults = document.getElementById('gen_btn_fill_defaults');
    if (btnDefaults) btnDefaults.addEventListener('click', fillDefaultTimeRange);
    var btnCreate = document.getElementById('gen_btn_create');
    if (btnCreate) btnCreate.addEventListener('click', createDelegationTag);
    var btnCopy = document.getElementById('gen_btn_copy_to_textarea');
    if (btnCopy) btnCopy.addEventListener('click', copyGeneratedToTextarea);
    // Delegatee keypair generate button
    var btnDelNew = document.getElementById('gen_btn_delegatee_new');
    if (btnDelNew) {
      console.log('[delegation-admin] binding click for gen_btn_delegatee_new');
      btnDelNew.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        generateDelegateeKeypair();
      });
    } else {
      console.warn('[delegation-admin] gen_btn_delegatee_new not found in DOM');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    try { console.log('[delegation-admin] DOMContentLoaded'); } catch(e) {}
    // Bind immediately for non-generator parts
    bindUiEvents();
  });
})();