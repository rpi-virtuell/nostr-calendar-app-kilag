// server/index.js
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieSession from 'cookie-session'
import crypto from 'crypto'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'
import * as secp from '@noble/secp256k1'
import { hmac } from '@noble/hashes/hmac'
import * as nobleHashes from '@noble/hashes/sha256'
import { getPublicKey, verifyEvent, finalizeEvent } from 'nostr-tools/pure'
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Setup crypto for @noble/secp256k1 v2.x
// The library requires hmacSha256Sync to be provided
const hmacSha256Sync = (key, ...msgs) => {
  const k = (typeof key === 'string') ? hexToBytes(key) : key;
  const h = hmac.create(sha256, k);
  for (const m of msgs) {
    const chunk = (typeof m === 'string') ? new TextEncoder().encode(m) : m;
    h.update(chunk);
  }
  return new Uint8Array(h.digest());
};

secp.utils.hmacSha256Sync = hmacSha256Sync;
console.log('[server] initialized @noble/secp256k1 with hmacSha256Sync');

const app = express()
const PORT = process.env.PORT || 8787

app.use(cors({
  origin: true,
  credentials: true
}))

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}))

app.use(express.json())

app.use(cookieSession({
  name: 'session',
  keys: ['your-secret-key', 'another-secret-key'],
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  httpOnly: true,
  secure: false, // Set to true in production with HTTPS
  sameSite: 'lax'
}))

// Demo delegation key pair (Johan Amos Comenius)
const delegatorSkHex = 'b66d1dddbb1a50a5e8f0c4b24f1e26ed982d0654b5b70afbb1c6b0cdf84d8730'
const delegatorSk = hexToBytes(delegatorSkHex)
// Get the full public key and extract only the x-coordinate (remove the 02 prefix)
const fullPubkey = secp.getPublicKey(delegatorSk)
const delegatorPkHex = bytesToHex(fullPubkey.slice(1)) // Remove first byte (02 prefix)

console.log('delegatorSk type:', typeof delegatorSk, 'length:', delegatorSk.length, 'instanceof Uint8Array:', delegatorSk instanceof Uint8Array)
console.log('delegatorPkHex length:', delegatorPkHex.length, 'value:', delegatorPkHex)

// ============ SSO Bunker Endpoints ============

app.get('/bunker', async (req, res) => {
  if (!req.query.bunker) return res.status(400).json({ error: 'bunker parameter required' })

  try {
    const bunkerUrl = new URL(req.query.bunker)
    const pubkey = bunkerUrl.pathname.substring(2) // Remove '//'
    const relay = bunkerUrl.searchParams.get('relay')
    const secret = bunkerUrl.searchParams.get('secret')

    if (!pubkey || !relay || !secret) {
      return res.status(400).json({ error: 'invalid bunker URL format' })
    }

    // Store in session for later use
    req.session.bunker = { pubkey, relay, secret }
    
    res.json({ 
      ok: true, 
      pubkey, 
      relay, 
      message: 'Bunker connection ready' 
    })
  } catch (e) {
    console.error('[BUNKER] URL parse error:', e)
    res.status(400).json({ error: 'invalid bunker URL' })
  }
})

app.post('/sso/finish', async (req, res) => {
  try {
    const { pubkey, signature } = req.body
    if (!pubkey || !signature) {
      return res.status(400).json({ ok: false, error: 'missing_fields' })
    }

    // Verify the signature (simplified for demo)
    req.session.user = { pubkey }
    
    res.json({ 
      ok: true, 
      user: { pubkey },
      message: 'Login successful' 
    })
  } catch (e) {
    console.error('[SSO/FINISH] unexpected error:', e && (e.stack || e.message || e))
    return res.status(500).json({ ok: false, error: 'internal_error', reason: String(e) })
  }
})

app.get('/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ ok: false })
  res.json({ ok: true, ...req.session.user })
})

