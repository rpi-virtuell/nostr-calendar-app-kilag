// js/auth/NostrAuthPlugin.js
// Nostr authentication plugin using NIP-07, manual keys, or NIP-46

import { AuthPluginInterface } from './AuthPluginInterface.js';
import { client as nostrClient } from '../nostr.js';

export class NostrAuthPlugin extends AuthPluginInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'nostr';
    this.displayName = 'Nostr';
    this.client = nostrClient;
    this.currentMethod = null; // 'nip07', 'manual', 'nip46'
  }

  async initialize() {
    console.log('[NostrAuth] Initializing Nostr auth plugin');
    // Auto-reconnect NIP-46 if previously connected
    try {
      const wasConnected = localStorage.getItem('nip46_connected');
      const savedPubkey = localStorage.getItem('nip46_connected_pubkey');
      if (wasConnected && savedPubkey) {
        // Auto-reconnect will be handled by bunker auto-reconnect logic
        this.currentMethod = 'nip46';
      }
    } catch (e) {
      console.debug('[NostrAuth] No previous NIP-46 session');
    }
  }

  async isLoggedIn() {
    return this.client.signer !== null && this.client.pubkey !== null;
  }

  async getIdentity() {
    if (!await this.isLoggedIn()) {
      return null;
    }

    return {
      pubkey: this.client.pubkey,
      method: this.currentMethod,
      displayName: this.getDisplayNameForPubkey(this.client.pubkey),
      provider: 'nostr',
      supports: {
        signing: true,
        eventCreation: true,
        directPublishing: true
      }
    };
  }

  async login(credentials = {}) {
    const { method = 'auto', nsec = null, bunkerURI = null } = credentials;

    try {
      let result;
      
      if (method === 'nip07' || (method === 'auto' && window.nostr)) {
        result = await this.client.login();
        this.currentMethod = 'nip07';
      } else if (method === 'manual' && nsec) {
        result = await this.client.loginWithNsec(nsec);
        this.currentMethod = 'manual';
      } else if (method === 'nip46' && bunkerURI) {
        result = await this.client.connectBunker(bunkerURI);
        this.currentMethod = 'nip46';
      } else if (method === 'auto') {
        // Fallback to generated key
        result = await this.client.login();
        this.currentMethod = 'local';
      } else {
        throw new Error('Invalid login method or missing credentials');
      }

      console.log(`[NostrAuth] Logged in via ${this.currentMethod}:`, result.pubkey);
      return {
        success: true,
        method: this.currentMethod,
        pubkey: result.pubkey,
        provider: 'nostr'
      };
    } catch (error) {
      console.error('[NostrAuth] Login failed:', error);
      throw error;
    }
  }

  async logout() {
    console.log('[NostrAuth] Logging out');
    
    // Clear bunker connection
    if (this.currentMethod === 'nip46' && this.client.signer?.close) {
      try {
        await this.client.signer.close();
      } catch (e) {
        console.warn('[NostrAuth] Error closing bunker connection:', e);
      }
    }

    await this.client.logout();
    this.currentMethod = null;
    
    // Clear stored connection state
    try {
      localStorage.removeItem('nip46_connected');
      localStorage.removeItem('nip46_connected_pubkey');
    } catch (e) {
      // Ignore
    }
  }

  async createEvent(eventData) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to Nostr');
    }

    console.log('[NostrAuth] Creating event via Nostr client');
    return await this.client.publish(eventData);
  }

  async deleteEvent(eventId) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to Nostr');
    }

    console.log('[NostrAuth] Deleting event via Nostr client:', eventId);
    
    const deleteEventData = {
      kind: 5,
      content: '',
      tags: [['e', eventId]],
      created_at: Math.floor(Date.now() / 1000)
    };

    if (!this.client.signer) {
      throw new Error('No signer available');
    }

    await this.client.initPool();
    const signed = await this.client.signer.signEvent(deleteEventData);

    // Publish delete event to relays
    const { Config } = await import('../config.js');
    const pubs = this.client.pool.publish(Config.relays, signed);
    
    if (Array.isArray(pubs)) {
      const timeout = 3000;
      const promises = pubs.map(pub => {
        if (!pub || typeof pub.on !== 'function') return Promise.resolve();
        return new Promise(resolve => {
          const timer = setTimeout(() => resolve(), timeout);
          const onOk = () => { clearTimeout(timer); resolve(true); };
          const onFailed = () => { clearTimeout(timer); resolve(false); };
          try {
            pub.on('ok', onOk);
            pub.on('failed', onFailed);
          } catch (e) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      await Promise.race(promises);
      await Promise.allSettled(promises);
    }

    return { signed };
  }

  updateAuthUI(elements) {
    const { whoami, btnLogin, btnLogout, btnNew, btnLoginMenu } = elements;
    
    if (this.isLoggedIn()) {
      // Show user info
      if (whoami && this.client.pubkey) {
        const shortPubkey = this.client.pubkey.slice(0, 16) + '...';
        const methodLabel = this.getMethodLabel(this.currentMethod);
        whoami.innerHTML = `
          <div style="text-align: left;">
            <div><strong>🔑 Nostr Identity (${methodLabel})</strong></div>
            <div style="font-size: 0.85em; color: #666;">${this.getDisplayNameForPubkey(this.client.pubkey)}</div>
            <div style="font-size: 0.75em; color: #999;">${shortPubkey}</div>
          </div>
        `;
      }
      
      // Hide login elements, show logout
      if (btnLoginMenu) btnLoginMenu.style.display = 'none';
      if (btnLogin) btnLogin.style.display = 'none';
      if (btnLogout) {
        btnLogout.style.display = 'inline-block';
        btnLogout.classList.remove('hidden');
      }
      if (btnNew) {
        btnNew.style.display = 'inline-block';
        btnNew.disabled = false;
        btnNew.title = 'Neuen Termin anlegen';
      }
    } else {
      // Show login elements, hide logout
      if (btnLoginMenu) btnLoginMenu.style.display = 'inline-block';
      if (btnLogout) btnLogout.style.display = 'none';
      if (whoami) whoami.textContent = '';
      if (btnNew) {
        btnNew.disabled = true;
        btnNew.title = 'Bitte zuerst einloggen';
      }
    }
  }

  setupUI(elements, onChange) {
    const { btnManual, btnNip07, btnBunker } = elements;

    // NIP-07 login
    if (btnNip07) {
      btnNip07.onclick = async () => {
        try {
          await this.login({ method: 'nip07' });
          if (onChange) onChange();
        } catch (error) {
          alert('NIP-07 Login fehlgeschlagen: ' + error.message);
        }
      };
    }

    // Manual nsec login
    if (btnManual) {
      btnManual.onclick = async () => {
        const nsec = prompt('Bitte nsec1... Key eingeben:');
        if (!nsec) return;
        
        try {
          await this.login({ method: 'manual', nsec });
          if (onChange) onChange();
        } catch (error) {
          alert('Manual Login fehlgeschlagen: ' + error.message);
        }
      };
    }

    // NIP-46 Bunker login - handled by bunker.js setupBunkerUI()
    // Removed onclick handler to avoid conflicts with bunker.js
  }

  async getPublicKey() {
    return this.client.pubkey;
  }

  async getDisplayName() {
    return this.getDisplayNameForPubkey(this.client.pubkey);
  }

  supports(feature) {
    switch (feature) {
      case 'signing':
      case 'event_creation':
      case 'direct_publishing':
        return true;
      case 'server_side_publishing':
        return false;
      default:
        return false;
    }
  }

  getPriority() {
    return 10; // Standard priority for Nostr auth
  }

  // Helper methods
  getMethodLabel(method) {
    switch (method) {
      case 'nip07': return 'Extension';
      case 'manual': return 'Manual Key';
      case 'nip46': return 'Bunker';
      case 'local': return 'Generated';
      default: return 'Unknown';
    }
  }

  getDisplayNameForPubkey(pubkey) {
    if (!pubkey) return 'Unknown';
    // Could integrate with NIP-05 lookup here
    return `nostr:${pubkey.slice(0, 8)}...`;
  }

  async destroy() {
    await this.logout();
  }
}