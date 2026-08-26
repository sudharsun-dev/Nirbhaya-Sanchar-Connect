import { useState } from 'react'

export default function JoinScreen({ onJoin }) {
  const [name, setName] = useState('')
  const [room, setRoom] = useState('')
  const [error, setError] = useState('')
  function submit(event) {
    event.preventDefault()
    if (!name.trim() || !room.trim()) return setError('Enter your display name and a room ID to continue.')
    setError('')
    onJoin({ name: name.trim(), roomName: room.trim() })
  }
  return <section className="join-layout">
    <div className="intro"><div className="national-visual"><img className="gov-emblem" src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" /><div><strong>GOVERNMENT OF INDIA</strong><small>SAFE DIGITAL COMMUNICATION</small></div></div><p className="eyebrow">SECURE VOICE NETWORK</p><h1>Speak freely.<br /><em>Stay connected.</em></h1><p className="lede">A focused voice channel for people who need a clear, trusted line.</p><div className="signal-line"><span /> CHANNEL READY</div></div>
    <form className="join-panel" onSubmit={submit}>
      <div className="portrait-side"><img src="/image.png" alt="Prime Minister of India" /><span>GOVERNMENT OF INDIA<br />PUBLIC SERVICE</span></div>
      <div className="panel-heading"><span className="status-dot" /> <span>Start a call</span></div>
      <label>Display Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="How should others identify you?" autoComplete="name" /></label>
      <label>Room ID<input value={room} onChange={(event) => setRoom(event.target.value)} placeholder="Enter a shared room ID" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit">JOIN CALL <span aria-hidden="true">↗</span></button>
      <p className="panel-note">Only people with the same room ID can hear this call.</p>
    </form>
  </section>
}