<?php
/**
 * Nostr Event Publisher
 * Handles publishing events to Nostr relays using WebSocket connections
 */

class NostrCalendarPublisher {
    
    private $relays;
    
    public function __construct() {
        $this->relays = get_option('nostr_calendar_relays', [
            'wss://relay.damus.io',
            'wss://nos.lol'
        ]);
    }
    
    /**
     * Publish event to Nostr relays
     */
    public function publish_event($event_data, $calendar_identity) {
        try {
            // If a delegation is stored for this blog, attach delegation tag to event tags
            $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
            $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
            $stored = get_option($option_key, null);
            $delegation_parsed = null;
            if (is_array($stored) && !empty($stored['blob'])) {
                // try to parse stored blob as JSON array (it was stored raw)
                $raw = $stored['blob'];
                $arr = json_decode($raw, true);
                if (!is_array($arr)) {
                    // fallback: replace single quotes
                    $arr = json_decode(str_replace("'", '"', $raw), true);
                }
                if (is_array($arr) && count($arr) >= 4 && $arr[0] === 'delegation') {
                    // ensure tags array exists
                    if (!isset($event_data['tags']) || !is_array($event_data['tags'])) {
                        $event_data['tags'] = array();
                    }
                    // Append delegation tag in NIP-26 format: ['delegation', '<sig>', '<conds>', '<delegator_pubkey>']
                    $delegation_tag = array('delegation', $arr[1], $arr[2], $arr[3]);
                    $event_data['tags'][] = $delegation_tag;

                    // keep parsed delegation for validation
                    $delegation_parsed = array(
                        'sig' => $arr[1],
                        'conds' => $arr[2],
                        'delegator' => $arr[3]
                    );
                }
            }

            // If a delegation exists, validate its conditions against the event (created_at and kind)
            if ($delegation_parsed) {
                $valid = $this->validate_delegation_conditions($delegation_parsed['conds'], $event_data);
                if ($valid !== true) {
                    // Return structured error explaining why delegation invalid
                    return [
                        'success' => false,
                        'errors' => ['delegation_invalid' => $valid]
                    ];
                }
            }

            // Sign the event
            $signed_event = $this->sign_event($event_data, $calendar_identity);
            
            if (!$signed_event) {
                return [
                    'success' => false,
                    'errors' => ['Failed to sign event']
                ];
            }
            
            // Publish to relays
            $results = $this->publish_to_relays($signed_event);
            
            return [
                'success' => count($results['successful']) > 0,
                'event' => $signed_event,
                'relays_published' => $results['successful'],
                'errors' => $results['failed']
            ];
            
        } catch (Exception $e) {
            return [
                'success' => false,
                'errors' => [$e->getMessage()]
            ];
        }
    }

    /**
     * Validate a delegation conditions string (NIP-26 simple parser)
     * Supports conditions like: "created_at>1600000000&created_at<1700000000&kind=1,31923"
     * Returns true if valid, otherwise string with reason.
     */
    private function validate_delegation_conditions($conds, $event_data) {
        if (empty($conds) || !is_string($conds)) return true;

        $parts = explode('&', $conds);
        $now = time();

        $allowed_kinds = null;
        $min_created = null;
        $max_created = null;

        foreach ($parts as $p) {
            $p = trim($p);
            if (strpos($p, 'created_at>') === 0) {
                $v = (int)substr($p, strlen('created_at>'));
                $min_created = $v;
            } elseif (strpos($p, 'created_at<') === 0) {
                $v = (int)substr($p, strlen('created_at<'));
                $max_created = $v;
            } elseif (strpos($p, 'kind=') === 0) {
                $vals = substr($p, strlen('kind='));
                // allow comma separated kinds
                $allowed_kinds = array_filter(array_map('intval', explode(',', $vals)));
            } elseif (strpos($p, 'kinds=') === 0) {
                $vals = substr($p, strlen('kinds='));
                $allowed_kinds = array_filter(array_map('intval', explode(',', $vals)));
            } else {
                // unknown condition - ignore for now
            }
        }

        // Validate created_at against delegation
        $event_created = isset($event_data['created_at']) ? (int)$event_data['created_at'] : $now;
        if ($min_created !== null && $event_created <= $min_created) {
            return "created_at must be > {$min_created}";
        }
        if ($max_created !== null && $event_created >= $max_created) {
            return "created_at must be < {$max_created}";
        }

        // Validate kind if delegation restricts kinds
        if (is_array($allowed_kinds)) {
            $event_kind = isset($event_data['kind']) ? (int)$event_data['kind'] : null;
            if ($event_kind === null) {
                return "event kind missing";
            }
            if (!in_array($event_kind, $allowed_kinds, true)) {
                return "event kind {$event_kind} not allowed by delegation";
            }
        }

        return true;
    }
    
    /**
     * Sign Nostr event using secp256k1
     */
    private function sign_event($event_data, $calendar_identity) {
        try {
            // Prepare event for signing
            $event = [
                'id' => '',
                'pubkey' => $calendar_identity['pubkey'],
                'created_at' => $event_data['created_at'],
                'kind' => $event_data['kind'],
                'tags' => $event_data['tags'],
                'content' => $event_data['content'],
                'sig' => ''
            ];
            
            // Create event ID
            $event['id'] = $this->calculate_event_id($event);
            
            // Sign the event
            $event['sig'] = $this->sign_event_id($event['id'], $calendar_identity['private_key']);
            
            return $event;
            
        } catch (Exception $e) {
            error_log('Nostr Calendar: Event signing failed: ' . $e->getMessage());
            return false;
        }
    }
    
