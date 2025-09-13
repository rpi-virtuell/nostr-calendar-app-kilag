// js/auth/WordPressAuthPlugin.js
// WordPress SSO authentication plugin

import { AuthPluginInterface } from './AuthPluginInterface.js';

export class WordPressAuthPlugin extends AuthPluginInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'wordpress';
    this.displayName = 'WordPress SSO';
    this.serverBase = config.serverBase || 'http://localhost:8787';
    this.currentSession = null;
  }

  async initialize() {
    console.log('[WordPressAuth] Initializing WordPress SSO plugin');
    
    // Check for SSO success parameters
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('wp_sso') === 'success') {
        console.log('[WordPressAuth] SSO success detected in URL');
        
        // Show notification
        this.showSSONotification(urlParams.get('user'));
        
        // Clean URL
        const url = new URL(window.location);
        url.searchParams.delete('wp_sso');
        url.searchParams.delete('user');
        window.history.replaceState({}, '', url);
      }
    } catch (e) {
      console.warn('[WordPressAuth] Error checking URL params:', e);
    }

    // Check existing session
    await this.checkSession();
  }

  async isLoggedIn() {
    const session = await this.getSession();
    return session !== null;
  }

  async getIdentity() {
    const session = await this.getSession();
    if (!session) return null;

    return {
      pubkey: session.calendar_identity.pubkey,
      wpUser: session.wp_user,
      calendarIdentity: session.calendar_identity,
      displayName: session.wp_user.display_name || session.wp_user.username,
      provider: 'wordpress',
      supports: {
        signing: false,
        eventCreation: true,
        serverSidePublishing: true
      }
    };
  }

  async login(credentials = {}) {
    const { token } = credentials;
    
    if (!token) {
      throw new Error('WordPress SSO token required for login');
    }

    try {
      const response = await fetch(`${this.serverBase}/wp-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token })
      });

      const result = await response.json();
      
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'WordPress login failed');
      }

      this.currentSession = result;
      console.log('[WordPressAuth] Login successful:', result.user.username);
      
      return {
        success: true,
        method: 'wordpress_sso',
        user: result.user,
        calendarIdentity: result.calendar_identity,
        provider: 'wordpress'
      };
    } catch (error) {
      console.error('[WordPressAuth] Login failed:', error);
      throw error;
    }
  }

  async logout() {
    console.log('[WordPressAuth] Logging out from WordPress SSO');
    
    try {
      await fetch(`${this.serverBase}/wp-logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.warn('[WordPressAuth] Logout request failed:', e);
    }

    this.currentSession = null;
  }

  async createEvent(eventData) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress SSO');
    }

    console.log('[WordPressAuth] Creating event via WordPress SSO');
    
    const response = await fetch(`${this.serverBase}/wp-calendar/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        title: eventData.title,
        start: eventData.starts,
        end: eventData.ends,
        location: eventData.location || '',
        description: eventData.content || '',
        d: eventData.d || `wp-event-${Date.now()}`
      })
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Event creation failed');
    }

    return result;
  }

  updateAuthUI(elements) {
    const { whoami, btnLogin, btnLogout, btnNew, btnLoginMenu } = elements;
    
    if (this.currentSession) {
      // Show WordPress user info
      if (whoami) {
        const wpUser = this.currentSession.wp_user;
        const identity = this.currentSession.calendar_identity;
        
        whoami.innerHTML = `
          <div style="text-align: left;">
            <div><strong>📅 Calendar Identity:</strong> ${identity.name}</div>
            <div style="font-size: 0.85em; color: #666;">WordPress User: ${wpUser.display_name || wpUser.username}</div>
            <div style="font-size: 0.75em; color: #999;">${identity.pubkey.slice(0, 16)}...</div>
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
    // WordPress SSO doesn't need manual UI setup
    // Login is handled via external WordPress site redirects
    console.log('[WordPressAuth] UI setup - WordPress SSO uses external login flow');
  }

  async getPublicKey() {
    const identity = await this.getIdentity();
    return identity?.pubkey || null;
  }

  async getDisplayName() {
    const identity = await this.getIdentity();
    return identity?.displayName || null;
  }

  supports(feature) {
    switch (feature) {
      case 'event_creation':
      case 'server_side_publishing':
        return true;
      case 'signing':
      case 'direct_publishing':
        return false;
      default:
        return false;
    }
  }

  getPriority() {
    return 20; // Higher priority than Nostr auth when available
  }

  // Helper methods
  async getSession() {
    if (this.currentSession) {
      return this.currentSession;
    }
    
    return await this.checkSession();
  }

  async checkSession() {
    try {
      const response = await fetch(`${this.serverBase}/wp-me`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          this.currentSession = data;
          return data;
        }
      }
    } catch (e) {
      console.debug('[WordPressAuth] No active session');
    }
    
    this.currentSession = null;
    return null;
  }

  showSSONotification(username) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      background: #4CAF50; color: white; padding: 15px 20px;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: system-ui, sans-serif; font-size: 14px;
    `;
    notification.innerHTML = `
      ✅ <strong>WordPress SSO erfolgreich!</strong><br>
      Angemeldet als: ${username || 'WordPress User'}
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  async destroy() {
    await this.logout();
    this.currentSession = null;
  }
}