<?php

/**
 * Admin Interface Class for Nostr Calendar Plugin
 * Handles the rendering of the admin page with all tabs
 */
class NostrCalendarAdminInterface {
    
    public function render_admin_page() {
        // Handle form submission
        if ($_POST && check_admin_referer('nostr_calendar_settings', 'nostr_calendar_nonce')) {
            $this->handle_admin_form_submission();
        }
        
        // Get current settings
        $relays = get_option('nostr_calendar_relays', [
            'wss://relay.damus.io',
            'wss://relay.snort.social',
            'wss://nostr.wine'
        ]);
        
        $sso_enabled = get_option('nostr_calendar_sso_enabled', false);
        $sso_settings = get_option('nostr_calendar_sso_settings', [
            'shared_secret' => '',
            'calendar_app_url' => 'https://test1.rpi-virtuell.de/nostr-calendar'
        ]);
        
        $crypto_status = $this->get_crypto_status();
        $php_info = [
            'php_version' => PHP_VERSION
        ];
        
        $this->render_admin_page_html($relays, $sso_enabled, $sso_settings, $crypto_status, $php_info);
    }
    
    private function handle_admin_form_submission() {
        $current_tab = sanitize_text_field($_POST['current_tab'] ?? '');
        
        switch ($current_tab) {
            case 'calendar':
                // Handle calendar settings
                if (isset($_POST['relays'])) {
                    $relays = array_filter(array_map('trim', explode("\n", sanitize_textarea_field($_POST['relays']))));
                    update_option('nostr_calendar_relays', $relays);
                    $this->show_admin_notice(__('Kalender-Einstellungen gespeichert!', 'nostr-calendar'), 'success');
                }
                break;
                
            case 'sso':
                // Handle SSO settings
                $sso_enabled = isset($_POST['sso_enabled']) && $_POST['sso_enabled'] === '1';
                update_option('nostr_calendar_sso_enabled', $sso_enabled);
                
                if ($sso_enabled) {
                    $sso_settings = [
                        'shared_secret' => sanitize_text_field($_POST['shared_secret'] ?? ''),
                        'calendar_app_url' => esc_url_raw($_POST['calendar_app_url'] ?? '')
                    ];
                    
                    // Validate settings
                    if (strlen($sso_settings['shared_secret']) < 32) {
                        $this->show_admin_notice(__('Shared Secret muss mindestens 32 Zeichen lang sein!', 'nostr-calendar'), 'error');
                        break;
                    }
                    
                    update_option('nostr_calendar_sso_settings', $sso_settings);
                }
                
                $this->show_admin_notice(__('SSO-Einstellungen gespeichert!', 'nostr-calendar'), 'success');
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
    
    private function get_crypto_status() {
        $has_gmp = extension_loaded('gmp');
        $has_secp256k1_ext = extension_loaded('secp256k1');
        $has_autoloader = file_exists(NOSTR_CALENDAR_PLUGIN_DIR . 'vendor/autoload.php');
        
        // Ensure autoloader is loaded before checking class existence
        if ($has_autoloader && !class_exists('kornrunner\Secp256k1')) {
            require_once NOSTR_CALENDAR_PLUGIN_DIR . 'vendor/autoload.php';
        }
        
        // Check the correct namespace for kornrunner/secp256k1 v0.3.0
        $has_kornrunner = class_exists('kornrunner\Secp256k1');
        
        return [
            'has_gmp' => $has_gmp,
            'has_secp256k1_ext' => $has_secp256k1_ext,
            'has_autoloader' => $has_autoloader,
            'has_kornrunner' => $has_kornrunner,
            'using_fallback' => !($has_gmp && ($has_secp256k1_ext || $has_kornrunner))
        ];
    }
    
    private function ensure_user_pubkey_meta($user_id) {
        // Delegate to SSO manager
        global $nostr_calendar_sso_manager;
        if ($nostr_calendar_sso_manager) {
            return $nostr_calendar_sso_manager->generate_deterministic_pubkey($user_id);
        }
    }
    
    private function generate_nostr_token($user_id) {
        // Delegate to SSO manager
        global $nostr_calendar_sso_manager;
        if ($nostr_calendar_sso_manager) {
            return $nostr_calendar_sso_manager->generate_nostr_token($user_id);
        }
        return 'placeholder_token';
    }
    
    private function render_admin_page_html($relays, $sso_enabled, $sso_settings, $crypto_status, $php_info) {
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
                        <?php wp_nonce_field('nostr_calendar_settings', 'nostr_calendar_nonce'); ?>
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
                        <?php wp_nonce_field('nostr_calendar_settings', 'nostr_calendar_nonce'); ?>
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
                    // Get delegation manager instance and render tab
                    global $nostr_calendar_delegation_manager;
                    if ($nostr_calendar_delegation_manager) {
                        $nostr_calendar_delegation_manager->render_delegation_tab();
                    } else {
                        echo '<p>' . __('Delegation-Manager nicht verfügbar.', 'nostr-calendar') . '</p>';
                    }
                    ?>
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
}