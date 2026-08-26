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
        <div className="gov-mark"><img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span aria-hidden="true">INDIA</span></div>
        <img className="brand-logo" src="/nirbhaya-sanchar-logo.svg" alt="Nirbhaya Sanchar" />
        <small>BRUTE FORCE</small>
      </header>
      {call ? <CallScreen {...call} onEnded={() => { if (call.callId) updateCall(call.callId, 'end').catch(() => {}); setCall(null) }} /> : profile ? <ContactsScreen profile={profile} onLogout={() => { clearSessionUser(); setProfile(null) }} onManualJoin={() => { clearSessionUser(); setProfile(null) }} onConnected={setCall} /> : <AuthScreen onAuthenticated={setProfile} onManualJoin={() => { clearSessionUser(); setProfile(null) }} />}
      <footer>PRIVATE VOICE CHANNEL <span aria-hidden="true">•</span> CONNECTIONS ARE ENCRYPTED IN TRANSIT</footer>
    </main>
  )
}

export default App
