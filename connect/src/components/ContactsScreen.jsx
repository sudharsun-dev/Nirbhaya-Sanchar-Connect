import { useCallback, useEffect, useState } from 'react'
import { createCall, getCalls, updateCall } from '../services/signaling'

function displayTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem('nirbhaya-history') || '[]')
  } catch {
    return []
  }
}

export default function ContactsScreen({ profile, onManualJoin, onLogout, onConnected }) {
  const [calls, setCalls] = useState([])
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState(() => readHistory())
  const [busy, setBusy] = useState(false)
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const incoming = calls.find((call) => call.receiver.id === profile.id && ['RINGING', 'CALLING'].includes(call.status))
  const outgoing = calls.find((call) => call.caller.id === profile.id && ['RINGING', 'CALLING'].includes(call.status))

  function addHistory(entry) {
    if (history.some((item) => item.id === entry.id)) return
    const next = [entry, ...history].slice(0, 10)
    setHistory(next)
    localStorage.setItem('nirbhaya-history', JSON.stringify(next))
  }

  const loadContacts = useCallback(async () => {
    try {
      const response = await fetch(`/api/contacts?userId=${encodeURIComponent(profile.id)}`)
      const result = await response.json().catch(() => ({ contacts: [] }))
      if (!response.ok) throw new Error(result.error || 'Unable to load contacts.')
      setContacts(result.contacts || [])
    } catch (error) {
      setNotice(error.message)
    }
  }, [profile.id])

  async function searchUsers() {
    if (!search.trim()) return setSearchResults([])
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(search.trim())}`)
      const result = await response.json().catch(() => ({ users: [] }))
      if (!response.ok) throw new Error(result.error || 'Search failed.')
      setSearchResults((result.users || []).filter((user) => user.id !== profile.id))
    } catch (error) {
      setNotice(error.message)
    }
  }

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const result = await getCalls(profile.id)
        if (active) {
          const now = Date.now()
          setCalls(result.calls)
          const changed = result.calls.find((call) => call.caller.id === profile.id && ['REJECTED', 'CANCELLED', 'ENDED'].includes(call.status))
          if (changed && changed.updatedAt > now - 2500) setNotice(changed.status === 'REJECTED' ? `${changed.receiver.name} rejected the call.` : 'Call ended.')
          const accepted = result.calls.find((call) => call.caller.id === profile.id && call.status === 'ACCEPTED')
          if (accepted) onConnected({ name: profile.name, roomName: accepted.roomName, callId: accepted.id })
        }
      } catch (error) { if (active) setNotice(error.message) }
    }
    poll()
    const timer = setInterval(poll, 1000)
    return () => { active = false; clearInterval(timer) }
  }, [profile.id, profile.name, onConnected])

  async function callContact(contact) {
    const online = contact.online_status !== 'offline'
    if (!online) return setNotice('User is currently unavailable.')
    if (calls.some((call) => [call.caller.id, call.receiver.id].includes(profile.id) && ['RINGING', 'CALLING', 'ACCEPTED'].includes(call.status))) return setNotice('You are already in a call.')
    setBusy(true)
    try {
      const result = await createCall(profile, { id: contact.id, name: contact.name }, `nirbhaya-call-${crypto.randomUUID()}`)
      addHistory({ id: result.call.id, name: contact.name, direction: 'outgoing', time: Date.now() })
      setNotice(`Calling ${contact.name}...`)
    } catch (error) { setNotice(error.message) } finally { setBusy(false) }
  }

  async function addContact(contact) {
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id, contactId: contact.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to add contact.')
      setNotice(`${contact.name} was added to your contacts.`)
      await loadContacts()
    } catch (error) { setNotice(error.message) }
  }

  async function act(callId, action) {
    try {
      const result = await updateCall(callId, action, profile.id)
      setCalls((current) => current.map((call) => call.id === callId ? result.call : call))
      if (action === 'accept') { addHistory({ id: result.call.id, name: result.call.caller.name, direction: 'incoming', time: Date.now() }); onConnected({ name: profile.name, roomName: result.call.roomName, callId }) }
      if (action === 'reject') setNotice('Call rejected.')
    } catch (error) { setNotice(error.message) }
  }

  const list = contacts.length ? contacts : []

  return <section className="contacts-layout">
    <div className="contacts-main"><div className="contacts-heading"><div><p className="eyebrow">AVAILABLE CHANNELS</p><h1>Contacts</h1></div><div className="profile-chip"><span>{profile.name.slice(0, 1).toUpperCase()}</span>{profile.name}</div></div>
      <div className="search-row" style={{ display: 'flex', gap: '12px', marginBottom: '22px' }}>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by ID, name, or phone" style={{ width: '100%', padding: '12px 14px', background: '#12201f', border: '1px solid #2d3937', color: '#e8ece8' }} />
        <button type="button" onClick={searchUsers} className="primary-button" style={{ width: 'auto', marginTop: 0, padding: '12px 18px' }}>SEARCH</button>
      </div>
      {notice && <div className="call-notice" role="status">{notice}</div>}
      {searchResults.length > 0 && <div className="contacts-list" style={{ marginBottom: '18px' }}><p className="section-label">SEARCH RESULTS <span>{searchResults.length}</span></p>{searchResults.map((user) => <div className="contact-row" key={user.id}><span className={`presence ${user.online_status !== 'offline' ? 'online' : ''}`} /><div><strong>{user.name}</strong><small>ID: {user.id} • {user.online_status !== 'offline' ? 'Online' : 'Offline'}</small></div><div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}><button type="button" onClick={() => addContact(user)}>ADD</button><button type="button" onClick={() => callContact(user)}>CALL</button></div></div>)}</div>}
      {incoming && <div className="incoming-call"><p className="eyebrow">INCOMING CALL</p><h2>{incoming.caller.name}</h2><p>{incoming.caller.name} is calling you</p><div><button className="reject-button" onClick={() => act(incoming.id, 'reject')}>REJECT</button><button className="accept-button" onClick={() => act(incoming.id, 'accept')}>ACCEPT</button></div></div>}
      {outgoing && <div className="outgoing-call"><p className="eyebrow">OUTGOING CALL</p><h2>Calling {outgoing.receiver.name}...</h2><p>Ringing...</p><button className="cancel-button" onClick={() => act(outgoing.id, 'cancel')}>CANCEL CALL</button></div>}
      <div className="contacts-list"><p className="section-label">CONTACTS <span>{list.length}</span></p>{list.length ? list.map((contact) => <div className="contact-row" key={contact.id}><span className={`presence ${contact.online_status !== 'offline' ? 'online' : ''}`} /><div><strong>{contact.name}</strong><small>{contact.online_status !== 'offline' ? 'Available' : 'Offline'}</small></div><button disabled={busy || contact.online_status === 'offline' || Boolean(incoming || outgoing)} onClick={() => callContact(contact)}>CALL <span aria-hidden="true">↗</span></button></div>) : <p className="empty-history">No contacts yet. Search a user and add them.</p>}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '18px' }}>
        <button className="manual-link" onClick={onManualJoin}>JOIN ROOM MANUALLY</button>
        <button className="manual-link" type="button" onClick={onLogout}>LOGOUT</button>
      </div>
    </div>
    <aside className="history-panel"><p className="eyebrow">RECENT ACTIVITY</p><h2>Call history</h2>{history.length ? history.map((entry) => <div className="history-item" key={entry.id}><strong>{entry.direction === 'outgoing' ? '↗' : '↙'} {entry.name}</strong><small>{displayTime(entry.time)} · {entry.direction}</small></div>) : <p className="empty-history">Your recent calls will appear here.</p>}</aside>
  </section>
}
