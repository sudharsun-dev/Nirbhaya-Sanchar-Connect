const AUTH_KEY = 'nirbhaya-session'
const TOKEN_KEY = 'nirbhaya-auth-token'

export function getApiBase() {
  return import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
    : (import.meta.env.DEV ? 'http://localhost:3001' : '')
}

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
  else localStorage.removeItem(TOKEN_KEY)
}

export async function authenticatedRequest(path, options = {}) {
  const token = getAuthToken()
  const apiBase = getApiBase()
  const fullUrl = path.startsWith('http') ? path : `${apiBase}${path}`
  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (response.status === 401) console.warn('AUTHENTICATED_REQUEST_401=true')
  return response
}

export function clearSessionUser() {
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(TOKEN_KEY)
}

export async function registerUser(payload) {
  const apiBase = getApiBase()
  const response = await fetch(`${apiBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Registration failed.')
  return result.user
}

export async function loginUser(payload) {
  const apiBase = getApiBase()
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Login failed.')
  return result.user
}
