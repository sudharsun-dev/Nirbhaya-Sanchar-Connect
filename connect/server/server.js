import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { AccessToken } from 'livekit-server-sdk'

const app = express()
const port = Number(process.env.PORT || 3001)
const calls = new Map()
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
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

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed.'))
  },
}))
app.use(express.json())

app.get('/health', (_request, response) => response.json({
  status: 'ok',
  service: 'nirbhaya-sanchar',
  livekitUrlConfigured: Boolean(process.env.LIVEKIT_URL?.startsWith('wss://')),
  apiKeyConfigured: Boolean(process.env.LIVEKIT_API_KEY),
  apiSecretConfigured: Boolean(process.env.LIVEKIT_API_SECRET),
}))

app.get('/api/calls', (request, response) => {
  const userId = String(request.query.userId || '')
  const activeCalls = [...calls.values()].filter((call) => [call.caller.id, call.receiver.id].includes(userId)).filter((call) => Date.now() - call.updatedAt < 120000)
  response.json({ calls: activeCalls })
})

app.post('/api/calls', (request, response) => {
  const { callId, action, userId } = request.body || {}
  if (callId && action && userId) {
    const call = calls.get(callId)
    const transitions = { accept: ['RINGING', 'ACCEPTED'], reject: ['RINGING', 'REJECTED'], cancel: ['RINGING', 'CANCELLED'], end: ['ACCEPTED', 'ENDED'] }
    if (!call || ![call.caller.id, call.receiver.id].includes(userId)) return response.status(404).json({ error: 'Call not found.' })
    if (!transitions[action]?.includes(call.status)) return response.status(409).json({ error: 'Call is no longer active.' })
    call.status = transitions[action][1]
    call.updatedAt = Date.now()
    return response.json({ call })
  }
  const { caller, receiver, roomName } = request.body || {}
  if (!caller?.id || !caller?.name || !receiver?.id || !receiver?.name || !roomName) return response.status(400).json({ error: 'caller, receiver, and roomName are required.' })
  if ([...calls.values()].some((call) => [call.caller.id, call.receiver.id].includes(caller.id) && ['RINGING', 'ACCEPTED'].includes(call.status))) return response.status(409).json({ error: 'User is busy.' })
  const call = { id: crypto.randomUUID(), caller, receiver, roomName, status: 'RINGING', createdAt: Date.now(), updatedAt: Date.now() }
  calls.set(call.id, call)
  response.status(201).json({ call })
})

app.post('/api/call-action', (request, response) => {
  const { callId, action, userId } = request.body || {}
  const call = calls.get(callId)
  const transitions = { accept: ['RINGING', 'ACCEPTED'], reject: ['RINGING', 'REJECTED'], cancel: ['RINGING', 'CANCELLED'], end: ['ACCEPTED', 'ENDED'] }
  if (!call || ![call.caller.id, call.receiver.id].includes(userId)) return response.status(404).json({ error: 'Call not found.' })
  if (!transitions[action]?.includes(call.status)) return response.status(409).json({ error: 'Call is no longer active.' })
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

app.listen(port, () => console.log(`LiveKit token server listening on http://localhost:${port}`))
