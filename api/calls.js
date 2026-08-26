import { compare } from 'bcryptjs'
import { getSupabaseAdmin } from './lib/supabase.js'

function readBearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice(7).trim()
}

async function getSessionUserId(supabase, token) {
  if (!token) return null
  const { data: sessions, error } = await supabase.from('sessions').select('user_id, token_hash')
  if (error) throw error
  for (const session of sessions || []) {
    const matches = await compare(token, session.token_hash)
    if (matches) return session.user_id
  }
  return null
}

async function getUserMap(supabase, userIds) {
  if (!userIds.length) return {}
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, phone, email')
    .in('id', userIds)
  if (error) throw error
  return Object.fromEntries((users || []).map((user) => [user.id, user]))
}

function normalizeCallRow(call, userMap) {
  const caller = userMap[call.caller_id]
  const receiver = userMap[call.receiver_id]
  if (!caller || !receiver) return null
  return {
    id: call.id,
    caller: { id: caller.id, name: caller.name },
    receiver: { id: receiver.id, name: receiver.name },
    roomName: call.room_id,
    roomId: call.room_id,
    status: call.status,
    createdAt: call.created_at,
    updatedAt: call.updated_at,
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

  const token = readBearerToken(request)
  if (!token) return response.status(401).json({ error: 'Authentication required.' })

  try {
    const supabase = getSupabaseAdmin()
    const currentUserId = await getSessionUserId(supabase, token)
    if (!currentUserId) return response.status(401).json({ error: 'Authentication required.' })

    if (request.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('calls')
        .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
        .or(`caller_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('updated_at', { ascending: false })

      if (error) {
        console.error('CALLS_DATABASE_ERROR', {
          operation: 'list_calls',
          code: error.code,
          message: error.message,
        })
        return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
      }

      const userIds = [...new Set((rows || []).flatMap((row) => [row.caller_id, row.receiver_id]))]
      const userMap = await getUserMap(supabase, userIds)
      const calls = (rows || []).map((row) => normalizeCallRow(row, userMap)).filter(Boolean)
      return response.status(200).json({ calls })
    }

    const { callId, action, receiverId } = request.body || {}

    if (callId && action) {
      const { data: callRows, error: fetchError } = await supabase
        .from('calls')
        .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
        .eq('id', callId)
        .single()

      if (fetchError) {
        return response.status(404).json({ error: 'Call not found.' })
      }

      const transitions = {
        accept: ['ringing', 'accepted'],
        reject: ['ringing', 'rejected'],
        cancel: ['ringing', 'cancelled'],
        end: ['accepted', 'ended'],
      }

      if (![callRows.caller_id, callRows.receiver_id].includes(currentUserId)) {
        return response.status(404).json({ error: 'Call not found.' })
      }

      if (!transitions[action]?.includes(callRows.status)) {
        return response.status(409).json({ error: 'Call is no longer active.' })
      }

      const nextStatus = transitions[action][1]
      const { data: updatedCall, error: updateError } = await supabase
        .from('calls')
        .update({ status: nextStatus, updated_at: Date.now() })
        .eq('id', callId)
        .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
        .single()

      if (updateError) {
        console.error('CALLS_DATABASE_ERROR', {
          operation: 'update_call',
          code: updateError.code,
          message: updateError.message,
        })
        return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
      }

      const userMap = await getUserMap(supabase, [updatedCall.caller_id, updatedCall.receiver_id])
      return response.status(200).json({ call: normalizeCallRow(updatedCall, userMap) })
    }

    if (!receiverId) return response.status(400).json({ error: 'receiverId is required.' })
    if (currentUserId === receiverId) return response.status(400).json({ error: 'A user cannot call themselves.' })

    const { data: receiver, error: receiverError } = await supabase
      .from('users')
      .select('id, name')
      .eq('id', receiverId)
      .maybeSingle()

    if (receiverError || !receiver) {
      return response.status(404).json({ error: 'Caller or receiver not found.' })
    }

    const { data: activeCalls, error: activeError } = await supabase
      .from('calls')
      .select('id')
      .or(`caller_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .in('status', ['ringing', 'accepted'])

    if (activeError) {
      console.error('CALLS_DATABASE_ERROR', {
        operation: 'check_active_calls',
        code: activeError.code,
        message: activeError.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    if ((activeCalls || []).length > 0) {
      return response.status(409).json({ error: 'User is busy.' })
    }

    const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const { data: createdCall, error: createError } = await supabase
      .from('calls')
      .insert({
        caller_id: currentUserId,
        receiver_id: receiverId,
        room_id: roomId,
        status: 'ringing',
        created_at: Date.now(),
        updated_at: Date.now(),
      })
      .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
      .single()

    if (createError) {
      console.error('CALLS_DATABASE_ERROR', {
        operation: 'create_call',
        code: createError.code,
        message: createError.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    const userMap = await getUserMap(supabase, [createdCall.caller_id, createdCall.receiver_id])
    return response.status(201).json({ call: normalizeCallRow(createdCall, userMap) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown call error'
    console.error('CALLS_DATABASE_ERROR', {
      operation: 'call_flow',
      message,
    })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