    /**
     * Calculate Nostr event ID (SHA256 hash)
     */
    private function calculate_event_id($event) {
        return NostrSimpleCrypto::calculate_event_id($event);
    }
    
    /**
     * Sign event ID with private key using secp256k1
     */
    private function sign_event_id($event_id, $private_key) {
        // Try proper crypto libraries first if available
        if (NostrSimpleCrypto::has_proper_crypto()) {
            
            // kornrunner/secp256k1 library
            if (class_exists('kornrunner\Secp256k1\Secp256k1')) {
                try {
                    $secp256k1 = new \kornrunner\Secp256k1\Secp256k1();
                    $signature = $secp256k1->sign(hex2bin($event_id), hex2bin($private_key));
                    return bin2hex($signature);
                } catch (Exception $e) {
                    error_log('Nostr Calendar: kornrunner signing failed: ' . $e->getMessage());
                }
            }
            
            // simplito/elliptic-php library
            if (class_exists('Elliptic\EC')) {
                try {
                    $ec = new \Elliptic\EC('secp256k1');
                    $key = $ec->keyFromPrivate($private_key, 'hex');
                    $signature = $key->sign(hex2bin($event_id));
                    return $signature->toDER('hex');
                } catch (Exception $e) {
                    error_log('Nostr Calendar: elliptic-php signing failed: ' . $e->getMessage());
                }
            }
            
            // Native PHP secp256k1 extension (if available)
            if (function_exists('secp256k1_sign')) {
                try {
                    $signature = secp256k1_sign(hex2bin($event_id), hex2bin($private_key));
                    return bin2hex($signature);
                } catch (Exception $e) {
                    error_log('Nostr Calendar: native secp256k1 signing failed: ' . $e->getMessage());
                }
            }
        }
        
        // Fallback to simplified signing (for development/demo)
        error_log('Nostr Calendar: Using simplified signing fallback (not production-ready)');
        return NostrSimpleCrypto::sign_event($event_id, $private_key);
    }
    
    /**
     * Fallback signing method using OpenSSL (simplified)
     */
    private function sign_with_openssl($event_id, $private_key) {
        // This is a simplified fallback - in production you'd want proper secp256k1
        $signature = hash_hmac('sha256', $event_id, $private_key);
        return $signature . '01'; // Add recovery flag
    }
    
    /**
     * Publish event to multiple Nostr relays
     */
    private function publish_to_relays($event) {
        $successful = [];
        $failed = [];
        
        foreach ($this->relays as $relay_url) {
            try {
                $result = $this->publish_to_relay($event, $relay_url);
                if ($result) {
                    $successful[] = $relay_url;
                } else {
                    $failed[] = $relay_url . ': Connection failed';
                }
            } catch (Exception $e) {
                $failed[] = $relay_url . ': ' . $e->getMessage();
            }
        }
        
        return [
            'successful' => $successful,
            'failed' => $failed
        ];
    }
    
    /**
     * Publish to single relay using WebSocket
     */
    private function publish_to_relay($event, $relay_url) {
        // Use ReactPHP or Ratchet/Pawl for WebSocket connections
        // For simplicity, this is a basic HTTP fallback approach
        
        // WebSocket message format for Nostr
        $message = json_encode(['EVENT', $event]);
        
        // In a real implementation, you'd use:
        // - ReactPHP WebSocket client
        // - Ratchet/Pawl
        // - Or exec a Node.js script
        
        return $this->send_websocket_message($relay_url, $message);
    }
    
    /**
     * Send WebSocket message (simplified implementation)
     */
    private function send_websocket_message($relay_url, $message) {
        // For demo: Use cURL with HTTP POST to a bridge endpoint
        // In production: Use proper WebSocket client
        
        // Option 1: Use exec to call Node.js WebSocket client
        $node_script = NOSTR_CALENDAR_PLUGIN_DIR . 'scripts/publish-to-relay.js';
        if (file_exists($node_script)) {
            $escaped_message = escapeshellarg($message);
            $escaped_relay = escapeshellarg($relay_url);
            
            $command = "node {$node_script} {$escaped_relay} {$escaped_message}";
            $output = shell_exec($command);
            
            return strpos($output, 'SUCCESS') !== false;
        }
        
        // Option 2: Use ReactPHP (if available)
        if (class_exists('React\\Socket\\Connector')) {
            return $this->send_with_reactphp($relay_url, $message);
        }
        
        // Option 3: Log for manual publishing
        error_log("Nostr Calendar: Would publish to {$relay_url}: {$message}");
        return true; // Assume success for demo
    }
    
    /**
     * Send using ReactPHP WebSocket (if available)
     */
    private function send_with_reactphp($relay_url, $message) {
        // Implementation with ReactPHP would go here
        // This requires additional dependencies
        return false;
    }
    
    /**
     * Validate Nostr event structure
     */
    public function validate_event($event) {
        $required_fields = ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig'];
        
        foreach ($required_fields as $field) {
            if (!isset($event[$field])) {
                return false;
            }
        }
        
        // Validate pubkey format (64 char hex)
        if (!preg_match('/^[0-9a-f]{64}$/i', $event['pubkey'])) {
            return false;
        }
        
        // Validate signature format (128 char hex)
        if (!preg_match('/^[0-9a-f]{128}$/i', $event['sig'])) {
            return false;
        }
        
        return true;
    }
}