import { compare } from 'bcryptjs'
import { getSupabaseAdmin } from '../lib/supabase.js'

function readBearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice(7).trim()
}

async function getSessionUserId(supabase, token) {
  if (!token) return null
  const { data: sessions, error } = await supabase.from('sessions').select('user_id, token_hash, expires_at')
  if (error) throw error
  for (const session of sessions || []) {
    const expiresAt = Date.parse(session.expires_at) || Number(session.expires_at)
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue
    const matches = await compare(token, session.token_hash)
    if (matches) {
      console.info('SESSION_FOUND=true')
      console.info('AUTHENTICATED_USER_ID_PRESENT=true')
      return session.user_id
    }
  }
  console.info('SESSION_FOUND=false')
  console.info('AUTHENTICATED_USER_ID_PRESENT=false')
  return null
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })

  const token = readBearerToken(request)
  console.info(`AUTH_HEADER_PRESENT=${Boolean(token)}`)
  if (!token) return response.status(401).json({ error: 'Authentication required.' })

  try {
    const supabase = getSupabaseAdmin()
    const currentUserId = await getSessionUserId(supabase, token)
    if (!currentUserId) return response.status(401).json({ error: 'Authentication required.' })

    const query = String(request.query?.q || '').trim().toLowerCase()
    if (!query) return response.status(200).json({ users: [] })

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, phone, email, created_at')

    if (error) {
      console.error('USER_SEARCH_DATABASE_ERROR', {
        operation: 'search_users',
        code: error.code,
        message: error.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    const safeUsers = (users || [])
      .filter((user) => user.id !== currentUserId)
      .filter((user) => {
        const haystack = [user.id, user.name, user.phone, user.email].map((value) => String(value || '').toLowerCase())
        return haystack.some((value) => value.includes(query))
      })
      .map((user) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        created_at: user.created_at,
        online_status: 'online',
      }))

    return response.status(200).json({ users: safeUsers })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown search error'
    console.error('USER_SEARCH_DATABASE_ERROR', {
      operation: 'search_users',
      message,
    })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
