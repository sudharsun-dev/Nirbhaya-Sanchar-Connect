const AUTH_KEY = 'nirbhaya-session'
const TOKEN_KEY = 'nirbhaya-auth-token'

export function getSessionUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setSessionUser(user, token) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
  if (token) localStorage.setItem(TOKEN_KEY, token)
}

export function clearSessionUser() {
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

export async function registerUser(payload) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Registration failed.')
  return result.user
}

export async function loginUser(payload) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Login failed.')
  return result.user
}
