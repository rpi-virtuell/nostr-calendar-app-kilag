<?php
/**
 * REST API Handler for Nostr Calendar
 */

class NostrCalendarRestAPI {
    
    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }
    
    public function register_routes() {
        $namespace = 'nostr-calendar/v1';
        
        // Get current user info (replaces /wp-me endpoint)
        register_rest_route($namespace, '/me', [
            'methods' => 'GET',
            'callback' => [$this, 'get_current_user'],
            'permission_callback' => 'is_user_logged_in'
        ]);
        
        // Create calendar event (replaces /wp-calendar/event POST)
        register_rest_route($namespace, '/event', [
            'methods' => 'POST',
            'callback' => [$this, 'create_event'],
            'permission_callback' => 'is_user_logged_in',
            'args' => [
                'title' => [
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field'
                ],
                'start' => [
                    'required' => true,
                    'type' => 'string'
                ],
                'end' => [
                    'required' => true,
                    'type' => 'string'
                ],
                'location' => [
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field'
                ],
                'description' => [
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_textarea_field'
                ]
            ]
        ]);
        
        // Delete calendar event (replaces /wp-calendar/event/:id DELETE)
        register_rest_route($namespace, '/event/(?P<id>[a-zA-Z0-9]+)', [
            'methods' => 'DELETE',
            'callback' => [$this, 'delete_event'],
            'permission_callback' => [$this, 'can_delete_event'],
            'args' => [
                'id' => [
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field'
                ]
            ]
        ]);
        
        // Get user's events
        register_rest_route($namespace, '/events', [
            'methods' => 'GET',
            'callback' => [$this, 'get_events'],
            'permission_callback' => 'is_user_logged_in'
        ]);
        
        // SSO status check (replaces /wp-sso-status)
        register_rest_route($namespace, '/sso-status', [
            'methods' => 'GET',
            'callback' => [$this, 'get_sso_status'],
            'permission_callback' => '__return_true' // Public endpoint
        ]);
    }
    
    public function get_current_user($request) {
        $current_user = wp_get_current_user();
        
        if (!$current_user->exists()) {
            return new WP_Error('not_authenticated', 'User not authenticated', ['status' => 401]);
        }
        
        // Get or create Nostr identity for this user
        $identity_manager = new NostrCalendarIdentity();
        $calendar_identity = $identity_manager->get_or_create_identity($current_user->ID);
        
        return [
            'ok' => true,
            'wp_user' => [
                'id' => $current_user->ID,
                'username' => $current_user->user_login,
                'email' => $current_user->user_email,
                'display_name' => $current_user->display_name,
                'roles' => $current_user->roles,
                'wp_site_url' => get_site_url(),
                'authenticated_at' => current_time('c')
            ],
            'calendar_identity' => $calendar_identity,
            'source' => 'wordpress_plugin'
        ];
    }
    
    public function create_event($request) {
        $current_user = wp_get_current_user();
        
        // Get user's Nostr identity
        $identity_manager = new NostrCalendarIdentity();
        $calendar_identity = $identity_manager->get_or_create_identity($current_user->ID);
        
        // Prepare event data
        $event_data = [
            'kind' => 31923, // Calendar time-based event
            'content' => $request->get_param('description') ?: '',
            'tags' => [
                ['d', $request->get_param('d') ?: 'wp-event-' . time()],
                ['title', $request->get_param('title')],
                ['start', $request->get_param('start')],
                ['end', $request->get_param('end')]
            ],
            'created_at' => time()
        ];
        
        // Add location if provided
        if ($location = $request->get_param('location')) {
            $event_data['tags'][] = ['location', $location];
        }
        
        // Publish to Nostr relays
        $publisher = new NostrCalendarPublisher();
        $result = $publisher->publish_event($event_data, $calendar_identity);
        
        if ($result['success']) {
            // Store event locally for user management
            $this->store_user_event($current_user->ID, $result['event']);
            
            return [
                'ok' => true,
                'event' => $result['event'],
                'relays_published' => $result['relays_published'],
                'message' => 'Event created and published to Nostr relays'
            ];
        } else {
            return new WP_Error('publish_failed', 'Failed to publish event', [
                'status' => 500,
                'details' => $result['errors']
            ]);
        }
    }
    
    public function delete_event($request) {
        $event_id = $request->get_param('id');
        $current_user = wp_get_current_user();
        
        // Get user's Nostr identity
        $identity_manager = new NostrCalendarIdentity();
        $calendar_identity = $identity_manager->get_or_create_identity($current_user->ID);
        
        // Create deletion event (kind 5)
        $deletion_event = [
            'kind' => 5,
            'content' => 'Event deleted',
            'tags' => [
                ['e', $event_id]
            ],
            'created_at' => time()
        ];
        
        // Publish deletion to Nostr relays
        $publisher = new NostrCalendarPublisher();
        $result = $publisher->publish_event($deletion_event, $calendar_identity);
        
        if ($result['success']) {
            // Remove from local storage
            $this->remove_user_event($current_user->ID, $event_id);
            
            return [
                'ok' => true,
                'message' => 'Event deleted',
                'deletion_event' => $result['event']
            ];
        } else {
            return new WP_Error('delete_failed', 'Failed to delete event', [
                'status' => 500,
                'details' => $result['errors']
            ]);
        }
    }
    
    public function get_events($request) {
        $current_user = wp_get_current_user();
        
        // Get user's stored events
        $events = $this->get_user_events($current_user->ID);
        
        return [
            'ok' => true,
            'events' => $events,
            'count' => count($events)
        ];
    }
    
    public function get_sso_status($request) {
        if (is_user_logged_in()) {
            return $this->get_current_user($request);
        } else {
            return [
                'ok' => false,
                'message' => 'No active WordPress session'
            ];
        }
    }
    
    public function can_delete_event($request) {
        if (!is_user_logged_in()) {
            return false;
        }
        
        $event_id = $request->get_param('id');
        $current_user = wp_get_current_user();
        
        // Check if user owns this event
        return $this->user_owns_event($current_user->ID, $event_id);
    }
    
    private function store_user_event($user_id, $event) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_events';
        
        return $wpdb->insert(
            $table_name,
            [
                'user_id' => $user_id,
                'event_id' => $event['id'],
                'event_data' => json_encode($event),
                'created_at' => current_time('mysql')
            ],
            ['%d', '%s', '%s', '%s']
        );
    }
    
    private function remove_user_event($user_id, $event_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_events';
        
        return $wpdb->delete(
            $table_name,
            [
                'user_id' => $user_id,
                'event_id' => $event_id
            ],
            ['%d', '%s']
        );
    }
    
    private function get_user_events($user_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_events';
        
        $results = $wpdb->get_results($wpdb->prepare(
            "SELECT event_data FROM $table_name WHERE user_id = %d ORDER BY created_at DESC",
            $user_id
        ));
        
        $events = [];
        foreach ($results as $row) {
            $event = json_decode($row->event_data, true);
            if ($event) {
                $events[] = $event;
            }
        }
        
        return $events;
    }
    
    private function user_owns_event($user_id, $event_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_events';
        
        $count = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $table_name WHERE user_id = %d AND event_id = %s",
            $user_id,
            $event_id
        ));
        
        return $count > 0;
    }
}