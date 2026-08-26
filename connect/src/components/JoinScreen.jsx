import { useState } from 'react'

const PROFILE_KEY = 'nirbhaya-user-profile'

function createProfile(name) {
  const trimmed = name.trim()
  return {
    id: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user',
    name: trimmed,
  }
}

export default function JoinScreen({ onJoin, onContacts }) {
  const [name, setName] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
      return stored?.name || ''
    } catch {
      return ''
    }
  })
  const [room, setRoom] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    if (!name.trim() || !room.trim()) return setError('Enter your display name and a room ID to continue.')
    setError('')
    onJoin({ name: name.trim(), roomName: room.trim() })
  }

  function openContacts() {
    if (!name.trim()) return setError('Enter your display name to continue.')
    setError('')
    onContacts(createProfile(name))
  }

  return <section className="join-layout">
    <div className="intro"><div className="national-visual"><img className="gov-emblem" src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" /><div><strong>GOVERNMENT OF INDIA</strong><small>SAFE DIGITAL COMMUNICATION</small></div></div><p className="eyebrow">SECURE VOICE NETWORK</p><h1>Speak freely.<br /><em>Stay connected.</em></h1><p className="lede">A focused voice channel for people who need a clear, trusted line.</p><div className="signal-line"><span /> CHANNEL READY</div></div>
    <form className="join-panel" onSubmit={submit}>
      <div className="portrait-side"><img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" /><span>GOVERNMENT OF INDIA<br />PUBLIC SERVICE</span></div>
      <div className="panel-heading"><span className="status-dot" /> <span>Start a call</span></div>
      <label>Display Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="How should others identify you?" autoComplete="name" /></label>
      <label>Room ID<input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Enter a shared room ID" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="button" onClick={openContacts}>OPEN CONTACTS <span aria-hidden="true">↗</span></button>
      <button className="manual-link" type="submit">JOIN ROOM MANUALLY</button>
      <p className="panel-note">Only people with the same room ID can hear this call.</p>
    </form>
  </section>
}