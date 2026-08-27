import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import crypto from 'node:crypto'
import { AccessToken } from 'livekit-server-sdk'

const app = express()
const port = Number(process.env.PORT || 3001)
const calls = new Map()
const users = new Map()
const sessions = new Map()

const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173,https://nirbhaya-sanchar-connect-vv3g.vercel.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const hasUsableCredentials = () => Boolean(
  process.env.LIVEKIT_URL?.startsWith('wss://') &&
  process.env.LIVEKIT_API_KEY &&
  process.env.LIVEKIT_API_SECRET &&
  !process.env.LIVEKIT_API_KEY.startsWith('YOUR_') &&
  !process.env.LIVEKIT_API_SECRET.startsWith('YOUR_'),
)

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function verifyPassword(password, storedHash, salt) {
  const hash = hashPassword(password, salt)
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'))
}

function seedUser(name, email, phone, password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const id = email.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  users.set(email.toLowerCase(), {
    id,
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    salt,
    createdAt: Date.now(),
  })
}

// Seed default official accounts
seedUser('Officer Sharma', 'officer@sanchar.gov.in', '+91 98765 43210', 'Nirbhaya@2026')
seedUser('Analyst Verma', 'analyst@sanchar.gov.in', '+91 98765 43211', 'Nirbhaya@2026')
seedUser('Test User', 'test@example.com', '+91 98765 00000', 'Password123')

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app') || origin.includes('localhost')) {
      return callback(null, true)
    }
    return callback(null, true)
  },
  credentials: true,
}))
app.use(express.json())

app.get('/health', (_request, response) => response.json({
  status: 'ok',
  service: 'nirbhaya-sanchar',
  livekitUrlConfigured: Boolean(process.env.LIVEKIT_URL?.startsWith('wss://')),
  apiKeyConfigured: Boolean(process.env.LIVEKIT_API_KEY),
  apiSecretConfigured: Boolean(process.env.LIVEKIT_API_SECRET),
}))

// Authentication Endpoints
app.post('/api/auth/register', (request, response) => {
  const { name, phone, email, password } = request.body || {}
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return response.status(400).json({ error: 'Name, email, and password are required.' })
  }
  const cleanEmail = email.trim().toLowerCase()
  if (users.has(cleanEmail)) {
    return response.status(409).json({ error: 'User with this email already exists.' })
  }
  if (password.length < 6) {
    return response.status(400).json({ error: 'Password must be at least 6 characters.' })
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const id = cleanEmail.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const user = {
    id,
    name: name.trim(),
    email: cleanEmail,
    phone: phone?.trim() || '',
    passwordHash,
    salt,
    createdAt: Date.now(),
  }
  users.set(cleanEmail, user)

  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { userId: user.id, email: user.email, createdAt: Date.now() })

  return response.status(201).json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, online_status: 'online' },
    token,
  })
})

app.post('/api/auth/login', (request, response) => {
  const { email, password } = request.body || {}
  if (!email?.trim() || !password?.trim()) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }
  const cleanEmail = email.trim().toLowerCase()
  const user = users.get(cleanEmail)
  if (!user) {
    return response.status(401).json({ error: 'Authentication failed. Invalid email or password.' })
  }

  try {
    const isValid = verifyPassword(password, user.passwordHash, user.salt)
    if (!isValid) {
      return response.status(401).json({ error: 'Authentication failed. Invalid email or password.' })
    }
  } catch {
    return response.status(401).json({ error: 'Authentication failed.' })
  }

  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { userId: user.id, email: user.email, createdAt: Date.now() })

  return response.json({
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, online_status: 'online' },
    token,
  })
})

app.get('/api/users/search', (request, response) => {
  const query = String(request.query.q || '').trim().toLowerCase()
  const matching = [...users.values()]
    .filter((u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.phone.includes(query))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, online_status: 'online' }))
  response.json({ users: matching })
})

function getAuthUser(request) {
  const authHeader = request.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (token && sessions.has(token)) {
    const session = sessions.get(token)
    return users.get(session.email) || null
  }
  return null
}

app.get('/api/calls', (request, response) => {
  let userId = String(request.query.userId || '').trim()
  if (!userId) {
    const authUser = getAuthUser(request)
    if (authUser) userId = authUser.id
  }
  const activeCalls = [...calls.values()]
    .filter((call) => !userId || [call.caller?.id, call.receiver?.id].includes(userId))
    .filter((call) => Date.now() - call.updatedAt < 120000)
  response.json({ calls: activeCalls })
})

