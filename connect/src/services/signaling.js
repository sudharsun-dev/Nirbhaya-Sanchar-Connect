import { authenticatedRequest } from './auth'

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

export function createCall(receiverId) {
  return request('/api/calls', {
    method: 'POST',
    body: JSON.stringify({ receiverId }),
  })
}
export function getCalls(options) { return request('/api/calls', options) }
export function updateCall(callId, action) { return request('/api/calls', { method: 'POST', body: JSON.stringify({ callId, action }) }) }
