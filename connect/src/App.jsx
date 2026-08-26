import { useState } from 'react'
import JoinScreen from './components/JoinScreen'
import CallScreen from './components/CallScreen'
import './App.css'

function App() {
  const [call, setCall] = useState(null)

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <div className="gov-mark"><img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Government of India emblem" onError={(event) => { event.currentTarget.style.display = 'none' }} /><span aria-hidden="true">INDIA</span></div>
        <img className="brand-logo" src="/nirbhaya-sanchar-logo.svg" alt="Nirbhaya Sanchar" />
        <small>BRUTE FORCE</small>
      </header>
      {call ? <CallScreen {...call} onEnded={() => setCall(null)} /> : <JoinScreen onJoin={setCall} />}
      <footer>PRIVATE VOICE CHANNEL <span aria-hidden="true">•</span> CONNECTIONS ARE ENCRYPTED IN TRANSIT</footer>
    </main>
  )
}

export default App
