<?php
/**
 * Plugin Name: Nostr Calendar
 * Plugin URI: https://github.com/johappel/nostr-calendar-app
 * Description: Ein WordPress Plugin für dezentrale Kalender-Events über das Nostr-Protokoll
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
class NostrCalendar {
    
    public function __construct() {
        add_action('init', [$this, 'init']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        
        // Plugin lifecycle hooks
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }
    
    public function init() {
        // Initialize REST API
        new NostrCalendarRestAPI();
        
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
            
            // Localize script with WordPress data
            wp_localize_script('nostr-calendar-app', 'nostrCalendarWP', [
                'apiUrl' => rest_url('nostr-calendar/v1/'),
                'nonce' => wp_create_nonce('wp_rest'),
                'currentUser' => wp_get_current_user(),
                'isLoggedIn' => is_user_logged_in(),
                'relays' => get_option('nostr_calendar_relays', [
                    'wss://relay.damus.io',
                    'wss://nos.lol'
                ])
            ]);
        }
    }
    
    public function add_admin_menu() {
        add_options_page(
            __('Nostr Calendar Settings', 'nostr-calendar'),
            __('Nostr Calendar', 'nostr-calendar'),
            'manage_options',
            'nostr-calendar',
            [$this, 'admin_page']
        );
    }
    
    public function admin_page() {
        if (isset($_POST['submit'])) {
            $relays = array_filter(array_map('trim', explode("\n", $_POST['relays'])));
            update_option('nostr_calendar_relays', $relays);
            echo '<div class="notice notice-success"><p>' . __('Settings saved!', 'nostr-calendar') . '</p></div>';
        }
        
        $relays = get_option('nostr_calendar_relays', [
            'wss://relay.damus.io',
            'wss://nos.lol'
        ]);
        
        // Get crypto status
        $crypto_status = NostrSimpleCrypto::get_crypto_status();
        $php_info = NostrSimpleCrypto::get_php_info();
        ?>
        <div class="wrap">
            <h1><?php _e('Nostr Calendar Settings', 'nostr-calendar'); ?></h1>
            
            <?php if ($crypto_status['using_fallback']): ?>
            <div class="notice notice-warning">
                <p><strong><?php _e('Cryptographic Warning:', 'nostr-calendar'); ?></strong></p>
                <p><?php _e('This plugin is using simplified cryptography (development mode). For production use, please install:', 'nostr-calendar'); ?></p>
                <ul>
                    <li><code>ext-gmp</code> PHP extension</li>
                    <li><code>kornrunner/secp256k1</code> via Composer</li>
                </ul>
                <p><?php _e('Current status:', 'nostr-calendar'); ?></p>
                <ul>
                    <li>GMP Extension: <?php echo $crypto_status['has_gmp'] ? '✅ Installed' : '❌ Missing'; ?></li>
                    <li>secp256k1 Extension: <?php echo $crypto_status['has_secp256k1_ext'] ? '✅ Available' : '❌ Missing'; ?></li>
                    <li>Composer Autoloader: <?php echo $crypto_status['has_autoloader'] ? '✅ Found' : '❌ Missing'; ?></li>
                    <li>kornrunner/secp256k1: <?php echo $crypto_status['has_kornrunner'] ? '✅ Available' : '❌ Missing'; ?></li>
                    <li>Crypto Libraries: <?php echo ($crypto_status['has_kornrunner'] || $crypto_status['has_elliptic']) ? '✅ Available' : '❌ Missing'; ?></li>
                </ul>
                
                <details>
                    <summary><strong>🔍 Detailed Diagnostics</strong></summary>
                    <div style="background: #f0f0f0; padding: 15px; margin: 10px 0; font-family: monospace; font-size: 12px;">
                        <p><strong>PHP Environment:</strong></p>
                        <ul>
                            <li>PHP Version: <?php echo $php_info['php_version']; ?></li>
                            <li>SAPI: <?php echo $php_info['php_sapi']; ?></li>
                            <li>Server: <?php echo $php_info['server_software']; ?></li>
                            <li>Extensions Dir: <?php echo $php_info['extensions_dir']; ?></li>
                        </ul>
                        
                        <p><strong>PHP Configuration Files:</strong></p>
                        <ul>
                            <li>Main: <?php echo $php_info['ini_files']['main'] ?: 'None'; ?></li>
                            <li>Additional: <?php echo $php_info['ini_files']['additional'] ?: 'None'; ?></li>
                        </ul>
                        
                        <p><strong>Loaded Extensions (<?php echo count($php_info['loaded_extensions']); ?> total):</strong></p>
                        <div style="max-height: 100px; overflow-y: auto; border: 1px solid #ccc; padding: 5px;">
                            <?php echo implode(', ', $php_info['loaded_extensions']); ?>
                        </div>
                        
                        <p><strong>Composer Autoloader Search:</strong></p>
                        <ul>
                            <?php foreach ($crypto_status['autoloader_paths'] as $path): ?>
                            <li><?php echo esc_html($path); ?>: <?php echo file_exists($path) ? '✅ Found' : '❌ Not Found'; ?></li>
                            <?php endforeach; ?>
                        </ul>
                        
                        <?php if (!empty($crypto_status['debug_classes'])): ?>
                        <p><strong>Class Detection Debug:</strong></p>
                        <ul>
                            <?php foreach ($crypto_status['debug_classes'] as $class_status): ?>
                            <li><?php echo esc_html($class_status); ?></li>
                            <?php endforeach; ?>
                        </ul>
                        <?php endif; ?>
                        
                        <?php if ($crypto_status['has_gmp'] && !empty($crypto_status['gmp_functions'])): ?>
                        <p><strong>GMP Functions:</strong></p>
                        <ul>
                            <?php foreach ($crypto_status['gmp_functions'] as $func => $available): ?>
                            <li><?php echo $func; ?>: <?php echo $available ? '✅' : '❌'; ?></li>
                            <?php endforeach; ?>
                        </ul>
                        <?php endif; ?>
                        
                        <?php if (!empty($php_info['gmp_info'])): ?>
                        <p><strong>GMP Extension Info:</strong></p>
                        <pre style="white-space: pre-wrap; font-size: 10px;"><?php echo esc_html($php_info['gmp_info']); ?></pre>
                        <?php endif; ?>
                    </div>
                </details>
                
                <p><strong>🛠️ Quick Fix Commands:</strong></p>
                <div style="background: #333; color: #0f0; padding: 10px; font-family: monospace;">
                    <p># For Ubuntu/Debian systems:</p>
                    <p>sudo apt-get install php8.3-gmp</p>
                    <p>sudo systemctl reload php8.3-fpm</p>
                    <p>sudo systemctl reload nginx  # or apache2</p>
                    <br>
                    <p># For CentOS/RHEL systems:</p>
                    <p>sudo yum install php-gmp</p>
                    <p>sudo systemctl reload php-fpm</p>
                    <br>
                    <p># Verify installation:</p>
                    <p>php -m | grep gmp</p>
                </div>
            </div>
            <?php else: ?>
            <div class="notice notice-success">
                <p><strong><?php _e('Cryptography Status:', 'nostr-calendar'); ?></strong> ✅ Production-ready crypto libraries detected!</p>
            </div>
            <?php endif; ?>
            
            <form method="post">
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php _e('Nostr Relays', 'nostr-calendar'); ?></th>
                        <td>
                            <textarea name="relays" rows="10" cols="50" class="large-text"><?php echo esc_textarea(implode("\n", $relays)); ?></textarea>
                            <p class="description"><?php _e('Enter one relay URL per line (WebSocket URLs starting with wss://)', 'nostr-calendar'); ?></p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
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

    /**
     * Serve the plugin's single-page app when the rewrite rule matches.
     */
    public function serve_calendar_page() {
        if (get_query_var('nostr_calendar')) {
            $path = get_query_var('nostr_calendar_path');
            
            // If there's a specific file path requested
            if ($path) {
                // Clean the path to prevent directory traversal
                $path = ltrim($path, '/');
                $path = str_replace(['../', './'], '', $path);
                
                // Define allowed files and their locations
                $file_candidates = [
                    'wp-sso.html' => [
                        NOSTR_CALENDAR_PLUGIN_DIR . 'html/wp-sso.html',
                        dirname(NOSTR_CALENDAR_PLUGIN_DIR) . '/wp-sso.html'  // Root of nostr-calendar-app
                    ],
                    'wp-logout' => [
                        NOSTR_CALENDAR_PLUGIN_DIR . 'html/wp-logout.html',
                        dirname(NOSTR_CALENDAR_PLUGIN_DIR) . '/wp-logout.html'
                    ],
                    'index.html' => [
                        NOSTR_CALENDAR_PLUGIN_DIR . 'html/index.html',
                        NOSTR_CALENDAR_PLUGIN_DIR . 'assets/html/index.html',
                        NOSTR_CALENDAR_PLUGIN_DIR . 'index.html',
                        NOSTR_CALENDAR_PLUGIN_DIR . 'assets/index.html',
                        dirname(NOSTR_CALENDAR_PLUGIN_DIR) . '/index.html'  // Root of nostr-calendar-app
                    ]
                ];
                
                // Check if the requested file is in our allowed list
                if (isset($file_candidates[$path])) {
                    foreach ($file_candidates[$path] as $file) {
                        if (file_exists($file)) {
                            // Determine content type
                            $content_type = 'text/html; charset=utf-8';
                            if (pathinfo($path, PATHINFO_EXTENSION) === 'css') {
                                $content_type = 'text/css';
                            } elseif (pathinfo($path, PATHINFO_EXTENSION) === 'js') {
                                $content_type = 'application/javascript';
                            }
                            
                            header('Content-Type: ' . $content_type);
                            readfile($file);
                            exit;
                        }
                    }
                    
                    // File not found
                    status_header(404);
                    echo '<h1>File Not Found</h1><p>' . esc_html($path) . ' not found in plugin folder.</p>';
                    exit;
                }
                
                // For any other files, try to serve them from the html directory
                $generic_file = NOSTR_CALENDAR_PLUGIN_DIR . 'html/' . $path;
                if (file_exists($generic_file) && is_file($generic_file)) {
                    // Basic security check - only allow certain file types
                    $allowed_extensions = ['html', 'css', 'js', 'json', 'txt'];
                    $extension = pathinfo($path, PATHINFO_EXTENSION);
                    
                    if (in_array($extension, $allowed_extensions)) {
                        $content_types = [
                            'html' => 'text/html; charset=utf-8',
                            'css' => 'text/css',
                            'js' => 'application/javascript',
                            'json' => 'application/json',
                            'txt' => 'text/plain'
                        ];
                        
                        header('Content-Type: ' . ($content_types[$extension] ?? 'text/plain'));
                        readfile($generic_file);
                        exit;
                    }
                }
                
                // File not found or not allowed
                status_header(404);
                echo '<h1>Not Found</h1><p>The requested file was not found.</p>';
                exit;
            }
            
            // No specific path - serve main index.html
            $candidates = [
                NOSTR_CALENDAR_PLUGIN_DIR . 'html/index.html',
                NOSTR_CALENDAR_PLUGIN_DIR . 'assets/html/index.html',
                NOSTR_CALENDAR_PLUGIN_DIR . 'index.html',
                NOSTR_CALENDAR_PLUGIN_DIR . 'assets/index.html',
                dirname(NOSTR_CALENDAR_PLUGIN_DIR) . '/index.html'  // Root of nostr-calendar-app
            ];

            foreach ($candidates as $file) {
                if (file_exists($file)) {
                    header('Content-Type: text/html; charset=utf-8');
                    readfile($file);
                    exit;
                }
            }

            // If not found, return 404
            status_header(404);
            echo '<h1>Nostr Calendar</h1><p>Frontend not found in plugin folder.</p>';
            exit;
        }
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
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($identities_sql);
        dbDelta($events_sql);
    }
}

// Include required classes
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-simple-crypto.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-rest-api.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-identity.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/class-nostr-publisher.php';
require_once NOSTR_CALENDAR_PLUGIN_DIR . 'includes/shortcodes.php';

// Initialize the plugin
new NostrCalendar();