app.post('/logout', (req, res) => {
  // For cookie-session, we clear the session data instead of using destroy()
  if (req.session) {
    req.session = null; // This clears the session for cookie-session
    res.clearCookie('session');
    res.clearCookie('session.sig');
    res.json({ ok: true, message: 'Logged out successfully' });
  } else {
    res.json({ ok: true, message: 'No active session' });
  }
})

// ============ WordPress SSO Integration ============

// Shared secret for token verification (must match WordPress plugin)
const WP_SHARED_SECRET = 'your-secure-shared-secret-key-here';

// WordPress SSO endpoint - validates tokens and creates sessions
app.get('/wp-sso', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ ok: false, error: 'token_required' });
    }
    
    // Verify WordPress token
    const wpUser = verifyWordPressToken(token);
    if (!wpUser) {
      return res.status(401).json({ ok: false, error: 'invalid_token' });
    }
    
    // Create session for WordPress user
    req.session.wp_user = {
      id: wpUser.wp_user_id,
      username: wpUser.wp_username,
      email: wpUser.wp_email,
      display_name: wpUser.wp_display_name,
      roles: wpUser.wp_roles,
      wp_site_url: wpUser.wp_site_url,
      authenticated_at: new Date().toISOString(),
      source: 'wordpress_sso'
    };
    
    console.log(`[WP-SSO] WordPress user authenticated via SSO: ${wpUser.wp_username} from ${wpUser.wp_site_url}`);
    
    // Redirect to calendar app with success status
    const calendarUrl = `/index.html?wp_sso=success&user=${encodeURIComponent(wpUser.wp_username)}`;
    res.redirect(calendarUrl);
    
  } catch (e) {
    console.error('[WP-SSO] failed:', e);
    return res.status(500).json({ ok: false, error: 'sso_failed', reason: String(e) });
  }
});

// WordPress token verification function
function verifyWordPressToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    
    const [tokenData, signature] = parts;
    
    // Für Demo: Akzeptiere Mock-Signaturen (beginnen mit "demo_signature_")
    if (signature.startsWith('demo_signature_')) {
      console.log('[WP-SSO] Demo token detected, skipping signature verification');
      
      // Decode payload
      const payload = JSON.parse(Buffer.from(tokenData, 'base64').toString());
      
      // Check expiration
      if (Date.now() / 1000 > payload.expires) {
        console.log('[WP-SSO] Token expired');
        return null;
      }
      
      return payload;
    }
    
    // Produktions-Token: Verify signature
    const expectedSignature = crypto.createHmac('sha256', WP_SHARED_SECRET)
                                   .update(tokenData)
                                   .digest('hex');
    
    if (expectedSignature !== signature) {
      console.log('[WP-SSO] Invalid token signature');
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(Buffer.from(tokenData, 'base64').toString());
    
    // Check expiration
    if (Date.now() / 1000 > payload.expires) {
      console.log('[WP-SSO] Token expired');
      return null;
    }
    
    return payload;
    
  } catch (error) {
    console.error('[WP-SSO] Token verification failed:', error);
    return null;
  }
}

// WordPress logout endpoint
app.post('/wp-logout', (req, res) => {
  if (req.session?.wp_user) {
    const username = req.session.wp_user.username;
    req.session = null; // Clear session
    res.clearCookie('session');
    res.clearCookie('session.sig');
    console.log(`[WP-SSO] WordPress user logged out: ${username}`);
  }
  
  res.json({ ok: true, message: 'WordPress SSO logout successful' });
});

// Check WordPress SSO status
app.get('/wp-sso-status', (req, res) => {
  if (!req.session?.wp_user) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }
  
  res.json({ 
    ok: true, 
    wp_user: req.session.wp_user,
    calendar_identity: {
      pubkey: delegatorPkHex,
      name: 'Johan Amos Comenius'
    },
    source: 'wordpress_sso'
  });
});

// ============ WordPress Authentication ============

