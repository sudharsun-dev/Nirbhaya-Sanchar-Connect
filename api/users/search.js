import { loadStore, sanitizeUser } from '../lib/store.js'

export default function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
  const query = String(request.query?.q || '').trim().toLowerCase()
  if (!query) return response.status(200).json({ users: [] })

  const store = loadStore()
  const users = store.users
    .filter((user) => {
      const haystack = [user.id, user.name, user.phone, user.email].map((value) => String(value || '').toLowerCase())
      return haystack.some((value) => value.includes(query))
    })
    .map((user) => sanitizeUser(user))

  return response.status(200).json({ users })
}
