import { compare, hash } from 'bcryptjs'
import { generateSessionToken } from '../lib/store.js'
import { getSupabaseAdmin } from '../lib/supabase.js'
import { createSessionId } from '../lib/auth.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

  const { email, password } = request.body || {}
  const trimmedEmail = String(email || '').trim().toLowerCase()

  if (!trimmedEmail || !password) {
    return response.status(400).json({ error: 'Email and password are required.' })
  }

  try {
    console.info(`SUPABASE_URL_CONFIGURED=${Boolean(process.env.SUPABASE_URL)}`)
    console.info(`SUPABASE_SERVICE_ROLE_CONFIGURED=${Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}`)
    const supabase = getSupabaseAdmin()
    console.info('LOGIN_STEP=users_query')
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, phone, email, password_hash, created_at')
      .eq('email', trimmedEmail)
      .maybeSingle()

    if (userError) {
      console.error('LOGIN_DATABASE_ERROR', {
        code: userError.code,
        message: userError.message,
        details: userError.details,
      })
      return response.status(500).json({
        error: 'Login users query failed.',
        code: userError.code,
        message: userError.message,
        details: userError.details,
      })
    }

    if (!user) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }

    console.info('LOGIN_STEP=password_check')
    const passwordMatches = await compare(String(password), user.password_hash)
    if (!passwordMatches) {
      return response.status(401).json({ error: 'Invalid email or password.' })
    }

    const sessionToken = generateSessionToken()
    console.info('LOGIN_STEP=session_hash')
    const sessionHash = await hash(sessionToken, 12)
    const now = new Date().toISOString()
    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        id: createSessionId(),
        user_id: user.id,
        token_hash: sessionHash,
        created_at: now,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      })

    if (sessionError) {
      console.error('LOGIN_DATABASE_ERROR', {
        code: sessionError.code,
        message: sessionError.message,
        details: sessionError.details,
      })
      return response.status(500).json({
        error: 'Login session insert failed.',
        code: sessionError.code,
        message: sessionError.message,
        details: sessionError.details,
      })
    }

    console.info('LOGIN_STEP=session_insert')
    console.info('LOGIN_STEP=response')
    console.info('AUTH_LOGIN_SUCCESS=true')
    console.info('SESSION_CREATED=true')

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
    console.error('LOGIN_ERROR', { message })
    return response.status(500).json({ error: 'Login operation failed.', message })
  }
}
