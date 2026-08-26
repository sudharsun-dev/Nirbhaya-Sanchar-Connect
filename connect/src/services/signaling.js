const apiBase = import.meta.env.DEV ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001') : ''

function tokenHeaders(extra = {}) {
  const token = localStorage.getItem('nirbhaya-auth-token') || ''
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  }
}

async function request(path, options = {}) {
  const requestHeaders = { ...tokenHeaders(), ...(options.headers || {}) }
  let response
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: requestHeaders,
    })
  } catch {
    throw new Error('Signaling service unavailable.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Signaling request failed.')
  return body
}

export function createCall(receiverId) {
  const sessionUser = JSON.parse(localStorage.getItem('nirbhaya-user-profile') || 'null')
  return request('/api/calls', {
    method: 'POST',
    body: JSON.stringify({ receiverId, callerId: sessionUser?.id || null }),
  })
}
export function getCalls(userId) { return request(`/api/calls?userId=${encodeURIComponent(userId)}`) }
export function updateCall(callId, action, userId) { return request('/api/calls', { method: 'POST', body: JSON.stringify({ callId, action, userId }) }) }
