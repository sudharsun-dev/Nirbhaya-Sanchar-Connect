export default function handler(_request, response) {
	response.status(200).json({
		status: 'ok',
		service: 'nirbhaya-sanchar',
		version: '190ee70',
		livekitUrlConfigured: Boolean(process.env.LIVEKIT_URL?.startsWith('wss://')),
		apiKeyConfigured: Boolean(process.env.LIVEKIT_API_KEY),
		apiSecretConfigured: Boolean(process.env.LIVEKIT_API_SECRET),
	})
}