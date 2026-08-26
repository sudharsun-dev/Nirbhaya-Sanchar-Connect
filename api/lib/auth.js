import crypto from 'node:crypto'
import { compare } from 'bcryptjs'

function readBearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return { headerPresent: Boolean(header), token }
}

export async function getAuthenticatedUser(supabase, request) {
  const { headerPresent, token } = readBearerToken(request)
  const diagnostics = {
    headerPresent,
    tokenPresent: Boolean(token),
    sessionFound: false,
    sessionExpired: false,
    currentUserFound: false,
  }

  if (!token) return { userId: null, diagnostics }

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('user_id, token_hash, expires_at')

  if (error) throw error

  for (const session of sessions || []) {
    const expiresAt = Date.parse(session.expires_at) || Number(session.expires_at)
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      const matches = await compare(token, session.token_hash)
      if (matches) diagnostics.sessionExpired = true
      continue
    }

    const matches = await compare(token, session.token_hash)
    if (matches) {
      diagnostics.sessionFound = true
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', session.user_id)
        .maybeSingle()

      if (userError) throw userError
      diagnostics.currentUserFound = Boolean(user)
      return { userId: user?.id || null, diagnostics }
    }
  }

  return { userId: null, diagnostics }
}

export function createSessionId() {
  return crypto.randomUUID()
}