app.post('/api/calls', (request, response) => {
  const { callId, action, userId } = request.body || {}
  if (callId && action) {
    const effectiveUserId = userId || getAuthUser(request)?.id
    const call = calls.get(callId)
    const transitions = {
      accept: ['RINGING', 'ACCEPTED'],
      reject: ['RINGING', 'REJECTED'],
      cancel: ['RINGING', 'CANCELLED'],
      end: ['ACCEPTED', 'ENDED'],
    }
    if (!call || (effectiveUserId && ![call.caller.id, call.receiver.id].includes(effectiveUserId))) {
      return response.status(404).json({ error: 'Call not found.' })
    }
    if (!transitions[action]?.includes(call.status)) {
      return response.status(409).json({ error: 'Call is no longer active.' })
    }
    call.status = transitions[action][1]
    call.updatedAt = Date.now()
    return response.json({ call })
  }

  let { caller, receiver, roomName, receiverId } = request.body || {}

  // 1. Resolve caller from session or payload
  if (!caller?.id || !caller?.name) {
    const sessionUser = getAuthUser(request)
    if (sessionUser) {
      caller = {
        id: sessionUser.id,
        name: sessionUser.name,
        email: sessionUser.email,
        phone: sessionUser.phone || '',
      }
    } else if (caller?.id) {
      caller = {
        id: String(caller.id).trim(),
        name: String(caller.name || caller.email || 'Caller').trim(),
        email: String(caller.email || '').trim(),
        phone: String(caller.phone || '').trim(),
      }
    }
  }

  // 2. Resolve receiver from payload or receiverId
  if (!receiver?.id || !receiver?.name) {
    const targetId = receiverId || receiver?.id
    if (targetId) {
      const target = [...users.values()].find((u) => u.id === targetId || u.email.toLowerCase() === String(targetId).toLowerCase())
      if (target) {
        receiver = {
          id: target.id,
          name: target.name,
          email: target.email,
          phone: target.phone || '',
        }
      } else {
        receiver = {
          id: String(targetId).trim(),
          name: String(receiver?.name || receiver?.email || targetId).trim(),
          email: String(receiver?.email || '').trim(),
          phone: String(receiver?.phone || '').trim(),
        }
      }
    }
  }

  // 3. Auto-generate safe unique room name if omitted
  if (!roomName && caller?.id && receiver?.id) {
    const callerSlug = String(caller.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'caller'
    const receiverSlug = String(receiver.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'receiver'
    roomName = `nirbhaya-${callerSlug}-${receiverSlug}-${Date.now().toString(36)}`
  }

  if (!caller?.id || !caller?.name) {
    return response.status(400).json({ error: 'Caller identification is required. Please ensure you are logged in.' })
  }
  if (!receiver?.id || !receiver?.name) {
    return response.status(400).json({ error: 'Receiver contact is required. Please select a valid contact.' })
  }
  if (!roomName) {
    return response.status(400).json({ error: 'roomName could not be generated.' })
  }

  // Clean stale calls older than 60s
  const now = Date.now()
  for (const [id, c] of calls.entries()) {
    if (now - c.updatedAt > 60000 && ['RINGING', 'CANCELLED', 'REJECTED', 'ENDED'].includes(c.status)) {
      calls.delete(id)
    }
  }

  // Check if caller or receiver is in an ongoing call
  const activeExisting = [...calls.values()].find(
    (c) => [c.caller.id, c.receiver.id].includes(caller.id) && ['ACCEPTED'].includes(c.status) && now - c.updatedAt < 60000,
  )
  if (activeExisting) {
    return response.status(409).json({ error: 'User is already in an active call.', activeCallId: activeExisting.id })
  }

  const call = {
    id: crypto.randomUUID(),
    caller,
    receiver,
    roomName,
    status: 'RINGING',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  calls.set(call.id, call)
  console.info(`[CALL-INIT] Created call ${call.id}: caller=${caller.name} (${caller.id}) -> receiver=${receiver.name} (${receiver.id}), room=${roomName}`)
  return response.status(201).json({ call })
})

app.post('/api/call-action', (request, response) => {
  const { callId, action, userId } = request.body || {}
  const effectiveUserId = userId || getAuthUser(request)?.id
  const call = calls.get(callId)
  const transitions = {
    accept: ['RINGING', 'ACCEPTED'],
    reject: ['RINGING', 'REJECTED'],
    cancel: ['RINGING', 'CANCELLED'],
    end: ['ACCEPTED', 'ENDED'],
  }
  if (!call || (effectiveUserId && ![call.caller.id, call.receiver.id].includes(effectiveUserId))) {
    return response.status(404).json({ error: 'Call not found.' })
  }
  if (!transitions[action]?.includes(call.status)) {
    return response.status(409).json({ error: 'Call is no longer active.' })
  }
  call.status = transitions[action][1]
  call.updatedAt = Date.now()
  response.json({ call })
})

app.post('/api/token', async (request, response) => {
  const { roomName, identity } = request.body || {}
  console.info('[TOKEN SERVER] Request received')
  console.info('[TOKEN SERVER] room:', roomName || '')
  console.info('[TOKEN SERVER] identity:', identity || '')
  if (!roomName?.trim() || !identity?.trim()) {
    return response.status(400).json({ error: 'roomName and identity are required.' })
  }
  if (!hasUsableCredentials()) {
    return response.status(500).json({ error: 'LiveKit server credentials are not configured.' })
  }

  try {
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: identity.trim(),
      ttl: '10m',
    })
    token.addGrant({
      roomJoin: true,
      room: roomName.trim(),
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    })
    console.info('[TOKEN SERVER] token generated successfully')
    return response.json({ token: await token.toJwt(), serverUrl: process.env.LIVEKIT_URL })
  } catch (error) {
    console.error('Token generation failed:', error)
    return response.status(500).json({ error: 'Unable to create a LiveKit token.' })
  }
})

app.post('/api/nirbhaya/callback', (request, response) => {
  const engineKey = request.headers['x-nirbhaya-engine-key']
  const payload = request.body || {}
  const { call_id, risk_score, risk_level, recommended_action, reasons } = payload

  console.info(`[SYSTEM 1 CALLBACK] Security risk update received for call ${call_id}: Score=${risk_score} Level=${risk_level} Action=${recommended_action}`)

  if (call_id && calls.has(call_id)) {
    const call = calls.get(call_id)
    call.securityRisk = {
      risk_score,
      risk_level,
      recommended_action,
      reasons,
      updatedAt: Date.now(),
      raw: payload,
    }
    call.updatedAt = Date.now()
  }

  return response.json({ status: 'ok', call_id, timestamp: Date.now() })
})

app.listen(port, () => console.log(`LiveKit token server listening on http://localhost:${port}`))
