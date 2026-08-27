import { useEffect, useState } from 'react'
import { connectToRoom, disconnectFromRoom } from '../services/livekit'
import CallControls from './CallControls'
import ParticipantList from './ParticipantList'
import ConnectionStatus from './ConnectionStatus'

export default function CallScreen({ name, roomName, onEnded }) {
  const [status, setStatus] = useState('connecting')
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [participants, setParticipants] = useState([{ identity: 'local', name }])
  const [error, setError] = useState('')
  const [connection, setConnection] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true
    let currentConnection
    connectToRoom(roomName, name, {
      onConnectionState: (state) => active && setStatus(state.toLowerCase() === 'connected' ? 'connected' : state.toLowerCase() === 'disconnected' ? 'disconnected' : 'connecting'),
      onParticipantChange: (_participant, livekitRoom) => active && setParticipants([{ identity: 'local', name }, ...[...livekitRoom.remoteParticipants.values()].map((item) => ({ identity: item.identity, name: item.name || item.identity }))]),
      onDisconnected: () => active && setStatus('disconnected'),
    }).then((result) => { if (active) { currentConnection = result; setConnection(result); setError(''); setStatus('connected') } else disconnectFromRoom(result.room) }).catch((reason) => { if (active) { setStatus('error'); setError(reason.message || 'Unable to join this call.') } })
    return () => { active = false; disconnectFromRoom(currentConnection?.room) }
  }, [name, roomName, retryCount])

  useEffect(() => { if (status !== 'connected') return undefined; const timer = setInterval(() => setSeconds((value) => value + 1), 1000); return () => clearInterval(timer) }, [status])
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  async function toggleMute() { const next = !muted; await connection?.room.localParticipant.setMicrophoneEnabled(!next); setMuted(next) }
  function endCall() { disconnectFromRoom(connection?.room); onEnded() }
  function retryConnection() { setError(''); setStatus('connecting'); setConnection(null); setSeconds(0); setMuted(false); setParticipants([{ identity: 'local', name }]); setRetryCount((count) => count + 1) }

  return <section className="call-layout"><div className="call-main"><div className="call-top"><div><p className="eyebrow">ACTIVE VOIP CALL</p><h1>Connected</h1></div><ConnectionStatus status={status} /></div><div className="call-clock"><span className="live-ring" />{duration}<small>CALL DURATION</small></div>{error ? <div className="call-error" role="alert"><strong>Call unavailable</strong><p>{error}</p><button onClick={retryConnection}>RETRY CONNECTION</button><button onClick={onEnded}>RETURN TO JOIN</button></div> : <div className="call-waiting">{status === 'connected' ? 'Your voice channel is open' : 'Establishing a secure connection'}</div>}<CallControls muted={muted} onMute={toggleMute} onEnd={endCall} /></div><aside><ParticipantList participants={participants} /><div className="room-detail"><span>CALL STATUS</span><strong>ACTIVE VOIP CALL</strong></div></aside></section>
}