import { loadStore, sanitizeUser } from '../lib/store.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })
  const store = await loadStore()
  return response.status(200).json({ users: store.users.map((user) => sanitizeUser(user)) })
}
