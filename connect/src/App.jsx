import { useEffect, useState } from 'react'
import AuthScreen from './components/AuthScreen'
import CallScreen from './components/CallScreen'
import ContactsScreen from './components/ContactsScreen'
import { clearSessionUser, getAuthToken } from './services/auth'
import { updateCall } from './services/signaling'
import './App.css'

const PROFILE_KEY = 'nirbhaya-user-profile'

function readStoredProfile() {
  try {
    if (!getAuthToken()) return null
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null
    return { id: parsed.id || parsed.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user', name: parsed.name.trim(), email: parsed.email || '', phone: parsed.phone || '', online_status: parsed.online_status || 'online', last_seen: parsed.last_seen || 0 }
  } catch {
    return null
  }
}

function App() {
  const [call, setCall] = useState(null)
  const [profile, setProfile] = useState(() => readStoredProfile())

  useEffect(() => {
    if (profile) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
    } else {
      localStorage.removeItem(PROFILE_KEY)
    }
  }, [profile])

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <img className="brand-app-logo" src="/image.png" alt="Secure voice calling" />
        <div className="brand-heading"><strong>NIRBHAYA SANCHAR</strong><span>SECURE VOIP CALL SYSTEM</span><small>GOVERNMENT OF INDIA <i aria-hidden="true">•</i> SECURE VOICE COMMUNICATION</small></div>
        <div className="brand-status"><strong>VOIP CALL SYSTEM</strong><span><i aria-hidden="true" /> SECURE CHANNEL</span></div>
      </header>
      {call ? <CallScreen {...call} onEnded={() => { if (call.callId) updateCall(call.callId, 'end').catch(() => {}); setCall(null) }} /> : profile ? <ContactsScreen profile={profile} onLogout={() => { clearSessionUser(); setProfile(null) }} onManualJoin={() => { clearSessionUser(); setProfile(null) }} onConnected={setCall} /> : <AuthScreen onAuthenticated={setProfile} onManualJoin={() => { clearSessionUser(); setProfile(null) }} />}
        <nav className="mobile-nav" aria-label="Application navigation"><span className="active"><b aria-hidden="true">◉</b>Contacts</span><span><b aria-hidden="true">☎</b>Calls</span><span><b aria-hidden="true">✉</b>Messages</span><span><b aria-hidden="true">⚙</b>More</span></nav>
      <footer>PRIVATE VOICE CHANNEL <span aria-hidden="true">•</span> CONNECTIONS ARE ENCRYPTED IN TRANSIT</footer>
    </main>
  )
}

export default App
