import { useEffect, useState } from 'react'
import { createCall, getCalls, updateCall } from '../services/signaling'
import { authenticatedRequest } from '../services/auth'

function displayTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase()
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
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [filter, setFilter] = useState('All')

  const incoming = calls.find((call) => call.receiver.id === profile.id && ['ringing', 'calling'].includes(normalizeStatus(call.status)))
  const outgoing = calls.find((call) => call.caller.id === profile.id && ['ringing', 'calling'].includes(normalizeStatus(call.status)))

  function addHistory(entry) {
    if (history.some((item) => item.id === entry.id)) return
    const next = [entry, ...history].slice(0, 10)
    setHistory(next)
    localStorage.setItem('nirbhaya-history', JSON.stringify(next))
  }

  async function searchUsers() {
    if (!search.trim()) return setSearchResults([])
    try {
      const response = await authenticatedRequest(`/api/users/search?q=${encodeURIComponent(search.trim())}`)
      const result = await response.json().catch(() => ({ users: [] }))
      if (!response.ok) throw new Error(result.error || 'Search failed.')
      setSearchResults((result.users || []).filter((user) => user.id !== profile.id))
    } catch (error) {
      setNotice(error.message)
    }
  }

  useEffect(() => {
    let active = true
    let polling = false
    const controller = new AbortController()
    async function poll() {
      if (polling) return
      polling = true
      try {
        const result = await getCalls({ signal: controller.signal })
        if (active) {
          const now = Date.now()
          setCalls(result.calls)
          const changed = result.calls.find((call) => call.caller.id === profile.id && ['rejected', 'cancelled', 'ended'].includes(normalizeStatus(call.status)))
          if (changed && changed.updatedAt > now - 2500) setNotice(normalizeStatus(changed.status) === 'rejected' ? `${changed.receiver.name} rejected the call.` : 'Call ended.')
          const accepted = result.calls.find((call) => call.caller.id === profile.id && normalizeStatus(call.status) === 'accepted')
          if (accepted) onConnected({ name: profile.name, roomName: accepted.roomName, callId: accepted.id })
        }
      } catch (error) {
        if (active && error.name !== 'AbortError') setNotice(error.message)
      } finally {
        polling = false
      }
    }
    poll()
    const timer = setInterval(poll, 2000)
    return () => { active = false; controller.abort(); clearInterval(timer) }
  }, [profile.id, profile.name, onConnected])

  async function callContact(contact) {
    const online = contact.online_status !== 'offline'
    if (!online) return setNotice('User is currently unavailable.')
    if (calls.some((call) => [call.caller.id, call.receiver.id].includes(profile.id) && ['ringing', 'calling', 'accepted'].includes(normalizeStatus(call.status)))) return setNotice('You are already in a call.')
    try {
      const result = await createCall(contact.id)
      addHistory({ id: result.call.id, contactId: contact.id, name: contact.name, direction: 'outgoing', time: Date.now() })
      setNotice(`Calling ${contact.name}...`)
    } catch (error) { setNotice(error.message) }
  }

  async function act(callId, action) {
    try {
      const result = await updateCall(callId, action)
      setCalls((current) => current.map((call) => call.id === callId ? result.call : call))
      if (action === 'accept') { addHistory({ id: result.call.id, contactId: result.call.caller.id, name: result.call.caller.name, direction: 'incoming', time: Date.now() }); onConnected({ name: profile.name, roomName: result.call.roomName, callId: result.call.id }) }
      if (action === 'reject') setNotice('Call rejected.')
    } catch (error) { setNotice(error.message) }
  }

  return <section className="contacts-layout">
    <div className="contacts-main"><div className="security-badge"><span aria-hidden="true">盾</span> Secure communication</div><div className="contacts-heading"><div><p className="eyebrow">GOOD MORNING,</p><h1>{profile.name}</h1><p className="subheading">Your private communication space</p></div><div className="profile-chip"><span>{profile.name.slice(0, 1).toUpperCase()}</span></div></div>
      <div className="search-row"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && searchUsers()} placeholder="Search contacts or messages" /><button type="button" onClick={searchUsers} aria-label="Search users">SEARCH</button></div>
      <div className="filter-row" aria-label="Conversation filters">{['All', 'Messages', 'Calls', 'Contacts'].map((item) => <button className={`filter-chip ${filter === item ? 'active' : ''}`} type="button" key={item} onClick={() => setFilter(item)}>{item}</button>)}</div>
      {notice && <div className="call-notice" role="status">{notice}</div>}
      {searchResults.length > 0 && <div className="contacts-list search-results"><p className="section-label">SEARCH RESULTS <span>{searchResults.length}</span></p>{searchResults.map((user) => <div className="contact-row" key={user.id}><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div className="contact-copy"><strong>{user.name}</strong><small><i className={`presence ${user.online_status !== 'offline' ? 'online' : ''}`} />{user.online_status !== 'offline' ? 'Online' : 'Offline'}</small></div><button type="button" onClick={() => callContact(user)} aria-label={`Call ${user.name}`}>☎</button></div>)}</div>}
      {incoming && <div className="incoming-call"><p className="eyebrow">INCOMING SECURE CALL</p><div className="large-avatar">{incoming.caller.name.slice(0, 1).toUpperCase()}</div><h2>{incoming.caller.name}</h2><p><i className="presence online" /> Online · Voice call</p><div><button className="reject-button" onClick={() => act(incoming.id, 'reject')}>DECLINE</button><button className="accept-button" onClick={() => act(incoming.id, 'accept')}>ANSWER</button></div></div>}
      {outgoing && <div className="outgoing-call"><div className="avatar">{outgoing.receiver.name.slice(0, 1).toUpperCase()}</div><div><p className="eyebrow">CALLING</p><h2>{outgoing.receiver.name}</h2><p><i className="presence online" /> Ringing...</p></div><button className="cancel-button" onClick={() => act(outgoing.id, 'cancel')} aria-label="Cancel call">×</button></div>}
      <div className="conversation-section"><p className="section-label">RECENT CHATS <span>{history.length ? 'View all' : ''}</span></p>{history.length ? history.map((entry) => <div className="conversation-row" key={entry.id}><div className="avatar">{entry.name.slice(0, 1).toUpperCase()}</div><div className="contact-copy"><strong>{entry.name}</strong><small><i className="presence online" /> {entry.direction === 'outgoing' ? 'Voice call' : 'Incoming voice call'}</small></div><time>{displayTime(entry.time)}</time>{entry.contactId && <button type="button" onClick={() => callContact({ id: entry.contactId, name: entry.name, online_status: 'online' })} aria-label={`Call ${entry.name}`}>☎</button>}</div>) : <p className="empty-history">No conversations yet<br />Search for a contact to start securely.</p>}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '18px' }}>
        <button className="manual-link" onClick={onManualJoin}>JOIN ROOM MANUALLY</button>
        <button className="manual-link" type="button" onClick={onLogout}>LOGOUT</button>
      </div>
      <button className="compose-fab" type="button" onClick={() => document.querySelector('.search-row input')?.focus()} aria-label="Start a new conversation">+</button>
    </div>
    <aside className="history-panel"><p className="eyebrow">PRIVATE CHANNEL</p><h2>Ready when you are.</h2><p className="empty-history">Calls are encrypted in transit.</p></aside>
  </section>
}
