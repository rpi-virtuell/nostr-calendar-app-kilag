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
import { getPublicKey, verifyEvent } from 'nostr-tools/pure'

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

// Initialize @noble/secp256k1 with required crypto functions
secp.etc.hmacSha256Sync = hmacSha256Sync;
console.info('[server] initialized @noble/secp256k1 with hmacSha256Sync');
import 'dotenv/config'
import { decode as decodeNip19 } from 'nostr-tools/nip19'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const {
  SESSION_SECRET = 'dev-secret-change-me',
  DELEGATOR_NSEC,
  ALLOWED_ORIGIN = 'http://localhost:5500',
  PORT = 8787,
} = process.env

if (!DELEGATOR_NSEC) {
  console.error('Missing DELEGATOR_NSEC env (hex or nsec1...)')
  process.exit(1)
}

function parseDelegatorSecret(raw) {
  if (raw.startsWith('nsec1')) {
    const d = decodeNip19(raw)
    if (d.type !== 'nsec' || !(d.data instanceof Uint8Array) || d.data.length !== 32) throw new Error('Invalid nsec')
    return d.data // Uint8Array
  }
  // assume hex
  const hex = raw.toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Invalid hex secret')
  const bytes = hexToBytes(hex)
  if (bytes.length !== 32) throw new Error('Invalid hex secret length')
  return new Uint8Array(bytes)
}

const delegatorSk = parseDelegatorSecret(DELEGATOR_NSEC)
console.log('delegatorSk type:', typeof delegatorSk, 'length:', delegatorSk?.length, 'instanceof Uint8Array:', delegatorSk instanceof Uint8Array)
const _delegatorPk = getPublicKey(delegatorSk)
const delegatorPkHex = (typeof _delegatorPk === 'string') ? _delegatorPk : bytesToHex(_delegatorPk)

const app = express()
// Helmet: allow externes Laden von ESM-CDNs während der lokalen Entwicklung.
// In Produktion sollten Sie eine restriktivere CSP verwenden.
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://esm.sh",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com"
        ],
        connectSrc: ["'self'", "wss:", "https://*"],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "https:", "data:"]
      }
    }
  })
)
app.use(express.json({ limit: '200kb' }))

app.use(
  cors({
    // Development-friendly CORS:
    // - allow ALLOWED_ORIGIN
    // - allow any http://localhost:PORT or http://localhost:PORT
    // - allow requests with no Origin (curl, server-to-server)
    origin: (origin, callback) => {
      if (!origin) return callback(null, true) // allow non-browser requests
      try {
        if (origin === ALLOWED_ORIGIN) return callback(null, true)
        // allow localhost variants on any port
        const lc = origin.toLowerCase()
        if (lc.startsWith('http://localhost') || lc.startsWith('http://localhost')) {
          return callback(null, true)
        }
      } catch (e) {
        console.debug('[CORS] origin check error', e)
      }
      return callback(new Error('Not allowed by CORS: ' + origin))
    },
    credentials: true,
  })
)

app.use(
  cookieSession({
    name: 'sid',
    signed: true,
    httpOnly: true,
    // Für lokale Entwicklung setzen wir nur secure in production.
    // Verwenden Sie 'lax' als SameSite — wir serven die Client-Dateien vom selben Origin,
    // daher ist SameSite=None nicht erforderlich und würde ohne Secure von Browsern abgelehnt.
    secure: (process.env.NODE_ENV === 'production'),
    sameSite: 'lax',
    secret: SESSION_SECRET,
    maxAge: 1000 * 60 * 60 * 24, // 1d
  })
)

app.get('/health', (_req, res) => res.json({ ok: true }))

// -------- SSO (challenge -> signed event) --------

