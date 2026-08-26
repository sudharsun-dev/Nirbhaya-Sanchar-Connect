import { loadStore, sanitizeUser, saveStore } from './lib/store.js'

export default function handler(request, response) {
  if (request.method === 'GET') {
    const userId = String(request.query?.userId || '')
    const store = loadStore()
    const contacts = store.contacts.filter((entry) => entry.user_id === userId || entry.contact_id === userId)
    return response.status(200).json({ contacts })
  }

  if (request.method === 'POST') {
    const { userId, contactId } = request.body || {}
    if (!userId || !contactId) return response.status(400).json({ error: 'userId and contactId are required.' })
    const store = loadStore()
    if (userId === contactId) return response.status(400).json({ error: 'A user cannot add themselves as a contact.' })
    const exists = store.contacts.some((entry) => entry.user_id === userId && entry.contact_id === contactId)
    if (exists) return response.status(200).json({ message: 'Contact already exists.' })
    const user = store.users.find((entry) => entry.id === userId)
    const contact = store.users.find((entry) => entry.id === contactId)
    if (!user || !contact) return response.status(404).json({ error: 'User or contact not found.' })
    store.contacts.push({ id: `${userId}-${contactId}`, user_id: userId, contact_id: contactId, created_at: Date.now() })
    saveStore(store)
    return response.status(201).json({ contact: sanitizeUser(contact) })
  }

  return response.status(405).json({ error: 'Method not allowed.' })
}
