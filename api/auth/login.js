import { generateSessionToken, loadStore, sanitizeUser, saveStore, verifyPassword } from '../lib/store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  const { email, password } = request.body || {}

  if (!email?.trim() || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }

  try {
    const store = await loadStore()
    const normalizedEmail = String(email).trim().toLowerCase()
    const user = store.users.find((item) => item.email.toLowerCase() === normalizedEmail)
    console.info('LOGIN_USER_FOUND', { userId: user?.id || null, email: normalizedEmail, status: user ? 'found' : 'not_found' })
    if (!user || !verifyPassword(password, user.password_hash)) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }

    const now = Date.now()
    user.online_status = 'online'
    user.last_seen = now
    const updated = { ...user }
    const index = store.users.findIndex((item) => item.id === user.id)
    if (index >= 0) store.users[index] = updated
    const sessionToken = generateSessionToken()
    store.sessions = store.sessions.filter((session) => session.userId !== user.id)
    store.sessions.push({ id: `session-${user.id}`, userId: user.id, token: sessionToken, createdAt: now, expiresAt: now + 86400000 })
    await saveStore(store)

    console.info('LOGIN_SUCCESS', { userId: user.id, email: normalizedEmail, status: 'ok' })
    return response.status(200).json({ user: sanitizeUser(updated), token: sessionToken })
  } catch (error) {
    console.error('LOGIN_ERROR', { email: String(email || '').trim(), status: 'failed', message: error.message })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
