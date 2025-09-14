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
        add_shortcode('nostr_calendar', array($this, 'calendar_shortcode'));
        
        // AJAX endpoints
        add_action('wp_ajax_get_nostr_token', array($this, 'ajax_get_nostr_token'));
        add_action('wp_ajax_nopriv_get_nostr_token', array($this, 'ajax_get_nostr_token_public'));
        
        // REST API endpoints for Nostr Calendar App
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Admin menu
        add_action('admin_menu', array($this, 'admin_menu'));
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
        
        $payload = array(
            'wp_user_id' => $user_id,
            'wp_username' => $user->user_login,
            'wp_email' => $user->user_email,
            'wp_display_name' => $user->display_name,
            'wp_roles' => $user->roles,
            // Add deterministic calendar pubkey to payload for client consistency
            'calendar_pubkey' => $this->generate_deterministic_pubkey($user_id),
            'timestamp' => $timestamp,
            'expires' => $expires,
            'wp_site_url' => site_url()
        );
        
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

        return array(
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
        ?>
        <div class="wrap">
            <h1>Nostr Calendar SSO Integration</h1>
            
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