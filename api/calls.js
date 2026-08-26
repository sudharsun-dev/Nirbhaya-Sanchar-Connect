import { generateCallId, generateRoomId, loadStore, saveStore } from './lib/store.js'

const now = () => Date.now()

function normalizeCall(call, store) {
  if (!call) return null
  const caller = store.users.find((user) => user.id === call.callerId)
  const receiver = store.users.find((user) => user.id === call.receiverId)
  if (!caller || !receiver) return null
  return {
    id: call.id,
    caller: { id: caller.id, name: caller.name },
    receiver: { id: receiver.id, name: receiver.name },
    roomName: call.roomId,
    roomId: call.roomId,
    status: call.status,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
  }
}

export default function handler(request, response) {
  const store = loadStore()

  if (request.method === 'GET') {
    const userId = String(request.query?.userId || '')
    const items = store.calls
      .filter((call) => [call.callerId, call.receiverId].includes(userId))
      .filter((call) => now() - call.updatedAt < 120000)
      .map((call) => normalizeCall(call, store))
      .filter(Boolean)
    return response.status(200).json({ calls: items })
  }

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

  const { callId, action, userId } = request.body || {}
  if (callId && action && userId) {
    const call = store.calls.find((item) => item.id === callId)
    const transitions = { accept: ['ringing', 'accepted'], reject: ['ringing', 'rejected'], cancel: ['calling', 'cancelled'], end: ['accepted', 'ended'] }
    if (!call || ![call.callerId, call.receiverId].includes(userId)) return response.status(404).json({ error: 'Call not found.' })
    if (!transitions[action]?.includes(call.status)) return response.status(409).json({ error: 'Call is no longer active.' })
    call.status = transitions[action][1]
    call.updatedAt = Date.now()
    saveStore(store)
    return response.status(200).json({ call: normalizeCall(call, store) })
  }

  const { callerId, receiverId } = request.body || {}
  if (!receiverId) return response.status(400).json({ error: 'receiverId is required.' })

  const caller = store.users.find((user) => user.id === callerId)
  const receiver = store.users.find((user) => user.id === receiverId)
  if (!caller || !receiver) return response.status(404).json({ error: 'Caller or receiver not found.' })
  if (caller.id === receiver.id) return response.status(400).json({ error: 'A user cannot call themselves.' })

  const active = store.calls.some((call) => [call.callerId, call.receiverId].includes(caller.id) && ['calling', 'ringing', 'accepted'].includes(call.status))
  if (active) return response.status(409).json({ error: 'User is busy.' })

  const callId = generateCallId()
  const roomId = generateRoomId(callId)
  const call = {
    id: callId,
    callerId: caller.id,
    receiverId: receiver.id,
    roomId,
    status: 'calling',
    createdAt: now(),
    updatedAt: now(),
  }
  store.calls.push(call)
  saveStore(store)
  return response.status(201).json({ call: normalizeCall(call, store) })
}
