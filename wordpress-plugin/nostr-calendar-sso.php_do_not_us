<?php
/**
 * Plugin Name: Nostr Calendar SSO Integration
 * Description: Ermöglicht WordPress-Benutzern die automatische Anmeldung in der Nostr Calendar App
 * Version: 1.0.0
 * Author: johappel
 * Author URI: https://github.com/johappel
 * License: MIT
 */

// Verhindere direkten Zugriff
if (!defined('ABSPATH')) {
    exit;
}

class NostrCalendarSSO {
    
    private $calendar_app_url = 'https://test1.rpi-virtuell.de/nostr-calendar'; // In Produktion: Ihre Nostr Calendar Domain
    private $shared_secret = '33633f1ee42b18d4f9439bda97cf8c760704d408c70e7b0bbd3ccb8321137a92'; // In Produktion: Sichere Konfiguration
    
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_login', array($this, 'on_wp_login'), 10, 2);
        add_action('wp_logout', array($this, 'on_wp_logout'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        // Admin-specific script enqueue for delegation UI
        add_action('admin_enqueue_scripts', array($this, 'admin_enqueue_scripts'));
        add_shortcode('nostr_calendar', array($this, 'calendar_shortcode'));
        
        // AJAX endpoints
        add_action('wp_ajax_get_nostr_token', array($this, 'ajax_get_nostr_token'));
        add_action('wp_ajax_nopriv_get_nostr_token', array($this, 'ajax_get_nostr_token_public'));
        // Delegation management AJAX endpoints (admin only)
        add_action('wp_ajax_save_nostr_delegation', array($this, 'ajax_save_nostr_delegation'));
        add_action('wp_ajax_remove_nostr_delegation', array($this, 'ajax_remove_nostr_delegation'));
        
        // REST API endpoints for Nostr Calendar App
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Admin menu
        add_action('admin_menu', array($this, 'admin_menu'));

        // nsec upload removed - use NIP-26 delegations instead
    }
    
    public function init() {
        // Plugin initialisierung
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
     * Registriert REST API Routen für die Nostr Calendar App
     */
    public function register_rest_routes() {
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
        
        register_rest_route('nostr-calendar/v1', '/events/(?P<id>[a-zA-Z0-9\-]+)', array(
            'methods' => 'DELETE',
            'callback' => array($this, 'rest_delete_event'),
            'permission_callback' => array($this, 'rest_permission_check')
        ));
    }

    
    
    /**
     * REST API Permission Check
     */
    public function rest_permission_check() {
        // Check for SSO token first (more reliable)
        $token = $this->get_request_token();
        if ($token) {
            $payload = $this->verify_token($token);
            if ($payload && $payload['wp_user_id']) {
                // Set current user temporarily for this request
                wp_set_current_user($payload['wp_user_id']);
                return true;
            }
        }
        
        // Fallback to regular WordPress authentication
        return is_user_logged_in();
    }
    
    /**
     * Helper function to get token from request
     */
    private function get_request_token() {
        // Check query parameter first (most reliable for WordPress)
        if (isset($_GET['sso_token'])) {
            return sanitize_text_field($_GET['sso_token']);
        }
        
        // Check POST data
        if (isset($_POST['sso_token'])) {
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
            return substr($auth_header, 7);
        }
        
        return null;
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

        if ($delegation) {
            $response['calendar_identity']['delegation'] = $delegation;
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
     * REST API Debug Endpoint
     */
    public function rest_debug_auth($request) {
        $debug_info = array(
            'is_user_logged_in' => is_user_logged_in(),
            'current_user_id' => get_current_user_id(),
            'headers' => array(),
            'server_vars' => array(),
            'get_params' => $_GET,
            'post_params' => $_POST
        );
        
        // Collect headers
        if (function_exists('getallheaders')) {
            $debug_info['headers'] = getallheaders();
        }
        
        // Collect relevant server vars
        $server_keys = ['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION', 'PHP_AUTH_USER', 'PHP_AUTH_PW'];
        foreach ($server_keys as $key) {
            if (isset($_SERVER[$key])) {
                $debug_info['server_vars'][$key] = $_SERVER[$key];
            }
        }
        
        // Check for token
        $token = $this->get_request_token();
        $debug_info['found_token'] = $token ? 'Yes (length: ' . strlen($token) . ')' : 'No';
        
        if ($token) {
            $payload = $this->verify_token($token);
            $debug_info['token_valid'] = $payload ? 'Yes' : 'No';
            if ($payload) {
                $debug_info['token_user_id'] = $payload['wp_user_id'];
                $debug_info['token_username'] = $payload['wp_username'];
                $debug_info['token_expires'] = date('Y-m-d H:i:s', $payload['expires']);
                $debug_info['token_expired'] = time() > $payload['expires'] ? 'Yes' : 'No';
            }
        }

        // Include stored delegation option for current blog (helpful for debugging admin save flow)
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $stored_delegation = get_option($option_key, null);
        $debug_info['stored_delegation_option_key'] = $option_key;
        $debug_info['stored_delegation'] = $stored_delegation;

        return $debug_info;
    }

    /**
     * Generiert deterministischen Pubkey für WordPress User
     */
    public function generate_deterministic_pubkey($user_id) {
        $input = 'wp-user-' . $user_id . '-' . site_url();
        return hash('sha256', $input);
    }

    /**
     * Verifiziert Token (für Debugging/Testing)
     */
    public function verify_token($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 2) return false;
        
        list($token_data, $signature) = $parts;
        
        // Signatur prüfen
        $expected_signature = hash_hmac('sha256', $token_data, $this->shared_secret);
        if (!hash_equals($expected_signature, $signature)) return false;
        
        // Payload dekodieren
        $payload = json_decode(base64_decode($token_data), true);
        if (!$payload) return false;
        
        // Ablauf prüfen
        if (time() > $payload['expires']) return false;
        
        return $payload;
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
     * WordPress Login Hook
     */
    public function on_wp_login($user_login, $user) {
        // Ensure deterministic pubkey is stored in usermeta for quick lookup
        $this->ensure_user_pubkey_meta($user->ID);
        // Optional: Automatische Weiterleitung zur Calendar App if enabled
        $auto = get_option('nostr_calendar_auto_redirect', 0);
        if ($auto && isset($_GET['redirect_to_calendar'])) {
            $token = $this->generate_nostr_token($user->ID);
            wp_redirect($this->calendar_app_url . '/wp-sso.html?token=' . $token);
            exit;
        }
    }
    
    /**
     * WordPress Logout Hook
     */
    public function on_wp_logout() {
        // If auto-redirect enabled, redirect the browser to the calendar logout page
        $auto = get_option('nostr_calendar_auto_redirect', 0);
        if ($auto && !defined('DOING_CRON')) {
            $logout_url = untrailingslashit($this->calendar_app_url) . '/wp-logout';
            // Optionally pass return URL so the calendar can redirect back
            $return_to = site_url();
            $logout_url .= '?return=' . urlencode($return_to);

            if (!headers_sent()) {
                wp_safe_redirect($logout_url);
                exit;
            }
        }
    }
    
    /**
     * Shortcode für Calendar Integration
     */
    public function calendar_shortcode($atts) {
        if (!is_user_logged_in()) {
            return '<p>Bitte <a href="' . wp_login_url() . '">melden Sie sich an</a>, um den Kalender zu verwenden.</p>';
        }
        
        $user_id = get_current_user_id();
        $token = $this->generate_nostr_token($user_id);
        
        ob_start();
        ?>
        <div id="nostr-calendar-container">
            <div id="nostr-calendar-status">Lade Kalender...</div>
            <iframe id="nostr-calendar-frame" 
                    src="<?php echo esc_url($this->calendar_app_url); ?>/wp-sso.html?token=<?php echo urlencode($token); ?>" 
                    width="100%" 
                    height="600" 
                    frameborder="0">
                Ihr Browser unterstützt keine iFrames.
            </iframe>
        </div>
        
        <style>
        #nostr-calendar-container {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 10px;
            margin: 20px 0;
        }
        #nostr-calendar-frame {
            border-radius: 5px;
        }
        </style>
        
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            const statusDiv = document.getElementById('nostr-calendar-status');
            const frame = document.getElementById('nostr-calendar-frame');
            
            frame.onload = function() {
                statusDiv.style.display = 'none';
            };
            
            frame.onerror = function() {
                statusDiv.innerHTML = 'Fehler beim Laden des Kalenders.';
                statusDiv.style.color = 'red';
            };
        });
        </script>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Scripts einbinden
     */
    public function enqueue_scripts() {
        wp_enqueue_script('nostr-calendar-sso', plugin_dir_url(__FILE__) . 'nostr-calendar-sso.js', array('jquery'), '1.0.0', true);
        wp_localize_script('nostr-calendar-sso', 'nostr_calendar_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('nostr_calendar_nonce'),
            'calendar_url' => $this->calendar_app_url
        ));
    }

