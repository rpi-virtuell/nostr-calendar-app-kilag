<?php
/**
 * Simplified Nostr Crypto Helper
 * Provides basic cryptographic functions without requiring ext-gmp
 */

class NostrSimpleCrypto {
    
    /**
     * Generate a simple key pair for demo/development purposes
     * Note: This is NOT cryptographically secure for production use!
     */
    public static function generate_key_pair() {
        // Generate a random private key (32 bytes = 64 hex chars)
        $private_key = bin2hex(random_bytes(32));
        
        // Create a deterministic public key from private key
        // This is simplified - real Nostr uses secp256k1 curve
        $public_key = hash('sha256', $private_key . 'nostr_pubkey_salt');
        
        return [
            'private_key' => $private_key,
            'public_key' => $public_key
        ];
    }

    /**
     * Derive a public key from a private key using the simplified fallback algorithm
     * Keeps compatibility with generate_key_pair() deterministic public derivation
     */
    public static function private_to_public($private_key) {
        if (!is_string($private_key)) return null;
        // If the provided private key looks like a WIF (base64), try to decode hex
        if (!ctype_xdigit($private_key) && base64_decode($private_key, true) !== false) {
            // attempt to convert from base64-encoded binary to hex
            $bin = base64_decode($private_key);
            $hex = bin2hex($bin);
            if (ctype_xdigit($hex) && strlen($hex) === 64) {
                $private_key = $hex;
            }
        }

        if (!self::validate_key($private_key)) {
            // Not a valid 32-byte hex private key for our fallback
            return null;
        }

        return hash('sha256', $private_key . 'nostr_pubkey_salt');
    }
    
    /**
     * Create event ID (SHA256 hash of serialized event)
     */
    public static function calculate_event_id($event) {
        $serialized = json_encode([
            0, // Reserved
            $event['pubkey'],
            $event['created_at'],
            $event['kind'],
            $event['tags'],
            $event['content']
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        
        return hash('sha256', $serialized);
    }
    
    /**
     * Create a signature for the event
     * Note: This is simplified for demo - real Nostr uses secp256k1 ECDSA
     */
    public static function sign_event($event_id, $private_key) {
        // Simplified signing using HMAC (not real secp256k1)
        $signature = hash_hmac('sha256', $event_id, $private_key);
        
        // Pad to typical signature length and add recovery flag
        $signature = str_pad($signature, 128, '0') . '01';
        
        return substr($signature, 0, 128); // 128 hex chars
    }
    
    /**
     * Validate key format
     */
    public static function validate_key($key) {
        return is_string($key) && strlen($key) === 64 && ctype_xdigit($key);
    }
    
    /**
     * Validate signature format
     */
    public static function validate_signature($signature) {
        return is_string($signature) && strlen($signature) === 128 && ctype_xdigit($signature);
    }
    
    /**
     * Convert private key to WIF format (for compatibility)
     */
    public static function private_key_to_wif($private_key) {
        // Simplified WIF conversion
        return base64_encode(hex2bin($private_key));
    }
    
    /**
     * Check if proper secp256k1 libraries are available
     */
    public static function has_proper_crypto() {
        return (
            extension_loaded('gmp') && 
            (class_exists('kornrunner\Secp256k1\Secp256k1') || 
             class_exists('Elliptic\EC') ||
             function_exists('secp256k1_sign'))
        );
    }
    
    /**
     * Get crypto status for admin display
     */
    public static function get_crypto_status() {
        $has_gmp = extension_loaded('gmp');
        $has_secp256k1_ext = function_exists('secp256k1_sign');
        
        // Check for Composer autoloader and kornrunner library
        $autoloader_paths = [
            dirname(__DIR__) . '/vendor/autoload.php',
            ABSPATH . 'vendor/autoload.php',
            WP_CONTENT_DIR . '/vendor/autoload.php'
        ];
        
        $has_autoloader = false;
        $has_kornrunner = false;
        
        // First check if class already exists
        if (class_exists('kornrunner\\Secp256k1')) {
            $has_kornrunner = true;
            $has_autoloader = true;
        } else {
            // Try to load autoloader
            foreach ($autoloader_paths as $path) {
                if (file_exists($path)) {
                    $has_autoloader = true;
                    try {
                        require_once $path;
                        // Check correct namespace for kornrunner/secp256k1 v0.3.0
                        $has_kornrunner = class_exists('kornrunner\\Secp256k1');
                        if ($has_kornrunner) break;
                    } catch (Exception $e) {
                        // Continue to next path
                    }
                }
            }
        }
        
        $has_elliptic = class_exists('Elliptic\\EC');
        
        $status = [
            'has_gmp' => $has_gmp,
            'has_secp256k1_ext' => $has_secp256k1_ext,
            'has_kornrunner' => $has_kornrunner,
            'has_elliptic' => $has_elliptic,
            'has_autoloader' => $has_autoloader,
            'using_fallback' => true,
            'php_version' => PHP_VERSION,
            'php_sapi' => PHP_SAPI,
            'loaded_extensions' => get_loaded_extensions(),
            'gmp_functions' => [],
            'autoloader_paths' => $autoloader_paths,
            'debug_classes' => []
        ];
        
        // Debug: Check which kornrunner classes exist
        if ($has_autoloader) {
            $possible_classes = [
                'kornrunner\\Secp256k1\\Secp256k1',
                'kornrunner\\Secp256k1',
                'kornrunner\\secp256k1\\Secp256k1',
                'Secp256k1\\Secp256k1'
            ];
            foreach ($possible_classes as $class) {
                if (class_exists($class)) {
                    $status['debug_classes'][] = $class . ' ✅';
                } else {
                    $status['debug_classes'][] = $class . ' ❌';
                }
            }
        }
        
        // Check GMP functions specifically
        if ($status['has_gmp']) {
            $gmp_functions = ['gmp_init', 'gmp_add', 'gmp_mul', 'gmp_pow', 'gmp_mod'];
            foreach ($gmp_functions as $func) {
                $status['gmp_functions'][$func] = function_exists($func);
            }
        }

        $status['using_fallback'] = !($status['has_gmp'] && 
            ($status['has_secp256k1_ext'] || $status['has_kornrunner'] || $status['has_elliptic']));
        
        return $status;
    }
    
    /**
     * Get detailed PHP configuration info
     */
    public static function get_php_info() {
        ob_start();
        phpinfo(INFO_MODULES);
        $phpinfo = ob_get_clean();
        
        // Extract GMP section
        $gmp_info = '';
        if (preg_match('/gmp support.*?<\/table>/si', $phpinfo, $matches)) {
            $gmp_info = strip_tags($matches[0]);
        }
        
        return [
            'php_version' => PHP_VERSION,
            'php_sapi' => PHP_SAPI,
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
            'extensions_dir' => ini_get('extension_dir'),
            'loaded_extensions' => get_loaded_extensions(),
            'gmp_info' => $gmp_info,
            'ini_files' => [
                'main' => php_ini_loaded_file(),
                'additional' => php_ini_scanned_files()
            ]
        ];
    }
}