import { compare, hash } from 'bcryptjs'
import { generateSessionToken } from '../lib/store.js'
import { getSupabaseAdmin } from '../lib/supabase.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

  const { email, password } = request.body || {}
  const trimmedEmail = String(email || '').trim().toLowerCase()

  if (!trimmedEmail || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, phone, email, password_hash, created_at')
      .eq('email', trimmedEmail)
      .maybeSingle()

    if (userError) {
      console.error('LOGIN_DATABASE_ERROR', {
        email: trimmedEmail,
        operation: 'lookup_user',
        code: userError.code,
        message: userError.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    if (!user) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }

    const passwordMatches = await compare(String(password), user.password_hash)
    if (!passwordMatches) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }

    const sessionToken = generateSessionToken()
    const sessionHash = hash(sessionToken, 12)
    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        token_hash: sessionHash,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })

    if (sessionError) {
      console.error('LOGIN_SESSION_ERROR', {
        userId: user.id,
        email: trimmedEmail,
        operation: 'create_session',
        code: sessionError.code,
        message: sessionError.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    return response.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        created_at: user.created_at,
      },
      token: sessionToken,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown login error'
    console.error('LOGIN_DATABASE_ERROR', {
      email: trimmedEmail,
      operation: 'login_user',
      message,
    })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