// WordPress user authentication (simulated)
app.post('/wp-auth', async (req, res) => {
  try {
    const { username, email, user_id } = req.body;
    
    if (!username) {
      return res.status(400).json({ ok: false, error: 'username_required' });
    }
    
    // Simulate WordPress user validation
    const wp_user_id = user_id || Math.floor(Math.random() * 10000) + 1000;
    const wp_email = email || `${username}@example.com`;
    
    // Store WordPress user in session
    req.session.wp_user = {
      id: wp_user_id,
      username: username,
      email: wp_email,
      authenticated_at: new Date().toISOString()
    };
    
    console.log(`[WP-AUTH] WordPress user authenticated: ${username} (ID: ${wp_user_id})`);
    
    res.json({
      ok: true,
      message: 'WordPress user authenticated',
      user: {
        id: wp_user_id,
        username: username,
        email: wp_email
      },
      // The calendar will post as Johan, not as the WP user
      calendar_identity: {
        pubkey: delegatorPkHex,
        name: 'Johan Amos Comenius'
      }
    });
    
  } catch (e) {
    console.error('[WP-AUTH] failed:', e);
    return res.status(500).json({ ok: false, error: 'wp_auth_failed', reason: String(e) });
  }
});

// Check WordPress authentication status
app.get('/wp-me', (req, res) => {
  if (!req.session?.wp_user) {
    return res.status(401).json({ ok: false, error: 'not_authenticated' });
  }
  
  res.json({ 
    ok: true, 
    wp_user: req.session.wp_user,
    calendar_identity: {
      pubkey: delegatorPkHex,
      name: 'Johan Amos Comenius'
    }
  });
});

// ============ Test Endpoint for Publishing ============

app.post('/test-publish', async (req, res) => {
  console.log('[TEST-PUBLISH] Testing event creation and publishing...');
  
  try {
    const now = Math.floor(Date.now() / 1000);
    
    // Create test event
    const eventTemplate = {
      kind: 31923,
      created_at: now,
      pubkey: delegatorPkHex,
      tags: [
        ['title', 'Test Real Publishing'],
        ['starts', String(now + 3600)], // 1 hour from now
        ['ends', String(now + 7200)], // 2 hours from now
        ['location', 'Test Location'],
        ['d', `test-${now}-${Math.random().toString(36).substr(2, 9)}`],
        ['client', 'test-publishing'],
        ['test', 'true']
      ],
      content: 'This is a test event to verify real publishing works'
    };
    
    console.log(`[TEST-PUBLISH] Event template:`, JSON.stringify(eventTemplate, null, 2));
    
    // Sign with Johan's private key
    const signedEvent = finalizeEvent(eventTemplate, delegatorSkHex);
    console.log(`[TEST-PUBLISH] Signed event ID: ${signedEvent.id}`);
    
    // Publish to relays
    const relayResults = await publishToRelays(signedEvent);
    
    res.json({
      ok: true,
      event: signedEvent,
      relay_results: relayResults,
      message: 'Test event published'
    });
    
  } catch (e) {
    console.error('[TEST-PUBLISH] failed:', e);
    return res.status(500).json({ ok: false, error: 'test_publish_failed', reason: String(e) });
  }
});

// ============ WordPress Calendar Event Creation ============

