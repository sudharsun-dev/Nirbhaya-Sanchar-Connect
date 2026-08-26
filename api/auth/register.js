import { generateSessionToken, generateUserId, hashPassword, loadStore, sanitizeUser, saveStore, hashToken } from '../lib/store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  const { name, phone, email, password } = request.body || {}

  if (!name?.trim() || !phone?.trim() || !email?.trim() || !password) {
    return response.status(400).json({ error: 'Name, phone, email, and password are required.' })
  }

  try {
    const store = await loadStore()
    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedPhone = String(phone).trim()
    const existing = store.users.find((user) => user.email.toLowerCase() === normalizedEmail || user.phone === normalizedPhone)
    if (existing) return response.status(409).json({ error: 'A user with that email or phone number already exists.' })

    const id = generateUserId()
    const now = Date.now()
    const user = {
      id,
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      password_hash: hashPassword(password),
      profile_photo: '',
      online_status: 'online',
      last_seen: now,
      created_at: now,
    }

    const sessionToken = generateSessionToken()
    store.users.push(user)
    store.sessions.push({ id: `session-${id}`, userId: user.id, token: sessionToken, createdAt: now, expiresAt: now + 86400000 })
    await saveStore(store)

    return response.status(201).json({ user: sanitizeUser(user), token: sessionToken })
  } catch (error) {
    console.error('REGISTER_ERROR', { email: String(email || '').trim(), status: 'failed', message: error.message })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
