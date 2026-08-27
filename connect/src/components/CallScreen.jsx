import { useEffect, useState, useRef } from 'react'
import { connectToRoom, disconnectFromRoom } from '../services/livekit'
import { connectEngineStream, notifyEngineStartCall, startAudioStreamToEngine } from '../services/engineClient'
import CallControls from './CallControls'
import ParticipantList from './ParticipantList'
import ConnectionStatus from './ConnectionStatus'

export default function CallScreen({ name, roomName, callId, onEnded }) {
  const [status, setStatus] = useState('connecting')
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [participants, setParticipants] = useState([{ identity: 'local', name }])
  const [error, setError] = useState('')
  const [connection, setConnection] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  // System 2 Security Intelligence State
  const [securityState, setSecurityState] = useState({
    status: 'INITIALIZING', // INITIALIZING, ACTIVE, OFFLINE, DEGRADED
    riskScore: null,
    riskLevel: 'LOW',
    overallConfidence: null,
    syntheticProbability: null,
    speakerSimilarity: null,
    reasons: [],
    recommendedAction: 'CONTINUE',
    windowsAnalyzed: 0,
    lastLatencyMs: null,
    audioQuality: null,
    alertMessage: null,
  })
  const [showSecurityDrawer, setShowSecurityDrawer] = useState(false)

  const effectiveCallId = useRef(callId || `call_${roomName || Date.now()}`).current

  useEffect(() => {
    let active = true
    let currentConnection = null
    let stopAudioTap = () => {}
    let closeEngineSocket = () => {}

    async function initCall() {
      try {
        // 1. Notify System 2 of call start
        notifyEngineStartCall({
          call_id: effectiveCallId,
          caller_id: name,
          receiver_id: roomName,
          channel: 'VOIP',
        }).catch((err) => console.warn('[SYSTEM 1] Engine start call notification failed', err))

        // 2. Connect to System 2 WebSocket for live security events
        closeEngineSocket = connectEngineStream(effectiveCallId, (event) => {
          if (!active) return

          if (event.event === 'ANALYSIS_STARTED') {
            setSecurityState((prev) => ({ ...prev, status: 'ACTIVE' }))
          } else if (event.event === 'AUDIO_PROCESSED') {
            setSecurityState((prev) => ({
              ...prev,
              windowsAnalyzed: event.window_index || prev.windowsAnalyzed + 1,
              audioQuality: event.audio_quality_score,
            }))
          } else if (event.event === 'RISK_UPDATED') {
            setSecurityState((prev) => ({
              ...prev,
              status: 'ACTIVE',
              riskScore: event.risk_score,
              riskLevel: event.risk_level || 'LOW',
              overallConfidence: event.overall_confidence,
              syntheticProbability: event.synthetic_probability,
              speakerSimilarity: event.speaker_similarity,
              reasons: event.reasons || [],
              recommendedAction: event.recommended_action || 'CONTINUE',
            }))
          } else if (event.event === 'ALERT_CREATED') {
            setSecurityState((prev) => ({
              ...prev,
              alertMessage: event.security_message,
              recommendedAction: event.recommended_action || prev.recommendedAction,
            }))
          } else if (event.event === 'ERROR') {
            setSecurityState((prev) => ({
              ...prev,
              status: 'DEGRADED',
            }))
          }
        })

        // 3. Connect to LiveKit Room
        const result = await connectToRoom(roomName, name, {
          onConnectionState: (state) => {
            if (!active) return
            setStatus(
              state.toLowerCase() === 'connected'
                ? 'connected'
                : state.toLowerCase() === 'disconnected'
                ? 'disconnected'
                : 'connecting'
            )
          },
          onParticipantChange: (_participant, livekitRoom) => {
            if (!active) return
            setParticipants([
              { identity: 'local', name },
              ...[...livekitRoom.remoteParticipants.values()].map((item) => ({
                identity: item.identity,
                name: item.name || item.identity,
              })),
            ])
          },
          onTrackSubscribed: (remoteTrack) => {
            console.info('[SYSTEM 1] Subscribed to remote audio track for LiveKit call')
          },
          onDisconnected: () => {
            if (!active) return
            setStatus('disconnected')
          },
        })

        if (active) {
          currentConnection = result
          setConnection(result)
          setError('')
          setStatus('connected')

          // 4. Start Real Audio Tap to System 2 Engine
          if (result.microphone?.mediaStreamTrack) {
            stopAudioTap = startAudioStreamToEngine(effectiveCallId, result.microphone.mediaStreamTrack, {
              onChunkSent: ({ windowIndex, durationMs }) => {
                console.info(`[SYSTEM 1] Audio chunk #${windowIndex} (${durationMs}ms) sent to System 2`)
              },
            })
          }
        } else {
          disconnectFromRoom(result.room)
        }
      } catch (reason) {
        if (active) {
          setStatus('error')
          setError(reason.message || 'Unable to join this call.')
          setSecurityState((prev) => ({ ...prev, status: 'OFFLINE' }))
        }
      }
    }

    initCall()

    return () => {
      active = false
      stopAudioTap()
      closeEngineSocket()
      disconnectFromRoom(currentConnection?.room)
    }
  }, [name, roomName, retryCount, effectiveCallId])

  useEffect(() => {
    if (status !== 'connected') return undefined
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [status])

  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

  async function toggleMute() {
    const next = !muted
    await connection?.room.localParticipant.setMicrophoneEnabled(!next)
    setMuted(next)
  }

  function endCall() {
    disconnectFromRoom(connection?.room)
    onEnded()
  }

  function retryConnection() {
    setError('')
    setStatus('connecting')
    setConnection(null)
    setSeconds(0)
    setMuted(false)
    setParticipants([{ identity: 'local', name }])
    setRetryCount((count) => count + 1)
  }

  // Determine Security Badge Colors
  const isHighRisk = securityState.riskLevel === 'HIGH' || (securityState.riskScore !== null && securityState.riskScore >= 70)
  const isMediumRisk = securityState.riskLevel === 'MEDIUM' || (securityState.riskScore !== null && securityState.riskScore >= 30 && securityState.riskScore < 70)

  return (
    <section className="call-layout">
      <div className="call-main">
        {/* Top Bar */}
        <div className="call-top">
          <button className="back-button" onClick={onEnded} aria-label="Return to conversations">‹</button>
          <div>
            <p className="eyebrow">SECURE VOIP CALL</p>
            <h1>{name}</h1>
          </div>
          <ConnectionStatus status={status} />
        </div>

        {/* Live Security HUD Indicator Bar */}
        <div
          className={`security-hud-pill ${isHighRisk ? 'high-risk' : isMediumRisk ? 'medium-risk' : securityState.status === 'OFFLINE' ? 'offline' : 'low-risk'}`}
          onClick={() => setShowSecurityDrawer(!showSecurityDrawer)}
          role="button"
          tabIndex={0}
        >
          <div className="hud-icon">
            {isHighRisk ? '🚨' : isMediumRisk ? '⚠️' : securityState.status === 'OFFLINE' ? '⚪' : '🛡️'}
          </div>
          <div className="hud-info">
            <strong>
              {securityState.riskScore !== null
                ? `AI Security: Risk ${securityState.riskScore.toFixed(0)}/100 (${securityState.riskLevel})`
                : securityState.status === 'ACTIVE'
                ? 'AI Voice Monitoring Active'
                : securityState.status === 'OFFLINE'
                ? 'AI Security: Offline'
                : 'AI Voice Shield Initializing...'}
            </strong>
            <small>
              {securityState.syntheticProbability !== null
                ? `Synthetic Voice Prob: ${securityState.syntheticProbability.toFixed(1)}% · Windows: ${securityState.windowsAnalyzed}`
                : securityState.windowsAnalyzed > 0
                ? `Analyzing real audio (${securityState.windowsAnalyzed} windows)`
                : 'Streaming real microphone audio'}
            </small>
          </div>
          <span className="hud-toggle">{showSecurityDrawer ? '▲' : '▼'}</span>
        </div>

        {/* Expandable Security Risk Telemetry Card */}
        {showSecurityDrawer && (
          <div className="security-details-drawer">
            <div className="drawer-header">
              <h3>NIRBHAYA SANCHAR SECURITY INTELLIGENCE</h3>
              <span className={`risk-tag ${securityState.riskLevel.toLowerCase()}`}>{securityState.riskLevel} RISK</span>
            </div>

            <div className="drawer-grid">
              <div className="metric-box">
                <span className="label">OVERALL RISK</span>
                <span className="value">{securityState.riskScore !== null ? `${securityState.riskScore.toFixed(1)}/100` : '—'}</span>
              </div>
              <div className="metric-box">
                <span className="label">SYNTHETIC SPEECH</span>
                <span className="value">{securityState.syntheticProbability !== null ? `${securityState.syntheticProbability.toFixed(1)}%` : 'Processing'}</span>
              </div>
              <div className="metric-box">
                <span className="label">SPEAKER MATCH</span>
                <span className="value">{securityState.speakerSimilarity !== null ? `${securityState.speakerSimilarity.toFixed(1)}%` : 'No Enrolled Profile'}</span>
              </div>
              <div className="metric-box">
                <span className="label">AI CONFIDENCE</span>
                <span className="value">{securityState.overallConfidence !== null ? `${(securityState.overallConfidence * 100).toFixed(0)}%` : '—'}</span>
              </div>
            </div>

            {securityState.reasons && securityState.reasons.length > 0 && (
              <div className="reasons-list">
                <p className="reasons-title">Detected Signals:</p>
                <ul>
                  {securityState.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="policy-recommendation">
              <strong>Policy Action: </strong>
              <span>{securityState.recommendedAction || 'ALLOW & MONITOR'}</span>
            </div>
          </div>
        )}

        {/* High Risk Security Alert Modal / Warning */}
        {isHighRisk && (
          <div className="high-risk-alert-banner" role="alert">
            <div className="alert-badge">SECURITY ALERT: POTENTIAL VOICE IMPERSONATION</div>
            <p>
              Elevated synthetic voice signals detected. Recommended action: <strong>HOLD & INDEPENDENTLY VERIFY</strong>.
            </p>
          </div>
        )}

        {/* Call Identity Center */}
        <div className="call-identity">
          <div className="large-avatar">{name.slice(0, 1).toUpperCase()}</div>
          <p>
            <i className="presence online" /> {status === 'connected' ? 'Connected' : 'Connecting'}
          </p>
          <div className="call-clock">
            {duration}
            <small>CALL DURATION</small>
          </div>
        </div>

        {error ? (
          <div className="call-error" role="alert">
            <strong>Call unavailable</strong>
            <p>{error}</p>
            <button onClick={retryConnection}>RETRY CONNECTION</button>
            <button onClick={onEnded}>RETURN TO JOIN</button>
          </div>
        ) : (
          <div className="call-waiting">
            {status === 'connected' ? 'Microphone connected · Real-time AI protection enabled' : 'Establishing a secure connection'}
          </div>
        )}

        {/* Controls */}
        <CallControls muted={muted} onMute={toggleMute} onEnd={endCall} />
      </div>
      <aside>
        <ParticipantList participants={participants} />
      </aside>
    </section>
  )
}