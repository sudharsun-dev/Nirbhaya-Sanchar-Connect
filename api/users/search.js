import { getAuthenticatedUser } from '../lib/auth.js'
import { getSupabaseAdmin } from '../lib/supabase.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })

  try {
    const supabase = getSupabaseAdmin()
    const auth = await getAuthenticatedUser(supabase, request)
    console.info(`AUTH_HEADER_PRESENT=${auth.diagnostics.headerPresent}`)
    console.info(`AUTH_TOKEN_PRESENT=${auth.diagnostics.tokenPresent}`)
    console.info(`SESSION_FOUND=${auth.diagnostics.sessionFound}`)
    console.info(`SESSION_EXPIRED=${auth.diagnostics.sessionExpired}`)
    console.info(`CURRENT_USER_FOUND=${auth.diagnostics.currentUserFound}`)
    if (!auth.userId) return response.status(401).json({ error: 'Authentication required.' })
    const currentUserId = auth.userId
    console.info('CONTACT_SEARCH_STARTED=true')

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

    console.info(`CONTACT_SEARCH_RESULT_COUNT=${safeUsers.length}`)
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
