const apiBase = import.meta.env.DEV ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001') : ''

async function request(path, options = {}) {
  let response
  try { response = await fetch(`${apiBase}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options }) } catch { throw new Error('Signaling service unavailable.') }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Signaling request failed.')
  return body
}

export function createCall(caller, receiver, roomName) { return request('/api/calls', { method: 'POST', body: JSON.stringify({ caller, receiver, roomName }) }) }
export function getCalls(userId) { return request(`/api/calls?userId=${encodeURIComponent(userId)}`) }
export function updateCall(callId, action, userId) { return request('/api/calls', { method: 'POST', body: JSON.stringify({ callId, action, userId }) }) }