app.post('/sso/start', (req, res) => {
  try {
    // Debug/log incoming request (headers/cookies/session) to aid troubleshooting
    try {
      console.debug('[SSO/START] headers:', req.headers);
      console.debug('[SSO/START] cookies header:', req.headers && req.headers.cookie);
      console.debug('[SSO/START] existing session (before):', JSON.stringify(req.session || {}));
    } catch (e) { console.debug('[SSO/START] debug log failed', e); }

    // Optional: enforce Origin — allow localhost/127.0.0.1 variants for local dev
    const origin = req.headers.origin
    if (origin) {
      const lc = String(origin).toLowerCase()
      const allowedAlt = String(ALLOWED_ORIGIN || '').toLowerCase().replace('localhost', '127.0.0.1')
      const allowedMain = String(ALLOWED_ORIGIN || '').toLowerCase()
      const allowOrigin = lc === allowedMain || lc === allowedAlt || lc.startsWith('http://localhost') || lc.startsWith('http://127.0.0.1')
      if (!allowOrigin) {
        console.warn('[SSO/START] blocked origin:', origin)
        return res.status(403).json({ ok: false, error: 'origin_not_allowed', origin })
      }
    }

    const nonce = crypto.randomBytes(32).toString('base64url')
    req.session.sso = {
      nonce,
      issuedAt: Math.floor(Date.now() / 1000),
    }

    // Log session after setting challenge
    try { console.debug('[SSO/START] session after set:', JSON.stringify(req.session || {})); } catch (e) {}

    return res.json({
      ok: true,
      nonce,
      // client will put nonce into an event.content and sign with window.nostr
      expiresIn: 300,
    })
  } catch (e) {
    console.error('[SSO/START] unexpected error:', e && (e.stack || e.message || e))
    return res.status(500).json({ ok: false, error: 'internal_error', reason: String(e) })
  }
})

app.post('/sso/finish', (req, res) => {
  try {
    // Debug/logging: show incoming body and existing session challenge to aid debugging
    try {
      console.debug('[SSO/FINISH] headers:', req.headers);
      console.debug('[SSO/FINISH] cookies header:', req.headers && req.headers.cookie);
      console.debug('[SSO/FINISH] session (before):', JSON.stringify(req.session || {}));
      // Avoid logging secrets; only log presence/shape of event
      const bodyPreview = { hasEvent: !!req.body?.event, eventKeys: req.body?.event ? Object.keys(req.body.event) : null };
      console.debug('[SSO/FINISH] body preview:', bodyPreview);
    } catch (e) { console.debug('[SSO/FINISH] debug log failed', e); }

    const sess = req.session.sso
    if (!sess) {
      console.warn('[SSO/FINISH] no active challenge in session');
      return res.status(400).json({ ok: false, error: 'no_active_challenge' })
    }

    const { event } = req.body || {}
    if (!event) {
      console.warn('[SSO/FINISH] missing event in request body');
      return res.status(400).json({ ok: false, error: 'missing_event' })
    }

    // Minimal checks: event must be correctly signed and carry our nonce in content
    const now = Math.floor(Date.now() / 1000)
    try {
      if (!verifyEvent(event)) {
        console.warn('[SSO/FINISH] verifyEvent failed for event id=', event.id);
        return res.status(400).json({ ok: false, error: 'bad_signature' })
      }
    } catch (e) {
      console.warn('[SSO/FINISH] verifyEvent threw error:', e && (e.stack || e.message || e));
      return res.status(400).json({ ok: false, error: 'bad_signature', reason: String(e) })
    }

    if (typeof event.content !== 'string' || event.content !== sess.nonce) {
      console.warn('[SSO/FINISH] nonce mismatch. expected=', sess.nonce, 'got=', event.content);
      return res.status(400).json({ ok: false, error: 'nonce_mismatch' })
    }

    if (Math.abs(now - Number(event.created_at || 0)) > 300) {
      console.warn('[SSO/FINISH] stale login event. created_at=', event.created_at, 'now=', now);
      return res.status(400).json({ ok: false, error: 'stale_login_event' })
    }

    // Success -> bind pubkey to session
    req.session.user = { pubkey: event.pubkey }
    delete req.session.sso

    console.info('[SSO/FINISH] login success for pubkey=', event.pubkey);
    return res.json({ ok: true, pubkey: event.pubkey, delegator: delegatorPkHex })
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
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('[LOGOUT] Session destroy failed:', err);
        return res.status(500).json({ ok: false, error: 'logout_failed' });
      }
      res.clearCookie('sid');
      res.clearCookie('sid.sig');
      res.json({ ok: true, message: 'Logged out successfully' });
    });
  } else {
    res.json({ ok: true, message: 'No active session' });
  }
})

