// Admin JavaScript for Nostr Calendar Unified Plugin
jQuery(document).ready(function($) {
    console.log('[NostrCalendarAdmin] Initializing admin interface');
    
    // Initialize tabs
    $('#nostr-calendar-tabs').tabs({
        activate: function(event, ui) {
            console.log('[NostrCalendarAdmin] Tab activated:', ui.newTab.find('a').text());
            
            // Load delegations when delegation tab is activated  
            if (ui.newPanel.attr('id') === 'tab-delegation') {
                // Delegation interface is now handled by initDelegationInterface()
                console.log('[NostrCalendarAdmin] Delegation tab activated');
            }
        }
    });
    
    // SSO Enable/Disable toggle
    $('input[name="sso_enabled"]').on('change', function() {
        const isEnabled = $(this).is(':checked');
        toggleSSOFields(isEnabled);
        
        if (isEnabled && !$('input[name="shared_secret"]').val()) {
            generateSharedSecret();
        }
    });
    
    // Generate shared secret button
    $('#generate-secret-btn').on('click', function(e) {
        e.preventDefault();
        generateSharedSecret();
    });
    
    // Test SSO connection button
    $('#test-sso-btn').on('click', function(e) {
        e.preventDefault();
        testSSOConnection();
    });
    
    // Delegation management
    initDelegationUI();
    
    // Initialize delegation interface if on delegation tab
    initDelegationInterface();
    
    // Initialize delegation interface functions
    function initDelegationInterface() {
        console.log('[NostrCalendarAdmin] Initializing delegation interface');
        
        // Helpers from original nostr-delegation-admin.js
        function toHex(buf) {
            return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        
        // Portable SHA-256 (WebCrypto first, fallback to nostr-tools if available)
        async function sha256Bytes(inputUint8) {
            if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
                const digest = await window.crypto.subtle.digest('SHA-256', inputUint8);
                return new Uint8Array(digest);
            }
            const NT = window.NostrTools;
            if (NT && NT.utils && typeof NT.utils.sha256 === 'function') {
                return await NT.utils.sha256(inputUint8);
            }
            throw new Error('SHA-256 nicht verfügbar (WebCrypto/nostr-tools)');
        }

        // Lazy loader für nostr-tools
        async function getNT() {
            let NT = window.NostrTools;
            if (!NT) {
                try {
                    NT = await import('https://esm.sh/nostr-tools@2.8.1');
                    window.NostrTools = NT;
                    console.log('[delegation-admin] nostr-tools loaded via dynamic import');
                } catch (e) {
                    console.warn('[delegation-admin] dynamic import failed', e);
                    return null;
                }
            }
            // Some bundlers deliver under .default
            if (NT && NT.default && !NT.getPublicKey && NT.default.getPublicKey) {
                NT = NT.default;
                window.NostrTools = NT;
            }
            return NT;
        }

        // Get schnorr implementation (from nostr-tools or @noble/curves)
        async function getSchnorr(NT) {
            // 1) Check if nostr-tools already provides schnorr with sign()
            if (NT && NT.schnorr && typeof NT.schnorr.sign === 'function') {
                return NT.schnorr;
            }
            // 2) Fallback: load directly from @noble/curves
            try {
                const mod = await import('https://esm.sh/@noble/curves@1.4.0/secp256k1');
                const secp = mod.secp256k1 || (mod.default && mod.default.secp256k1) || mod;
                const schnorr = mod.schnorr || (secp && secp.schnorr);
                if (schnorr && typeof schnorr.sign === 'function') {
                    return schnorr;
                }
            } catch (e) {
                console.warn('[delegation-admin] noble schnorr import failed', e);
            }
            return null;
        }
        
        // Delegation blob validation and save
        function validateDelegationBlob(blob) {
            try {
                let arr = JSON.parse(blob);
                if (!Array.isArray(arr)) {
                    // Try PHP-like single quotes fallback
                    const fixed = blob.replace(/'/g, '"');
                    arr = JSON.parse(fixed);
                }
                if (Array.isArray(arr) && arr.length >= 4 && arr[0] === 'delegation') {
                    return {
                        valid: true,
                        parsed: {
                            sig: arr[1],
                            conds: arr[2], 
                            delegator: arr[3]
                        }
                    };
                }
                return { valid: false, error: 'Invalid format: must be array with "delegation" as first element' };
            } catch (e) {
                return { valid: false, error: 'JSON parse error: ' + e.message };
            }
        }
        
        function updateValidationResult(result) {
            const $resultDiv = $('#delegation-validation-result');
            if (result.valid) {
                $resultDiv.html('<p style="color:green;">✅ Valid delegation format</p>');
                $('#save-delegation').prop('disabled', false);
            } else {
                $resultDiv.html('<p style="color:red;">❌ ' + result.error + '</p>');
                $('#save-delegation').prop('disabled', true);
            }
        }
        
        // Validate on input change
        $('#delegation_blob').on('input', function() {
            const blob = $(this).val().trim();
            if (blob) {
                const result = validateDelegationBlob(blob);
                updateValidationResult(result);
            } else {
                $('#delegation-validation-result').empty();
                $('#save-delegation').prop('disabled', true);
            }
        });
        
        // File upload handler
        $('#delegation_file').on('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const content = e.target.result.trim();
                    $('#delegation_blob').val(content).trigger('input');
                };
                reader.readAsText(file);
            }
        });
        
        // Save delegation
        $('#save-delegation').on('click', function(e) {
            e.preventDefault();
            const blob = $('#delegation_blob').val().trim();
            if (!blob) return;
            
            $.ajax({
                url: nostrCalendarAdmin.ajaxUrl,
                method: 'POST',
                data: {
                    action: 'save_nostr_delegation',
                    delegation: blob,
                    _wpnonce: nostrCalendarAdmin.delegationNonce
                },
                success: function(response) {
                    if (response.success) {
                        location.reload(); // Reload to show updated delegation
                    } else {
                        alert('Error: ' + (response.data || response.error || 'Unknown error'));
                    }
                },
                error: function() {
                    alert('AJAX error occurred');
                }
            });
        });
        
        // Remove delegation
        $('#remove-delegation').on('click', function(e) {
            e.preventDefault();
            if (confirm('Are you sure you want to remove the delegation?')) {
                $.ajax({
                    url: nostrCalendarAdmin.ajaxUrl,
                    method: 'POST',
                    data: {
                        action: 'remove_nostr_delegation',
                        _wpnonce: nostrCalendarAdmin.delegationNonce
                    },
                    success: function(response) {
                        if (response.success) {
                            location.reload(); // Reload to show removed delegation
                        } else {
                            alert('Error: ' + (response.data || response.error || 'Unknown error'));
                        }
                    },
                    error: function() {
                        alert('AJAX error occurred');
                    }
                });
            }
        });
        
        // Generate new keypair (delegator)
        $('#gen_btn_new_nsec').on('click', async function() {
            try {
                const NT = await getNT();
                if (!NT || !NT.generateSecretKey || !NT.getPublicKey || !NT.nip19) {
                    throw new Error('nostr-tools nicht verfügbar');
                }
                const sk = NT.generateSecretKey();
                const pk = NT.getPublicKey(sk);
                const nsec = NT.nip19.nsecEncode(sk);
                const npub = NT.nip19.npubEncode(pk);
                
                $('#gen_delegator_nsec').val(nsec);
                $('#gen_delegator_info').html(`
                    <strong>Pubkey (hex):</strong> ${pk}<br/>
                    <strong>Pubkey (npub):</strong> ${npub}
                `);
            } catch (e) {
                alert('Fehler beim Erzeugen des Schlüssels: ' + e.message);
            }
        });
        
        // Generate delegatee keypair
        $('#gen_btn_delegatee_new').on('click', async function() {
            try {
                const NT = await getNT();
                if (!NT || !NT.generateSecretKey || !NT.getPublicKey || !NT.nip19) {
                    throw new Error('nostr-tools nicht verfügbar');
                }
                const sk = NT.generateSecretKey();
                const pk = NT.getPublicKey(sk);
                const nsec = NT.nip19.nsecEncode(sk);
                const npub = NT.nip19.npubEncode(pk);
                
                $('#gen_delegatee_pub').val(pk);
                $('#gen_delegatee_info').html(`
                    Delegatee pubkey (hex): ${pk}<br/>
                    npub: ${npub}<br/>
                    <span style="color:#b00;">nsec (GEHEIM, sicher speichern!): ${nsec}</span>
                `);
            } catch (e) {
                alert('Fehler beim Erzeugen des Delegatee-Schlüssels: ' + e.message);
            }
        });
        
        // Update delegator info when nsec is entered
        $('#gen_delegator_nsec').on('input', async function() {
            const nsec = $(this).val().trim();
            if (nsec.startsWith('nsec1')) {
                try {
                    const NT = await getNT();
                    if (NT && NT.nip19 && NT.getPublicKey) {
                        const dec = NT.nip19.decode(nsec);
                        if (dec.type === 'nsec') {
                            const pk = NT.getPublicKey(dec.data);
                            const npub = NT.nip19.npubEncode(pk);
                            $('#gen_delegator_info').html(`
                                <strong>Pubkey (hex):</strong> ${pk}<br/>
                                <strong>Pubkey (npub):</strong> ${npub}
                            `);
                        }
                    }
                } catch (e) {
                    $('#gen_delegator_info').html('<span style="color:red;">Invalid nsec</span>');
                }
            } else {
                $('#gen_delegator_info').empty();
            }
        });
        
        // Update delegatee info when pubkey is entered
        $('#gen_delegatee_pub').on('input', async function() {
            const pubkey = $(this).val().trim();
            if (pubkey.length === 64) {
                try {
                    const NT = await getNT();
                    if (NT && NT.nip19) {
                        const npub = NT.nip19.npubEncode(pubkey);
                        $('#gen_delegatee_info').html(`
                            <strong>Pubkey (npub):</strong> ${npub}
                        `);
                    }
                } catch (e) {
                    $('#gen_delegatee_info').html('<span style="color:red;">Invalid pubkey</span>');
                }
            } else {
                $('#gen_delegatee_info').empty();
            }
        });
        
        // Fill default time range
        $('#gen_btn_fill_defaults').on('click', function() {
            const now = Math.floor(Date.now() / 1000);
            const threeMonths = 60 * 60 * 24 * 90;
            $('#gen_since').val(now);
            $('#gen_until').val(now + threeMonths);
            $('#gen_until_info').text(`(bis ${new Date((now + threeMonths) * 1000).toLocaleDateString()})`);
        });
        
        // Create delegation tag (original working implementation)
        $('#gen_btn_create').on('click', async function() {
            try {
                const NT = await getNT();
                if (!NT || !NT.getPublicKey || !NT.nip19) {
                    throw new Error('nostr-tools nicht verfügbar');
                }
                
                // Read inputs
                const nsec = $('#gen_delegator_nsec').val().trim();
                const delegatee = $('#gen_delegatee_pub').val().trim();
                const kinds = $('#gen_kinds').val().trim();
                const since = $('#gen_since').val().trim();
                const until = $('#gen_until').val().trim();

                if (!nsec || !delegatee) {
                    throw new Error('Bitte nsec und Delegatee Pubkey angeben.');
                }
                
                // Decode nsec -> private key hex
                let skHex;
                try {
                    const dec = NT.nip19.decode(nsec);
                    if (dec.type !== 'nsec') throw new Error('Kein nsec');
                    skHex = dec.data;
                } catch (e) {
                    throw new Error('Ungültiger nsec.');
                }

                // Derive delegator pubkey
                const delegator = NT.getPublicKey(skHex); // hex

                // Build conditions string
                const condParts = [];
                if (since) condParts.push('created_at>' + parseInt(since, 10));
                if (until) condParts.push('created_at<' + parseInt(until, 10));
                if (kinds) {
                    const normalized = kinds.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));
                    if (normalized.length) {
                        condParts.push('kind=' + normalized.join(','));
                    }
                }
                const conds = condParts.join('&');

                // NIP-26 signing:
                // message = sha256( UTF8("nostr:delegation:" + delegatee + ":" + conds) )
                const enc = new TextEncoder();
                const preimage = enc.encode(`nostr:delegation:${delegatee}:${conds}`);
                const hash = await sha256Bytes(preimage); // Uint8Array
                
                // Get schnorr from nostr-tools or @noble/curves
                const schnorr = await getSchnorr(NT);
                if (!schnorr || typeof schnorr.sign !== 'function') {
                    throw new Error('schnorr.sign nicht verfügbar (nostr-tools/@noble/curves).');
                }
                const sigBytes = await schnorr.sign(hash, skHex);
                const sig = typeof sigBytes === 'string' ? sigBytes : toHex(sigBytes);

                // Compose tag array: ['delegation','<sig>','<conds>','<delegator_pubkey>']
                const arr = ['delegation', sig, conds, delegator];
                const raw = JSON.stringify(arr);

                // Show result and enable copy-to-textarea button
                $('#gen_result').text(raw);
                $('#gen_btn_copy_to_textarea').prop('disabled', false);
                
            } catch (e) {
                alert('Fehler beim Erzeugen der Delegation: ' + (e.message || e));
            }
        });
        
        // Copy generated delegation to textarea
        $('#gen_btn_copy_to_textarea').on('click', function() {
            const result = $('#gen_result').text().trim();
            if (result) {
                $('#delegation_blob').val(result).trigger('input');
                // Scroll to textarea
                $('html, body').animate({
                    scrollTop: $('#delegation_blob').offset().top - 80
                }, 500);
            }
        });
    }
    
    // Form validation
    $('form').on('submit', function(e) {
        if (!validateForm($(this))) {
            e.preventDefault();
        }
    });
    
    // Initialize UI state
    const ssoEnabled = $('input[name="sso_enabled"]').is(':checked');
    toggleSSOFields(ssoEnabled);
    
    // Helper functions
    function toggleSSOFields(enabled) {
        const ssoFields = $('.sso-field');
        
        if (enabled) {
            ssoFields.show();
        } else {
            ssoFields.hide();
        }
    }
    
    function generateSharedSecret() {
        const secret = generateRandomHex(64); // 32 bytes = 64 hex chars
        $('input[name="shared_secret"]').val(secret);
        showNotice('Neuer Shared Secret generiert!', 'success');
    }
    
    function generateRandomHex(length) {
        const chars = '0123456789abcdef';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
    
    function testSSOConnection() {
        const button = $('#test-sso-btn');
        const originalText = button.text();
        
        button.text('Teste...').prop('disabled', true);
        
        const testData = {
            action: 'test_nostr_sso_connection',
            nonce: nostrCalendarAdmin.nonce,
            calendar_app_url: $('input[name="calendar_app_url"]').val(),
            shared_secret: $('input[name="shared_secret"]').val()
        };
        
        $.ajax({
            url: nostrCalendarAdmin.ajaxUrl,
            method: 'POST',
            data: testData,
            success: function(response) {
                if (response.success) {
                    showNotice('SSO-Verbindung erfolgreich getestet!', 'success');
                } else {
                    showNotice('SSO-Test fehlgeschlagen: ' + response.data.message, 'error');
                }
            },
            error: function(xhr, status, error) {
                showNotice('SSO-Test fehlgeschlagen: ' + error, 'error');
            },
            complete: function() {
                button.text(originalText).prop('disabled', false);
            }
        });
    }
    
    function validateForm(form) {
        const currentTab = form.find('input[name="current_tab"]').val();
        
        switch (currentTab) {
            case 'sso':
                return validateSSOForm(form);
            case 'calendar':
                return validateCalendarForm(form);
            case 'delegation':
                return validateDelegationForm(form);
            default:
                return true;
        }
    }
    
    function validateSSOForm(form) {
        const ssoEnabled = form.find('input[name="sso_enabled"]').is(':checked');
        
        if (ssoEnabled) {
            const sharedSecret = form.find('input[name="shared_secret"]').val();
            const calendarUrl = form.find('input[name="calendar_app_url"]').val();
            
            if (!sharedSecret || sharedSecret.length < 32) {
                showNotice('Shared Secret ist erforderlich und muss mindestens 32 Zeichen lang sein!', 'error');
                return false;
            }
            
            if (!calendarUrl || !isValidUrl(calendarUrl)) {
                showNotice('Eine gültige Calendar App URL ist erforderlich!', 'error');
                return false;
            }
        }
        
        return true;
    }
    
    function validateCalendarForm(form) {
        const relays = form.find('textarea[name="relays"]').val();
        const relayLines = relays.split('\n').filter(line => line.trim());
        
        for (let relay of relayLines) {
            if (!relay.startsWith('wss://') && !relay.startsWith('ws://')) {
                showNotice('Alle Relay-URLs müssen mit wss:// oder ws:// beginnen!', 'error');
                return false;
            }
        }
        
        return true;
    }
    
    function validateDelegationForm(form) {
        // Add delegation-specific validation here
        return true;
    }
    
    function isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
    
    function showNotice(message, type = 'info') {
        const notice = $('<div class="notice notice-' + type + ' is-dismissible"><p>' + message + '</p><button type="button" class="notice-dismiss"><span class="screen-reader-text">Diese Meldung ausblenden.</span></button></div>');
        $('.wrap h1').after(notice);
        
        // Auto-remove after 5 seconds
        setTimeout(function() {
            notice.fadeOut(function() {
                $(this).remove();
            });
        }, 5000);
        
        // Add dismiss functionality
        notice.find('.notice-dismiss').on('click', function() {
            notice.fadeOut(function() {
                $(this).remove();
            });
        });
    }
    
    // NIP-26 Delegation Management
    function initDelegationUI() {
        console.log('[NostrCalendarAdmin] Initializing delegation management');
        
        // Add delegation form handler
        $('#add-delegation-form').on('submit', function(e) {
            e.preventDefault();
            addDelegation();
        });
        
        // Remove delegation handlers (delegated events)
        $(document).on('click', '.remove-delegation', function(e) {
            e.preventDefault();
            const delegationId = $(this).data('delegation-id');
            removeDelegation(delegationId);
        });
        
        // Generate delegation template
        $('#generate-delegation-btn').on('click', function(e) {
            e.preventDefault();
        });
    }
});

// Global functions for WordPress integration
window.nostrCalendarAdmin = window.nostrCalendarAdmin || {};

console.log('[NostrCalendarAdmin] Admin script loaded successfully');