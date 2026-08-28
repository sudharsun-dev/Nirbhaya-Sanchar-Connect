import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { connectToRoom, disconnectFromRoom } from '../services/livekit'
import { connectEngineStream, notifyEngineStartCall, startAudioStreamToEngine, getQAState, setQAState } from '../services/engineClient'
import CallControls from './CallControls'
import ParticipantList from './ParticipantList'
import ConnectionStatus from './ConnectionStatus'

function formatScore(val, digits = 0) {
  if (val === null || val === undefined || isNaN(Number(val))) return null;
  return Number(val).toFixed(digits);
}

function formatPercent(val, digits = 1) {
  if (val === null || val === undefined || isNaN(Number(val))) return null;
  return Number(val).toFixed(digits);
}

export default function CallScreen({ name, roomName, callId, onEnded }) {
  const [status, setStatus] = useState('connecting')
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [participants, setParticipants] = useState([{ identity: 'local', name }])
  const [error, setError] = useState('')
  const [connection, setConnection] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  // Global QA Simulation Test State (Synchronized across all browsers)
  const [qaState, setQaState] = useState({ enabled: false, scenario: 'HIGH' })

  // System 2 Security Intelligence State
  const [securityState, setSecurityState] = useState({
    status: 'INITIALIZING', // INITIALIZING, ACTIVE, OFFLINE, DEGRADED
    riskScore: null,
    riskLevel: 'LOW',
    overallConfidence: null,
    syntheticProbability: null,
    aasistSynthetic: null,
    resembleSynthetic: null,
    resembleStatus: null,
    detectorAgreement: null,
    speakerSimilarity: null,
    reasons: [],
    recommendedAction: 'CONTINUE',
    windowsAnalyzed: 0,
    lastLatencyMs: null,
    audioQuality: null,
    detectorStatus: null,
    label: null,
    authenticityScore: null,
    alertMessage: null,
    simulated: false,
  })
  const [showSecurityDrawer, setShowSecurityDrawer] = useState(false)

  // Fetch initial global QA state on mount
  useEffect(() => {
    getQAState().then((state) => {
      if (state && state.enabled !== undefined) {
        setQaState(state)
      }
    })
  }, [])

  const effectiveCallId = useRef(callId || `call_${roomName || Date.now()}`).current

  useEffect(() => {
    let active = true
    let currentConnection = null
    let stopAudioTap = () => {}
    let closeEngineSocket = () => {}

    async function initCall() {
      try {
        console.info(`[VOICE-ANALYSIS] CALL_ID=${effectiveCallId}`);
        console.info(`[VOICE-ANALYSIS] STARTING_ANALYSIS call_id=${effectiveCallId}`);
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
            const synthProb = event.synthetic_probability;
            const authScore = event.authenticity_score != null ? event.authenticity_score : (synthProb != null ? Math.max(0, 100 - synthProb) : null);
            const conf = event.confidence || event.overall_confidence;
            const verdict = event.label || (synthProb != null ? (synthProb >= 70 ? 'SYNTHETIC' : synthProb <= 30 ? 'AUTHENTIC' : 'SUSPICIOUS') : 'UNCERTAIN');
            const risk = event.risk_score;

            console.info(`[WS-RECEIVE]\nevent=RISK_UPDATED\n`);
            console.info(`[UI-UPDATE]\nsynthetic_probability=${synthProb}\nauthenticity=${authScore}\nconfidence=${conf}\nverdict=${verdict}\nrisk_score=${risk}\n`);

            setSecurityState((prev) => ({
              ...prev,
              status: 'ACTIVE',
              riskScore: risk,
              riskLevel: event.risk_level || 'LOW',
              overallConfidence: conf,
              syntheticProbability: synthProb,
              authenticityScore: authScore,
              label: verdict,
              speakerSimilarity: event.speaker_similarity,
              reasons: event.reasons || [],
              recommendedAction: event.action || event.recommended_action || 'CONTINUE',
              simulated: Boolean(event.simulated),
            }))
          } else if (event.event === 'QA_MODE_UPDATED') {
            console.info(`[QA-SYNC] enabled=${event.enabled} scenario=${event.scenario}`);
            setQaState({ enabled: Boolean(event.enabled), scenario: event.scenario || 'HIGH' });
            if (event.enabled && event.simulated_data) {
              const sim = event.simulated_data;
              setSecurityState((prev) => ({
                ...prev,
                status: 'ACTIVE',
                riskScore: sim.risk_score,
                riskLevel: sim.risk_level,
                syntheticProbability: sim.synthetic_probability,
                authenticityScore: sim.authenticity_score,
                label: sim.label,
                reasons: sim.reasons || [],
                recommendedAction: sim.action || sim.recommended_action,
                simulated: true,
              }));
            } else if (!event.enabled) {
              setSecurityState((prev) => ({ ...prev, simulated: false }));
            }
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
                console.info(`[SYSTEM 1] Streamed audio window #${windowIndex} (${durationMs}ms) to System 2`);
              },
              onError: (tapErr) => {
                console.warn('[SYSTEM 1] Audio tap error:', tapErr);
              }
            });
          }
        }
      } catch (err) {
        if (!active) return
        setError(err.message || 'Failed to initialize secure call connection')
        setStatus('disconnected')
      }
    }

    initCall()

    return () => {
      active = false
      stopAudioTap()
      closeEngineSocket()
      if (currentConnection) {
        currentConnection.disconnect()
      }
    }
  }, [roomName, name, effectiveCallId])

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

  const handleToggleSecurityDrawer = useCallback(() => {
    console.info('[VOICE-ANALYSIS] BUTTON_CLICKED');
    console.info(`[VOICE-ANALYSIS] CALL_ID=${effectiveCallId}`);
    setShowSecurityDrawer((prev) => !prev);
  }, [effectiveCallId]);

  // Determine Security Badge Colors
  const riskVal = securityState.riskScore
  const isHighRisk = securityState.riskLevel === 'HIGH' || (riskVal !== null && riskVal >= 70)
  const isMediumRisk = securityState.riskLevel === 'MEDIUM' || (riskVal !== null && riskVal >= 30 && riskVal < 70)

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
          onClick={handleToggleSecurityDrawer}
          role="button"
          tabIndex={0}
        >
          <div className="hud-icon">
            {isHighRisk ? '🚨' : isMediumRisk ? '⚠️' : securityState.status === 'OFFLINE' ? '⚪' : '🛡️'}
          </div>
          <div className="hud-info">
            <strong>
              {formatScore(securityState.riskScore, 0) !== null
                ? `AI Security: Risk ${formatScore(securityState.riskScore, 0)}/100 (${securityState.riskLevel || 'LOW'})`
                : securityState.riskLevel === 'NO_VOICE'
                ? 'AI Security: NO VOICE DETECTED'
                : securityState.status === 'ACTIVE'
                ? 'Voice Authenticity Engine Active (Waiting for Voice)'
                : securityState.status === 'OFFLINE'
                ? 'DETECTOR UNAVAILABLE'
                : 'Pretrained Deepfake Detector Initializing...'}
            </strong>
            <small>
              {securityState.syntheticProbability !== null
                ? `WAV2VEC2: ${formatPercent(securityState.syntheticProbability, 1)}% · AUTHENTICITY: ${formatPercent(securityState.authenticityScore, 1)}% · ${securityState.detectorStatus || 'PRETRAINED MODEL ACTIVE'}`
                : (securityState.windowsAnalyzed || 0) > 0
                ? `Streaming real audio (${securityState.windowsAnalyzed} windows analyzed)`
                : 'Streaming real microphone audio to Wav2Vec2 Deepfake Detector'}
            </small>
          </div>
          <span className="hud-toggle">{showSecurityDrawer ? '▲' : '▼'}</span>
        </div>

        {/* Expandable Security Risk Telemetry Card */}
        {showSecurityDrawer && (
          <div className="security-details-drawer">
            <div className="drawer-header">
              <h3>
                VOICE AUTHENTICITY ENGINE — PRETRAINED DEEPFAKE DETECTOR
                {(qaState.enabled || securityState.simulated) && <span className="qa-simulated-pill">SIMULATED</span>}
              </h3>
              <span className={`risk-tag ${String(securityState.riskLevel || 'low').toLowerCase()}`}>{securityState.riskLevel || 'LOW'} RISK</span>
            </div>

            <div className="drawer-grid">
              <div className="metric-box">
                <span className="label">DETECTOR</span>
                <span className="value">Wav2Vec2 Deepfake Detector</span>
              </div>
              <div className="metric-box">
                <span className="label">STATUS</span>
                <span className="value">
                  {securityState.detectorStatus || (securityState.status === 'ACTIVE' ? 'PRETRAINED MODEL ACTIVE' : 'INITIALIZING')}
                  {(qaState.enabled || securityState.simulated) && ' (QA MODE)'}
                </span>
              </div>
              <div className="metric-box">
                <span className="label">SYNTHETIC PROBABILITY</span>
                <span className="value">{formatPercent(securityState.syntheticProbability, 1) !== null ? `${formatPercent(securityState.syntheticProbability, 1)}%` : 'Processing'}</span>
              </div>
              <div className="metric-box">
                <span className="label">AUTHENTICITY</span>
                <span className="value">{formatPercent(securityState.authenticityScore, 1) !== null ? `${formatPercent(securityState.authenticityScore, 1)}%` : '—'}</span>
              </div>
              <div className="metric-box">
                <span className="label">VERDICT</span>
                <span className="value">{securityState.label || (securityState.riskLevel === 'NO_VOICE' ? 'NO VOICE' : 'ANALYZING')}</span>
              </div>
              <div className="metric-box">
                <span className="label">CONFIDENCE</span>
                <span className="value">{securityState.overallConfidence !== null && !isNaN(Number(securityState.overallConfidence)) ? `${(Number(securityState.overallConfidence) * 100).toFixed(0)}%` : '—'}</span>
              </div>
              <div className="metric-box">
                <span className="label">SOURCE</span>
                <span className="value">{securityState.detectorSource || 'PRETRAINED MODEL'}</span>
              </div>
              <div className="metric-box">
                <span className="label">POLICY ACTION</span>
                <span className="value">{securityState.recommendedAction || 'CONTINUE'}</span>
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
              <span>{securityState.recommendedAction || 'CONTINUE'}</span>
            </div>
          </div>
        )}

        {/* High Risk Security Alert Modal / Warning */}
        {isHighRisk && (
          <div className="high-risk-alert-banner" role="alert">
            <div className="alert-badge">
              SECURITY ALERT: POTENTIAL VOICE IMPERSONATION
              {(qaState.enabled || securityState.simulated) && <span className="qa-simulated-pill">SIMULATED</span>}
            </div>
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

      {/* Global QA Test Control Bar (Synchronized with Backend & All Clients) */}
      <div className="global-qa-bottom-bar" title="Global QA Test Control (Synchronized across all browsers)">
        <span className="qa-label">QA</span>
        <button
          type="button"
          className={`qa-toggle-btn ${qaState.enabled ? 'active' : ''}`}
          onClick={async () => {
            const next = !qaState.enabled;
            setQaState((prev) => ({ ...prev, enabled: next }));
            await setQAState(next, qaState.scenario);
          }}
        >
          {qaState.enabled ? 'ON' : 'OFF'}
        </button>
        {qaState.enabled && (
          <div className="qa-scenario-group">
            {['LOW', 'MEDIUM', 'HIGH'].map((sc) => (
              <button
                key={sc}
                type="button"
                className={`qa-sc-btn ${qaState.scenario === sc ? 'selected' : ''}`}
                onClick={async () => {
                  setQaState((prev) => ({ ...prev, scenario: sc }));
                  await setQAState(true, sc);
                }}
              >
                {sc}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}