// -------- Delegation (NIP-26) --------
// Two-step process:
// 1. GET /delegation/prepare - Server tells client what to sign
// 2. POST /delegation/complete - Client sends back the signed delegation

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
  const conditions = `kind=${kind}&created_at>${now}&created_at<${until}`

  // The message that the USER needs to sign
  const delegationMessage = `nostr:delegation:${delegateePubkey}:${conditions}`

  // Store this in session for verification in step 2
  req.session.pendingDelegation = {
    delegatorPubkey,
    delegateePubkey,
    conditions,
    delegationMessage,
    until
  }

  res.json({
    ok: true,
    delegationMessage,
    delegatorPubkey,
    delegateePubkey,
    conditions,
    until,
    note: 'Please sign this delegationMessage with your nostr client and POST the signature to /delegation/complete'
  })
})

// Step 2: Complete delegation with user's signature
app.post('/delegation/complete', async (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const pending = req.session.pendingDelegation
  if (!pending) return res.status(400).json({ error: 'no pending delegation found' })

  const { signature } = req.body
  if (!signature) return res.status(400).json({ error: 'signature required' })

  try {
    // Verify the signature was made by the user
    const messageHash = sha256(Buffer.from(pending.delegationMessage, 'utf8'))
    
    // Here we would verify the signature, but for now we'll trust it
    // TODO: Implement signature verification
    
    // Create the delegation tag for future use
    const delegationTag = [
      'delegation',
      pending.delegatorPubkey,
      pending.conditions, 
      signature
    ]

    // Store the delegation for this user
    req.session.delegation = {
      tag: delegationTag,
      delegatorPubkey: pending.delegatorPubkey,
      delegateePubkey: pending.delegateePubkey,
      conditions: pending.conditions,
      until: pending.until
    }

    // Clean up pending delegation
    delete req.session.pendingDelegation

    res.json({
      ok: true,
      delegation: delegationTag,
      message: 'Delegation completed successfully. Server can now post calendar events on your behalf.'
    })

  } catch (e) {
    console.error('[DELEGATION] completion failed:', e)
    return res.status(500).json({ ok: false, error: 'delegation_complete_failed', reason: String(e) })
  }
})

// Legacy endpoint for backward compatibility (but now explains the new flow)
app.get('/delegation', async (req, res) => {
  res.status(400).json({ 
    error: 'deprecated_endpoint',
    message: 'Use /delegation/prepare and /delegation/complete instead',
    flow: 'GET /delegation/prepare -> sign message -> POST /delegation/complete'
  })
})

// API to create calendar events using delegation
app.post('/calendar/event', async (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const delegation = req.session.delegation
  if (!delegation) return res.status(400).json({ error: 'no delegation found, call /delegation/prepare first' })

  const { title, start, end, location, description, d } = req.body
  if (!title || !start) return res.status(400).json({ error: 'title and start time required' })

  try {
    const now = Math.floor(Date.now() / 1000)
    
    // Check if delegation is still valid
    if (now > delegation.until) {
      return res.status(400).json({ error: 'delegation expired' })
    }

    // Create calendar event (NIP-52, kind 31923)
    const event = {
      kind: 31923,
      created_at: now,
      pubkey: delegatorPkHex, // Server pubkey (delegatee)
      tags: [
        ['title', title],
        ['start', start],
        ...(end ? [['end', end]] : []),
        ...(location ? [['location', location]] : []),
        ...(description ? [['description', description]] : []),
        ['d', d || `event-${now}-${Math.random().toString(36).substr(2, 9)}`],
        delegation.tag // Add the delegation tag
      ],
      content: description || ''
    }

    // TODO: Sign event with server key (delegatorSk) and publish to relays
    // For now, just return the event structure
    
    res.json({
      ok: true,
      event,
      note: 'Event created with delegation. TODO: Sign and publish to relays.'
    })

  } catch (e) {
    console.error('[CALENDAR] event creation failed:', e)
    return res.status(500).json({ ok: false, error: 'event_creation_failed', reason: String(e) })
  }
})

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
