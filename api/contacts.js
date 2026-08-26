import { getAuthenticatedUser } from './lib/auth.js'
import { getSupabaseAdmin } from './lib/supabase.js'

function normalizeContactUser(user) {
  if (!user) return null
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    created_at: user.created_at,
    online_status: user.online_status || 'online',
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' })

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

    if (request.method === 'GET') {
      const { data: edges, error } = await supabase
        .from('contacts')
        .select('id, user_id, contact_user_id, created_at')
        .or(`user_id.eq.${currentUserId},contact_user_id.eq.${currentUserId}`)

      if (error) {
        console.error('CONTACTS_DATABASE_ERROR', {
          operation: 'list_contacts',
          code: error.code,
          message: error.message,
        })
        return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
      }

      const relatedIds = (edges || []).map((edge) => edge.user_id === currentUserId ? edge.contact_user_id : edge.user_id)
      const uniqueIds = [...new Set(relatedIds)]
      const users = uniqueIds.length
        ? await supabase
            .from('users')
            .select('id, name, phone, email, created_at, online_status')
            .in('id', uniqueIds)
        : { data: [] }

      if (users.error) {
        console.error('CONTACTS_DATABASE_ERROR', {
          operation: 'fetch_contact_users',
          code: users.error.code,
          message: users.error.message,
        })
        return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
      }

      return response.status(200).json({ contacts: (users.data || []).map(normalizeContactUser).filter(Boolean) })
    }

    const { userId, contactId } = request.body || {}
    const resolvedUserId = userId || currentUserId
    if (!resolvedUserId || !contactId) return response.status(400).json({ error: 'userId and contactId are required.' })
    if (resolvedUserId !== currentUserId) return response.status(403).json({ error: 'You can only manage your own contacts.' })
    if (resolvedUserId === contactId) return response.status(400).json({ error: 'A user cannot add themselves as a contact.' })

    const { data: existingEdge, error: existingError } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', resolvedUserId)
      .eq('contact_user_id', contactId)
      .maybeSingle()

    if (existingError) {
      console.error('CONTACTS_DATABASE_ERROR', {
        operation: 'check_existing_contact',
        code: existingError.code,
        message: existingError.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    if (existingEdge) {
      return response.status(200).json({ message: 'Contact already exists.' })
    }

    const { data: contact, error: contactLookupError } = await supabase
      .from('users')
      .select('id, name, phone, email, created_at, online_status')
      .eq('id', contactId)
      .maybeSingle()

    if (contactLookupError || !contact) {
      return response.status(404).json({ error: 'User or contact not found.' })
    }

    const { error: insertError } = await supabase
      .from('contacts')
      .insert({
        user_id: resolvedUserId,
        contact_user_id: contactId,
        created_at: Date.now(),
      })

    if (insertError) {
      console.error('CONTACTS_DATABASE_ERROR', {
        operation: 'create_contact',
        code: insertError.code,
        message: insertError.message,
      })
      return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
    }

    return response.status(201).json({ contact: normalizeContactUser(contact) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown contact error'
    console.error('CONTACTS_DATABASE_ERROR', {
      operation: 'contact_flow',
      message,
    })
    return response.status(500).json({ error: 'Authentication service temporarily unavailable.' })
  }
}
