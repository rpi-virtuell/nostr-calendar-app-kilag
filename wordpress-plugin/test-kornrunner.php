<?php
// Test Script für kornrunner/secp256k1 Detection
define('NOSTR_CALENDAR_PLUGIN_DIR', __DIR__ . '/');

echo "=== kornrunner/secp256k1 Test ===\n";

// Check if autoloader exists
$autoloader_path = NOSTR_CALENDAR_PLUGIN_DIR . 'vendor/autoload.php';
echo "Autoloader exists: " . (file_exists($autoloader_path) ? "✅ YES" : "❌ NO") . "\n";

// Load autoloader if it exists
if (file_exists($autoloader_path)) {
    require_once $autoloader_path;
    echo "Autoloader loaded: ✅ SUCCESS\n";
} else {
    echo "Autoloader loaded: ❌ FAILED\n";
    exit(1);
}

// Test class existence
$class_exists = class_exists('kornrunner\Secp256k1');
echo "kornrunner\\Secp256k1 class exists: " . ($class_exists ? "✅ YES" : "❌ NO") . "\n";

// Test instantiation
if ($class_exists) {
    try {
        $secp256k1 = new \kornrunner\Secp256k1();
        echo "Class instantiation: ✅ SUCCESS\n";
        echo "Object type: " . get_class($secp256k1) . "\n";
    } catch (Exception $e) {
        echo "Class instantiation: ❌ FAILED - " . $e->getMessage() . "\n";
    }
} else {
    echo "Class instantiation: ❌ SKIPPED (class not found)\n";
}

echo "\n=== Test Complete ===\n";