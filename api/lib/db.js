import crypto from 'node:crypto'
import { sql } from '@vercel/postgres'

export function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL)
}

export async function ensureSchema() {
  if (!hasDatabaseConfig()) {
    throw new Error('Database configuration is missing.')
  }

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile_photo TEXT DEFAULT '',
      online_status TEXT DEFAULT 'online',
      last_seen BIGINT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL DEFAULT 0
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL DEFAULT 0,
      expires_at BIGINT NOT NULL DEFAULT 0
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL DEFAULT 0
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ringing',
      created_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT 0,
      answered_at BIGINT,
      ended_at BIGINT,
      duration INTEGER DEFAULT 0
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`
  await sql`CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_calls_users ON calls(caller_id, receiver_id)`
}

function asNumber(value, fallback = Date.now()) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    password_hash: row.password_hash,
    profile_photo: row.profile_photo || '',
    online_status: row.online_status || 'online',
    last_seen: asNumber(row.last_seen, row.created_at || Date.now()),
    created_at: asNumber(row.created_at, Date.now()),
  }
}

export function normalizeContactRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    contact_id: row.contact_user_id,
    created_at: asNumber(row.created_at, Date.now()),
  }
}

export function normalizeSessionRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token_hash,
    createdAt: asNumber(row.created_at, Date.now()),
    expiresAt: asNumber(row.expires_at, Date.now()),
  }
}

export function normalizeCallRow(row) {
  return {
    id: row.id,
    callerId: row.caller_id,
    receiverId: row.receiver_id,
    roomId: row.room_id,
    status: row.status,
    createdAt: asNumber(row.created_at, Date.now()),
    updatedAt: asNumber(row.updated_at, Date.now()),
    answeredAt: row.answered_at ? asNumber(row.answered_at, Date.now()) : null,
    endedAt: row.ended_at ? asNumber(row.ended_at, Date.now()) : null,
    duration: Number(row.duration || 0),
  }
}

export async function loadStore() {
  await ensureSchema()

  const [usersResult, contactsResult, callsResult, sessionsResult] = await Promise.all([
    sql`SELECT * FROM users ORDER BY created_at ASC`,
    sql`SELECT * FROM contacts ORDER BY created_at ASC`,
    sql`SELECT * FROM calls ORDER BY created_at ASC`,
    sql`SELECT * FROM sessions ORDER BY created_at ASC`,
  ])

  return {
    users: usersResult.rows.map(normalizeUserRow),
    contacts: contactsResult.rows.map(normalizeContactRow),
    calls: callsResult.rows.map(normalizeCallRow),
    sessions: sessionsResult.rows.map(normalizeSessionRow),
  }
}

export async function saveStore(store) {
  if (!store) return store
  await ensureSchema()

  await sql`DELETE FROM sessions`
  for (const session of store.sessions || []) {
    await sql`
      INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
      VALUES (${session.id || crypto.randomUUID()}, ${session.userId}, ${session.token}, ${Number(session.createdAt || Date.now())}, ${Number(session.expiresAt || Date.now() + 86400000)})
    `
  }

  await sql`DELETE FROM contacts`
  for (const contact of store.contacts || []) {
    await sql`
      INSERT INTO contacts (id, user_id, contact_user_id, created_at)
      VALUES (${contact.id || crypto.randomUUID()}, ${contact.user_id}, ${contact.contact_id}, ${Number(contact.created_at || Date.now())})
    `
  }

  await sql`DELETE FROM calls`
  for (const call of store.calls || []) {
    await sql`
      INSERT INTO calls (id, caller_id, receiver_id, room_id, status, created_at, updated_at, answered_at, ended_at, duration)
      VALUES (
        ${call.id},
        ${call.callerId},
        ${call.receiverId},
        ${call.roomId},
        ${call.status},
        ${Number(call.createdAt || Date.now())},
        ${Number(call.updatedAt || Date.now())},
        ${call.answeredAt ? Number(call.answeredAt) : null},
        ${call.endedAt ? Number(call.endedAt) : null},
        ${Number(call.duration || 0)}
      )
    `
  }

  await sql`DELETE FROM users`
  for (const user of store.users || []) {
    await sql`
      INSERT INTO users (id, name, phone, email, password_hash, profile_photo, online_status, last_seen, created_at)
      VALUES (
        ${user.id},
        ${user.name},
        ${user.phone},
        ${user.email},
        ${user.password_hash},
        ${user.profile_photo || ''},
        ${user.online_status || 'online'},
        ${Number(user.last_seen || user.created_at || Date.now())},
        ${Number(user.created_at || Date.now())}
      )
    `
  }

  return store
}