app.post('/wp-calendar/event', async (req, res) => {
  // Check WordPress authentication
  if (!req.session?.wp_user) {
    return res.status(401).json({ ok: false, error: 'wp_auth_required' });
  }
  
  const { title, start, end, location, description, d } = req.body;
  if (!title || !start) {
    return res.status(400).json({ ok: false, error: 'title_and_start_required' });
  }
  
  try {
    const now = Math.floor(Date.now() / 1000);
    
    // Convert start/end to Unix timestamps if they're not already
    let startTimestamp = start;
    let endTimestamp = end;
    
    // If start/end are ISO strings, convert to Unix timestamps
    if (typeof start === 'string' && start.includes('T')) {
      startTimestamp = Math.floor(new Date(start).getTime() / 1000);
    } else if (typeof start === 'string') {
      // Assume YYYY-MM-DDTHH:mm format from HTML datetime-local input
      startTimestamp = Math.floor(new Date(start).getTime() / 1000);
    }
    
    if (end) {
      if (typeof end === 'string' && end.includes('T')) {
        endTimestamp = Math.floor(new Date(end).getTime() / 1000);
      } else if (typeof end === 'string') {
        endTimestamp = Math.floor(new Date(end).getTime() / 1000);
      }
    }
    
    console.log(`[WP-CALENDAR] Converting times - start: ${start} -> ${startTimestamp}, end: ${end} -> ${endTimestamp}`);
    
    // Create calendar event (NIP-52, kind 31923)
    const eventTemplate = {
      kind: 31923,
      created_at: now,
      pubkey: delegatorPkHex, // Johan's pubkey
      tags: [
        ['title', title],
        ['starts', String(startTimestamp)], // NIP-52 uses 'starts', not 'start'
        ...(endTimestamp ? [['ends', String(endTimestamp)]] : []), // NIP-52 uses 'ends', not 'end'
        ...(location ? [['location', location]] : []),
        ...(description ? [['description', description]] : []),
        ['d', d || `wp-event-${now}-${Math.random().toString(36).substr(2, 9)}`],
        ['client', 'wordpress-calendar'],
        ['wp_user', req.session.wp_user.username], // Track which WP user created it
        ['wp_user_id', String(req.session.wp_user.id)]
      ],
      content: description || ''
    };
    
    console.log(`[WP-CALENDAR] Event template:`, JSON.stringify(eventTemplate, null, 2));
    
    // Sign with Johan's private key using nostr-tools
    const signedEvent = finalizeEvent(eventTemplate, delegatorSkHex);

    // Publish to relays
    const relayResults = await publishToRelays(signedEvent);

    console.log(`[WP-CALENDAR] Event created by ${req.session.wp_user.username}: ${title}`);

    res.json({
      ok: true,
      event: signedEvent,
      message: `Event "${title}" created as Johan Amos Comenius`,
      created_by: req.session.wp_user.username,
      relay_results: relayResults,
      calendar_identity: {
        name: 'Johan Amos Comenius',
        pubkey: delegatorPkHex
      }
    });
    
  } catch (e) {
    console.error('[WP-CALENDAR] event creation failed:', e);
    return res.status(500).json({ ok: false, error: 'event_creation_failed', reason: String(e) });
  }
});

// ============ WordPress Calendar Event Deletion ============

app.delete('/wp-calendar/event/:eventId', async (req, res) => {
  // Check WordPress authentication
  if (!req.session?.wp_user) {
    return res.status(401).json({ ok: false, error: 'wp_auth_required' });
  }
  
  const { eventId } = req.params;
  if (!eventId) {
    return res.status(400).json({ ok: false, error: 'event_id_required' });
  }
  
  try {
    const now = Math.floor(Date.now() / 1000);
    
    console.log(`[WP-CALENDAR] Deleting event ${eventId} by ${req.session.wp_user.username}`);
    
    // Create delete event (NIP-09, kind 5)
    const deleteEvent = {
      kind: 5,
      created_at: now,
      pubkey: delegatorPkHex, // Johan's pubkey
      tags: [
        ['e', eventId], // Reference to event being deleted
        ['client', 'wordpress-calendar'],
        ['wp_user', req.session.wp_user.username], // Track which WP user deleted it
        ['wp_user_id', String(req.session.wp_user.id)]
      ],
      content: 'Event deleted via WordPress Calendar'
    };
    
    console.log(`[WP-CALENDAR] Delete event template:`, JSON.stringify(deleteEvent, null, 2));
    
    // Sign with Johan's private key using nostr-tools
    const signedEvent = finalizeEvent(deleteEvent, delegatorSkHex);

    // Publish to relays
    const relayResults = await publishToRelays(signedEvent);

    console.log(`[WP-CALENDAR] Event ${eventId} deleted by ${req.session.wp_user.username}`);

    res.json({
      ok: true,
      delete_event: signedEvent,
      message: `Event deleted as Johan Amos Comenius`,
      deleted_by: req.session.wp_user.username,
      relay_results: relayResults,
      calendar_identity: {
        name: 'Johan Amos Comenius',
        pubkey: delegatorPkHex
      }
    });
    
  } catch (e) {
    console.error('[WP-CALENDAR] event deletion failed:', e);
    return res.status(500).json({ ok: false, error: 'event_deletion_failed', reason: String(e) });
  }
});

