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

// -------- Delegation (NIP-26) --------
// Client calls this after SSO to receive a delegation tag to attach to their events.
// Query params:
//   kind (int, required)          -> the calendar event kind you want to allow
//   ttl  (seconds, default 3600)  -> validity window
app.get('/delegation', async (req, res) => {
  const user = req.session?.user
  if (!user?.pubkey) return res.status(401).json({ error: 'not logged in' })

  const kind = Number(req.query.kind)
  if (!Number.isInteger(kind)) return res.status(400).json({ error: 'kind required' })

  const ttl = Math.min(24 * 3600, Math.max(60, Number(req.query.ttl) || 3600))
  const now = Math.floor(Date.now() / 1000)
  const until = now + ttl

  // NIP-26 condition string. Commonly '&' joined constraints.
  // You can add more constraints if you want (e.g. 'kind=...' is the key one here).
  const conditions = `kind=${kind}&created_at>=${now}&created_at<=${until}`

  // spec: sig = SchnorrSign(sha256("nostr:delegation:" + delegatee + ":" + conditions), delegatorSk)
  const preimage = Buffer.from(`nostr:delegation:${user.pubkey}:${conditions}`, 'utf8')
  const digest = nobleHashes.sha256(preimage)

  // Robust sign handling: some builds/export-names of @noble/secp256k1 differ.
  // Try several possible sign function locations and call the first available.
  let sigBytes = null
  try {
    const maybeSigners = [
      secp?.schnorr?.sign,
      secp?.schnorrSign,
      secp?.signSchnorr,
      secp?.sign, // fallback
    ]
    let signer = null
    for (const f of maybeSigners) {
      if (typeof f === 'function') { signer = f; break }
    }
    if (!signer) throw new Error('No schnorr signer found in @noble/secp256k1 module')
    // Call signer; it may return a Promise or a value
    try {
      const out = signer(digest, delegatorSk)
      sigBytes = (out && typeof out.then === 'function') ? await out : out
      console.log('[DEBUG] sigBytes type:', typeof sigBytes, 'constructor:', sigBytes?.constructor?.name, 'isUint8Array:', sigBytes instanceof Uint8Array)
      if (sigBytes && typeof sigBytes === 'object' && !Array.isArray(sigBytes) && !(sigBytes instanceof Uint8Array)) {
        console.log('[DEBUG] Available methods:', Object.getOwnPropertyNames(sigBytes), Object.getOwnPropertyNames(Object.getPrototypeOf(sigBytes)))
      }
    } catch (e) {
      // Some signer variants expect different param order (privKey, msg) — try swap
      const out2 = signer(delegatorSk, digest)
      sigBytes = (out2 && typeof out2.then === 'function') ? await out2 : out2
      console.log('[DEBUG] sigBytes type (swapped):', typeof sigBytes, 'constructor:', sigBytes?.constructor?.name, 'isUint8Array:', sigBytes instanceof Uint8Array)
      if (sigBytes && typeof sigBytes === 'object' && !Array.isArray(sigBytes) && !(sigBytes instanceof Uint8Array)) {
        console.log('[DEBUG] Available methods (swapped):', Object.getOwnPropertyNames(sigBytes), Object.getOwnPropertyNames(Object.getPrototypeOf(sigBytes)))
      }
    }
    if (!sigBytes) throw new Error('Signer returned empty signature')
    
    // Ensure sigBytes is a Uint8Array for bytesToHex
    if (!(sigBytes instanceof Uint8Array)) {
      if (typeof sigBytes === 'string') {
        // If it's a hex string, convert it
        sigBytes = hexToBytes(sigBytes)
      } else if (Array.isArray(sigBytes)) {
        // If it's an array, convert to Uint8Array
        sigBytes = new Uint8Array(sigBytes)
      } else if (sigBytes && typeof sigBytes === 'object') {
        // If it's a Signature object from @noble/secp256k1, extract the raw bytes
        if (typeof sigBytes.toRawBytes === 'function') {
          sigBytes = sigBytes.toRawBytes()
        } else if (typeof sigBytes.toCompactRawBytes === 'function') {
          sigBytes = sigBytes.toCompactRawBytes()
        } else if (typeof sigBytes.toBytes === 'function') {
          sigBytes = sigBytes.toBytes()
        } else if (sigBytes.constructor?.name === 'Signature') {
          // Try to access raw signature data
          sigBytes = sigBytes.r && sigBytes.s ? 
            new Uint8Array([...sigBytes.r, ...sigBytes.s]) : 
            new Uint8Array(Object.values(sigBytes))
        } else {
          // If it's a plain object with numeric keys, convert to Uint8Array
          const values = Object.values(sigBytes)
          sigBytes = new Uint8Array(values)
        }
      } else {
        throw new Error(`Unexpected signature type: ${typeof sigBytes}, constructor: ${sigBytes?.constructor?.name}`)
      }
    }
  } catch (e) {
    console.error('[DELEGATION] signing failed:', e && (e.stack || e.message || e))
    return res.status(500).json({ ok: false, error: 'delegation_sign_failed', reason: String(e) })
  }

  const sigHex = bytesToHex(sigBytes)

  const tag = ['delegation', delegatorPkHex, conditions, sigHex]
  res.json({
    ok: true,
    tag,
    conditions,
    delegator: delegatorPkHex,
    until,
  })
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
