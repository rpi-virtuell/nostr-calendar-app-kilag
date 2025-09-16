<?php

/**
 * Delegation Manager Class for Nostr Calendar Plugin
 * Handles NIP-26 delegation functionality and AJAX endpoints
 */
class NostrCalendarDelegationManager {
    
    public function init_ajax_endpoints() {
        // AJAX endpoints for delegation management (always available)
        add_action('wp_ajax_get_nostr_delegations', [$this, 'ajax_get_nostr_delegations']);
        add_action('wp_ajax_save_nostr_delegation', [$this, 'ajax_save_nostr_delegation']);
        add_action('wp_ajax_remove_nostr_delegation', [$this, 'ajax_remove_nostr_delegation']);
        add_action('wp_ajax_save_delegator_profile', [$this, 'ajax_save_delegator_profile']);
    }
    
    /**
     * Get all delegations for the current blog
     */
    public function ajax_get_nostr_delegations() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
        }
        
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $stored_delegation = get_option($option_key, null);
        
        $delegations = array();
        if (is_array($stored_delegation) && !empty($stored_delegation['blob'])) {
            $delegations[] = $stored_delegation;
        }
        
        wp_send_json_success(['delegations' => $delegations]);
    }
    
    /**
     * Save a new delegation
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
     * Remove delegation
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
     * AJAX Handler to save delegator profile information
     */
    public function ajax_save_delegator_profile() {
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
        }
        
        if (!check_ajax_referer('nostr_calendar_delegation', '_wpnonce', false)) {
            wp_send_json_error('Invalid nonce');
        }
        
        $delegator_pubkey = sanitize_text_field($_POST['delegator_pubkey'] ?? '');
        $profile_name = sanitize_text_field($_POST['profile_name'] ?? '');
        $profile_about = sanitize_text_field($_POST['profile_about'] ?? '');
        $profile_picture = esc_url_raw($_POST['profile_picture'] ?? '');
        
        if (empty($delegator_pubkey) || empty($profile_name)) {
            wp_send_json_error('Delegator pubkey and profile name are required');
        }
        
        // Store profile information linked to the current blog
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegator_profile_' . $blog_id . '_' . $delegator_pubkey;
        
        $profile_data = [
            'name' => $profile_name,
            'about' => $profile_about,
            'picture' => $profile_picture,
            'pubkey' => $delegator_pubkey,
            'cached_at' => time(),
            'blog_id' => $blog_id
        ];
        
        update_option($option_key, $profile_data);
        
        wp_send_json_success([
            'message' => 'Delegator profile saved successfully',
            'profile' => $profile_data
        ]);
    }
    
    /**
     * Get stored delegation for current blog
     */
    public function get_delegation_for_blog() {
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        return get_option($option_key, null);
    }
    
    /**
     * Get delegator profile
     */
    public function get_delegator_profile($delegator_pubkey) {
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegator_profile_' . $blog_id . '_' . $delegator_pubkey;
        return get_option($option_key, null);
    }
    
    /**
     * Render delegation tab content
     */
    public function render_delegation_tab() {
        $blog_id = function_exists('get_current_blog_id') ? get_current_blog_id() : 0;
        $option_key = 'nostr_calendar_delegation_blog_' . $blog_id;
        $stored_delegation = get_option($option_key, null);
        $delegation_raw = '';
        
        if (is_array($stored_delegation) && !empty($stored_delegation['blob'])) {
            $delegation_raw = $stored_delegation['blob'];
        }
        ?>
        
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
        
        <!-- Delegation Display and Management Section -->
        <div style="margin:12px 0; padding:12px; border:1px solid #e5e5e5; background:#fafafa;">
            <h2 style="margin-top:0;">Delegation für dieses Blog</h2>
            
            <?php wp_nonce_field('nostr_calendar_delegation', '_wpnonce', false); ?>
            
            <?php if (is_array($stored_delegation) && !empty($stored_delegation['blob'])):
                // Parse stored delegation for display
                $raw = $stored_delegation['blob'];
                $arr = json_decode($raw, true);
                if (!is_array($arr)) { 
                    $arr = json_decode(str_replace("'", '"', $raw), true); 
                }
                
                if (is_array($arr) && count($arr) >= 4 && $arr[0] === 'delegation') {
                    $sig = $arr[1];
                    $conds = $arr[2];
                    $delegator = $arr[3];

                    // Parse conditions for human readable output
                    $conds_str = is_string($conds) ? $conds : '';
                    $parts = array_filter(array_map('trim', explode('&', $conds_str)));
                    $min_created = null; 
                    $max_created = null; 
                    $allowed_kinds = null;
                    
                    foreach ($parts as $p) {
                        if (strpos($p, 'created_at>') === 0) { 
                            $min_created = (int)substr($p, strlen('created_at>')); 
                        } elseif (strpos($p, 'created_at<') === 0) { 
                            $max_created = (int)substr($p, strlen('created_at<')); 
                        } elseif (strpos($p, 'kind=') === 0) {
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

                    // Build external lookup links for "whoami" of delegator
                    $hex = $delegator;
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
                                            <span id="delegator-profile-info-<?php echo esc_attr($hex); ?>" style="color:#666;">
                                                Profil wird geladen...
                                            </span>
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
                            Das Profil des Delegators wird automatisch über Nostr-Relays ermittelt.
                            Die externen Links bieten alternative Ansichten.
                        </p>
                    </div>
                    <?php
                } else {
                    echo '<p style="color:#cc0000; margin-top:10px;">Gespeicherter Delegation‑Eintrag ist nicht im erwarteten Format.</p>';
                }
            endif; ?>
        
            <div style="margin-top:10px;">
                <p class="description">Erzeuge die Delegation extern (z. B. auf <a href="https://nostrtool.com/" target="_blank" rel="noopener">nostrtool.com</a>), kopiere den Delegation-Tag und füge ihn hier ein. Das Plugin validiert das Tag und speichert nur den Delegation-Blob (kein nsec).</p>
                <label for="delegation_blob"><strong>Delegation (JSON array)</strong></label><br/>
                <textarea id="delegation_blob" rows="6" cols="80" style="width:100%;" placeholder="['delegation','<sig>','created_at>...','<delegator_pub>']"><?php echo esc_textarea($delegation_raw); ?></textarea>
                <p style="margin-top:8px;"><strong>Oder</strong> lade eine Datei mit dem Delegation-Tag hoch:</p>
                <input type="file" id="delegation_file" accept=".txt,.json" />
            </div>
            <div id="delegation-validation-result" style="margin-top:12px;"></div>
            <p style="margin-top:8px;">
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
        
        <?php
    }
}