// ============ Legacy Delegation Endpoints ============

// Step 1: Prepare delegation for client to sign
app.get('/delegation/prepare', async (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const kind = Number(req.query.kind) || 31923 // Default to calendar events
  if (!Number.isInteger(kind)) return res.status(400).json({ error: 'kind required' })

  // For calendar events, use a longer delegation period (1 year)
  const now = Math.floor(Date.now() / 1000)
  const until = now + (365 * 24 * 3600) // 1 year validity

  // NIP-26: User (delegator) delegates to Server (delegatee)
  const delegatorPubkey = user.pubkey // User is the delegator
  const delegateePubkey = delegatorPkHex // Server is the delegatee

  // Build delegation string according to NIP-26
  const delegationString = `nostr:delegation:${delegateePubkey}:${kind}:${until}`

  console.log(`[DELEGATION/PREPARE] User ${delegatorPubkey.slice(0, 8)}... wants to delegate kind ${kind} to server`)

  res.json({
    ok: true,
    delegationString,
    delegator: delegatorPubkey,
    delegatee: delegateePubkey,
    kind,
    until,
    message: 'Sign this delegation string with your Nostr key'
  })
})

// Step 2: Complete delegation after client has signed
app.post('/delegation/complete', async (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const { signature, kind, until } = req.body
  if (!signature || !kind || !until) {
    return res.status(400).json({ error: 'signature, kind, and until required' })
  }

  try {
    const delegatorPubkey = user.pubkey
    const delegateePubkey = delegatorPkHex
    const delegationString = `nostr:delegation:${delegateePubkey}:${kind}:${until}`

    // TODO: Verify the signature against the delegation string
    // For demo purposes, we'll accept any signature

    // Store the delegation
    req.session.delegation = {
      delegator: delegatorPubkey,
      delegatee: delegateePubkey,
      kind: Number(kind),
      until: Number(until),
      signature,
      delegationString,
      created_at: Math.floor(Date.now() / 1000)
    }

    console.log(`[DELEGATION/COMPLETE] Delegation completed for kind ${kind}`)

    res.json({
      ok: true,
      delegation: req.session.delegation,
      message: 'Delegation stored successfully'
    })

  } catch (e) {
    console.error('[DELEGATION/COMPLETE] failed:', e)
    return res.status(500).json({ error: 'delegation_completion_failed', reason: String(e) })
  }
})

// Get current delegation status
app.get('/delegation/status', (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const delegation = req.session?.delegation
  if (!delegation) {
    return res.json({ ok: true, has_delegation: false })
  }

  res.json({
    ok: true,
    has_delegation: true,
    delegation
  })
})

// Create calendar event using stored delegation
app.post('/calendar/event', async (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const delegation = req.session?.delegation
  if (!delegation || delegation.kind !== 31923) {
    return res.status(400).json({ error: 'calendar delegation required' })
  }

  const { title, start, end, location, description, d } = req.body
  if (!title || !start) {
    return res.status(400).json({ error: 'title and start required' })
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    
    // Create calendar event with delegation
    const event = {
      kind: 31923,
      created_at: now,
      pubkey: delegation.delegatee, // Server's pubkey (delegatee)
      tags: [
        ['title', title],
        ['start', start],
        ...(end ? [['end', end]] : []),
        ...(location ? [['location', location]] : []),
        ...(description ? [['description', description]] : []),
        ['d', d || `event-${now}-${Math.random().toString(36).substr(2, 9)}`],
        ['client', 'nostr-calendar-delegation'],
        // NIP-26 delegation tag
        ['delegation', delegation.delegator, delegation.kind.toString(), delegation.until.toString(), delegation.signature]
      ],
      content: description || ''
    }

    // Generate event ID
    const eventId = sha256(Buffer.from(JSON.stringify([
      0,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content
    ])))

    event.id = bytesToHex(eventId)

    // Sign event with server's (delegatee's) key using nostr-tools
    const signedEvent = finalizeEvent(event, delegatorSkHex)
    
    console.log(`[CALENDAR] Event created with delegation: ${title}`)

    res.json({
      ok: true,
      event: signedEvent,
      message: 'Calendar event created with delegation'
    })

  } catch (e) {
    console.error('[CALENDAR] event creation failed:', e)
    return res.status(500).json({ ok: false, error: 'event_creation_failed', reason: String(e) })
  }
})

