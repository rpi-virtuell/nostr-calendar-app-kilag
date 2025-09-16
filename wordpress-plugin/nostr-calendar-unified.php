<?php
/**
 * Plugin Name: Nostr Calendar - Unified Plugin
 * Plugin URI: https://github.com/johappel/nostr-calendar-app
 * Description: Ein WordPress Plugin für dezentrale Kalender-Events über das Nostr-Protokoll mit optionaler SSO-Integration
 * Version: 1.0.0
 * Author: johappel
 * Author URI: https://github.com/johappel
 * License: MIT
 * Text Domain: nostr-calendar
 * Domain Path: /languages
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('NOSTR_CALENDAR_VERSION', '1.0.0');
define('NOSTR_CALENDAR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('NOSTR_CALENDAR_PLUGIN_URL', plugin_dir_url(__FILE__));

// Composer autoload for Nostr PHP library
if (file_exists(NOSTR_CALENDAR_PLUGIN_DIR . 'vendor/autoload.php')) {
    require_once NOSTR_CALENDAR_PLUGIN_DIR . 'vendor/autoload.php';
}

/**
 * Main Plugin Class
 */
class NostrCalendarUnified {
    
    private $sso_enabled = false;
    private $shared_secret = '8afbcf017eee556056251b040a3e70f9e78720580a12b27d5f166bf750b3fe7f'; // Same as original SSO plugin
    private $calendar_app_url = 'https://test1.rpi-virtuell.de/nostr-calendar'; // In Produktion: Ihre Nostr Calendar Domain
    
