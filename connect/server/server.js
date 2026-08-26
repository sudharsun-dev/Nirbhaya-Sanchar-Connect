import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { AccessToken } from 'livekit-server-sdk'

const app = express()
const port = Number(process.env.PORT || 3001)
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