// ============ Publishing ============

async function publishToRelays(event) {
  console.log('[RELAY] Starting to publish event:', event.id);
  
  // Use the same relays as the client app
  const relays = [
    'wss://relilab.nostr1.com',
    'wss://relay-rpi.edufeed.org'
  ];
  
  const results = [];
  
  for (const relayUrl of relays) {
    console.log(`[RELAY] Attempting to connect to ${relayUrl}...`);
    try {
      const WebSocket = (await import('ws')).default;
      
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(relayUrl);
        const timeout = setTimeout(() => {
          console.log(`[RELAY] Timeout connecting to ${relayUrl}`);
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000);
        
        ws.on('open', () => {
          console.log(`[RELAY] Connected to ${relayUrl}, sending event...`);
          clearTimeout(timeout);
          // Send EVENT message according to NIP-01
          const eventMessage = ['EVENT', event];
          ws.send(JSON.stringify(eventMessage));
          console.log(`[RELAY] Sent EVENT message to ${relayUrl}:`, JSON.stringify(eventMessage).substring(0, 200) + '...');
        });
        
        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            console.log(`[RELAY] Received from ${relayUrl}:`, msg);
            
            if (msg[0] === 'OK' && msg[1] === event.id) {
              if (msg[2] === true) {
                console.log(`[RELAY] ✅ Published to ${relayUrl}: ${event.id}`);
                results.push({
                  relay: relayUrl,
                  success: true,
                  message: 'Published successfully'
                });
              } else {
                console.error(`[RELAY] ❌ Rejected by ${relayUrl}: ${msg[3]}`);
                results.push({
                  relay: relayUrl,
                  success: false,
                  error: msg[3] || 'Event rejected'
                });
              }
              ws.close();
              resolve();
            }
          } catch (e) {
            console.error(`[RELAY] Error parsing response from ${relayUrl}:`, e);
            ws.close();
            reject(e);
          }
        });
        
        ws.on('error', (error) => {
          clearTimeout(timeout);
          console.error(`[RELAY] ❌ Failed to connect to ${relayUrl}:`, error.message);
          results.push({
            relay: relayUrl,
            success: false,
            error: error.message
          });
          reject(error);
        });
        
        ws.on('close', () => {
          console.log(`[RELAY] Connection to ${relayUrl} closed`);
          clearTimeout(timeout);
          resolve();
        });
      });
      
    } catch (error) {
      console.error(`[RELAY] ❌ Exception publishing to ${relayUrl}:`, error.message);
      results.push({
        relay: relayUrl,
        success: false,
        error: error.message
      });
    }
  }
  
  console.log('[RELAY] Publishing completed, results:', results);
  return results;
}

// Serve client static files from project root for local development.
// This makes client and server share the same origin (http://localhost:PORT),
// avoiding SameSite/Secure cookie issues during development.
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const staticRoot = resolve(__dirname, '..'); // project root
  app.use(express.static(staticRoot));
  console.info('[server] Serving static files from', staticRoot);
} catch (e) {
  console.warn('[server] static file serving disabled (could not resolve path):', e);
}

// -------- start --------
app.listen(Number(PORT), () => {
  console.log(`SSO+Delegation server on :${PORT}, delegator ${delegatorPkHex}`)
})