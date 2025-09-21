// js/auth/WordPressAuthPlugin.js
// WordPress SSO authentication plugin

const moduleUrl = `${window.NostrSignerConfig.pluginUrl}assets/js/nostr-app.js`;
const nostrModule = await import(moduleUrl);
const {
  configureNostr,
  nostr_send,
  nostr_fetch,
  nostr_me,
  nostr_onEvent,
  login,
  logout,
} = nostrModule;

import { AuthPluginInterface } from './AuthPluginInterface.js';


export class WordPressAuthPlugin extends AuthPluginInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'wordpress';
    this.displayName = 'WordPress SSO';
    this.currentSession = null;
  }

  async initialize() {
    console.log('[WordPressAuth] Initializing WordPress SSO plugin');
    const sessionData = localStorage.getItem('wp_session');
    if (sessionData) {
      this.currentSession = JSON.parse(sessionData);
      console.log('[WordPressAuth] Restored session from localStorage');
    }

    // Check for WordPress SSO session in localStorage if not already set
    if (!this.currentSession) {
      await this.checkLocalSession();
    }

    // Clean URL
    const url = new URL(window.location);
    window.history.replaceState({}, '', url);
    
  }

  async isLoggedIn() {
    const session = await this.getSession();
    return session !== null;
  }

  async getIdentity() {
    return await this.getSessionIdentity();
    
  }

  async login(credentials = {}) {
    // wp_login link
  }

  async logout() {
    // wp_logout link
    
  }

  async createEvent(eventData) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress SSO');
    }

    // nostr_send
  }

  // delete calendar event by ID
  async deleteEvent(eventId) {
    
    // Send NIP-9 DELETE request
  }

  async getEvents() {
    // get parent method to fetch events
    return super.getEvents();
  }

  async updateAuthUI(elements) {
    const { whoami, btnLogin, btnLogout, btnNew, btnLoginMenu } = elements;
    
    
    if (this.currentSession) {
      // Show WordPress user info 
      if (whoami) {
        const identity = await this.getIdentity();
        console.debug('[WordPressAuth] Updating UI for logged in user:', identity);
        if (identity) {
          whoami.innerHTML = `
            <div style="text-align: left;">
              <div style="font-size: 0.75em; color: #999; margin-bottom: 4px;">WordPress SSO</div>
              <div style="margin-bottom: 4px;">
                <img src="${identity.user.avatar || ''}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 16px; vertical-align: middle; margin-right: 8px;">
                <strong>${identity.user.display_name || identity.user.username}</strong>
              </div>  
              <div style="font-size: 0.85em; color: #666;">Blog: ${identity.blog.display_name || identity.user.username}</div>
              <div style="font-size: 0.75em; color: #999;">${identity.user.npub || identity.blog.npub.slice(0, 16)}...</div>
            </div>
          `;
        }
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
      // WordPress not active - don't interfere with other auth methods
      // The NostrAuthPlugin should handle the login UI when WordPress SSO is not active
      console.log('[WordPressAuth] Not logged in, letting other auth plugins handle UI');
    }
  }

  setupUI(elements, onChange) {
    // remove .sidebar-section.authsection if exists
    const authSection = document.querySelector('.sidebar-section.authsection');
    if (authSection) {
      authSection.remove();
    }

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

  

  
  // Helper methods
  async getSession() {
    if (this.currentSession) {
      return this.currentSession;
    }else{
      // get session from localStorage if available else fetch from /me
      const storedSession = localStorage.getItem('wp_session');
      if (storedSession) {
        this.currentSession = JSON.parse(storedSession);
        return this.currentSession;
      }else{
        // fetch from /me endpoint
        const sessionData = await nostr_me();
        if (sessionData) {
          sessionData.calendarIdentity.user.display_name = sessionData.user.display_name || {};
          sessionData.calendarIdentity.user.pubkey = sessionData.user.pubkey.hex;
          sessionData.calendarIdentity.user.npub  = sessionData.user.pubkey.npub;
          sessionData.calendarIdentity.blog.display_name = sessionData.blog.blog_name;
          sessionData.calendarIdentity.blog.npub = sessionData.blog.pubkey.npub;
          sessionData.calendarIdentity.user.avatar = sessionData.user.avatar_url?.['96'] || '';
          this.currentSession = sessionData;
          localStorage.setItem('wp_session', JSON.stringify(sessionData));
          return sessionData;
        }
      }
    }
    return null;
  }
  async getSessionIdentity() {
    const session = await this.getSession();
    if (!session) {
      return null;
    }
    return session.calendarIdentity;
  }


  

  
}
