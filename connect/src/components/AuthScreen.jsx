import { useState } from 'react'

export default function AuthScreen({ onAuthenticated, onManualJoin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const payload = mode === 'register'
        ? { name: form.name, phone: form.phone, email: form.email, password: form.password }
        : { email: form.email, password: form.password }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Authentication failed.')
      localStorage.setItem('nirbhaya-session', JSON.stringify(result.user))
      onAuthenticated(result.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="join-layout">
      <div className="intro">
        <div className="national-visual">
          <img className="gov-emblem" src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" />
          <div>
            <strong>GOVERNMENT OF INDIA</strong>
            <small>SAFE DIGITAL COMMUNICATION</small>
          </div>
        </div>
        <p className="eyebrow">SECURE VOICE NETWORK</p>
        <h1>Register.<br /><em>Access your calls.</em></h1>
        <p className="lede">Create an account to access trusted contacts, incoming call alerts, and secure voice calls.</p>
        <div className="signal-line"><span /> WEB-ONLY COMMUNICATION</div>
      </div>

      <form className="join-panel" onSubmit={submit}>
        <div className="portrait-side">
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" />
          <span>GOVERNMENT OF INDIA<br />PUBLIC SERVICE</span>
        </div>

        <div className="panel-heading" style={{ display: 'flex', gap: '12px' }}>
          <button type="button" className={mode === 'login' ? 'primary-button' : 'manual-link'} onClick={() => setMode('login')} style={{ width: 'auto', marginTop: 0, padding: '10px 16px' }}>
            LOGIN
          </button>
          <button type="button" className={mode === 'register' ? 'primary-button' : 'manual-link'} onClick={() => setMode('register')} style={{ width: 'auto', marginTop: 0, padding: '10px 16px' }}>
            REGISTER
          </button>
        </div>

        {mode === 'register' && (
          <>
            <label>Full name<input name="name" value={form.name} onChange={updateField} placeholder="Enter your full name" required /></label>
            <label>Phone number<input name="phone" value={form.phone} onChange={updateField} placeholder="e.g. +91 98765 43210" required /></label>
            <label>Email<input type="email" name="email" value={form.email} onChange={updateField} placeholder="name@example.com" required /></label>
          </>
        )}

        {mode === 'login' && (
          <label>Email<input type="email" name="email" value={form.email} onChange={updateField} placeholder="name@example.com" required /></label>
        )}

        <label>Password<input type="password" name="password" value={form.password} onChange={updateField} placeholder="Enter your password" required /></label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'PLEASE WAIT...' : mode === 'register' ? 'CREATE ACCOUNT' : 'LOGIN TO DASHBOARD'} <span aria-hidden="true">↗</span>
        </button>

        <button className="manual-link" type="button" onClick={onManualJoin}>ADVANCED / TEST MODE</button>
      </form>
    </section>
  )
}
