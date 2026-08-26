import { hash } from 'bcryptjs'
import { getSupabaseAdmin } from '../lib/supabase.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

  const { name, phone, email, password } = request.body || {}
  const trimmedName = String(name || '').trim()
  const trimmedPhone = String(phone || '').trim()
  const trimmedEmail = String(email || '').trim().toLowerCase()

  if (!trimmedName || !trimmedPhone || !trimmedEmail || !password) {
    return response.status(400).json({ error: 'Name, phone, email, and password are required.' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return response.status(400).json({ error: 'Please enter a valid email address.' })
  }

  if (String(password).length < 8) {
    return response.status(400).json({ error: 'Password must be at least 8 characters long.' })
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data: existingByEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', trimmedEmail)
      .maybeSingle()

    if (existingByEmail) {
      return response.status(409).json({ error: 'An account with this email already exists.' })
    }

    const { data: existingByPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone', trimmedPhone)
      .maybeSingle()

    if (existingByPhone) {
      return response.status(409).json({ error: 'This phone number is already registered.' })
    }

    const passwordHash = await hash(password, 12)
    const { data, error } = await supabase
      .from('users')
      .insert({
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        password_hash: passwordHash,
      })
      .select('id, name, phone, email, created_at')
      .single()

    if (error) {
      console.error('REGISTER_DATABASE_ERROR', {
        email: trimmedEmail,
        operation: 'insert_user',
        code: error.code,
        message: error.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    return response.status(201).json({
      user: {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        created_at: data.created_at,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown registration error'
    console.error('REGISTER_DATABASE_ERROR', {
      email: String(email || '').trim(),
      operation: 'register_user',
      message,
    })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
