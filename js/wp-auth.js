// js/wp-auth.js
// WordPress-style authentication (no NIP-07 needed)

export class WordPressAuth {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
  }

  /**
   * Simulate WordPress login (in production, this would come from WordPress)
   */
  async loginAsWordPressUser(username, userInfo = {}) {
    try {
      const wp_user_data = {
        user_id: userInfo.id || Math.floor(Math.random() * 10000),
        username: username,
        email: userInfo.email || `${username}@example.com`,
        wp_token: 'demo-token-' + Math.random().toString(36),
        wp_nonce: 'demo-nonce-' + Date.now()
      };

      const response = await fetch('http://localhost:8787/wp-auth', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wp_user_data)
      });

      const result = await response.json();

      if (response.ok) {
        this.user = result.user;
        this.isAuthenticated = true;
        this.calendarIdentity = result.calendar_identity;
        
        console.log('[WP-Auth] Login successful:', result);
        return result;
      } else {
        throw new Error(result.error || 'WordPress authentication failed');
      }
    } catch (e) {
      console.error('[WP-Auth] Login failed:', e);
      throw e;
    }
  }

  /**
   * Check current authentication status
   */
  async checkAuth() {
    try {
      const response = await fetch('http://localhost:8787/wp-me', {
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        this.user = result.wp_user;
        this.isAuthenticated = true;
        this.calendarIdentity = result.calendar_identity;
        return result;
      } else {
        this.user = null;
        this.isAuthenticated = false;
        return null;
      }
    } catch (e) {
      console.error('[WP-Auth] Auth check failed:', e);
      this.user = null;
      this.isAuthenticated = false;
      return null;
    }
  }

  /**
   * Create calendar event (server-side signing as Johan)
   */
  async createCalendarEvent(eventData) {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch('http://localhost:8787/wp-calendar/event', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });

      const result = await response.json();

      if (response.ok) {
        console.log('[WP-Auth] Event created:', result);
        return result;
      } else {
        throw new Error(result.error || 'Event creation failed');
      }
    } catch (e) {
      console.error('[WP-Auth] Event creation failed:', e);
      throw e;
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      await fetch('http://localhost:8787/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      console.warn('[WP-Auth] Logout request failed:', e);
    }
    
    this.user = null;
    this.isAuthenticated = false;
    this.calendarIdentity = null;
  }

  /**
   * Get current user info
   */
  getCurrentUser() {
    return {
      user: this.user,
      isAuthenticated: this.isAuthenticated,
      calendarIdentity: this.calendarIdentity
    };
  }
}

// Global instance
export const wpAuth = new WordPressAuth();