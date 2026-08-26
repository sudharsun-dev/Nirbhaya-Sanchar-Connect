import { useEffect, useState } from 'react'
import { createCall, getCalls, updateCall } from '../services/signaling'

const contacts = [
  { id: 'alice', name: 'Alice', online: true },
  { id: 'bob', name: 'Bob', online: true },
  { id: 'charlie', name: 'Charlie', online: false },
]

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

export default function ContactsScreen({ profile, onManualJoin, onConnected }) {
  const [calls, setCalls] = useState([])
  const [notice, setNotice] = useState('')
  const [history, setHistory] = useState(() => readHistory())
  const [busy, setBusy] = useState(false)
  const incoming = calls.find((call) => call.receiver.id === profile.id && ['RINGING', 'CALLING'].includes(call.status))
  const outgoing = calls.find((call) => call.caller.id === profile.id && ['RINGING', 'CALLING'].includes(call.status))

  function addHistory(entry) {
    if (history.some((item) => item.id === entry.id)) return
    const next = [entry, ...history].slice(0, 10)
    setHistory(next)
    localStorage.setItem('nirbhaya-history', JSON.stringify(next))
  }

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
    if (!contact.online) return setNotice('User is currently unavailable.')
    if (calls.some((call) => [call.caller.id, call.receiver.id].includes(profile.id) && ['RINGING', 'CALLING', 'ACCEPTED'].includes(call.status))) return setNotice('You are already in a call.')
    setBusy(true)
    try {
      const result = await createCall(profile, contact, `nirbhaya-call-${crypto.randomUUID()}`)
      addHistory({ id: result.call.id, name: contact.name, direction: 'outgoing', time: Date.now() })
      setNotice(`Calling ${contact.name}...`)
    } catch (error) { setNotice(error.message) } finally { setBusy(false) }
  }

  async function act(callId, action) {
    try {
      const result = await updateCall(callId, action, profile.id)
      setCalls((current) => current.map((call) => call.id === callId ? result.call : call))
      if (action === 'accept') { addHistory({ id: result.call.id, name: result.call.caller.name, direction: 'incoming', time: Date.now() }); onConnected({ name: profile.name, roomName: result.call.roomName, callId }) }
      if (action === 'reject') setNotice('Call rejected.')
    } catch (error) { setNotice(error.message) }
  }

  return <section className="contacts-layout">
    <div className="contacts-main"><div className="contacts-heading"><div><p className="eyebrow">AVAILABLE CHANNELS</p><h1>Contacts</h1></div><div className="profile-chip"><span>{profile.name.slice(0, 1).toUpperCase()}</span>{profile.name}</div></div>
      {notice && <div className="call-notice" role="status">{notice}</div>}
      {incoming && <div className="incoming-call"><p className="eyebrow">INCOMING CALL</p><h2>{incoming.caller.name}</h2><p>{incoming.caller.name} is calling you</p><div><button className="reject-button" onClick={() => act(incoming.id, 'reject')}>REJECT</button><button className="accept-button" onClick={() => act(incoming.id, 'accept')}>ACCEPT</button></div></div>}
      {outgoing && <div className="outgoing-call"><p className="eyebrow">OUTGOING CALL</p><h2>Calling {outgoing.receiver.name}...</h2><p>Ringing...</p><button className="cancel-button" onClick={() => act(outgoing.id, 'cancel')}>CANCEL CALL</button></div>}
      <div className="contacts-list"><p className="section-label">CONTACTS <span>{contacts.length}</span></p>{contacts.map((contact) => <div className="contact-row" key={contact.id}><span className={`presence ${contact.online ? 'online' : ''}`} /><div><strong>{contact.name}</strong><small>{contact.online ? 'Available' : 'Offline'}</small></div><button disabled={busy || !contact.online || Boolean(incoming || outgoing)} onClick={() => callContact(contact)}>CALL <span aria-hidden="true">↗</span></button></div>)}</div><button className="manual-link" onClick={onManualJoin}>JOIN ROOM MANUALLY</button></div>
    <aside className="history-panel"><p className="eyebrow">RECENT ACTIVITY</p><h2>Call history</h2>{history.length ? history.map((entry) => <div className="history-item" key={entry.id}><strong>{entry.direction === 'outgoing' ? '↗' : '↙'} {entry.name}</strong><small>{displayTime(entry.time)} · {entry.direction}</small></div>) : <p className="empty-history">Your recent calls will appear here.</p>}</aside>
  </section>
}
