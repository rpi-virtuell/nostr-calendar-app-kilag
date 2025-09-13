/**
 * WordPress SSO Integration für Nostr Calendar
 */
class WordPressSSO {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.calendarIdentity = null;
    this.source = null;
  }

  /**
   * Prüft WordPress SSO Status beim Laden der App
   */
  async checkSSO() {
    try {
      // URL Parameter prüfen
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('wp_sso') === 'success') {
        console.log('[WP-SSO] Success parameter detected, checking status...');
      }

      const response = await fetch('/wp-sso-status', {
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (response.ok) {
        this.user = result.wp_user;
        this.isAuthenticated = true;
        this.calendarIdentity = result.calendar_identity;
        this.source = result.source;
        
        console.log('[WP-SSO] WordPress user authenticated:', this.user);
        return result;
      } else {
        this.user = null;
        this.isAuthenticated = false;
        return null;
      }
    } catch (e) {
      console.error('[WP-SSO] Status check failed:', e);
      this.user = null;
      this.isAuthenticated = false;
      return null;
    }
  }

  /**
   * Erstellt Calendar Event als WordPress User
   */
  async createCalendarEvent(eventData) {
    if (!this.isAuthenticated) {
      throw new Error('WordPress user not authenticated');
    }

    try {
      const response = await fetch('/wp-calendar/event', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
      });

      const result = await response.json();

      if (response.ok) {
        console.log('[WP-SSO] Event created successfully:', result);
        return result;
      } else {
        throw new Error(result.error || 'Event creation failed');
      }
    } catch (e) {
      console.error('[WP-SSO] Event creation failed:', e);
      throw e;
    }
  }

  /**
   * Logout von WordPress SSO
   */
  async logout() {
    try {
      const response = await fetch('/wp-logout', {
        method: 'POST',
        credentials: 'include'
      });

      this.user = null;
      this.isAuthenticated = false;
      this.calendarIdentity = null;
      this.source = null;

      console.log('[WP-SSO] Logged out successfully');
      
      // Redirect zur WordPress Site oder Reload
      window.location.href = '/';
      
    } catch (e) {
      console.error('[WP-SSO] Logout failed:', e);
    }
  }

  /**
   * Aktueller WordPress User
   */
  getCurrentUser() {
    return {
      user: this.user,
      isAuthenticated: this.isAuthenticated,
      calendarIdentity: this.calendarIdentity,
      source: this.source
    };
  }

  /**
   * WordPress User Informationen anzeigen
   */
  getUserDisplayInfo() {
    if (!this.user) return null;

    return {
      displayName: this.user.display_name || this.user.username,
      username: this.user.username,
      email: this.user.email,
      roles: this.user.roles || [],
      site: this.user.wp_site_url,
      loginTime: this.user.authenticated_at
    };
  }
}

// Global instance
const wpSSO = new WordPressSSO();

// Auto-Export
export { wpSSO };