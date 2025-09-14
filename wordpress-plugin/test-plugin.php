<?php
/**
 * Plugin Test Script
 * Testet die Grundfunktionen des Nostr Calendar Plugins
 */

// Nur ausführen wenn direkt aufgerufen
if (basename($_SERVER['SCRIPT_NAME']) === 'test-plugin.php') {
    // Lade WordPress
    require_once('../../../wp-load.php');
    
    echo "<h1>Nostr Calendar Plugin Test</h1>\n";
    
    // Test 1: Plugin-Klassen verfügbar?
    echo "<h2>1. Klassen-Test</h2>\n";
    $classes = [
        'NostrCalendar',
        'NostrCalendarRestAPI', 
        'NostrCalendarIdentity',
        'NostrCalendarPublisher',
        'NostrSimpleCrypto'
    ];
    
    foreach ($classes as $class) {
        echo "<p>$class: " . (class_exists($class) ? '✅ OK' : '❌ Missing') . "</p>\n";
    }
    
    // Test 2: Crypto-Status
    echo "<h2>2. Kryptographie-Test</h2>\n";
    if (class_exists('NostrSimpleCrypto')) {
        $crypto_status = NostrSimpleCrypto::get_crypto_status();
        echo "<p>GMP Extension: " . ($crypto_status['has_gmp'] ? '✅ Available' : '❌ Missing') . "</p>\n";
        echo "<p>secp256k1 Extension: " . ($crypto_status['has_secp256k1_ext'] ? '✅ Available' : '❌ Missing') . "</p>\n";
        echo "<p>Crypto Libraries: " . (($crypto_status['has_kornrunner'] || $crypto_status['has_elliptic']) ? '✅ Available' : '❌ Missing') . "</p>\n";
        echo "<p>Using Fallback: " . ($crypto_status['using_fallback'] ? '⚠️ Yes (Development Mode)' : '✅ No (Production Ready)') . "</p>\n";
        
        // Test Key Generation
        echo "<h3>Key Generation Test</h3>\n";
        $keypair = NostrSimpleCrypto::generate_key_pair();
        if ($keypair && isset($keypair['private_key']) && isset($keypair['public_key'])) {
            echo "<p>✅ Key generation successful</p>\n";
            echo "<p>Private key length: " . strlen($keypair['private_key']) . " chars</p>\n";
            echo "<p>Public key length: " . strlen($keypair['public_key']) . " chars</p>\n";
        } else {
            echo "<p>❌ Key generation failed</p>\n";
        }
    }
    
    // Test 3: Database Tables
    echo "<h2>3. Datenbank-Test</h2>\n";
    global $wpdb;
    
    $tables = [
        $wpdb->prefix . 'nostr_calendar_identities',
        $wpdb->prefix . 'nostr_calendar_events'
    ];
    
    foreach ($tables as $table) {
        $exists = $wpdb->get_var("SHOW TABLES LIKE '$table'");
        echo "<p>$table: " . ($exists ? '✅ Exists' : '❌ Missing') . "</p>\n";
    }
    
    // Test 4: WordPress-Integration
    echo "<h2>4. WordPress-Integration</h2>\n";
    echo "<p>WordPress Version: " . get_bloginfo('version') . "</p>\n";
    echo "<p>Plugin Active: " . (is_plugin_active('nostr-calendar/nostr-calendar.php') ? '✅ Yes' : '❌ No') . "</p>\n";
    echo "<p>Current User: " . (is_user_logged_in() ? wp_get_current_user()->display_name : 'Not logged in') . "</p>\n";
    
    // Test 5: REST API Endpoints
    echo "<h2>5. REST API Test</h2>\n";
    $endpoints = [
        '/wp-json/nostr-calendar/v1/sso-status',
        '/wp-json/nostr-calendar/v1/me'
    ];
    
    foreach ($endpoints as $endpoint) {
        $url = home_url($endpoint);
        echo "<p><a href='$url' target='_blank'>$endpoint</a></p>\n";
    }
    
    echo "<h2>Test Complete! 🎉</h2>\n";
    echo "<p>Plugin is ready for use. Check the admin settings at <a href='" . admin_url('options-general.php?page=nostr-calendar') . "'>Settings → Nostr Calendar</a></p>\n";
}