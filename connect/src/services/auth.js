const AUTH_KEY = 'nirbhaya-session'
const TOKEN_KEY = 'nirbhaya-auth-token'

export function getApiBase() {
  return import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '')
    : (import.meta.env.DEV ? 'http://localhost:3001' : 'https://nirbhaya-connect-server.onrender.com')
}

export function getSessionUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY) || localStorage.getItem('nirbhaya-user-profile')
    if (!raw) return null
    const user = JSON.parse(raw)
    if (!user || typeof user !== 'object') return null
    return {
      id: user.id || (user.name ? user.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'user'),
      name: user.name || 'User',
      email: user.email || '',
      phone: user.phone || '',
      online_status: user.online_status || 'online',
    }
  } catch {
    return null
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setSessionUser(user, token) {
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user))
    localStorage.setItem('nirbhaya-user-profile', JSON.stringify(user))
  }
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else if (token === null) localStorage.removeItem(TOKEN_KEY)
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
  localStorage.removeItem('nirbhaya-user-profile')
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
  if (result.user && result.token) {
    setSessionUser(result.user, result.token)
  }
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
  if (result.user && result.token) {
    setSessionUser(result.user, result.token)
  }
  return result.user
}
