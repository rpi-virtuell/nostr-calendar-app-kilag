// js/auth/WordPressAuthPlugin.js
// WordPress SSO authentication plugin

import { AuthPluginInterface } from './AuthPluginInterface.js';

export class WordPressAuthPlugin extends AuthPluginInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'wordpress';
    this.displayName = 'WordPress SSO';
    this.wpSiteUrl = config.wpSiteUrl || 'https://test1.rpi-virtuell.de';
    this.currentSession = null;
  }

  async initialize() {
    console.log('[WordPressAuth] Initializing WordPress SSO plugin');
    
    // Check for SSO success parameters first
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('wp_sso') === 'success') {
        console.log('[WordPressAuth] SSO success detected in URL');
        
        // Check if we have a valid session in localStorage
        const sessionData = localStorage.getItem('wp_sso_session');
        if (sessionData) {
          try {
            const session = JSON.parse(sessionData);
            if (Date.now() / 1000 < session.expires) {
              // Normalize calendar_identity.pubkey to match server algorithm
              try {
                if (session.user && session.user.id) {
                  const siteUrl = session.site_url || session.wp_site_url || this.wpSiteUrl;
                  const expectedPub = await this.generateDeterministicPubkey(session.user.id, siteUrl);
                  if (!session.calendar_identity) session.calendar_identity = {};
                  if (!session.calendar_identity.pubkey || session.calendar_identity.pubkey !== expectedPub) {
                    session.calendar_identity.pubkey = expectedPub;
                    localStorage.setItem('wp_sso_session', JSON.stringify(session));
                  }
                }
              } catch (e) {
                console.debug('[WordPressAuth] Error normalizing session pubkey during init:', e);
              }

              this.currentSession = session;
              console.log('[WordPressAuth] Valid SSO session found, user logged in:', session.user.username);
            }
          } catch (e) {
            console.warn('[WordPressAuth] Invalid session data in localStorage');
          }
        }
        
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

    // Check for WordPress SSO session in localStorage if not already set
    if (!this.currentSession) {
      await this.checkLocalSession();
    }
  }

  async isLoggedIn() {
    const session = await this.getSession();
    return session !== null;
  }

  async getIdentity() {
    const session = await this.getSession();
    if (!session) {
      return null;
    }

    // Handle different session structures
    const user = session.user || session.wp_user;
    const calendarIdentity = session.calendar_identity;
    
    if (!user) {
      console.error('[WordPressAuth] getIdentity: No user data in session');
      return null;
    }

    const identity = {
      pubkey: calendarIdentity?.pubkey || await this.generateDeterministicPubkey(user.id, session.site_url || session.wp_site_url),
      user: user,
      wpUser: user, // backwards compatibility
  calendarIdentity: calendarIdentity || {
  pubkey: await this.generateDeterministicPubkey(user.id, session.site_url || session.wp_site_url),
        name: user.display_name || user.username,
        about: `WordPress user from ${session.site_url || session.wp_site_url}`,
        nip05: `${user.username}@${new URL(session.site_url || session.wp_site_url).hostname}`
      },
      displayName: user.display_name || user.username,
      provider: 'wordpress',
      method: 'wordpress_sso',
      supports: {
        signing: false,
        eventCreation: true,
        serverSidePublishing: true
      }
    };

    return identity;
  }

  async login(credentials = {}) {
    const { token } = credentials;
    
    if (!token) {
      throw new Error('WordPress SSO token required for login');
    }

    try {
      // For client-side SSO, we process the token directly
      const tokenParts = token.split('.');
      if (tokenParts.length !== 2) {
        throw new Error('Ungültiges Token-Format');
      }

      const [tokenData, signature] = tokenParts;
      let payload;
      
      try {
        payload = JSON.parse(atob(tokenData));
      } catch (e) {
        throw new Error('Token konnte nicht dekodiert werden');
      }

      // Check if token is expired
      if (Date.now() / 1000 > payload.expires) {
        throw new Error('Token ist abgelaufen');
      }

      // Create session data
      const sessionData = {
        type: 'wordpress_sso',
        token: token,
        user: {
          id: payload.wp_user_id,
          username: payload.wp_username,
          email: payload.wp_email,
          display_name: payload.wp_display_name,
          roles: payload.wp_roles
        },
        site_url: payload.wp_site_url,
        timestamp: payload.timestamp,
        expires: payload.expires,
        authenticated_at: Date.now(),
        // Generate a calendar identity for this WordPress user
        calendar_identity: {
            pubkey: await this.generateDeterministicPubkey(payload.wp_user_id, payload.wp_site_url),
            name: payload.wp_display_name || payload.wp_username,
            about: `WordPress user from ${payload.wp_site_url}`,
            nip05: `${payload.wp_username}@${new URL(payload.wp_site_url).hostname}`
          }
      };

      // Store in localStorage and memory
      localStorage.setItem('wp_sso_session', JSON.stringify(sessionData));
      this.currentSession = sessionData;

      console.log('[WordPressAuth] Login successful:', sessionData.user.username);
      
      return {
        success: true,
        method: 'wordpress_sso',
        user: sessionData.user,
        calendarIdentity: sessionData.calendar_identity,
        provider: 'wordpress'
      };
    } catch (error) {
      console.error('[WordPressAuth] Login failed:', error);
      throw error;
    }
  }

  async logout() {
    console.log('[WordPressAuth] Logging out from WordPress SSO');
    
    // Clear localStorage
    localStorage.removeItem('wp_sso_session');
    this.currentSession = null;
  }

  async createEvent(eventData) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress SSO');
    }

    try {
      // Prepare the event data for WordPress API
      const apiEventData = {
        title: eventData.title,
        content: eventData.content || '',
        starts: eventData.starts,
        ends: eventData.ends || '',
        location: eventData.location || ''
      };

      // Get the WordPress site URL from session
      const wpSiteUrl = this.currentSession.site_url || this.currentSession.wp_site_url;
      let apiUrl = `${wpSiteUrl}/wp-json/nostr-calendar/v1/events`;

      // Add SSO token to request if available
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(apiEventData)
      };

      // Try to use SSO token for authentication
      const storedSession = localStorage.getItem('wp_sso_session');
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData.token && Date.now() / 1000 < sessionData.expires) {
            apiUrl += `?sso_token=${encodeURIComponent(sessionData.token)}`;
          }
        } catch (e) {
          console.debug('[WordPressAuth] Error parsing stored session');
        }
      }

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WordPressAuth] Event creation failed:', response.status, errorText);
        throw new Error(`Failed to create event: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      return {
        ok: true,
        event: result.event,
        message: result.message || 'Event created successfully'
      };

    } catch (error) {
      console.error('[WordPressAuth] Event creation error:', error);
      throw error;
    }
  }

  async deleteEvent(eventId) {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress SSO');
    }

    try {
      // Get the WordPress site URL from session
      const wpSiteUrl = this.currentSession.site_url || this.currentSession.wp_site_url;
      let apiUrl = `${wpSiteUrl}/wp-json/nostr-calendar/v1/events/${encodeURIComponent(eventId)}`;

      // Add SSO token to request if available
      const fetchOptions = {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      // Try to use SSO token for authentication
      const storedSession = localStorage.getItem('wp_sso_session');
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData.token && Date.now() / 1000 < sessionData.expires) {
            apiUrl += `?sso_token=${encodeURIComponent(sessionData.token)}`;
          }
        } catch (e) {
          console.debug('[WordPressAuth] Error parsing stored session');
        }
      }

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WordPressAuth] Event deletion failed:', response.status, errorText);
        throw new Error(`Failed to delete event: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      return {
        ok: true,
        message: result.message || 'Event deleted successfully'
      };

    } catch (error) {
      console.error('[WordPressAuth] Event deletion error:', error);
      throw error;
    }
  }

  async getEvents() {
    if (!await this.isLoggedIn()) {
      throw new Error('Not logged in to WordPress SSO');
    }

    try {
      // Get the WordPress site URL from session
      const wpSiteUrl = this.currentSession.site_url || this.currentSession.wp_site_url;
      let apiUrl = `${wpSiteUrl}/wp-json/nostr-calendar/v1/events`;

      // Add SSO token to request if available
      const fetchOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      };

      // Try to use SSO token for authentication
      const storedSession = localStorage.getItem('wp_sso_session');
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData.token && Date.now() / 1000 < sessionData.expires) {
            apiUrl += `?sso_token=${encodeURIComponent(sessionData.token)}`;
          }
        } catch (e) {
          console.debug('[WordPressAuth] Error parsing stored session');
        }
      }

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[WordPressAuth] Getting events failed:', response.status, errorText);
        throw new Error(`Failed to get events: ${response.status} ${errorText}`);
      }

      const result = await response.json();

      // Convert WordPress events to the format expected by the calendar
      const events = result.events ? Object.values(result.events) : [];
      return events;

    } catch (error) {
      console.error('[WordPressAuth] Get events error:', error);
      throw error;
    }
  }

  async updateAuthUI(elements) {
    const { whoami, btnLogin, btnLogout, btnNew, btnLoginMenu } = elements;
    
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
    // First check localStorage for WordPress SSO session
    const localSession = await this.checkLocalSession();
    if (localSession) {
      return localSession;
    }
    
    // Check WordPress site directly via REST API
    try {
      const fetchOptions = {
        credentials: 'include'
      };
      
      // If we have a stored session with token, include it as query parameter
      // (more reliable than headers for WordPress REST API)
      let apiUrl = `${this.wpSiteUrl}/wp-json/nostr-calendar/v1/me`;
      const storedSession = localStorage.getItem('wp_sso_session');
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData.token && Date.now() / 1000 < sessionData.expires) {
            // Use query parameter instead of header for better WordPress compatibility
            apiUrl += `?sso_token=${encodeURIComponent(sessionData.token)}`;
          }
        } catch (e) {
          console.debug('[WordPressAuth] Error parsing stored session');
        }
      }
      
      const response = await fetch(apiUrl, fetchOptions);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Create session from WordPress data
          const sessionData = {
            type: 'wordpress_direct',
            user: data.user,
            site_url: data.site_url,
            calendar_identity: data.calendar_identity,
            authenticated_at: Date.now(),
            expires: Math.floor(Date.now() / 1000) + (8 * 3600) // 8 hours from now
          };
          
          this.currentSession = sessionData;
          localStorage.setItem('wp_sso_session', JSON.stringify(sessionData));
          
          return sessionData;
        }
      }
    } catch (e) {
      console.debug('[WordPressAuth] No direct WordPress session available');
    }
    
    // No session found
    this.currentSession = null;
    return null;
  }

  async checkLocalSession() {
    try {
      const sessionData = localStorage.getItem('wp_sso_session');
      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData);
      
      // Check if session is expired
      if (Date.now() / 1000 > session.expires) {
        console.log('[WordPressAuth] Session expired, removing');
        localStorage.removeItem('wp_sso_session');
        return null;
      }

      // Session is valid
      // Ensure calendar_identity.pubkey matches deterministic algorithm
      try {
        if (session.user && session.user.id) {
          const siteUrl = session.site_url || session.wp_site_url || this.wpSiteUrl;
          const expectedPub = await this.generateDeterministicPubkey(session.user.id, siteUrl);
          if (!session.calendar_identity) session.calendar_identity = {};
          if (!session.calendar_identity.pubkey || session.calendar_identity.pubkey !== expectedPub) {
            session.calendar_identity.pubkey = expectedPub;
            localStorage.setItem('wp_sso_session', JSON.stringify(session));
            console.log('[WordPressAuth] Normalized local session pubkey for user:', session.user.username);
          }
        }
      } catch (e) {
        console.debug('[WordPressAuth] Error normalizing session pubkey:', e);
      }

      this.currentSession = session;
      console.log('[WordPressAuth] Found valid local session for:', session.user.username);
      return session;
      
    } catch (e) {
      console.warn('[WordPressAuth] Error checking local session:', e);
      localStorage.removeItem('wp_sso_session');
      return null;
    }
  }

  async generateDeterministicPubkey(userId, siteUrl) {
    // Generate deterministic pubkey matching PHP's hash('sha256', $input)
    const input = `wp-user-${userId}-${siteUrl}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(input);

    // Use WebCrypto to compute SHA-256
    const digest = await crypto.subtle.digest('SHA-256', data);

    // Convert ArrayBuffer to lowercase hex string
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }

    // Ensure 64-character lowercase hex (32 bytes)
    return hex.toLowerCase().slice(0, 64).padEnd(64, '0');
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