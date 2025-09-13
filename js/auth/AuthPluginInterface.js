// js/auth/AuthPluginInterface.js
// Interface definition for authentication plugins

/**
 * AuthPlugin Interface - defines the contract for authentication providers
 * 
 * This allows pluggable authentication systems (WordPress SSO, Keycloak, SAML, etc.)
 * while maintaining a consistent API for the application.
 */
export class AuthPluginInterface {
  constructor(config = {}) {
    this.config = config;
    this.name = 'base';
    this.displayName = 'Base Auth';
  }

  /**
   * Initialize the auth plugin
   * Called once during app startup
   */
  async initialize() {
    throw new Error('initialize() must be implemented by auth plugin');
  }

  /**
   * Check if user is currently authenticated
   * @returns {Promise<boolean>}
   */
  async isLoggedIn() {
    throw new Error('isLoggedIn() must be implemented by auth plugin');
  }

  /**
   * Get current user identity/session info
   * @returns {Promise<Object|null>} User identity object or null if not logged in
   */
  async getIdentity() {
    throw new Error('getIdentity() must be implemented by auth plugin');
  }

  /**
   * Perform login
   * @param {Object} credentials - Login credentials (varies by auth type)
   * @returns {Promise<Object>} Login result with user info
   */
  async login(credentials = {}) {
    throw new Error('login() must be implemented by auth plugin');
  }

  /**
   * Perform logout
   * @returns {Promise<void>}
   */
  async logout() {
    throw new Error('logout() must be implemented by auth plugin');
  }

  /**
   * Create a calendar event using this auth method
   * @param {Object} eventData - Event data to create
   * @returns {Promise<Object>} Created event result
   */
  async createEvent(eventData) {
    throw new Error('createEvent() must be implemented by auth plugin');
  }

  /**
   * Update UI elements for this auth plugin
   * @param {Object} elements - UI elements to update
   */
  updateAuthUI(elements) {
    // Default implementation - can be overridden
    console.log(`[${this.name}] updateAuthUI called`);
  }

  /**
   * Setup UI event handlers for this auth plugin
   * @param {Object} elements - UI elements to bind
   * @param {Function} onChange - Callback for auth state changes
   */
  setupUI(elements, onChange) {
    // Default implementation - can be overridden
    console.log(`[${this.name}] setupUI called`);
  }

  /**
   * Get the public key/identifier for this auth session
   * @returns {Promise<string|null>}
   */
  async getPublicKey() {
    const identity = await this.getIdentity();
    return identity?.pubkey || null;
  }

  /**
   * Get display name for current user
   * @returns {Promise<string|null>}
   */
  async getDisplayName() {
    const identity = await this.getIdentity();
    return identity?.displayName || identity?.username || null;
  }

  /**
   * Check if this auth plugin supports certain features
   * @param {string} feature - Feature to check ('event_creation', 'signing', etc.)
   * @returns {boolean}
   */
  supports(feature) {
    return false; // Default: no special features
  }

  /**
   * Get auth plugin priority (higher = preferred when multiple plugins available)
   * @returns {number}
   */
  getPriority() {
    return 0;
  }

  /**
   * Clean up resources when plugin is disabled/destroyed
   */
  async destroy() {
    // Default: no cleanup needed
  }
}

/**
 * Auth Plugin Registry - for registering and managing auth plugins
 */
export class AuthPluginRegistry {
  constructor() {
    this.plugins = new Map();
  }

  /**
   * Register an auth plugin
   * @param {string} name - Plugin name
   * @param {AuthPluginInterface} plugin - Plugin instance
   */
  register(name, plugin) {
    if (!(plugin instanceof AuthPluginInterface)) {
      throw new Error('Plugin must extend AuthPluginInterface');
    }
    this.plugins.set(name, plugin);
  }

  /**
   * Get a plugin by name
   * @param {string} name - Plugin name
   * @returns {AuthPluginInterface|null}
   */
  get(name) {
    return this.plugins.get(name) || null;
  }

  /**
   * Get all registered plugins
   * @returns {Array<AuthPluginInterface>}
   */
  getAll() {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all active (logged in) plugins
   * @returns {Promise<Array<AuthPluginInterface>>}
   */
  async getActive() {
    const active = [];
    for (const plugin of this.plugins.values()) {
      try {
        if (await plugin.isLoggedIn()) {
          active.push(plugin);
        }
      } catch (e) {
        console.warn(`[AuthRegistry] Error checking ${plugin.name}:`, e);
      }
    }
    return active.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Get the primary active auth plugin (highest priority)
   * @returns {Promise<AuthPluginInterface|null>}
   */
  async getPrimary() {
    const active = await this.getActive();
    return active[0] || null;
  }
}

// Global registry instance
export const authRegistry = new AuthPluginRegistry();