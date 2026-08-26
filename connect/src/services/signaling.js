import { authenticatedRequest } from './auth'

const apiBase = import.meta.env.DEV ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001') : ''

async function request(path, options = {}) {
  let response
  try {
    response = await authenticatedRequest(`${apiBase}${path}`, options)
  } catch {
    throw new Error('Signaling service unavailable.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'Signaling request failed.')
  return body
}

export function createCall(receiverId) {
  return request('/api/calls', {
    method: 'POST',
    body: JSON.stringify({ receiverId }),
  })
}
export function getCalls() { return request('/api/calls') }
export function updateCall(callId, action) { return request('/api/calls', { method: 'POST', body: JSON.stringify({ callId, action }) }) }
