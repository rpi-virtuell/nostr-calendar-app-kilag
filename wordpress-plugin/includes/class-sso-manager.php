<?php

/**
 * SSO Manager Class for Nostr Calendar Plugin
 * Handles Single Sign-On functionality and token generation
 */
class NostrCalendarSSOManager {
    
    private $shared_secret;
    private $calendar_app_url;
    
    public function __construct($shared_secret, $calendar_app_url) {
        $this->shared_secret = $shared_secret;
        $this->calendar_app_url = $calendar_app_url;
    }
    
    public function init() {
        // SSO login/logout hooks
        add_action('wp_login', [$this, 'on_wp_login'], 10, 2);
        add_action('wp_logout', [$this, 'on_wp_logout']);
        
        // AJAX endpoints for SSO
        add_action('wp_ajax_get_nostr_token', [$this, 'ajax_get_nostr_token']);
        add_action('wp_ajax_nopriv_get_nostr_token', [$this, 'ajax_get_nostr_token_public']);
        add_action('wp_ajax_test_nostr_sso_connection', [$this, 'ajax_test_sso_connection']);
        
        error_log('[NostrCalendar] SSO features initialized');
    }
    
    public function on_wp_login($user_login, $user) {
        // Handle login events if needed
        error_log('[NostrCalendar] User logged in: ' . $user_login);
    }
    
    public function on_wp_logout() {
        // Handle logout events if needed  
        error_log('[NostrCalendar] User logged out');
    }
    
    /**
     * AJAX Handler für eingeloggte User
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
     * AJAX Handler für SSO-Verbindungstest
     */
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
     * Verify SSO token
     */
    public function verify_token($token) {
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
        
        return $payload;
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
}