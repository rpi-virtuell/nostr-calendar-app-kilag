/**
 * WordPress Plugin Version of WordPressAuthPlugin
 * Integrates with WordPress REST API instead of Node.js server
 */

import { AuthPluginInterface } from './AuthPluginInterface.js';

export class WordPressPluginAuth extends AuthPluginInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'wordpress';
    this.displayName = 'WordPress SSO';
    this.apiBase = window.nostrCalendarWP?.apiUrl || '/wp-json/nostr-calendar/v1/';
    this.nonce = window.nostrCalendarWP?.nonce || '';
    this.currentSession = null;
  }

  async initialize() {
    console.log('[WordPressPluginAuth] Initializing WordPress Plugin integration');
    
    // Check existing session from WordPress
    if (window.nostrCalendarWP?.isLoggedIn) {
      await this.checkSession();
    }
  }

  async isLoggedIn() {
    if (window.nostrCalendarWP?.isLoggedIn) {
      const session = await this.getSession();
      return session !== null;
    }
    return false;
  }

  async getIdentity() {
    const session = await this.getSession();
    if (!session) return null;

    return {
      pubkey: session.calendar_identity.pubkey,
      user: session.wp_user, // Add user property for consistency
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
    // WordPress login is handled by WordPress itself
    // This method would redirect to wp-login.php
    const loginUrl = window.nostrCalendarWP?.loginUrl || '/wp-login.php';
    const returnUrl = encodeURIComponent(window.location.href);
    
    window.location.href = `${loginUrl}?redirect_to=${returnUrl}`;
    
    return {
      success: false,
      message: 'Redirecting to WordPress login...'
    };
  }

  async logout() {
    console.log('[WordPressPluginAuth] Logging out from WordPress');
    
    try {
      // Use WordPress logout
      const logoutUrl = window.nostrCalendarWP?.logoutUrl || '/wp-login.php?action=logout';
      const nonce = window.nostrCalendarWP?.logoutNonce || '';
      
      if (nonce) {
        window.location.href = `${logoutUrl}&_wpnonce=${nonce}`;
      } else {
        window.location.href = logoutUrl;
      }
    } catch (e) {
      console.warn('[WordPressPluginAuth] Logout request failed:', e);
    }

    this.currentSession = null;
  }

  async createEvent(eventData) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress');
    }

    console.log('[WordPressPluginAuth] Creating event via WordPress Plugin API');
    
    const response = await fetch(`${this.apiBase}event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': this.nonce
      },
      credentials: 'include',
      body: JSON.stringify({
        title: eventData.title,
        starts: eventData.starts,  // Fixed: 'starts' instead of 'start'
        ends: eventData.ends,      // Fixed: 'ends' instead of 'end'
        location: eventData.location || '',
        content: eventData.content || '',  // Fixed: 'content' instead of 'description'
        d: eventData.d || `wp-event-${Date.now()}`
      })
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'Event creation failed');
    }

    return result;
  }

  async deleteEvent(eventId) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress');
    }

    console.log('[WordPressPluginAuth] Deleting event via WordPress Plugin API:', eventId);
    
    const response = await fetch(`${this.apiBase}event/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': this.nonce
      },
      credentials: 'include'
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'Event deletion failed');
    }

    return result;
  }

  async updateAuthUI(elements) {
    const { whoami, btnLogin, btnLogout, btnNew } = elements;
    
    if (this.currentSession) {
      // Show WordPress user info
      if (whoami) {
        const identity = await this.getIdentity();
        if (identity) {
          whoami.innerHTML = `
            <div style="text-align: left;">
              <div><strong>📅 Calendar Identity:</strong> ${identity.displayName}</div>
              <div style="font-size: 0.85em; color: #666;">WordPress User: ${identity.user.display_name || identity.user.username}</div>
              <div style="font-size: 0.75em; color: #999;">${identity.pubkey.slice(0, 16)}...</div>
            </div>
          `;
        }
      }
      
      // Update sidebar auth status
      const wpAuthStatus = document.getElementById('wp-auth-status');
      if (wpAuthStatus) {
        wpAuthStatus.innerHTML = `
          <p>Logged in as: ${this.currentSession.wp_user.display_name || this.currentSession.wp_user.username}</p>
          <button id="btn-logout" class="btn-logout">Logout</button>
        `;
        
        // Add logout handler
        const logoutBtn = wpAuthStatus.querySelector('#btn-logout');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', () => this.logout());
        }
      }
      
      // Enable new event button
      if (btnNew) {
        btnNew.style.display = 'inline-block';
        btnNew.disabled = false;
        btnNew.title = 'Neuen Termin anlegen';
      }
    } else {
      // Not logged in state
      const wpAuthStatus = document.getElementById('wp-auth-status');
      if (wpAuthStatus) {
        const loginUrl = window.nostrCalendarWP?.loginUrl || '/wp-login.php';
        const returnUrl = encodeURIComponent(window.location.href);
        
        wpAuthStatus.innerHTML = `
          <p>Not logged in</p>
          <a href="${loginUrl}?redirect_to=${returnUrl}" class="btn-login">WordPress Login</a>
        `;
      }
    }
  }

  setupUI(elements, onChange) {
    // WordPress Plugin uses WordPress's own login system
    console.log('[WordPressPluginAuth] UI setup - using WordPress login system');
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
      const response = await fetch(`${this.apiBase}sso-status`, {
        credentials: 'include',
        headers: {
          'X-WP-Nonce': this.nonce
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          this.currentSession = data;
          return data;
        }
      }
    } catch (e) {
      console.debug('[WordPressPluginAuth] No active session');
    }
    
    this.currentSession = null;
    return null;
  }

  async destroy() {
    await this.logout();
    this.currentSession = null;
  }
}