import { AccessToken } from 'livekit-server-sdk'

function readBody(request) {
	if (request.body && typeof request.body === 'object') return request.body
	try { return JSON.parse(request.body || '{}') } catch { return {} }
}

export default async function handler(request, response) {
	console.info('[TOKEN API] request received:', true)
	if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
	const { roomName, identity } = readBody(request)
	if (!roomName?.trim() || !identity?.trim()) return response.status(400).json({ error: 'roomName and identity are required.' })

	const livekitUrlConfigured = Boolean(process.env.LIVEKIT_URL?.startsWith('wss://'))
	const apiKeyConfigured = Boolean(process.env.LIVEKIT_API_KEY)
	const apiSecretConfigured = Boolean(process.env.LIVEKIT_API_SECRET)
	console.info('[TOKEN API] LIVEKIT_URL configured:', livekitUrlConfigured)
	console.info('[TOKEN API] LIVEKIT_API_KEY configured:', apiKeyConfigured)
	console.info('[TOKEN API] LIVEKIT_API_SECRET configured:', apiSecretConfigured)
	if (!livekitUrlConfigured || !apiKeyConfigured || !apiSecretConfigured) {
		console.info('[TOKEN API] token generated:', false)
		return response.status(500).json({ error: 'LiveKit server credentials are not configured.', debug: { livekitUrlConfigured, apiKeyConfigured, apiSecretConfigured } })
	}

	try {
		const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, { identity: identity.trim(), ttl: '10m' })
		token.addGrant({ roomJoin: true, room: roomName.trim(), canPublish: true, canSubscribe: true, canPublishData: false })
		console.info('[TOKEN API] token generated:', true)
		return response.status(200).json({ token: await token.toJwt(), serverUrl: process.env.LIVEKIT_URL, debug: { livekitUrlConfigured, apiKeyConfigured, apiSecretConfigured } })
	} catch (error) {
		console.error('Token generation failed:', error.message)
		return response.status(500).json({ error: 'Unable to create a LiveKit token.' })
	}
}