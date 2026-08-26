import { loadStore, sanitizeUser, verifyPassword } from '../lib/store.js'

export default function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  const { email, password } = request.body || {}

  if (!email?.trim() || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }

  const store = loadStore()
  const user = store.users.find((item) => item.email.toLowerCase() === String(email).trim().toLowerCase())
  if (!user || !verifyPassword(password, user.password_hash)) {
    return response.status(401).json({ error: 'Invalid email or password.' })
  }

  user.online_status = 'online'
  user.last_seen = Date.now()
  const updated = { ...user }
  const index = store.users.findIndex((item) => item.id === user.id)
  if (index >= 0) store.users[index] = updated
  saveStore(store)

  return response.status(200).json({ user: sanitizeUser(updated) })
}