    /**
     * Admin-specific scripts for the plugin settings page (delegation UI)
     */
    public function admin_enqueue_scripts($hook_suffix) {
        // Only load on our plugin options page
        // The options page slug used in admin_menu is 'nostr-calendar-sso'
        if ($hook_suffix !== 'settings_page_nostr-calendar-sso') {
            return;
        }

        $plugin_dir = plugin_dir_url(__FILE__);

        // Admin JS (independent; generator checks window.NostrTools on demand)
        wp_enqueue_script(
            'nostr-delegation-admin',
            $plugin_dir . 'assets/js/nostr-delegation-admin.js',
            array('jquery'),
            '1.1.3',
            true
        );

        // Localize data for AJAX and nonce for delegation actions
        wp_localize_script('nostr-delegation-admin', 'nostrDelegationAdmin', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'save_action' => 'save_nostr_delegation',
            'remove_action' => 'remove_nostr_delegation',
            'nonce' => wp_create_nonce('nostr_calendar_delegation')
        ));
    }
    
    /**
     * Admin Menu
     */
    public function admin_menu() {
        add_options_page(
            'Nostr Calendar SSO',
            'Nostr Calendar',
            'manage_options',
            'nostr-calendar-sso',
            array($this, 'admin_page')
        );
    }
    
    /**
     * Admin Seite
     */
    public function admin_page() {
        if (isset($_POST['submit'])) {
            $this->calendar_app_url = sanitize_url($_POST['calendar_app_url']);
            update_option('nostr_calendar_app_url', $this->calendar_app_url);
            $auto = isset($_POST['nostr_calendar_auto_redirect']) ? 1 : 0;
            update_option('nostr_calendar_auto_redirect', $auto);
            echo '<div class="notice notice-success"><p>Einstellungen gespeichert!</p></div>';
        }
        
        $current_url = get_option('nostr_calendar_app_url', $this->calendar_app_url);
        $auto_redirect = get_option('nostr_calendar_auto_redirect', 0);

        // Load existing delegation blob for this blog (if any) so the textarea can show it
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $stored_delegation = get_option($option_key, null);
        $delegation_raw = '';
        if (is_array($stored_delegation) && !empty($stored_delegation['blob'])) {
            $delegation_raw = $stored_delegation['blob'];
        }
        ?>
        <div class="wrap">
            <h1>Nostr Calendar SSO Integration</h1>

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

            <!-- Delegation (prominent) -->
            <div style="margin:12px 0; padding:12px; border:1px solid #e5e5e5; background:#fafafa;">
                <h2 style="margin-top:0;">Delegation für dieses Blog</h2>
                
                

                <?php if (is_array($stored_delegation) && !empty($stored_delegation['blob'])):
                    // Parse stored delegation for display
                    $raw = $stored_delegation['blob'];
                    $arr = json_decode($raw, true);
                    if (!is_array($arr)) { $arr = json_decode(str_replace("'", '"', $raw), true); }
                    $delegation_display = null;
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

                        // Build external lookup links for "whoami" of delegator (no local relay query)
                        $hex = $delegator;
                        $link_nostr_band = 'https://nostr.band/?q=' . urlencode($hex);
                        $link_highlighter = 'https://njump.me/' . urlencode($hex); // accepts hex and resolves to profile
                        $link_iris = 'https://iris.to/' . urlencode($hex);

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
                                                Whoami/Profil anzeigen:
                                                <a href="<?php echo esc_url($link_nostr_band); ?>" target="_blank" rel="noopener">nostr.band</a> ·
                                                <a href="<?php echo esc_url($link_highlighter); ?>" target="_blank" rel="noopener">njump</a> ·
                                                <a href="<?php echo esc_url($link_iris); ?>" target="_blank" rel="noopener">iris.to</a>
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
                                Hinweis: Die Bestimmung des "Name/Whoami" des Delegators erfolgt über externe Nostr‑Explorer (Links oben).
                                Eine direkte Auflösung gegen Relays ist serverseitig derzeit nicht aktiviert.
                            </p>
                        </div>
                        <?php
                    } else {
                        echo '<p style="color:#cc0000; margin-top:10px;">Gespeicherter Delegation‑Eintrag ist nicht im erwarteten Format.</p>';
                    }
                endif; ?>
                <div style="display:none;">
                    <p class="description">Erzeuge die Delegation extern (z. B. auf <a href="https://nostrtool.com/" target="_blank" rel="noopener">nostrtool.com</a>), kopiere den Delegation-Tag und füge ihn hier ein. Das Plugin validiert das Tag und speichert nur den Delegation-Blob (kein nsec).</p>
                    <label for="delegation_blob"><strong>Delegation (JSON array)</strong></label><br/>
                    <textarea id="delegation_blob" rows="6" cols="80" style="width:100%;" placeholder="['delegation','<sig>','created_at>...','<delegator_pub>']"><?php echo esc_textarea($delegation_raw); ?></textarea>
                    <p style="margin-top:8px;"><strong>Oder</strong> lade eine Datei mit dem Delegation-Tag hoch:</p>
                    <input type="file" id="delegation_file" accept=".txt,.json" />
                    
                </div>
                <div id="delegation-validation-result" style="margin-top:12px;"></div>
                <p style="margin-top:8px;">
                        <!-- <button id="validate-delegation" class="button">Validate Delegation</button> -->
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
            
 
            <!-- Main Settings Form -->
            <form method="post">
                <table class="form-table">
                    <tr>
                        <th scope="row">Calendar App URL</th>
                        <td>
                            <input type="url" name="calendar_app_url" value="<?php echo esc_attr($current_url); ?>" class="regular-text" />
                            <p class="description">URL Ihrer Nostr Calendar App (z.B. https://calendar.example.com)</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Auto Redirect</th>
                        <td>
                            <label for="nostr_calendar_auto_redirect">
                                <input type="checkbox" id="nostr_calendar_auto_redirect" name="nostr_calendar_auto_redirect" value="1" <?php checked(1, $auto_redirect); ?> />
                                Bei WordPress Login/Logout automatisch zum Calendar weiterleiten (SSO)
                            </label>
                            <p class="description">Wenn aktiviert, werden Nutzer nach dem Login automatisch an die Kalender‑SSO Seite weitergeleitet. Beim Logout werden sie an die Kalender‑Logout URL weitergeleitet.</p>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
                <h2>Integration Testen</h2>
            <?php if (is_user_logged_in()): ?>
                <p><strong>Aktueller User:</strong> <?php echo wp_get_current_user()->user_login; ?></p>
                <button id="test-token" class="button">Token generieren & testen</button>
                <div id="test-result"></div>
                <h3>SSO Link</h3>
                <p>Direct SSO page for this calendar instance (with generated token):</p>
                <?php $uid = get_current_user_id(); $this->ensure_user_pubkey_meta($uid); $tok = $this->generate_nostr_token($uid); ?>
                <p><a href="<?php echo esc_url($current_url); ?>/wp-sso.html?token=<?php echo urlencode($tok); ?>" target="_blank"><?php echo esc_url($current_url); ?>/wp-sso.html?token=... </a></p>
                <p>Auto‑Redirect ist derzeit <strong><?php echo $auto_redirect ? 'aktiv' : 'deaktiv'; ?></strong>.</p>
            <?php else: ?>
                <p>Bitte melden Sie sich an, um die Integration zu testen.</p>
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
        <?php
    }
    
    /**
     * REST API: Get events for current user
     */
    public function rest_get_events($request) {
        $current_user = $this->get_current_user_from_request($request);
        if (!$current_user) {
            return new WP_Error('unauthorized', 'Not authorized', array('status' => 401));
        }
        
        // Get events from custom table or post meta
        $events = get_user_meta($current_user->ID, 'nostr_calendar_events', true);
        if (!$events) {
            $events = array();
        }
        
        return array(
            'success' => true,
            'events' => $events,
            'user_id' => $current_user->ID
        );
    }
    
    /**
     * REST API: Create new event
     */
    public function rest_create_event($request) {
        $current_user = $this->get_current_user_from_request($request);
        if (!$current_user) {
            return new WP_Error('unauthorized', 'Not authorized', array('status' => 401));
        }
        
        $event_data = $request->get_json_params();
        if (!$event_data) {
            return new WP_Error('invalid_data', 'Invalid event data', array('status' => 400));
        }
        
        // Generate event ID and pubkey
        $event_id = 'wp-event-' . time() . '-' . wp_rand(1000, 9999);
        $pubkey = $this->generate_deterministic_pubkey($current_user->ID);
        
        // Create event object
        $event = array(
            'id' => $event_id,
            'kind' => 31923,
            'pubkey' => $pubkey,
            'created_at' => time(),
            'content' => $event_data['content'] ?? '',
            'tags' => array(
                array('d', $event_id),
                array('title', $event_data['title'] ?? ''),
                array('starts', $event_data['starts'] ?? ''),  // Fixed: 'starts' instead of 'start'
                array('ends', $event_data['ends'] ?? ''),      // Fixed: 'ends' instead of 'end'
                array('location', $event_data['location'] ?? ''),
                array('wp_user_id', $current_user->ID),
                array('wp_site', site_url())
            ),
            'wp_created_at' => current_time('mysql'),
            'wp_user_id' => $current_user->ID
        );
        
        // Save event to user meta
        $existing_events = get_user_meta($current_user->ID, 'nostr_calendar_events', true);
        if (!$existing_events) {
            $existing_events = array();
        }
        $existing_events[$event_id] = $event;
        update_user_meta($current_user->ID, 'nostr_calendar_events', $existing_events);
        
        return array(
            'success' => true,
            'event' => $event,
            'message' => 'Event created successfully'
        );
    }
    
    /**
     * REST API: Delete event
     */
    public function rest_delete_event($request) {
        $current_user = $this->get_current_user_from_request($request);
        if (!$current_user) {
            return new WP_Error('unauthorized', 'Not authorized', array('status' => 401));
        }
        
        $event_id = $request['id'];
        if (!$event_id) {
            return new WP_Error('missing_id', 'Event ID required', array('status' => 400));
        }
        
        // Get existing events
        $existing_events = get_user_meta($current_user->ID, 'nostr_calendar_events', true);
        if (!$existing_events || !isset($existing_events[$event_id])) {
            return new WP_Error('not_found', 'Event not found', array('status' => 404));
        }
        
        // Remove event
        unset($existing_events[$event_id]);
        update_user_meta($current_user->ID, 'nostr_calendar_events', $existing_events);
        
        return array(
            'success' => true,
            'message' => 'Event deleted successfully'
        );
    }
    
    /**
     * Get current user from request (token or session)
     */
    private function get_current_user_from_request($request) {
        // Try SSO token first
        $token = $this->get_request_token();
        if ($token && $this->verify_token($token)) {
            $token_data = $this->verify_token($token);
            return get_user_by('ID', $token_data['wp_user_id']);
        }
        
        // Fallback to WordPress session
        if (is_user_logged_in()) {
            return wp_get_current_user();
        }
        
        return null;
    }

    /**
     * AJAX: Save delegation blob for current blog (admin only)
     */
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

    /**
     * AJAX: Remove delegation for current blog (admin only)
     */
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

    /**
     * Handle uploaded nsec file from admin page
     */
    public function handle_nsec_upload() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized', 403);
        }

        check_admin_referer('nostr_calendar_upload_nsec');

        if (empty($_FILES['nostr_nsec_file']) || $_FILES['nostr_nsec_file']['error'] !== UPLOAD_ERR_OK) {
            wp_redirect(add_query_arg('nostr_upload', 'error', wp_get_referer()));
            exit;
        }

        $content = file_get_contents($_FILES['nostr_nsec_file']['tmp_name']);
        $content = trim($content);

        // Optional password provided by admin for extra entropy (not required for decryption server-side)
        $password = sanitize_text_field($_POST['nostr_nsec_password'] ?? '');

        // Derive an encryption key from WP salts + optional password
        $key_material = AUTH_SALT . '|' . AUTH_KEY . '|' . $password . '|' . site_url();
        $key = hash('sha256', $key_material, true);

        // Encrypt using openssl
        $iv = openssl_random_pseudo_bytes(16);
        $ciphertext = openssl_encrypt($content, 'AES-256-CBC', $key, OPENSSL_RAW_DATA, $iv);
        $store = base64_encode($iv . $ciphertext);

        update_option('nostr_calendar_shared_nsec', array(
            'ciphertext' => $store,
            'uploaded_at' => time()
        ));

        // Enable shared identity by default when uploaded
        update_option('nostr_calendar_use_shared_identity', 1);

        wp_redirect(add_query_arg('nostr_upload', 'ok', wp_get_referer()));
        exit;
    }

    /**
     * Decrypt stored nsec blob
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
     * Get stored blog pubkey (derived)
     */
    private function get_stored_blog_pubkey() {
        $shared = get_option('nostr_calendar_shared_nsec', null);
        if (!$shared || empty($shared['ciphertext'])) return '';
        $nsec = $this->decrypt_stored_nsec($shared['ciphertext']);
        if (!$nsec) return '';
        if (class_exists('NostrSimpleCrypto') && method_exists('NostrSimpleCrypto', 'private_to_public')) {
            try {
                return NostrSimpleCrypto::private_to_public($nsec);
            } catch (Exception $e) {
                // fallback
            }
        }
        return hash('sha256', 'nostr-blog-' . $nsec . '-' . site_url());
    }
}

// Plugin aktivieren
new NostrCalendarSSO();

// Aktivierungs-Hook
register_activation_hook(__FILE__, function() {
    // Plugin-Aktivierung
    add_option('nostr_calendar_app_url', home_url().'/nostr-calendar');
});

// Deaktivierungs-Hook  
register_deactivation_hook(__FILE__, function() {
    // Cleanup bei Deaktivierung
});
?>