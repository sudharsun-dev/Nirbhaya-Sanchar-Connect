const calls = globalThis.__nirbhayaCalls || (globalThis.__nirbhayaCalls = new Map())
const now = () => Date.now()

export default function handler(request, response) {
  if (request.method === 'GET') {
    const userId = String(request.query?.userId || '')
    const items = [...calls.values()].filter((call) => call.caller.id === userId || call.receiver.id === userId).filter((call) => now() - call.updatedAt < 120000)
    return response.status(200).json({ calls: items })
  }
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  const { callId, action, userId } = request.body || {}
  if (callId && action && userId) {
    const call = calls.get(callId)
    const transitions = { accept: ['RINGING', 'ACCEPTED'], reject: ['RINGING', 'REJECTED'], cancel: ['CALLING', 'CANCELLED'], end: ['ACCEPTED', 'ENDED'] }
    if (!call || ![call.caller.id, call.receiver.id].includes(userId)) return response.status(404).json({ error: 'Call not found.' })
    if (!transitions[action]?.includes(call.status)) return response.status(409).json({ error: 'Call is no longer active.' })
    call.status = transitions[action][1]
    call.updatedAt = Date.now()
    return response.status(200).json({ call })
  }
  const { caller, receiver, roomName } = request.body || {}
  if (!caller?.id || !caller?.name || !receiver?.id || !receiver?.name || !roomName) return response.status(400).json({ error: 'caller, receiver, and roomName are required.' })
  if (caller.id === receiver.id) return response.status(400).json({ error: 'A user cannot call themselves.' })
  const active = [...calls.values()].find((call) => [call.caller.id, call.receiver.id].includes(caller.id) && ['CALLING', 'RINGING', 'ACCEPTED'].includes(call.status))
  if (active) return response.status(409).json({ error: 'User is busy.' })
  const call = { id: crypto.randomUUID(), caller, receiver, roomName, status: 'CALLING', createdAt: now(), updatedAt: now() }
  calls.set(call.id, call)
  return response.status(201).json({ call })
}
