// js/auth/KeycloakAuthPlugin.js
// Example template for additional auth plugins (Keycloak, SAML, etc.)

import { AuthPluginInterface } from './AuthPluginInterface.js';

export class KeycloakAuthPlugin extends AuthPluginInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'keycloak';
    this.displayName = 'Keycloak SSO';
    this.keycloakConfig = config.keycloak || {};
    this.serverBase = config.serverBase || '/api';
    this.currentSession = null;
    this.keycloak = null;
  }

  async initialize() {
    console.log('[KeycloakAuth] Initializing Keycloak SSO plugin');
    
    // Initialize Keycloak instance (would require keycloak-js library)
    // this.keycloak = new Keycloak(this.keycloakConfig);
    // await this.keycloak.init({ onLoad: 'check-sso' });
    
    // For this example, we'll simulate the API
    console.log('[KeycloakAuth] Keycloak initialization complete');
  }

  async isLoggedIn() {
    // return this.keycloak?.authenticated || false;
    return this.currentSession !== null;
  }

  async getIdentity() {
    if (!await this.isLoggedIn()) return null;

    // Example structure - would be populated by actual Keycloak data
    return {
      pubkey: this.currentSession?.pubkey,
      userId: this.currentSession?.userId,
      displayName: this.currentSession?.displayName,
      email: this.currentSession?.email,
      roles: this.currentSession?.roles,
      provider: 'keycloak',
      supports: {
        signing: false,
        eventCreation: true,
        serverSidePublishing: true,
        roleBasedAccess: true
      }
    };
  }

  async login(credentials = {}) {
    try {
      // In real implementation:
      // await this.keycloak.login();
      // const token = this.keycloak.token;
      
      // Example: simulate successful login
      this.currentSession = {
        userId: 'user123',
        displayName: 'John Doe',
        email: 'john@company.com',
        roles: ['user', 'event_creator'],
        pubkey: 'server_managed_identity_for_user123',
        token: 'simulated_jwt_token'
      };

      console.log('[KeycloakAuth] Login successful');
      return {
        success: true,
        method: 'keycloak_sso',
        user: this.currentSession,
        provider: 'keycloak'
      };
    } catch (error) {
      console.error('[KeycloakAuth] Login failed:', error);
      throw error;
    }
  }

  async logout() {
    console.log('[KeycloakAuth] Logging out from Keycloak');
    
    try {
      // await this.keycloak.logout();
      // Or call server logout endpoint
      await fetch(`${this.serverBase}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.currentSession?.token}`
        },
        credentials: 'include'
      });
    } catch (e) {
      console.warn('[KeycloakAuth] Logout request failed:', e);
    }

    this.currentSession = null;
  }

  async createEvent(eventData) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to Keycloak');
    }

    console.log('[KeycloakAuth] Creating event via Keycloak SSO');
    
    const response = await fetch(`${this.serverBase}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.currentSession.token}`
      },
      body: JSON.stringify({
        title: eventData.title,
        startTime: eventData.starts,
        endTime: eventData.ends,
        location: eventData.location || '',
        description: eventData.content || '',
        metadata: {
          source: 'keycloak_sso',
          creator: this.currentSession.userId
        }
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Event creation failed');
    }

    return result;
  }

  updateAuthUI(elements) {
    const { whoami, btnLogin, btnLogout, btnNew, btnLoginMenu } = elements;
    
    if (this.currentSession) {
      // Show Keycloak user info
      if (whoami) {
        whoami.innerHTML = `
          <div style="text-align: left;">
            <div><strong>🏢 ${this.currentSession.displayName}</strong></div>
            <div style="font-size: 0.85em; color: #666;">${this.currentSession.email}</div>
            <div style="font-size: 0.75em; color: #999;">Keycloak SSO • Roles: ${this.currentSession.roles.join(', ')}</div>
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
        btnNew.disabled = !this.currentSession.roles.includes('event_creator');
        btnNew.title = this.currentSession.roles.includes('event_creator') 
          ? 'Neuen Termin anlegen' 
          : 'Keine Berechtigung zum Erstellen von Events';
      }
    }
  }

  setupUI(elements, onChange) {
    // Keycloak typically handles login via redirect
    // Could add a "Login with Keycloak" button here
    console.log('[KeycloakAuth] UI setup - Keycloak uses redirect-based login');
  }

  async getPublicKey() {
    return this.currentSession?.pubkey || null;
  }

  async getDisplayName() {
    return this.currentSession?.displayName || null;
  }

  supports(feature) {
    switch (feature) {
      case 'event_creation':
      case 'server_side_publishing':
      case 'role_based_access':
        return true;
      case 'signing':
      case 'direct_publishing':
        return false;
      default:
        return false;
    }
  }

  getPriority() {
    return 30; // Highest priority for enterprise SSO
  }

  async destroy() {
    await this.logout();
    this.currentSession = null;
  }
}

// Usage example:
// import { KeycloakAuthPlugin } from './auth/KeycloakAuthPlugin.js';
// import { authRegistry } from './auth/AuthPluginInterface.js';
// 
// const keycloakPlugin = new KeycloakAuthPlugin({
//   serverBase: '/api',
//   keycloak: {
//     url: 'https://auth.company.com',
//     realm: 'company-realm',
//     clientId: 'calendar-app'
//   }
// });
// 
// authRegistry.register('keycloak', keycloakPlugin);