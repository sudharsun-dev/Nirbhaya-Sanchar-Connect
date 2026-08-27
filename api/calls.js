import { getAuthenticatedUser } from './lib/auth.js'
import { getSupabaseAdmin } from './lib/supabase.js'

function databaseError(response, operation, error) {
  console.error(operation, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  })
  return response.status(500).json({
    error: `${operation} failed.`,
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  })
}

async function getUserMap(supabase, userIds) {
  if (!userIds.length) return {}
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, phone, email')
    .in('id', userIds)
  return { users, error }
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

  try {
    const supabase = getSupabaseAdmin()
    let auth
    try {
      auth = await getAuthenticatedUser(supabase, request)
    } catch (error) {
      return databaseError(response, 'CALLS_AUTH', error)
    }
    console.info(`AUTH_HEADER_PRESENT=${auth.diagnostics.headerPresent}`)
    console.info(`AUTH_TOKEN_PRESENT=${auth.diagnostics.tokenPresent}`)
    console.info(`SESSION_FOUND=${auth.diagnostics.sessionFound}`)
    console.info(`SESSION_EXPIRED=${auth.diagnostics.sessionExpired}`)
    console.info(`CURRENT_USER_FOUND=${auth.diagnostics.currentUserFound}`)
    if (!auth.userId) return response.status(401).json({ error: 'Authentication required.' })
    const currentUserId = auth.userId

    if (request.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('calls')
        .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
        .or(`caller_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('updated_at', { ascending: false })

      if (error) {
        return databaseError(response, 'CALLS_SELECT', error)
      }

      const userIds = [...new Set((rows || []).flatMap((row) => [row.caller_id, row.receiver_id]))]
      const { users, error: usersError } = await getUserMap(supabase, userIds)
      if (usersError) return databaseError(response, 'CALLS_USER_LOOKUP', usersError)
      const userMap = Object.fromEntries((users || []).map((user) => [user.id, user]))
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
        if (fetchError.code === 'PGRST116') return response.status(404).json({ error: 'Call not found.' })
        return databaseError(response, 'CALLS_LOOKUP', fetchError)
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
      const updatedAt = new Date().toISOString()
      const { data: updatedCall, error: updateError } = await supabase
        .from('calls')
        .update({ status: nextStatus, updated_at: updatedAt })
        .eq('id', callId)
        .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
        .single()

      if (updateError) {
        return databaseError(response, 'CALLS_UPDATE', updateError)
      }

      const { users, error: usersError } = await getUserMap(supabase, [updatedCall.caller_id, updatedCall.receiver_id])
      if (usersError) return databaseError(response, 'CALLS_USER_LOOKUP', usersError)
      const userMap = Object.fromEntries((users || []).map((user) => [user.id, user]))
      return response.status(200).json({ call: normalizeCallRow(updatedCall, userMap) })
    }

    if (!receiverId) return response.status(400).json({ error: 'receiverId is required.' })
    if (currentUserId === receiverId) return response.status(400).json({ error: 'A user cannot call themselves.' })

    const { data: receiver, error: receiverError } = await supabase
      .from('users')
      .select('id, name')
      .eq('id', receiverId)
      .maybeSingle()

    if (receiverError) return databaseError(response, 'CALLS_TARGET_USER', receiverError)
    if (!receiver) {
      return response.status(404).json({ error: 'Caller or receiver not found.' })
    }

    const { data: activeCalls, error: activeError } = await supabase
      .from('calls')
      .select('id')
      .or(`caller_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
      .in('status', ['ringing', 'accepted'])

    if (activeError) {
      return databaseError(response, 'CALLS_ACTIVE_LOOKUP', activeError)
    }

    if ((activeCalls || []).length > 0) {
      return response.status(409).json({ error: 'User is busy.' })
    }

    const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const { data: createdCall, error: createError } = await supabase
      .from('calls')
      .insert({
        caller_id: currentUserId,
        receiver_id: receiverId,
        room_id: roomId,
        status: 'ringing',
        created_at: now,
        updated_at: now,
      })
      .select('id, caller_id, receiver_id, room_id, status, created_at, updated_at')
      .single()

    if (createError) {
      return databaseError(response, 'CALLS_INSERT', createError)
    }

    const { users, error: usersError } = await getUserMap(supabase, [createdCall.caller_id, createdCall.receiver_id])
    if (usersError) return databaseError(response, 'CALLS_USER_LOOKUP', usersError)
    const userMap = Object.fromEntries((users || []).map((user) => [user.id, user]))
    return response.status(201).json({ call: normalizeCallRow(createdCall, userMap) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown call error'
    console.error('CALLS_ERROR', { message })
    return response.status(500).json({ error: 'Call operation failed.', message })
  }
}
