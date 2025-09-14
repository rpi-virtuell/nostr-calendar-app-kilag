<?php
/**
 * Nostr Calendar Identity Management
 * Manages Nostr identities for WordPress users
 */

class NostrCalendarIdentity {
    
    public function __construct() {
        // Hook to create identity when user registers
        add_action('user_register', [$this, 'create_identity_for_new_user']);
    }
    
    /**
     * Get or create Nostr identity for WordPress user
     */
    public function get_or_create_identity($user_id) {
        $identity = $this->get_identity($user_id);
        
        if (!$identity) {
            $identity = $this->create_identity($user_id);
        }
        
        return $identity;
    }
    
    /**
     * Get existing identity for user
     */
    public function get_identity($user_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_identities';
        
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_name WHERE user_id = %d",
            $user_id
        ));
        
        if (!$row) {
            return null;
        }
        
        $user = get_user_by('ID', $user_id);
        $display_name = $user->display_name ?: $user->user_login;
        
        return [
            'pubkey' => $row->public_key,
            'private_key' => $row->private_key, // Only for server-side operations
            'name' => $display_name,
            'display_name' => $display_name,
            'created_at' => $row->created_at
        ];
    }
    
    /**
     * Create new Nostr identity for user
     */
    public function create_identity($user_id) {
        // Generate new key pair
        $key_pair = $this->generate_key_pair();
        
        if (!$key_pair) {
            throw new Exception('Failed to generate key pair');
        }
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'nostr_calendar_identities';
        
        $user = get_user_by('ID', $user_id);
        $display_name = $user->display_name ?: $user->user_login;
        
        $result = $wpdb->insert(
            $table_name,
            [
                'user_id' => $user_id,
                'private_key' => $key_pair['private_key'],
                'public_key' => $key_pair['public_key'],
                'display_name' => $display_name,
                'created_at' => current_time('mysql')
            ],
            ['%d', '%s', '%s', '%s', '%s']
        );
        
        if (!$result) {
            throw new Exception('Failed to store identity in database');
        }
        
        return [
            'pubkey' => $key_pair['public_key'],
            'private_key' => $key_pair['private_key'],
            'name' => $display_name,
            'display_name' => $display_name,
            'created_at' => current_time('mysql')
        ];
    }
    
    /**
     * Generate secp256k1 key pair
     */
    private function generate_key_pair() {
        try {
            // Method 1: Try proper crypto libraries if available
            if (NostrSimpleCrypto::has_proper_crypto()) {
                
                // kornrunner/secp256k1 library
                if (class_exists('kornrunner\Secp256k1\Secp256k1')) {
                    $secp256k1 = new \kornrunner\Secp256k1\Secp256k1();
                    $private_key = bin2hex(random_bytes(32));
                    $public_key = $secp256k1->publicKeyCreate(hex2bin($private_key));
                    
                    return [
                        'private_key' => $private_key,
                        'public_key' => bin2hex($public_key)
                    ];
                }
                
                // simplito/elliptic-php library
                if (class_exists('Elliptic\EC')) {
                    $ec = new \Elliptic\EC('secp256k1');
                    $key = $ec->genKeyPair();
                    
                    return [
                        'private_key' => $key->getPrivate('hex'),
                        'public_key' => $key->getPublic('hex')
                    ];
                }
                
                // Native PHP secp256k1 extension
                if (function_exists('secp256k1_keypair_create')) {
                    $context = secp256k1_context_create(SECP256K1_CONTEXT_SIGN | SECP256K1_CONTEXT_VERIFY);
                    $keypair = secp256k1_keypair_create($context);
                    
                    $private_key = '';
                    $public_key = '';
                    
                    secp256k1_keypair_sec($context, $private_key, $keypair);
                    secp256k1_keypair_pub($context, $public_key, $keypair);
                    
                    return [
                        'private_key' => bin2hex($private_key),
                        'public_key' => bin2hex($public_key)
                    ];
                }
            }
            
            // Method 2: Fallback to simplified crypto (for development/demo)
            error_log('Nostr Calendar: Using simplified crypto fallback (not production-ready)');
            return NostrSimpleCrypto::generate_key_pair();
            
        } catch (Exception $e) {
            error_log('Nostr Calendar: Key generation failed: ' . $e->getMessage());
            // Final fallback
            return NostrSimpleCrypto::generate_key_pair();
        }
    }
    
    /**
     * Generate key pair using OpenSSL (fallback)
     */
    private function generate_key_pair_openssl() {
        // Generate a strong random private key
        $private_key = bin2hex(random_bytes(32));
        
        // For demo purposes, create a pseudo-public key
        // In production, you'd derive the actual public key from private key
        $public_key = hash('sha256', $private_key . 'nostr_calendar_pubkey');
        
        // Ensure proper length (32 bytes = 64 hex chars)
        $public_key = substr($public_key, 0, 64);
        
        return [
            'private_key' => $private_key,
            'public_key' => $public_key
        ];
    }
    
    /**
     * Update display name for identity
     */
    public function update_display_name($user_id, $display_name) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_identities';
        
        return $wpdb->update(
            $table_name,
            ['display_name' => $display_name],
            ['user_id' => $user_id],
            ['%s'],
            ['%d']
        );
    }
    
    /**
     * Delete identity for user
     */
    public function delete_identity($user_id) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'nostr_calendar_identities';
        
        return $wpdb->delete(
            $table_name,
            ['user_id' => $user_id],
            ['%d']
        );
    }
    
    /**
     * Create identity for newly registered user
     */
    public function create_identity_for_new_user($user_id) {
        try {
            $this->create_identity($user_id);
        } catch (Exception $e) {
            error_log('Nostr Calendar: Failed to create identity for new user ' . $user_id . ': ' . $e->getMessage());
        }
    }
    
    /**
     * Get public key for user (without private key)
     */
    public function get_public_key($user_id) {
        $identity = $this->get_identity($user_id);
        return $identity ? $identity['pubkey'] : null;
    }
    
    /**
     * Validate key format
     */
    public function validate_key($key, $type = 'public') {
        // Both private and public keys should be 64 character hex strings
        if (!is_string($key) || strlen($key) !== 64) {
            return false;
        }
        
        return preg_match('/^[0-9a-f]{64}$/i', $key);
    }
    
    /**
     * Export identity (public info only)
     */
    public function export_identity($user_id) {
        $identity = $this->get_identity($user_id);
        
        if (!$identity) {
            return null;
        }
        
        // Return only public information
        return [
            'pubkey' => $identity['pubkey'],
            'name' => $identity['name'],
            'display_name' => $identity['display_name'],
            'created_at' => $identity['created_at']
        ];
    }
}