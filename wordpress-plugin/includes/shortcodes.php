<?php
/**
 * Shortcodes for Nostr Calendar
 */

// Register shortcode for calendar display
add_shortcode('nostr_calendar', 'nostr_calendar_shortcode');

/**
 * Main calendar shortcode
 */
function nostr_calendar_shortcode($atts) {
    $atts = shortcode_atts([
        'theme' => 'light',
        'view' => 'month',
        'relays' => '',
        'height' => '600px'
    ], $atts);
    
    // Custom relays for this instance
    if (!empty($atts['relays'])) {
        $custom_relays = array_map('trim', explode(',', $atts['relays']));
        wp_localize_script('nostr-calendar-app', 'customRelays', $custom_relays);
    }
    
    ob_start();
    ?>
    <div id="nostr-calendar-container" 
         data-theme="<?php echo esc_attr($atts['theme']); ?>"
         data-view="<?php echo esc_attr($atts['view']); ?>"
         style="height: <?php echo esc_attr($atts['height']); ?>;">
        
        <!-- Calendar HTML structure -->
        <div class="calendar-header">
            <div class="auth-section">
                <div id="whoami" class="user-info"></div>
                <button id="btn-sidebar" class="sidebar-btn">⚙️</button>
            </div>
            
            <div class="calendar-controls">
                <button id="btn-refresh">↻</button>
                <button id="btn-new" disabled>Neuer Termin</button>
            </div>
        </div>
        
        <!-- Sidebar -->
        <div id="sidebar" class="sidebar">
            <div class="sidebar-content">
                <h3><?php _e('Authentication', 'nostr-calendar'); ?></h3>
                <div class="auth-options">
                    <div class="auth-plugin-section">
                        <h4><?php _e('WordPress SSO', 'nostr-calendar'); ?></h4>
                        <div class="auth-status" id="wp-auth-status">
                            <?php if (is_user_logged_in()): ?>
                                <p><?php printf(__('Logged in as: %s', 'nostr-calendar'), wp_get_current_user()->display_name); ?></p>
                                <button id="btn-logout" class="btn-logout"><?php _e('Logout', 'nostr-calendar'); ?></button>
                            <?php else: ?>
                                <p><?php _e('Not logged in', 'nostr-calendar'); ?></p>
                                <a href="<?php echo wp_login_url(get_permalink()); ?>" class="btn-login">
                                    <?php _e('WordPress Login', 'nostr-calendar'); ?>
                                </a>
                            <?php endif; ?>
                        </div>
                    </div>
                    
                    <div class="auth-plugin-section">
                        <h4><?php _e('Nostr Authentication', 'nostr-calendar'); ?></h4>
                        <div class="auth-status" id="nostr-auth-status">
                            <button id="btn-nostr-login" class="btn-login"><?php _e('Connect Nostr', 'nostr-calendar'); ?></button>
                        </div>
                    </div>
                </div>
                
                <h3><?php _e('Settings', 'nostr-calendar'); ?></h3>
                <div class="settings-section">
                    <label for="sidebar-theme-select"><?php _e('Theme:', 'nostr-calendar'); ?></label>
                    <select id="sidebar-theme-select">
                        <option value="light"><?php _e('Light', 'nostr-calendar'); ?></option>
                        <option value="dark"><?php _e('Dark', 'nostr-calendar'); ?></option>
                        <option value="auto"><?php _e('Auto', 'nostr-calendar'); ?></option>
                    </select>
                </div>
                
                <h3><?php _e('Import/Export', 'nostr-calendar'); ?></h3>
                <div class="import-export-section">
                    <button id="sidebar-ics-import"><?php _e('Import ICS', 'nostr-calendar'); ?></button>
                    <button id="sidebar-ics-export"><?php _e('Export ICS', 'nostr-calendar'); ?></button>
                </div>
            </div>
        </div>
        
        <div id="sidebar-overlay" class="sidebar-overlay"></div>
        
        <!-- Main calendar content -->
        <div class="calendar-content">
            <div class="filters">
                <input type="text" id="text-search" placeholder="<?php _e('Search events...', 'nostr-calendar'); ?>">
                <input type="text" id="tag-search" placeholder="<?php _e('Add tag filter...', 'nostr-calendar'); ?>">
                <select id="month-select">
                    <option value=""><?php _e('All months', 'nostr-calendar'); ?></option>
                </select>
                <div id="selected-tags" class="selected-tags"></div>
            </div>
            
            <div id="info" class="info"></div>
            
            <div class="view-controls">
                <button id="btn-view-calendar" class="view-btn active"><?php _e('Calendar', 'nostr-calendar'); ?></button>
                <button id="btn-view-list" class="view-btn"><?php _e('List', 'nostr-calendar'); ?></button>
            </div>
            
            <div id="calendar-view" class="calendar-view"></div>
            <div id="list-view" class="list-view" style="display: none;"></div>
        </div>
        
        <!-- Event Modal -->
        <dialog id="modal" class="event-modal">
            <form>
                <h2 id="modal-title"><?php _e('New Event', 'nostr-calendar'); ?></h2>
                
                <label for="event-title"><?php _e('Title *', 'nostr-calendar'); ?></label>
                <input type="text" id="event-title" required>
                
                <label for="event-starts"><?php _e('Start *', 'nostr-calendar'); ?></label>
                <input type="datetime-local" id="event-starts" required>
                
                <label for="event-ends"><?php _e('End *', 'nostr-calendar'); ?></label>
                <input type="datetime-local" id="event-ends" required>
                
                <label for="event-location"><?php _e('Location', 'nostr-calendar'); ?></label>
                <input type="text" id="event-location">
                
                <label for="event-content"><?php _e('Description', 'nostr-calendar'); ?></label>
                <textarea id="event-content" rows="4"></textarea>
                
                <label for="event-tags"><?php _e('Tags', 'nostr-calendar'); ?></label>
                <input type="text" id="event-tags" placeholder="<?php _e('Comma separated tags', 'nostr-calendar'); ?>">
                
                <div class="modal-actions">
                    <button type="button" id="btn-close-modal"><?php _e('Cancel', 'nostr-calendar'); ?></button>
                    <button type="button" id="btn-save" class="btn-primary"><?php _e('Save', 'nostr-calendar'); ?></button>
                    <button type="button" id="btn-delete" class="btn-delete" style="display: none;"><?php _e('Delete', 'nostr-calendar'); ?></button>
                </div>
            </form>
        </dialog>
        
        <!-- Hidden elements for compatibility -->
        <input type="file" id="btn-ics-import" style="display: none;" accept=".ics">
        <button id="btn-ics-export" style="display: none;"></button>
    </div>
    
    <style>
    .calendar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding: 10px;
        border-bottom: 1px solid #ddd;
    }
    
    .auth-section {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .sidebar-btn {
        padding: 8px 12px;
        background: #0073aa;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .sidebar {
        position: fixed;
        top: 0;
        right: -400px;
        width: 400px;
        height: 100vh;
        background: white;
        box-shadow: -2px 0 5px rgba(0,0,0,0.1);
        transition: right 0.3s ease;
        z-index: 1000;
        overflow-y: auto;
    }
    
    .sidebar.open {
        right: 0;
    }
    
    .sidebar-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.5);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 999;
    }
    
    .sidebar-overlay.active {
        opacity: 1;
        visibility: visible;
    }
    
    .sidebar-content {
        padding: 20px;
    }
    
    .auth-plugin-section {
        margin-bottom: 20px;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 4px;
    }
    
    .calendar-content {
        position: relative;
    }
    
    .filters {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }
    
    .view-controls {
        margin-bottom: 20px;
    }
    
    .view-btn {
        padding: 8px 16px;
        margin-right: 10px;
        background: #f0f0f0;
        border: 1px solid #ddd;
        cursor: pointer;
    }
    
    .view-btn.active {
        background: #0073aa;
        color: white;
    }
    
    .event-modal {
        max-width: 500px;
        width: 90%;
        padding: 20px;
        border: none;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    
    .event-modal form {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }
    
    .modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
    }
    
    .btn-primary {
        background: #0073aa;
        color: white;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .btn-delete {
        background: #dc3545;
        color: white;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    </style>
    <?php
    
    return ob_get_clean();
}

/**
 * User calendar shortcode (shows events for specific user)
 */
add_shortcode('nostr_user_calendar', 'nostr_user_calendar_shortcode');

function nostr_user_calendar_shortcode($atts) {
    $atts = shortcode_atts([
        'user_id' => get_current_user_id(),
        'pubkey' => '',
        'readonly' => 'false'
    ], $atts);
    
    // If pubkey is provided, show events for that pubkey
    if (!empty($atts['pubkey'])) {
        wp_localize_script('nostr-calendar-app', 'filterPubkey', $atts['pubkey']);
    }
    
    // If readonly, disable editing
    if ($atts['readonly'] === 'true') {
        wp_localize_script('nostr-calendar-app', 'readOnly', true);
    }
    
    return nostr_calendar_shortcode($atts);
}