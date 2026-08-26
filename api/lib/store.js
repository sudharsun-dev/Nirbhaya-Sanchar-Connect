import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const STORE_PATH = path.join(process.cwd(), 'tmp', 'nirbhaya-store.json')

function ensureFile() {
  const directory = path.dirname(STORE_PATH)
  fs.mkdirSync(directory, { recursive: true })
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ users: [], contacts: [], calls: [] }, null, 2))
  }
}

export function loadStore() {
  if (globalThis.__nirbhayaStore) return globalThis.__nirbhayaStore
  ensureFile()
  const raw = fs.readFileSync(STORE_PATH, 'utf8')
  const parsed = JSON.parse(raw || '{"users":[],"contacts":[],"calls":[]}')
  const store = {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
    calls: Array.isArray(parsed.calls) ? parsed.calls : [],
  }
  globalThis.__nirbhayaStore = store
  return store
}

export function saveStore(store) {
  globalThis.__nirbhayaStore = store
  ensureFile()
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
  return store
}

export function generateUserId() {
  const number = (Math.floor(Math.random() * 90000) + 10000).toString()
  return `NS${number}`
}

export function generateCallId() {
  return `CALL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

export function generateRoomId(callId) {
  return `nirbhaya-call-${callId}`
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, storedValue) {
  if (!storedValue || typeof storedValue !== 'string') return false
  const [salt, hash] = storedValue.split(':')
  if (!salt || !hash) return false
  const generated = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(generated, 'hex'))
}

export function sanitizeUser(user) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    profile_photo: user.profile_photo || '',
    online_status: user.online_status || 'online',
    last_seen: user.last_seen || Date.now(),
    created_at: user.created_at || Date.now(),
  }
}
