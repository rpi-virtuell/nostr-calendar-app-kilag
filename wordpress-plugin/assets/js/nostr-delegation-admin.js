(function () {
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

  document.addEventListener('DOMContentLoaded', function () {
    var vbtn = document.getElementById('validate-delegation');
    if (vbtn) vbtn.addEventListener('click', onValidate);
    var file = document.getElementById('delegation_file');
    if (file) file.addEventListener('change', onFileChange);
    var save = document.getElementById('save-delegation');
    if (save) save.addEventListener('click', saveDelegation);
    var rem = document.getElementById('remove-delegation');
    if (rem) rem.addEventListener('click', removeDelegation);
  });
})();