    public function __construct() {
        add_action('init', [$this, 'init']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_enqueue_scripts', [$this, 'admin_enqueue_scripts']);
        
        // Plugin lifecycle hooks
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
        
        // Check if SSO is enabled
        $this->sso_enabled = get_option('nostr_calendar_sso_enabled', false);
        // error_log('[NostrCalendar] SSO enabled check: ' . ($this->sso_enabled ? 'YES' : 'NO'));
        
        // Initialize SSO features if enabled
        if ($this->sso_enabled) {
            // error_log('[NostrCalendar] Initializing SSO features');
            $this->init_sso_features();
            
            // Register REST API routes immediately like original SSO plugin
            add_action('rest_api_init', [$this, 'register_rest_routes']);
        } else {
            error_log('[NostrCalendar] SSO not enabled, skipping SSO features');
        }
    }
    
    public function init() {
        // Only initialize base REST API if SSO is disabled
        if (!$this->sso_enabled) {
            new NostrCalendarRestAPI();
        }
        
        // Initialize user identity management
        new NostrCalendarIdentity();
        
        // Load text domain
        load_plugin_textdomain('nostr-calendar', false, dirname(plugin_basename(__FILE__)) . '/languages');

        // Rewrite rule to serve single-page calendar app at /nostr-calendar
        add_rewrite_rule('^nostr-calendar/(.*)$', 'index.php?nostr_calendar=1&nostr_calendar_path=$matches[1]', 'top');
        add_rewrite_rule('^nostr-calendar/?$', 'index.php?nostr_calendar=1', 'top');
        add_filter('query_vars', function($vars) { 
            $vars[] = 'nostr_calendar'; 
            $vars[] = 'nostr_calendar_path'; 
            return $vars; 
        });
        add_action('template_redirect', [$this, 'serve_calendar_page']);
        
        // Initialize shortcodes
        $this->init_shortcodes();
        
        // AJAX endpoints for delegation management (always available)
        add_action('wp_ajax_get_nostr_delegations', [$this, 'ajax_get_nostr_delegations']);
        add_action('wp_ajax_save_nostr_delegation', [$this, 'ajax_save_nostr_delegation']);
        add_action('wp_ajax_remove_nostr_delegation', [$this, 'ajax_remove_nostr_delegation']);
        add_action('wp_ajax_test_nostr_sso_connection', [$this, 'ajax_test_sso_connection']);
        add_action('wp_ajax_save_delegator_profile', [$this, 'ajax_save_delegator_profile']);
    }
    
    /**
     * Initialize SSO-specific features
     */
    private function init_sso_features() {
        // SSO login/logout hooks
        add_action('wp_login', [$this, 'on_wp_login'], 10, 2);
        add_action('wp_logout', [$this, 'on_wp_logout']);
        
        // AJAX endpoints for SSO
        add_action('wp_ajax_get_nostr_token', [$this, 'ajax_get_nostr_token']);
        add_action('wp_ajax_nopriv_get_nostr_token', [$this, 'ajax_get_nostr_token_public']);
        
        error_log('[NostrCalendar] SSO features initialized');
    }
    
    public function enqueue_scripts() {
        // Only load on pages where calendar is displayed
        if (is_page() || is_single() || has_shortcode(get_post()->post_content ?? '', 'nostr_calendar')) {
            wp_enqueue_script(
                'nostr-calendar-app',
                NOSTR_CALENDAR_PLUGIN_URL . 'assets/js/app.js',
                [],
                NOSTR_CALENDAR_VERSION,
                true
            );
            
            wp_enqueue_style(
                'nostr-calendar-style',
                NOSTR_CALENDAR_PLUGIN_URL . 'assets/css/style.css',
                [],
                NOSTR_CALENDAR_VERSION
            );
            
            // Base configuration
            $config = [
                'apiUrl' => rest_url('nostr-calendar/v1/'),
                'nonce' => wp_create_nonce('wp_rest'),
                'currentUser' => wp_get_current_user(),
                'isLoggedIn' => is_user_logged_in(),
                'relays' => get_option('nostr_calendar_relays', [
                    'wss://relay.damus.io',
                    'wss://nos.lol'
                ])
            ];
            
            // Add SSO config if enabled
            if ($this->sso_enabled) {
                $config['sso'] = [
                    'enabled' => true,
                    'wpSiteUrl' => get_site_url(),
                    'loginUrl' => wp_login_url(),
                    'logoutUrl' => wp_logout_url()
                ];
            }
            
            // Localize script with WordPress data
            wp_localize_script('nostr-calendar-app', 'nostrCalendarWP', $config);
        }
    }
    
    public function admin_enqueue_scripts($hook) {
        if (strpos($hook, 'nostr-calendar') !== false) {
            wp_enqueue_script('jquery-ui-tabs');
            wp_enqueue_style('wp-jquery-ui-dialog');
            
            wp_enqueue_script(
                'nostr-calendar-admin',
                NOSTR_CALENDAR_PLUGIN_URL . 'assets/js/admin.js',
                ['jquery', 'jquery-ui-tabs'],
                NOSTR_CALENDAR_VERSION,
                true
            );
            
            wp_enqueue_style(
                'nostr-calendar-admin',
                NOSTR_CALENDAR_PLUGIN_URL . 'assets/css/admin.css',
                [],
                NOSTR_CALENDAR_VERSION
            );
            
            // Localize admin script with data
            wp_localize_script('nostr-calendar-admin', 'nostrCalendarAdmin', [
                'nonce' => wp_create_nonce('nostr_calendar_admin'),
                'delegationNonce' => wp_create_nonce('nostr_calendar_delegation'),
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'siteUrl' => get_site_url()
            ]);
        }
    }
    
    public function add_admin_menu() {
        add_options_page(
            __('Nostr Calendar Settings', 'nostr-calendar'),
            __('Nostr Calendar', 'nostr-calendar'),
            'manage_options',
            'nostr-calendar-unified',
            [$this, 'admin_page']
        );
    }
    
    public function admin_page() {
        // Handle form submissions
        if (isset($_POST['submit'])) {
            $this->handle_admin_form_submission();
        }
        
        // Get current settings
        $relays = get_option('nostr_calendar_relays', [
            'wss://relay.damus.io',
            'wss://nos.lol'
        ]);
        $sso_enabled = get_option('nostr_calendar_sso_enabled', false);
        $sso_settings = get_option('nostr_calendar_sso_settings', [
            'shared_secret' => '',
            'calendar_app_url' => get_site_url() . '/nostr-calendar'
        ]);
        
        // Generate shared secret if empty and SSO is enabled
        if ($sso_enabled && empty($sso_settings['shared_secret'])) {
            $sso_settings['shared_secret'] = bin2hex(random_bytes(32));
            update_option('nostr_calendar_sso_settings', $sso_settings);
        }
        
        // Get crypto status
        $crypto_status = NostrSimpleCrypto::get_crypto_status();
        $php_info = NostrSimpleCrypto::get_php_info();
        
        $this->render_admin_page($relays, $sso_enabled, $sso_settings, $crypto_status, $php_info);
    }
    
    private function handle_admin_form_submission() {
        $current_tab = $_POST['current_tab'] ?? 'calendar';
        
        switch ($current_tab) {
            case 'calendar':
                $relays = array_filter(array_map('trim', explode("\n", $_POST['relays'])));
                update_option('nostr_calendar_relays', $relays);
                $this->show_admin_notice(__('Kalender-Einstellungen gespeichert!', 'nostr-calendar'), 'success');
                break;
                
            case 'sso':
                $sso_enabled = isset($_POST['sso_enabled']);
                
                // Validate SSO settings if enabled
                if ($sso_enabled) {
                    $shared_secret = sanitize_text_field($_POST['shared_secret']);
                    $calendar_app_url = esc_url_raw($_POST['calendar_app_url']);
                    
                    // Validate required fields
                    if (empty($shared_secret)) {
                        // Auto-generate shared secret if empty
                        $shared_secret = bin2hex(random_bytes(32)); // 64 char hex string
                    } elseif (strlen($shared_secret) < 32) {
                        $this->show_admin_notice(__('Shared Secret muss mindestens 32 Zeichen lang sein!', 'nostr-calendar'), 'error');
                        break;
                    }
                    
                    if (empty($calendar_app_url) || !filter_var($calendar_app_url, FILTER_VALIDATE_URL)) {
                        $this->show_admin_notice(__('Eine gültige Calendar App URL ist erforderlich!', 'nostr-calendar'), 'error');
                        break;
                    }
                    
                    $sso_settings = [
                        'shared_secret' => $shared_secret,
                        'calendar_app_url' => $calendar_app_url
                    ];
                    update_option('nostr_calendar_sso_settings', $sso_settings);
                    
                    // Reload SSO features
                    $this->sso_enabled = true;
                    $this->init_sso_features();
                } else {
                    $this->sso_enabled = false;
                }
                
                update_option('nostr_calendar_sso_enabled', $sso_enabled);
                $this->show_admin_notice(__('SSO-Einstellungen gespeichert!', 'nostr-calendar'), 'success');
                break;
                
            case 'delegation':
                // Delegation handling is done via AJAX endpoints
                break;
                
            case 'advanced':
                // Handle advanced settings
                $this->show_admin_notice(__('Erweiterte Einstellungen gespeichert!', 'nostr-calendar'), 'success');
                break;
        }
    }
    
    private function show_admin_notice($message, $type = 'success') {
        echo '<div class="notice notice-' . esc_attr($type) . ' is-dismissible"><p>' . esc_html($message) . '</p></div>';
    }
    
    private function render_admin_page($relays, $sso_enabled, $sso_settings, $crypto_status, $php_info) {
        ?>
        <div class="wrap">
            <h1><?php _e('Nostr Calendar - Einstellungen', 'nostr-calendar'); ?></h1>
            
            <div id="nostr-calendar-tabs">
                <ul>
                    <li><a href="#tab-calendar">📅 <?php _e('Kalender', 'nostr-calendar'); ?></a></li>
                    <li><a href="#tab-sso">🔐 <?php _e('SSO Integration', 'nostr-calendar'); ?></a></li>
                    <li><a href="#tab-delegation">🔑 <?php _e('NIP-26 Delegationen', 'nostr-calendar'); ?></a></li>
                    <li><a href="#tab-advanced">⚙️ <?php _e('Erweitert', 'nostr-calendar'); ?></a></li>
                </ul>
                
                <!-- Calendar Tab -->
                <div id="tab-calendar">
                    <form method="post">
                        <input type="hidden" name="current_tab" value="calendar">
                        
                        <h2><?php _e('Kalender-Einstellungen', 'nostr-calendar'); ?></h2>
                        
                        <table class="form-table">
                            <tr>
                                <th scope="row"><?php _e('Nostr Relays', 'nostr-calendar'); ?></th>
                                <td>
                                    <textarea name="relays" rows="10" cols="50" class="large-text"><?php echo esc_textarea(implode("\n", $relays)); ?></textarea>
                                    <p class="description"><?php _e('Geben Sie eine Relay-URL pro Zeile ein (WebSocket-URLs beginnend mit wss://)', 'nostr-calendar'); ?></p>
                                </td>
                            </tr>
                        </table>
                        
                        <?php submit_button(__('Kalender-Einstellungen speichern', 'nostr-calendar')); ?>
                    </form>
                </div>
                
                <!-- SSO Tab -->
                <div id="tab-sso">
                    <form method="post">
                        <input type="hidden" name="current_tab" value="sso">
                        
                        <h2><?php _e('WordPress SSO Integration', 'nostr-calendar'); ?></h2>
                        
                        <table class="form-table">
                            <tr>
                                <th scope="row"><?php _e('SSO aktivieren', 'nostr-calendar'); ?></th>
                                <td>
                                    <label>
                                        <input type="checkbox" name="sso_enabled" value="1" <?php checked($sso_enabled); ?>>
                                        <?php _e('WordPress Single Sign-On für Nostr Calendar aktivieren', 'nostr-calendar'); ?>
                                    </label>
                                    <p class="description"><?php _e('Ermöglicht es WordPress-Benutzern, sich automatisch in der Nostr Calendar App anzumelden.', 'nostr-calendar'); ?></p>
                                </td>
                            </tr>
                            
                            <tr class="sso-field" style="<?php echo $sso_enabled ? '' : 'display:none;'; ?>">
                                <th scope="row"><?php _e('Shared Secret', 'nostr-calendar'); ?></th>
                                <td>
                                    <input type="text" name="shared_secret" value="<?php echo esc_attr($sso_settings['shared_secret']); ?>" class="large-text" required>
                                    <button type="button" id="generate-secret-btn" class="button"><?php _e('Neuen Secret generieren', 'nostr-calendar'); ?></button>
                                    <p class="description"><?php _e('Sicherheitsschlüssel für die SSO-Token-Validierung (mindestens 32 Zeichen erforderlich).', 'nostr-calendar'); ?></p>
                                </td>
                            </tr>
                            
                            <tr class="sso-field" style="<?php echo $sso_enabled ? '' : 'display:none;'; ?>">
                                <th scope="row"><?php _e('Calendar App URL', 'nostr-calendar'); ?></th>
                                <td>
                                    <input type="url" name="calendar_app_url" value="<?php echo esc_attr($sso_settings['calendar_app_url']); ?>" class="large-text" required>
                                    <button type="button" id="test-sso-btn" class="button"><?php _e('Verbindung testen', 'nostr-calendar'); ?></button>
                                    <p class="description"><?php _e('URL der Nostr Calendar App für SSO-Weiterleitungen.', 'nostr-calendar'); ?></p>
                                </td>
                            </tr>
                        </table>
                        
                        <?php submit_button(__('SSO-Einstellungen speichern', 'nostr-calendar')); ?>
                    </form>
                    
                    <?php if ($sso_enabled): ?>
                    <div class="sso-status">
                        <h3><?php _e('SSO Status', 'nostr-calendar'); ?></h3>
                        <p>✅ <?php _e('SSO-Integration ist aktiv', 'nostr-calendar'); ?></p>
                        <p><?php _e('Shortcode:', 'nostr-calendar'); ?> <code>[nostr_calendar sso="true"]</code></p>
                        
                        <h3><?php _e('Integration Testen', 'nostr-calendar'); ?></h3>
                        <?php if (is_user_logged_in()): ?>
                            <p><strong><?php _e('Aktueller User:', 'nostr-calendar'); ?></strong> <?php echo wp_get_current_user()->user_login; ?></p>
                            <button id="test-token" class="button"><?php _e('Token generieren & testen', 'nostr-calendar'); ?></button>
                            <div id="test-result"></div>
                            
                            <h3><?php _e('SSO Link', 'nostr-calendar'); ?></h3>
                            <p>
                                <?php _e('Direct SSO page for this calendar instance (with generated token):', 'nostr-calendar'); ?>
                            </p>
                            <?php 
                            $uid = get_current_user_id(); 
                            $this->ensure_user_pubkey_meta($uid);
                            $tok = $this->generate_nostr_token($uid);
                            $current_url = $sso_settings['calendar_app_url'];
                            ?>
                            <p>
                                <a href="<?php echo esc_url($current_url); ?>/wp-sso.html?token=<?php echo urlencode($tok); ?>" target="_blank"><?php echo esc_url($current_url); ?>/wp-sso.html?token=...</a>
                                <a href="<?php echo home_url(); ?>/wp-json/nostr-calendar/v1/me?sso_token=<?php echo urlencode($tok); ?>" target="_blank">rest api endpoint</a>
                            </p>
                        <?php else: ?>
                            <p><?php _e('Bitte melden Sie sich an, um die Integration zu testen.', 'nostr-calendar'); ?></p>
                        <?php endif; ?>
                    </div>
                    
                    <script>
                    document.getElementById('test-token')?.addEventListener('click', function() {
                        fetch('<?php echo admin_url('admin-ajax.php'); ?>', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: 'action=get_nostr_token'
                        })
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('test-result').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                        })
                        .catch(error => {
                            document.getElementById('test-result').innerHTML = '<p style="color: red;">Fehler: ' + error + '</p>';
                        });
                    });
                    </script>
                    <?php endif; ?>
                </div>
                
                <!-- NIP-26 Delegation Tab -->
                <div id="tab-delegation">
                    <h2><?php _e('NIP-26 Nostr Delegationen', 'nostr-calendar'); ?></h2>
                    
                    <?php 
                    // Load existing delegation blob for this blog (if any) - same logic as original SSO plugin
                    $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
                    $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
                    $stored_delegation = get_option($option_key, null);
                    $delegation_raw = '';
                    if (is_array($stored_delegation) && !empty($stored_delegation['blob'])) {
                        $delegation_raw = $stored_delegation['blob'];
                    }
                    ?>
                    
                    <!-- Inline module to import nostr-tools via ESM and expose as window.NostrTools -->
                    <script type="module">
                      try {
                        if (!window.NostrTools) {
                          const NT = await import('https://esm.sh/nostr-tools@2.8.1');
                          window.NostrTools = NT;
                          window.dispatchEvent(new CustomEvent('nostr-tools-ready', { detail: { version: '2.8.1' } }));
                          console.log('[delegation-admin] nostr-tools loaded via inline ESM');
                        }
                      } catch (e) {
                        console.warn('[delegation-admin] nostr-tools inline import failed', e);
                      }
                    </script>
                    
                    <!-- Delegation Display and Management Section -->
                    <div style="margin:12px 0; padding:12px; border:1px solid #e5e5e5; background:#fafafa;">
                        <h2 style="margin-top:0;">Delegation für dieses Blog</h2>
                        
                        <?php wp_nonce_field('nostr_calendar_delegation', '_wpnonce', false); ?>
                        
                        <?php if (is_array($stored_delegation) && !empty($stored_delegation['blob'])):
                            // Parse stored delegation for display
                            $raw = $stored_delegation['blob'];
                            $arr = json_decode($raw, true);
                            if (!is_array($arr)) { $arr = json_decode(str_replace("'", '"', $raw), true); }
                            if (is_array($arr) && count($arr) >= 4 && $arr[0] === 'delegation') {
                                $sig = $arr[1];
                                $conds = $arr[2];
                                $delegator = $arr[3];

                                // Parse conditions for human readable output
                                $conds_str = is_string($conds) ? $conds : '';
                                $parts = array_filter(array_map('trim', explode('&', $conds_str)));
                                $min_created = null; $max_created = null; $allowed_kinds = null;
                                foreach ($parts as $p) {
                                    if (strpos($p, 'created_at>') === 0) { $min_created = (int)substr($p, strlen('created_at>')); }
                                    elseif (strpos($p, 'created_at<') === 0) { $max_created = (int)substr($p, strlen('created_at<')); }
                                    elseif (strpos($p, 'kind=') === 0) {
                                        $vals = substr($p, strlen('kind='));
                                        $allowed_kinds = array_filter(array_map('intval', explode(',', $vals)));
                                    } elseif (strpos($p, 'kinds=') === 0) {
                                        $vals = substr($p, strlen('kinds='));
                                        $allowed_kinds = array_filter(array_map('intval', explode(',', $vals)));
                                    }
                                }
                                $saved_by_user = !empty($stored_delegation['saved_by']) ? get_user_by('id', (int)$stored_delegation['saved_by']) : null;
                                $saved_by_name = $saved_by_user ? ($saved_by_user->display_name ?: $saved_by_user->user_login) : 'unknown';
                                $saved_at = !empty($stored_delegation['saved_at']) ? date('Y-m-d H:i:s', (int)$stored_delegation['saved_at']) : '';

                                // Build external lookup links for "whoami" of delegator
                                $hex = $delegator;
                                ?>
                                <div style="margin-top:16px; padding:12px; border:1px dashed #ccc; background:#fff;">
                                    <h3 style="margin-top:0;">Gespeicherte Delegation (aktiver Status)</h3>
                                    <table class="widefat striped" style="margin-top:8px;">
                                        <tbody>
                                            <tr>
                                                <th style="width:220px;">Delegator Pubkey (hex)</th>
                                                <td>
                                                    <code><?php echo esc_html($hex); ?></code>
                                                    <div style="margin-top:6px; font-size:12px;">
                                                        <span id="delegator-profile-info-<?php echo esc_attr($hex); ?>" style="color:#666;">
                                                            Profil wird geladen...
                                                        </span>
                                                    </div>
                                                    
                                                </td>
                                            </tr>
                                            <tr>
                                                <th>Signatur</th>
                                                <td><code><?php echo esc_html($sig); ?></code></td>
                                            </tr>
                                            <tr>
                                                <th>Bedingungen (roh)</th>
                                                <td><code><?php echo esc_html($conds_str); ?></code></td>
                                            </tr>
                                            <tr>
                                                <th>Bedingungen (interpretiert)</th>
                                                <td>
                                                    <ul style="margin:0; padding-left:18px;">
                                                        <?php if ($min_created !== null): ?>
                                                            <li>created_at > <?php echo (int)$min_created; ?> (<?php echo esc_html(date('Y-m-d H:i:s', (int)$min_created)); ?>)</li>
                                                        <?php endif; ?>
                                                        <?php if ($max_created !== null): ?>
                                                            <li>created_at < <?php echo (int)$max_created; ?> (<?php echo esc_html(date('Y-m-d H:i:s', (int)$max_created)); ?>)</li>
                                                        <?php endif; ?>
                                                        <?php if (is_array($allowed_kinds)): ?>
                                                            <li>erlaubte kinds: <?php echo esc_html(implode(', ', $allowed_kinds)); ?></li>
                                                        <?php else: ?>
                                                            <li>erlaubte kinds: keine Einschränkung angegeben</li>
                                                        <?php endif; ?>
                                                    </ul>
                                                </td>
                                            </tr>
                                            <tr>
                                                <th>Gespeichert</th>
                                                <td>von <strong><?php echo esc_html($saved_by_name); ?></strong> am <?php echo esc_html($saved_at); ?></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p class="description" style="margin-top:8px;">
                                        Das Profil des Delegators wird automatisch über Nostr-Relays ermittelt.
                                        Die externen Links bieten alternative Ansichten.
                                    </p>
                                </div>
                                
                                <!-- JavaScript für automatische Profil-Ermittlung -->
                                <script type="module">
                                  // Warte auf nostr-tools
                                  const waitForNostrTools = () => {
                                    return new Promise((resolve) => {
                                      if (window.NostrTools) {
                                        resolve(window.NostrTools);
                                      } else {
                                        window.addEventListener('nostr-tools-ready', () => resolve(window.NostrTools));
                                      }
                                    });
                                  };
                                  
                                  // Profil-Ermittlung basierend auf author.js
                                  async function loadDelegatorProfile(hex) {
                                    try {
                                      const NostrTools = await waitForNostrTools();
                                      const { SimplePool } = NostrTools;
                                      
                                      const pool = new SimplePool();
                                      const relays = [
                                        'wss://relay.damus.io',
                                        'wss://relay.snort.social', 
                                        'wss://nostr.wine',
                                        'wss://nos.lol',
                                        'wss://relay.nostr.band'
                                      ];
                                      
                                      // Lade Profil-Event (kind 0)
                                      const event = await pool.get(relays, {
                                        authors: [hex],
                                        kinds: [0],
                                      });
                                      
                                      if (event && event.content) {
                                        const meta = JSON.parse(event.content);
                                        const name = meta.display_name || meta.name || 'Unbekannt';
                                        const about = meta.about ? ` (${meta.about.substring(0, 100)}${meta.about.length > 100 ? '...' : ''})` : '';
                                        
                                        return { name, about, picture: meta.picture };
                                      } else {
                                        return null;
                                      }
                                    } catch (error) {
                                      console.warn('Fehler beim Laden des Delegator-Profils:', error);
                                      return null;
                                    }
                                  }
                                  
                                  // Lade Profil für den aktuellen Delegator
                                  const delegatorHex = '<?php echo esc_js($hex); ?>';
                                  const profileElement = document.getElementById('delegator-profile-info-' + delegatorHex);
                                  
                                  if (profileElement) {
                                    loadDelegatorProfile(delegatorHex).then(profile => {
                                      if (profile) {
                                        profileElement.innerHTML = `
                                          <strong style="color:#333;">${profile.name}</strong>${profile.about}
                                          ${profile.picture ? `<br><img src="${profile.picture}" style="width:32px; height:32px; border-radius:16px; margin-top:4px;" alt="Avatar">` : ''}
                                        `;
                                        
                                        // Speichere das ermittelte Profil serverseitig für die REST API
                                        const formData = new FormData();
                                        formData.append('action', 'save_delegator_profile');
                                        formData.append('delegator_pubkey', delegatorHex);
                                        formData.append('profile_name', profile.name);
                                        formData.append('profile_about', profile.about || '');
                                        formData.append('profile_picture', profile.picture || '');
                                        formData.append('_wpnonce', '<?php echo wp_create_nonce('nostr_calendar_delegation'); ?>');
                                        
                                        fetch('<?php echo admin_url('admin-ajax.php'); ?>', {
                                          method: 'POST',
                                          body: formData
                                        }).then(response => response.json())
                                        .then(data => {
                                          if (data.success) {
                                            console.log('Delegator profile saved successfully:', data.data.profile);
                                          } else {
                                            console.warn('Failed to save delegator profile:', data.data);
                                          }
                                        }).catch(error => {
                                          console.warn('Error saving delegator profile:', error);
                                        });
                                        
                                      } else {
                                        profileElement.innerHTML = '<span style="color:#999;">Profil nicht gefunden</span>';
                                      }
                                    }).catch(() => {
                                      profileElement.innerHTML = '<span style="color:#cc0000;">Fehler beim Laden des Profils</span>';
                                    });
                                  }
                                </script>
                                <?php
                            } else {
                                echo '<p style="color:#cc0000; margin-top:10px;">Gespeicherter Delegation‑Eintrag ist nicht im erwarteten Format.</p>';
                            }
                        endif; ?>
                    
                    <!-- nostr-tools Script for delegation generation -->
                    <script type="module">
                      try {
                        if (!window.NostrTools) {
                          const NT = await import('https://esm.sh/nostr-tools@2.8.1');
                          window.NostrTools = NT;
                          window.dispatchEvent(new CustomEvent('nostr-tools-ready', { detail: { version: '2.8.1' } }));
                          console.log('[delegation-admin] nostr-tools loaded via inline ESM');
                        }
                      } catch (e) {
                        console.warn('[delegation-admin] nostr-tools inline import failed', e);
                      }
                    </script>
                        
                        <div style="margin-top:10px;">
                            <p class="description">Erzeuge die Delegation extern (z. B. auf <a href="https://nostrtool.com/" target="_blank" rel="noopener">nostrtool.com</a>), kopiere den Delegation-Tag und füge ihn hier ein. Das Plugin validiert das Tag und speichert nur den Delegation-Blob (kein nsec).</p>
                            <label for="delegation_blob"><strong>Delegation (JSON array)</strong></label><br/>
                            <textarea id="delegation_blob" rows="6" cols="80" style="width:100%;" placeholder="['delegation','<sig>','created_at>...','<delegator_pub>']"><?php echo esc_textarea($delegation_raw); ?></textarea>
                            <p style="margin-top:8px;"><strong>Oder</strong> lade eine Datei mit dem Delegation-Tag hoch:</p>
                            <input type="file" id="delegation_file" accept=".txt,.json" />
                        </div>
                        <div id="delegation-validation-result" style="margin-top:12px;"></div>
                        <p style="margin-top:8px;">
                            <button id="save-delegation" class="button button-primary" disabled>Save Delegation</button>
                            <button id="remove-delegation" class="button">Remove Delegation</button>
                        </p>
                    </div>
                    
                    <!-- Generator: In‑Browser NIP-26 Delegation Creator -->
                    <div style="margin:16px 0; padding:12px; border:1px solid #e5e5e5; background:#fefefe;">
                        <h2 style="margin-top:0;">Delegation erzeugen (im Browser)</h2>
                        <p class="description">
                            Erzeuge einen signierten Delegation‑Tag. Der Prozess läuft sicher und lokal nur in deinem Browser. Der nsec wird nicht hochgeladen oder gespeichert.
                        </p>
                        <table class="form-table">
                            <tr>
                                <th scope="row">Delegator nsec (privater Schlüssel)</th>
                                <td>
                                    <input type="password" id="gen_delegator_nsec" class="regular-text" placeholder="nsec1..." autocomplete="off" />
                                    <button type="button" class="button" id="gen_btn_new_nsec">Neuen Schlüssel erzeugen</button>
                                    <p class="description">Optional einen vorhandenen nsec einfügen oder einen neuen erzeugen.</p>
                                    <div id="gen_delegator_info" style="margin-top:6px; font-size:12px; color:#333;"></div>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Delegatee Pubkey (hex)</th>
                                <td>
                                    <input type="text" id="gen_delegatee_pub" class="regular-text" placeholder="64‑hex pubkey des Delegatee (Server/Bot)" />
                                    <button type="button" class="button" id="gen_btn_delegatee_new">Delegatee-Schlüssel erzeugen</button>
                                    <p class="description">Pubkey (hex) des Accounts, der Events im Auftrag veröffentlichen soll. Du kannst hier ein neues Schlüsselpaar erzeugen. Bewahre den zugehörigen privaten Schlüssel (nsec) sicher auf; er wird NICHT gespeichert.</p>
                                    <div id="gen_delegatee_info" style="margin-top:6px; font-size:12px; color:#333;"></div>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Erlaubte Kinds</th>
                                <td>
                                    <input type="text" id="gen_kinds" class="regular-text" placeholder="z.B. 1,31923" />
                                    <p class="description">Kommagetrennte Kind‑Nummern. Leer lassen für keine Einschränkung.</p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">Zeitfenster</th>
                                <td>
                                    <label>created_at > <input type="number" id="gen_since" style="width:160px;" placeholder="UNIX timestamp (since)"></label>
                                    &nbsp;&nbsp;
                                    <label>created_at < <input type="number" id="gen_until" style="width:160px;" placeholder="UNIX timestamp (until)"></label>
                                    <button type="button" class="button" id="gen_btn_fill_defaults">+3 Monate</button>
                                    <p class="description">UNIX‑Zeitstempel in Sekunden. Button setzt sinnvolle Standardwerte + 3 Monate ein. <span id="gen_until_info"></span></p>
                                </td>
                            </tr>
                        </table>
                        <p>
                            <button type="button" class="button button-primary" id="gen_btn_create">Delegation erzeugen</button>
                            <button type="button" class="button" id="gen_btn_copy_to_textarea">In Textfeld übernehmen</button>
                        </p>
                        <div id="gen_result" style="margin-top:8px; font-family:monospace; white-space:pre-wrap;"></div>
                    </div>
                </div>
                
                
                <!-- Advanced Tab -->
                <div id="tab-advanced">
                    <h2><?php _e('Erweiterte Einstellungen', 'nostr-calendar'); ?></h2>
                    
                    <?php if ($crypto_status['using_fallback']): ?>
                    <div class="notice notice-warning">
                        <p><strong><?php _e('Kryptographische Warnung:', 'nostr-calendar'); ?></strong></p>
                        <p><?php _e('Dieses Plugin verwendet vereinfachte Kryptographie (Entwicklungsmodus). Für den Produktivbetrieb installieren Sie bitte:', 'nostr-calendar'); ?></p>
                        <ul>
                            <li><code>ext-gmp</code> PHP-Erweiterung</li>
                            <li><code>kornrunner/secp256k1</code> via Composer</li>
                        </ul>
                        <p><?php _e('Aktueller Status:', 'nostr-calendar'); ?></p>
                        <ul>
                            <li>GMP Extension: <?php echo $crypto_status['has_gmp'] ? '✅ Installiert' : '❌ Fehlt'; ?></li>
                            <li>secp256k1 Extension: <?php echo $crypto_status['has_secp256k1_ext'] ? '✅ Verfügbar' : '❌ Fehlt'; ?></li>
                            <li>Composer Autoloader: <?php echo $crypto_status['has_autoloader'] ? '✅ Gefunden' : '❌ Fehlt'; ?></li>
                            <li>kornrunner/secp256k1: <?php echo $crypto_status['has_kornrunner'] ? '✅ Verfügbar' : '❌ Fehlt'; ?></li>
                        </ul>
                    </div>
                    <?php else: ?>
                    <div class="notice notice-success">
                        <p><strong><?php _e('Kryptographie-Status:', 'nostr-calendar'); ?></strong> ✅ Produktionsreife Krypto-Bibliotheken erkannt!</p>
                    </div>
                    <?php endif; ?>
                    
                    <div class="system-info">
                        <h3><?php _e('System-Information', 'nostr-calendar'); ?></h3>
                        <table class="widefat">
                            <tbody>
                                <tr><td><strong>Plugin Version:</strong></td><td><?php echo NOSTR_CALENDAR_VERSION; ?></td></tr>
                                <tr><td><strong>PHP Version:</strong></td><td><?php echo $php_info['php_version']; ?></td></tr>
                                <tr><td><strong>WordPress Version:</strong></td><td><?php echo get_bloginfo('version'); ?></td></tr>
                                <tr><td><strong>Calendar App URL:</strong></td><td><?php echo get_site_url() . '/nostr-calendar'; ?></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            $('#nostr-calendar-tabs').tabs();
        });
        </script>
        
        <style>
        .sso-status {
            background: #f0f8ff;
            border: 1px solid #0073aa;
            border-radius: 4px;
            padding: 15px;
            margin-top: 20px;
        }
        .system-info {
            margin-top: 20px;
        }
        .system-info table {
            max-width: 600px;
        }
        </style>
        <?php
    }
    
    /**
     * Initialize shortcodes
     */
    private function init_shortcodes() {
        add_shortcode('nostr_calendar', [$this, 'calendar_shortcode']);
    }
    
    /**
     * Calendar shortcode
     */
    public function calendar_shortcode($atts) {
        $atts = shortcode_atts([
            'sso' => 'auto',
            'height' => '600px',
            'view' => 'month'
        ], $atts);
        
        $sso_attr = '';
        if ($atts['sso'] === 'true' || ($atts['sso'] === 'auto' && $this->sso_enabled)) {
            $sso_attr = ' data-sso="enabled"';
        }
        
        return sprintf(
            '<div id="nostr-calendar-embed" style="height: %s;" data-view="%s"%s></div>',
            esc_attr($atts['height']),
            esc_attr($atts['view']),
            $sso_attr
        );
    }
    
    /**
     * Serve the plugin's single-page app when the rewrite rule matches.
     */
    public function serve_calendar_page() {
        if (get_query_var('nostr_calendar')) {
            $path = get_query_var('nostr_calendar_path');
            
            // If there's a specific file path requested
            if ($path) {
                $this->serve_static_file($path);
                return;
            }
            
            // No specific path - serve main index.html
            $this->serve_main_app();
        }
    }
    
    private function serve_static_file($path) {
        // Clean the path to prevent directory traversal
        $path = ltrim($path, '/');
        $path = str_replace(['../', './'], '', $path);
        
        // Define allowed files and their locations
        $file_candidates = [
            'wp-sso.html' => [
                NOSTR_CALENDAR_PLUGIN_DIR . 'assets/wp-sso.html',
            ],
            'wp-logout' => [
                NOSTR_CALENDAR_PLUGIN_DIR . 'assets/wp-logout.html',
            ],
            'index.html' => [
                NOSTR_CALENDAR_PLUGIN_DIR . 'assets/index.html',
            ]
        ];
        
        // Check if the requested file is in our allowed list
        if (isset($file_candidates[$path])) {
            foreach ($file_candidates[$path] as $file) {
                if (file_exists($file)) {
                    $this->serve_file($file, $path);
                    return;
                }
            }
        }
        
        // For any other files, try to serve them from the assets directory
        $generic_file = NOSTR_CALENDAR_PLUGIN_DIR . 'assets/' . $path;
        if (file_exists($generic_file) && is_file($generic_file)) {
            // Basic security check - only allow certain file types
            $allowed_extensions = ['html', 'css', 'js', 'json', 'txt'];
            $extension = pathinfo($path, PATHINFO_EXTENSION);
            
            if (in_array($extension, $allowed_extensions)) {
                $this->serve_file($generic_file, $path);
                return;
            }
        }
        
        // File not found or not allowed
        status_header(404);
        echo '<h1>Not Found</h1><p>The requested file was not found.</p>';
        exit;
    }
    
    private function serve_file($file, $path) {
        $content_types = [
            'html' => 'text/html; charset=utf-8',
            'css' => 'text/css',
            'js' => 'application/javascript',
            'json' => 'application/json',
            'txt' => 'text/plain'
        ];
        
        $extension = pathinfo($path, PATHINFO_EXTENSION);
        $content_type = $content_types[$extension] ?? 'text/plain';
        
        header('Content-Type: ' . $content_type);
        readfile($file);
        exit;
    }
    
    private function serve_main_app() {
        $candidates = [
            NOSTR_CALENDAR_PLUGIN_DIR . 'assets/index.html',
            dirname(NOSTR_CALENDAR_PLUGIN_DIR) . '/index.html'  // Root of nostr-calendar-app
        ];

        foreach ($candidates as $file) {
            if (file_exists($file)) {
                // Inject SSO configuration if enabled
                $content = file_get_contents($file);
                
                if ($this->sso_enabled) {
                    $sso_config = json_encode([
                        'enabled' => true,
                        'wpSiteUrl' => get_site_url(),
                        'features' => ['auto_login', 'server_side_publishing']
                    ]);
                    
                    $content = str_replace(
                        '</head>',
                        '<script>window.nostrCalendarSSO = ' . $sso_config . ';</script></head>',
                        $content
                    );
                }
                
                header('Content-Type: text/html; charset=utf-8');
                echo $content;
                exit;
            }
        }

        // If not found, return 404
        status_header(404);
        echo '<h1>Nostr Calendar</h1><p>Frontend not found in plugin folder.</p>';
        exit;
    }
    
    // SSO Methods (only loaded when SSO is enabled)
    public function on_wp_login($user_login, $user) {
        if (!$this->sso_enabled) return;
        
        // Generate SSO token for logged-in user
        $this->ensure_user_pubkey_meta($user->ID);
        $token = $this->generate_nostr_token($user->ID);
        set_transient('nostr_sso_' . $user->ID, $token, 3600); // 1 hour
    }
    
    public function on_wp_logout() {
        if (!$this->sso_enabled) return;
        
        $user_id = get_current_user_id();
        if ($user_id) {
            delete_transient('nostr_sso_' . $user_id);
        }
    }
    
    /**
     * AJAX Handler für Token-Anfrage (eingeloggte User)
     */
    public function ajax_get_nostr_token() {
        if (!is_user_logged_in()) {
            wp_die(json_encode(array('error' => 'not_logged_in')));
        }
        
        $user_id = get_current_user_id();
        // Ensure pubkey meta exists for this user
        $this->ensure_user_pubkey_meta($user_id);
        $token = $this->generate_nostr_token($user_id);
        
        if ($token) {
            wp_die(json_encode(array(
                'success' => true,
                'token' => $token,
                'calendar_url' => $this->calendar_app_url,
                'user' => array(
                    'id' => $user_id,
                    'username' => wp_get_current_user()->user_login,
                    'email' => wp_get_current_user()->user_email,
                    'display_name' => wp_get_current_user()->display_name
                )
            )));
        } else {
            wp_die(json_encode(array('error' => 'token_generation_failed')));
        }
    }
    
    /**
     * AJAX Handler für nicht-eingeloggte User
     */
    public function ajax_get_nostr_token_public() {
        wp_die(json_encode(array('error' => 'login_required')));
    }
    
    /**
     * Generiert sicheren Token für WordPress User
     */
    public function generate_nostr_token($user_id) {
        $user = get_user_by('id', $user_id);
        if (!$user) return false;
        
        $timestamp = time();
        $expires = $timestamp + (2 * 3600); // 2 Stunden gültig
        
        // Base payload
        $payload = array(
            'wp_user_id' => $user_id,
            'wp_username' => $user->user_login,
            'wp_email' => $user->user_email,
            'wp_display_name' => $user->display_name,
            'wp_roles' => $user->roles,
            'timestamp' => $timestamp,
            'expires' => $expires,
            'wp_site_url' => site_url()
        );
        
        // If a shared blog nsec exists, derive its pubkey and include it in the token payload
        $shared = get_option('nostr_calendar_shared_nsec', null);
        if ($shared && !empty($shared['ciphertext'])) {
            $nsec_plain = $this->decrypt_stored_nsec($shared['ciphertext']);
            if ($nsec_plain) {
                $blog_pub = null;
                // If NostrSimpleCrypto helper available, use it to derive public key
                if (class_exists('NostrSimpleCrypto') && method_exists('NostrSimpleCrypto', 'private_to_public')) {
                    try {
                        $blog_pub = NostrSimpleCrypto::private_to_public($nsec_plain);
                    } catch (Exception $e) {
                        $blog_pub = null;
                    }
                }
                // Fallback derivation if not available
                if (!$blog_pub) {
                    $blog_pub = hash('sha256', 'nostr-blog-' . $nsec_plain . '-' . site_url());
                }
    
                $payload['calendar_pubkey'] = $blog_pub;
                $payload['blog_pubkey'] = $blog_pub;
            }
        } else {
            // Default deterministic pubkey per user for backwards compatibility
            $payload['calendar_pubkey'] = $this->generate_deterministic_pubkey($user_id);
        }
    
        // Token mit HMAC signieren
        $token_data = base64_encode(json_encode($payload));
        $signature = hash_hmac('sha256', $token_data, $this->shared_secret);
        
        return $token_data . '.' . $signature;
    }

    /**
     * Save deterministic pubkey to usermeta for quick lookup
     */
    private function ensure_user_pubkey_meta($user_id) {
        $pub = $this->generate_deterministic_pubkey($user_id);
        if ($pub) {
            update_user_meta($user_id, 'nostr_calendar_pubkey', $pub);
        }
    }
    
    /**
     * Generiert deterministischen Pubkey für WordPress User
     */
    public function generate_deterministic_pubkey($user_id) {
        $input = 'wp-user-' . $user_id . '-' . site_url();
        return hash('sha256', $input);
    }
    
    /**
     * Decrypt stored nsec for token generation
     */
    private function decrypt_stored_nsec($blob) {
        try {
            $data = base64_decode($blob);
            $iv = substr($data, 0, 16);
            $ciphertext = substr($data, 16);
            // Derive same key as during encryption (password optional not stored, so rely on AUTH keys)
            $key_material = AUTH_SALT . '|' . AUTH_KEY . '|' . '' . '|' . site_url();
            $key = hash('sha256', $key_material, true);
            $plain = openssl_decrypt($ciphertext, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
            return $plain ?: null;
        } catch (Exception $e) {
            return null;
        }
    }
    
    /**
     * Registriert REST API Routen für die Nostr Calendar App
     */
    public function register_rest_routes() {
        // error_log('[NostrCalendar] Registering REST routes from unified plugin');
        
        register_rest_route('nostr-calendar/v1', '/me', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_user_info'),
            'permission_callback' => array($this, 'rest_permission_check')
        ));
        
        register_rest_route('nostr-calendar/v1', '/token', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_get_token'),
            'permission_callback' => array($this, 'rest_permission_check')
        ));
        
        register_rest_route('nostr-calendar/v1', '/debug', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_debug_auth'),
            'permission_callback' => '__return_true'
        ));
        
        // Event management endpoints
        register_rest_route('nostr-calendar/v1', '/events', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_events'),
            'permission_callback' => array($this, 'rest_permission_check')
        ));
        
        register_rest_route('nostr-calendar/v1', '/events', array(
            'methods' => 'POST',
            'callback' => array($this, 'rest_create_event'),
            'permission_callback' => array($this, 'rest_permission_check')
        ));
    }
    
    public function rest_permission_check() {
        // Debug logging
        // error_log('[NostrCalendar] rest_permission_check called');
        
        // Check for SSO token first (more reliable)
        $token = $this->get_request_token();
        // error_log('[NostrCalendar] Token found: ' . ($token ? 'YES' : 'NO'));
        
        if ($token) {
            $payload = $this->verify_token($token);
            // error_log('[NostrCalendar] Token valid: ' . ($payload ? 'YES' : 'NO'));
            if ($payload && $payload['wp_user_id']) {
                // Set current user temporarily for this request
                wp_set_current_user($payload['wp_user_id']);
                // error_log('[NostrCalendar] User set to: ' . $payload['wp_user_id']);
                return true;
            }
        }
        
        // Fallback to regular WordPress authentication
        $logged_in = is_user_logged_in();
        // error_log('[NostrCalendar] WordPress logged in: ' . ($logged_in ? 'YES' : 'NO'));
        return $logged_in;
    }
    
    /**
     * Helper function to get token from request
     */
    private function get_request_token() {
        // Check query parameter first (most reliable for WordPress)
        if (isset($_GET['sso_token'])) {
            // error_log('[NostrCalendar] Token found in GET: ' . substr($_GET['sso_token'], 0, 20) . '...');
            return sanitize_text_field($_GET['sso_token']);
        }
        
        // Check POST data
        if (isset($_POST['sso_token'])) {
            // error_log('[NostrCalendar] Token found in POST');
            return sanitize_text_field($_POST['sso_token']);
        }
        
        // Check Authorization header (multiple ways)
        $auth_header = null;
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            $auth_header = $headers['Authorization'] ?? $headers['authorization'] ?? null;
        }
        
        // Fallback for nginx/other servers
        if (!$auth_header && isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $auth_header = $_SERVER['HTTP_AUTHORIZATION'];
        }
        
        // Another fallback
        if (!$auth_header && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $auth_header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        }
        
        if ($auth_header && strpos($auth_header, 'Bearer ') === 0) {
            // error_log('[NostrCalendar] Token found in Authorization header');
            return substr($auth_header, 7);
        }
        
        error_log('[NostrCalendar] No token found anywhere');
        return null;
    }
    
    /**
     * Verifiziert Token (für Debugging/Testing)
     */
    public function verify_token($token) {
        // error_log('[NostrCalendar] Verifying token: ' . substr($token, 0, 20) . '...');
        
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            error_log('[NostrCalendar] Token format invalid - wrong number of parts: ' . count($parts));
            return false;
        }
        
        list($token_data, $signature) = $parts;
        
        // Signatur prüfen
        $expected_signature = hash_hmac('sha256', $token_data, $this->shared_secret);
        if (!hash_equals($expected_signature, $signature)) {
            error_log('[NostrCalendar] Token signature mismatch');
            error_log('[NostrCalendar] Expected: ' . $expected_signature);
            error_log('[NostrCalendar] Got: ' . $signature);
            error_log('[NostrCalendar] Shared secret: ' . $this->shared_secret);
            return false;
        }
        
        // Payload dekodieren
        $payload = json_decode(base64_decode($token_data), true);
        if (!$payload) {
            error_log('[NostrCalendar] Token payload decode failed');
            return false;
        }
        
        // Ablaufzeit prüfen
        if (isset($payload['expires']) && $payload['expires'] < time()) {
            error_log('[NostrCalendar] Token expired: ' . $payload['expires'] . ' < ' . time());
            return false;
        }
        
        // error_log('[NostrCalendar] Token valid for user: ' . $payload['wp_user_id']);
        return $payload;
    }
    
    /**
     * REST API Endpoint: Benutzer-Informationen abrufen
     */
    public function rest_get_user_info($request) {
        $user_id = get_current_user_id();
        $user = get_user_by('id', $user_id);
        
        if (!$user) {
            return new WP_Error('user_not_found', 'Benutzer nicht gefunden', array('status' => 404));
        }
        
        // Prefer stored usermeta pubkey if present
        $meta_pub = get_user_meta($user_id, 'nostr_calendar_pubkey', true);
        $pubkey = $meta_pub ? $meta_pub : $this->generate_deterministic_pubkey($user_id);

        // Check if a delegation is stored for this blog and include it in the response
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $stored_delegation = get_option($option_key, null);
        $delegation = null;
        if (is_array($stored_delegation) && !empty($stored_delegation['blob'])) {
            $raw = $stored_delegation['blob'];
            $arr = json_decode($raw, true);
            if (!is_array($arr)) {
                // fallback parse single quotes
                $arr = json_decode(str_replace("'", '"', $raw), true);
            }
            if (is_array($arr) && count($arr) >= 4 && $arr[0] === 'delegation') {
                $delegation = array(
                    'raw' => $raw,
                    'sig' => $arr[1],
                    'conds' => $arr[2],
                    'delegator' => $arr[3],
                    'saved_by' => $stored_delegation['saved_by'] ?? null,
                    'saved_at' => $stored_delegation['saved_at'] ?? null
                );
                
                // Load cached delegator profile if available
                $delegator_pubkey = $delegation['delegator'];
                $profile_option_key = 'nostr_calendar_delegator_profile_' . $blog_id . '_' . $delegator_pubkey;
                $cached_profile = get_option($profile_option_key, null);
                
                if ($cached_profile && is_array($cached_profile)) {
                    $delegation['delegator_profile'] = [
                        'name' => $cached_profile['name'] ?? 'Unbekannt',
                        'about' => $cached_profile['about'] ?? '',
                        'picture' => $cached_profile['picture'] ?? '',
                        'cached_at' => $cached_profile['cached_at'] ?? null
                    ];
                }
                
                // If delegation exists, prefer delegator as calendar_identity.pubkey to show the authority who delegated
                $pubkey = $delegation['delegator'];
            }
        }
 
        $response = array(
            'success' => true,
            'user' => array(
                'id' => $user_id,
                'username' => $user->user_login,
                'email' => $user->user_email,
                'display_name' => $user->display_name,
                'roles' => $user->roles
            ),
            'site_url' => site_url(),
            'calendar_identity' => array(
                'pubkey' => $pubkey,
                'name' => $user->display_name ?: $user->user_login,
                'about' => 'WordPress Benutzer von ' . site_url(),
                'nip05' => $user->user_login . '@' . parse_url(site_url(), PHP_URL_HOST)
            )
        );

        // If delegation exists and we have cached profile data, use delegator's name as calendar identity
        if ($delegation) {
            $response['calendar_identity']['delegation'] = $delegation;
            
            // Use delegator's profile name if available
            if (isset($delegation['delegator_profile']['name']) && !empty($delegation['delegator_profile']['name'])) {
                $response['calendar_identity']['name'] = $delegation['delegator_profile']['name'];
                $response['calendar_identity']['about'] = $delegation['delegator_profile']['about'] ?: 'Nostr Delegator';
                if (!empty($delegation['delegator_profile']['picture'])) {
                    $response['calendar_identity']['picture'] = $delegation['delegator_profile']['picture'];
                }
            }
        }

        return $response;
    }
    
    /**
     * REST API Endpoint: Token generieren
     */
    public function rest_get_token($request) {
        $user_id = get_current_user_id();
        $token = $this->generate_nostr_token($user_id);
        
        if ($token) {
            return array(
                'success' => true,
                'token' => $token
            );
        }
        
        return new WP_Error('token_failed', 'Token-Generierung fehlgeschlagen', array('status' => 500));
    }
    
    /**
     * REST API Endpoint: Debug authentication
     */
    public function rest_debug_auth($request) {
        return array(
            'authenticated' => is_user_logged_in(),
            'user_id' => get_current_user_id(),
            'token_present' => $this->get_request_token() !== null,
            'token_valid' => $this->get_request_token() ? (bool)$this->verify_token($this->get_request_token()) : false
        );
    }
    
    /**
     * REST API Endpoint: Events abrufen
     */
    public function rest_get_events($request) {
        // Simple implementation - in production this would query actual events
        return array(
            'success' => true,
            'events' => array(),
            'user_id' => get_current_user_id()
        );
    }
    
    /**
     * REST API Endpoint: Event erstellen
     */
    public function rest_create_event($request) {
        // Simple implementation - in production this would create actual events
        return array(
            'success' => true,
            'message' => 'Event würde erstellt werden',
            'user_id' => get_current_user_id()
        );
    }
    
    // NIP-26 Delegation Management Methods (Original from SSO Plugin)
    public function ajax_save_nostr_delegation() {
        if (!current_user_can('manage_options')) {
            wp_send_json(array('success' => false, 'error' => 'unauthorized'));
            exit;
        }
        check_admin_referer('nostr_calendar_delegation');
        $raw = isset($_POST['delegation']) ? trim(wp_unslash($_POST['delegation'])) : '';
        if (empty($raw)) {
            wp_send_json(array('success' => false, 'error' => 'empty_delegation'));
            exit;
        }

        // Basic validation: must be a JSON array with at least 4 elements and first = delegation
        $ok = false;
        $parsed = null;
        try {
            $arr = json_decode($raw, true);
            if (!is_array($arr)) {
                // try PHP-like single quotes fallback
                $fixed = str_replace("'", '"', $raw);
                $arr = json_decode($fixed, true);
            }
            if (is_array($arr) && count($arr) >= 4 && $arr[0] === 'delegation') {
                $parsed = array(
                    'sig' => $arr[1],
                    'conds' => $arr[2],
                    'delegator' => $arr[3]
                );
                $ok = true;
            }
        } catch (Exception $e) {
            $ok = false;
        }

        if (!$ok) {
            wp_send_json(array('success' => false, 'error' => 'invalid_format'));
            exit;
        }

        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $store = array(
            'blob' => $raw,
            'parsed' => $parsed,
            'saved_by' => get_current_user_id(),
            'saved_at' => time()
        );
        update_option($option_key, $store);
        wp_send_json(array('success' => true));
        exit;
    }

    public function ajax_remove_nostr_delegation() {
        if (!current_user_can('manage_options')) {
            wp_send_json(array('success' => false, 'error' => 'unauthorized'));
            exit;
        }
        check_admin_referer('nostr_calendar_delegation');
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        delete_option($option_key);
        wp_send_json(array('success' => true));
        exit;
    }

    public function ajax_get_nostr_delegations() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
        }
        
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $stored_delegation = get_option($option_key, null);
        
        $delegations = array();
        if (is_array($stored_delegation) && !empty($stored_delegation['blob'])) {
            $delegations[] = $stored_delegation;
        }
        
        wp_send_json_success(['delegations' => $delegations]);
    }
    
    public function ajax_test_sso_connection() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
        }
        
        $calendar_app_url = sanitize_text_field($_POST['calendar_app_url']);
        $shared_secret = sanitize_text_field($_POST['shared_secret']);
        
        if (empty($calendar_app_url) || empty($shared_secret)) {
            wp_send_json_error(['message' => 'Calendar App URL und Shared Secret sind erforderlich']);
        }
        
        // Test if URL is reachable
        $response = wp_remote_get($calendar_app_url, [
            'timeout' => 10,
            'headers' => [
                'User-Agent' => 'WordPress/Nostr-Calendar-Plugin'
            ]
        ]);
        
        if (is_wp_error($response)) {
            wp_send_json_error(['message' => 'Verbindung fehlgeschlagen: ' . $response->get_error_message()]);
        }
        
        $response_code = wp_remote_retrieve_response_code($response);
        if ($response_code !== 200) {
            wp_send_json_error(['message' => 'HTTP Error: ' . $response_code]);
        }
        
        // Test token generation
        $test_user = wp_get_current_user();
        $this->ensure_user_pubkey_meta($test_user->ID);
        $test_token = $this->generate_nostr_token($test_user->ID);
        
        if (empty($test_token)) {
            wp_send_json_error(['message' => 'Token-Generierung fehlgeschlagen']);
        }
        
        wp_send_json_success([
            'message' => 'SSO-Verbindung erfolgreich getestet!',
            'url_status' => 'OK',
            'token_generation' => 'OK'
        ]);
    }
    
    /**
     * AJAX Handler to save delegator profile information
     */
    public function ajax_save_delegator_profile() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
        }
        
        if (!check_ajax_referer('nostr_calendar_delegation', '_wpnonce', false)) {
            wp_send_json_error('Invalid nonce');
        }
        
        $delegator_pubkey = sanitize_text_field($_POST['delegator_pubkey'] ?? '');
        $profile_name = sanitize_text_field($_POST['profile_name'] ?? '');
        $profile_about = sanitize_text_field($_POST['profile_about'] ?? '');
        $profile_picture = esc_url_raw($_POST['profile_picture'] ?? '');
        
        if (empty($delegator_pubkey) || empty($profile_name)) {
            wp_send_json_error('Delegator pubkey and profile name are required');
        }
        
        // Store profile information linked to the current blog
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegator_profile_' . $blog_id . '_' . $delegator_pubkey;
        
        $profile_data = [
            'name' => $profile_name,
            'about' => $profile_about,
            'picture' => $profile_picture,
            'pubkey' => $delegator_pubkey,
            'cached_at' => time(),
            'blog_id' => $blog_id
        ];
        
        update_option($option_key, $profile_data);
        
        wp_send_json_success([
            'message' => 'Delegator profile saved successfully',
            'profile' => $profile_data
        ]);
    }
    
    public function activate() {
        // Create default options
        if (!get_option('nostr_calendar_relays')) {
            update_option('nostr_calendar_relays', [
                'wss://relay.damus.io',
                'wss://nos.lol'
            ]);
        }
        
        // Create user identity table
        $this->create_tables();
        
        // Flush rewrite rules
        flush_rewrite_rules();
    }
    
    public function deactivate() {
        // Cleanup if needed
        flush_rewrite_rules();
    }
    
    private function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Identities table
        $identities_table = $wpdb->prefix . 'nostr_calendar_identities';
        $identities_sql = "CREATE TABLE $identities_table (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            private_key varchar(64) NOT NULL,
            public_key varchar(64) NOT NULL,
            display_name varchar(255) DEFAULT '',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY user_id (user_id)
        ) $charset_collate;";
        
        // Events table
        $events_table = $wpdb->prefix . 'nostr_calendar_events';
        $events_sql = "CREATE TABLE $events_table (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            event_id varchar(64) NOT NULL,
            event_data longtext NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY event_id (event_id),
            KEY user_id (user_id)
        ) $charset_collate;";
        
        // Delegations table
        $delegations_table = $wpdb->prefix . 'nostr_calendar_delegations';
        $delegations_sql = "CREATE TABLE $delegations_table (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            wp_user_id bigint(20) NOT NULL,
            nostr_pubkey varchar(64) NOT NULL,
            delegation_token longtext NOT NULL,
            active tinyint(1) DEFAULT 1,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY user_pubkey (wp_user_id, nostr_pubkey),
            KEY wp_user_id (wp_user_id)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($identities_sql);
        dbDelta($events_sql);
        dbDelta($delegations_sql);
    }
}

// Include required classes
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-simple-crypto.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-rest-api.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-identity.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-nostr-publisher.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/shortcodes.php';

// Initialize the plugin
new NostrCalendarUnified();