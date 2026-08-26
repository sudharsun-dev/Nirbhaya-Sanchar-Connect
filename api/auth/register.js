import { generateSessionToken, generateUserId, hashPassword, loadStore, sanitizeUser, saveStore } from '../lib/store.js'

export default function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })
  const { name, phone, email, password } = request.body || {}

  if (!name?.trim() || !phone?.trim() || !email?.trim() || !password) {
    return response.status(400).json({ error: 'Name, phone, email, and password are required.' })
  }

  const store = loadStore()
  const existing = store.users.find((user) => user.email.toLowerCase() === String(email).trim().toLowerCase() || user.phone === phone.trim())
  if (existing) return response.status(409).json({ error: 'A user with that email or phone number already exists.' })

  const id = generateUserId()
  const user = {
    id,
    name: name.trim(),
    phone: phone.trim(),
    email: email.trim().toLowerCase(),
    password_hash: hashPassword(password),
    profile_photo: '',
    online_status: 'online',
    last_seen: Date.now(),
    created_at: Date.now(),
  }

  const sessionToken = generateSessionToken()
  store.users.push(user)
  store.sessions.push({ token: sessionToken, userId: user.id, createdAt: Date.now() })
  saveStore(store)

  return response.status(201).json({ user: sanitizeUser(user), token: sessionToken })
}
