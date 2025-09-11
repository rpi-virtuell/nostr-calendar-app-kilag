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
const delegatorPkHex = bytesToHex(secp.getPublicKey(delegatorSk))

console.log('delegatorSk type:', typeof delegatorSk, 'length:', delegatorSk.length, 'instanceof Uint8Array:', delegatorSk instanceof Uint8Array)

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
    
    // Create calendar event (NIP-52, kind 31923)
    const eventTemplate = {
      kind: 31923,
      created_at: now,
      pubkey: delegatorPkHex, // Johan's pubkey
      tags: [
        ['title', title],
        ['start', start],
        ...(end ? [['end', end]] : []),
        ...(location ? [['location', location]] : []),
        ...(description ? [['description', description]] : []),
        ['d', d || `wp-event-${now}-${Math.random().toString(36).substr(2, 9)}`],
        ['client', 'wordpress-calendar'],
        ['wp_user', req.session.wp_user.username], // Track which WP user created it
        ['wp_user_id', String(req.session.wp_user.id)]
      ],
      content: description || ''
    };
    
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
  const relays = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ];
  
  const results = [];
  
  for (const relayUrl of relays) {
    try {
      // In a real implementation, you would connect to WebSocket and send
      // For demo purposes, we'll just simulate the result
      results.push({
        relay: relayUrl,
        success: true,
        message: 'Published successfully (simulated)'
      });
      
      console.log(`[RELAY] Published to ${relayUrl}:`, event.id);
    } catch (error) {
      results.push({
        relay: relayUrl,
        success: false,
        error: error.message
      });
      
      console.error(`[RELAY] Failed to publish to ${relayUrl}:`, error);
    }
  }
  
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