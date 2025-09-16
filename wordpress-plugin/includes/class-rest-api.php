<?php
/**
 * REST API Handler for Nostr Calendar
 */

class NostrCalendarRestAPI {
    
    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }
    
    public function register_routes() {
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
     * Verify SSO token
     */
    public function verify_token($token) {
        // Get shared secret from SSO manager
        global $nostr_calendar_sso_manager;
        if (!$nostr_calendar_sso_manager) {
            return false;
        }
        
        return $nostr_calendar_sso_manager->verify_token($token);
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
        
        // Use SSO manager to generate deterministic pubkey
        global $nostr_calendar_sso_manager;
        $pubkey = $meta_pub;
        if (!$pubkey && $nostr_calendar_sso_manager) {
            $pubkey = $nostr_calendar_sso_manager->generate_deterministic_pubkey($user_id);
        }
        if (!$pubkey) {
            // Fallback
            $input = 'wp-user-' . $user_id . '-' . site_url();
            $pubkey = hash('sha256', $input);
        }

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
        
        global $nostr_calendar_sso_manager;
        if (!$nostr_calendar_sso_manager) {
            return new WP_Error('sso_not_available', 'SSO Manager nicht verfügbar', array('status' => 500));
        }
        
        $token = $nostr_calendar_sso_manager->generate_nostr_token($user_id);
        
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
        $user_id = get_current_user_id();
        $user = get_user_by('id', $user_id);
        
        if (!$user) {
            return new WP_Error('user_not_found', 'Benutzer nicht gefunden', array('status' => 404));
        }
        
        // Get event data from request (JSON body or form parameters)
        $json_params = $request->get_json_params();
        if ($json_params) {
            // Data from JSON body
            $title = sanitize_text_field($json_params['title'] ?? '');
            $start = $json_params['start'] ?? '';
            $end = $json_params['end'] ?? '';
            $location = sanitize_text_field($json_params['location'] ?? '');
            $description = sanitize_textarea_field($json_params['content'] ?? $json_params['summary'] ?? $json_params['description'] ?? '');
            $d_tag = sanitize_text_field($json_params['d'] ?? '');
        } else {
            // Data from form parameters
            $title = sanitize_text_field($request->get_param('title'));
            $start = $request->get_param('start');
            $end = $request->get_param('end');
            $location = sanitize_text_field($request->get_param('location'));
            $description = sanitize_textarea_field($request->get_param('description'));
            $d_tag = sanitize_text_field($request->get_param('d'));
        }
        
        if (empty($title) || empty($start) || empty($end)) {
            return new WP_Error('missing_data', 'Titel, Start und End-Zeit sind erforderlich', array('status' => 400));
        }
        
        // Convert timestamps to ISO strings if they're numeric
        if (is_numeric($start)) {
            $start = date('c', $start); // ISO 8601 format
        }
        if (is_numeric($end)) {
            $end = date('c', $end); // ISO 8601 format
        }
        
        // Get user's calendar identity (with delegation support)
        $identity_manager = new NostrCalendarIdentity();
        $calendar_identity = $identity_manager->get_or_create_identity($user_id);
        
        // Prepare event data for Nostr
        $event_data = [
            'kind' => 31923, // Calendar time-based event (NIP-52)
            'content' => $description ?: '',
            'tags' => [
                ['d', $d_tag ?: 'wp-event-' . time() . '-' . $user_id], // Unique identifier
                ['title', $title],
                ['start', $start],
                ['end', $end]
            ],
            'created_at' => time()
        ];
        
        // Add location if provided
        if (!empty($location)) {
            $event_data['tags'][] = ['location', $location];
        }
        
        // Add WordPress metadata
        $event_data['tags'][] = ['wp_user_id', (string)$user_id];
        $event_data['tags'][] = ['wp_site', site_url()];
        
        // Publish using NostrCalendarPublisher
        $publisher = new NostrCalendarPublisher();
        $result = $publisher->publish_event($event_data, $calendar_identity);
        
        if ($result['success']) {
            return [
                'success' => true,
                'message' => 'Event erfolgreich erstellt und an Nostr-Relays gesendet',
                'event' => $result['event'],
                'relays_published' => $result['relays_published'],
                'user_id' => $user_id,
                'calendar_identity' => $calendar_identity
            ];
        } else {
            return new WP_Error('publish_failed', 'Event-Veröffentlichung fehlgeschlagen', [
                'status' => 500,
                'details' => $result['errors']
            ]);
        }
    }
}