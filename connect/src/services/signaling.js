import { authenticatedRequest, getSessionUser } from './auth'

const apiBase = import.meta.env.VITE_API_BASE_URL 
  ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '') 
  : (import.meta.env.DEV ? 'http://localhost:3001' : '')

async function request(path, options = {}) {
  let response
  try {
    response = await authenticatedRequest(`${apiBase}${path}`, options)
  } catch {
    throw new Error('Signaling service unavailable.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401) throw new Error('Session expired. Please log in again.')
    if (response.status === 404) throw new Error('User or call not found.')
    if (response.status === 500) throw new Error('Call service temporarily unavailable.')
    throw new Error(body.error || 'Signaling request failed.')
  }
  return body
}

export function createCall(payload) {
  const sessionUser = getSessionUser()
  let body = {}
  if (typeof payload === 'string') {
    body = {
      receiverId: payload,
      caller: sessionUser ? { id: sessionUser.id, name: sessionUser.name, email: sessionUser.email, phone: sessionUser.phone || '' } : undefined,
    }
  } else if (payload && typeof payload === 'object') {
    body = {
      ...payload,
      caller: payload.caller || (sessionUser ? { id: sessionUser.id, name: sessionUser.name, email: sessionUser.email, phone: sessionUser.phone || '' } : undefined),
    }
  }
  return request('/api/calls', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getCalls(options = {}) {
  const user = getSessionUser()
  const query = user?.id ? `?userId=${encodeURIComponent(user.id)}` : ''
  return request(`/api/calls${query}`, options)
}

export function updateCall(callId, action) {
  const user = getSessionUser()
  return request('/api/calls', {
    method: 'POST',
    body: JSON.stringify({ callId, action, userId: user?.id }),
  })
}
