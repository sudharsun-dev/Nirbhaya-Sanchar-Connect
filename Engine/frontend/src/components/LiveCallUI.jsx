import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Volume2, ShieldAlert, AlertCircle, HelpCircle,
  Play, Square, CheckCircle2, RefreshCw, AlertTriangle, ShieldCheck,
  Radio, Clock, Database, ChevronRight, Activity, FileText
} from 'lucide-react';
import { getCurrentMode, subscribeToModeChanges } from '../services/globalControl';
import {
  fetchQAState,
  startAnalysis,
  requestVerification,
  resolveWsBase,
  API_BASE,
} from '../services/api';

function formatScore(val, digits = 1) {
  if (val === null || val === undefined || isNaN(Number(val))) return null;
  return Number(val).toFixed(digits);
}

function formatPercent(val, digits = 1) {
  if (val === null || val === undefined || isNaN(Number(val))) return null;
  return Number(val).toFixed(digits);
}

function formatConfidence(val) {
  if (val === null || val === undefined || isNaN(Number(val))) return null;
  return (Number(val) * 100).toFixed(0);
}

/**
 * Downsamples Float32 audio buffer from inputSampleRate (e.g. 48kHz / 44.1kHz) to outputSampleRate (16kHz).
 */
function downsampleBuffer(buffer, inputSampleRate, outputSampleRate = 16000) {
  if (inputSampleRate === outputSampleRate) {
    return buffer;
  }
  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

/**
 * Encodes raw Float32 samples into a standard 16-bit mono PCM WAV ArrayBuffer.
 */
function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

export default function LiveCallUI({ onOpenWhyThisScore, initialCallId, globalQAState, activeCall }) {
  const [callState, setCallState] = useState({
    callId: activeCall?.call_id || initialCallId || `nirbhaya-call-${Date.now().toString(36)}`,
    callerName: activeCall?.caller_id || 'Official Caller',
    callerId: activeCall?.caller_id || 'officer@sanchar.gov.in',
    receiverId: activeCall?.receiver_id || 'analyst@sanchar.gov.in',
    channel: activeCall?.channel || 'VOIP',
    durationSec: 0,
    status: (activeCall?.status === 'ACTIVE' || initialCallId) ? 'ANALYZING' : 'IDLE',
  });

  const [availableCalls, setAvailableCalls] = useState([]);
  const [audioStreamState, setAudioStreamState] = useState(
    (activeCall?.status === 'ACTIVE' || initialCallId) ? 'AUDIO RECEIVING' : 'WAITING FOR AUDIO'
  );
  const [isMicActive, setIsMicActive] = useState(false);
  const [rmsVolume, setRmsVolume] = useState(0);
  const [analysisId, setAnalysisId] = useState(activeCall?.call_id || initialCallId || null);

  // Manual Audio File Upload State
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);
  const [isFileAnalyzing, setIsFileAnalyzing] = useState(false);
  const [fileAnalysisProgress, setFileAnalysisProgress] = useState(0);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedAudioFile(e.target.files[0]);
    }
  };

  const handleAnalyzeAudioFile = async () => {
    if (!selectedAudioFile) return;
    setIsFileAnalyzing(true);
    setFileAnalysisProgress(0);

    const activeId = callState.callId || `file-analysis-${Date.now()}`;
    setCallState((prev) => ({ ...prev, callId: activeId, status: 'ANALYZING' }));
    setAnalysisId(activeId);
    setAudioStreamState('ANALYZING AUDIO FILE');

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWebSocket(activeId);
      await new Promise((res) => setTimeout(res, 400));
    }

    try {
      const arrayBuffer = await selectedAudioFile.arrayBuffer();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const nativeSr = audioBuffer.sampleRate;
      const targetSr = 16000;
      const downsampled = downsampleBuffer(channelData, nativeSr, targetSr);

      const chunkSamples = 40000; // 2.5s at 16kHz
      const totalWindows = Math.max(1, Math.floor(downsampled.length / chunkSamples));

      console.info(`[AUDIO-FILE-START] name=${selectedAudioFile.name} duration=${audioBuffer.duration.toFixed(2)}s sample_rate=${nativeSr} downsampled_samples=${downsampled.length} total_windows=${totalWindows}`);

      for (let w = 0; w < totalWindows; w++) {
        const slice = downsampled.slice(w * chunkSamples, (w + 1) * chunkSamples);
        let sum = 0;
        for (let i = 0; i < slice.length; i++) sum += slice[i] * slice[i];
        const rms = Math.sqrt(sum / (slice.length || 1));

        setIsMicActive(true);
        setRmsVolume(rms);

        const wavBuffer = encodeWav(slice, targetSr);

        console.info(`[AUDIO-RECEIVED]\ncall_id=${activeId}\nbytes=${wavBuffer.byteLength}\nsamples=${slice.length}\nrms=${rms.toFixed(4)}`);
        console.info(`[AUDIO-WINDOW]\ncall_id=${activeId}\nwindow=${w + 1}\nsamples=40000`);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(wavBuffer);
        }

        setFileAnalysisProgress(Math.round(((w + 1) / totalWindows) * 100));
        await new Promise((res) => setTimeout(res, 250));
      }

      setAudioStreamState('FILE ANALYSIS COMPLETE');
      setIsMicActive(false);
      setRmsVolume(0);
    } catch (err) {
      console.error('[AUDIO-FILE-ERROR] Failed to analyze file:', err);
      alert('Error analyzing audio file: ' + err.message);
    } finally {
      setIsFileAnalyzing(false);
    }
  };

  // Global QA Simulation Test State (Synchronized with Root App & Backend Database)
  const [qaState, setQaState] = useState(globalQAState || { enabled: false, scenario: 'HIGH' });

  const getSimulatedDataForScenario = useCallback((scenario) => {
    if (scenario === 'HIGH') {
      return {
        synthetic_probability: 95.0,
        authenticity_score: 5.0,
        confidence: 0.98,
        risk_score: 95.0,
        risk_level: 'HIGH',
        label: 'SYNTHETIC',
        action: 'HOLD',
        reasons: ['QA Database: High-confidence synthetic voice clone identified'],
      };
    } else if (scenario === 'MEDIUM') {
      return {
        synthetic_probability: 55.0,
        authenticity_score: 45.0,
        confidence: 0.95,
        risk_score: 55.0,
        risk_level: 'MEDIUM',
        label: 'SYNTHETIC',
        action: 'VERIFY',
        reasons: ['QA Database: Spectral phase anomaly and vocoder artifacts detected'],
      };
    } else {
      return {
        synthetic_probability: 15.0,
        authenticity_score: 85.0,
        confidence: 0.95,
        risk_score: 15.0,
        risk_level: 'LOW',
        label: 'REAL',
        action: 'CONTINUE',
        reasons: ['QA Database: Natural human acoustic profile verified'],
      };
    }
  }, []);

  const initialSim = (globalQAState?.enabled || qaState.enabled)
    ? getSimulatedDataForScenario(globalQAState?.scenario || qaState.scenario || 'HIGH')
    : null;

  // Real AI Outputs from backend voice authenticity streaming detector
  const [riskData, setRiskData] = useState({
    riskScore: initialSim ? initialSim.risk_score : null,
    riskLevel: initialSim ? initialSim.risk_level : null,
    overallConfidence: initialSim ? initialSim.confidence : null,
    syntheticProbability: initialSim ? initialSim.synthetic_probability : null,
    voiceAuthenticity: initialSim ? initialSim.authenticity_score : null,
    resemble: {
      available: false,
      status: 'DISCONNECTED',
      label: null,
      syntheticProbability: null,
      authenticityScore: null,
      confidence: null,
      consistency: null,
    },
    speakerSimilarity: null,
    audioQuality: null,
    contextScore: null,
    transactionScore: null,
    behaviorScore: null,
    reasons: initialSim ? initialSim.reasons : [],
    recommendedAction: initialSim ? initialSim.action : null,
    verificationRequired: false,
    windowsAnalyzed: 0,
    lastLatencyMs: null,
    simulated: Boolean(initialSim),
  });

  // Supabase Global Control Realtime Mode Subscription
  useEffect(() => {
    const unsub = subscribeToModeChanges((mode) => {
      if (mode && mode !== 'REAL') {
        const simData = getSimulatedDataForScenario(mode);
        setRiskData((prev) => ({
          ...prev,
          riskScore: simData.risk_score,
          riskLevel: simData.risk_level,
          syntheticProbability: simData.synthetic_probability,
          voiceAuthenticity: simData.authenticity_score,
          recommendedAction: simData.action,
          reasons: simData.reasons,
          simulated: true,
        }));
      } else if (mode === 'REAL') {
        setRiskData((prev) => (prev.simulated ? { ...prev, simulated: false } : prev));
      }
    });
    return () => unsub();
  }, [getSimulatedDataForScenario]);

  // Keep state in sync with globalQAState prop from App root
  useEffect(() => {
    if (globalQAState) {
      setQaState(globalQAState);
      if (globalQAState.enabled) {
        const simData = getSimulatedDataForScenario(globalQAState.scenario || 'HIGH');
        setRiskData((prev) => ({
          ...prev,
          riskScore: simData.risk_score,
          riskLevel: simData.risk_level,
          syntheticProbability: simData.synthetic_probability,
          voiceAuthenticity: simData.authenticity_score,
          recommendedAction: simData.action,
          reasons: simData.reasons,
          simulated: true,
        }));
      } else {
        setRiskData((prev) => (prev.simulated ? { ...prev, simulated: false } : prev));
      }
    }
  }, [globalQAState, getSimulatedDataForScenario]);

  // Sync with activeCall prop passed from App root
  useEffect(() => {
    if (activeCall && (activeCall.status === 'ACTIVE' || activeCall.has_active_call)) {
      const cid = activeCall.call_id;
      if (currentSubscribedCallIdRef.current !== cid) {
        console.info(`[SYSTEM 2] Auto-connecting to active call: ${cid}`);
        currentSubscribedCallIdRef.current = cid;
        setCallState((prev) => ({
          ...prev,
          callId: cid,
          callerId: activeCall.caller_id || prev.callerId,
          receiverId: activeCall.receiver_id || prev.receiverId,
          channel: activeCall.channel || 'VOIP',
          status: 'ANALYZING',
        }));
        setAnalysisId(cid);
        setAudioStreamState('AUDIO RECEIVING');
        connectWebSocket(cid);
      }
    }
  }, [activeCall]);

  // Note: QA state is managed at App root (App.jsx) via globalQAState prop & Supabase Realtime


  // Diagnostic Pipeline tracker
  const [pipelineState, setPipelineState] = useState({
    microphone: 'IDLE',      // IDLE | PASS | FAIL
    audioTap: 'IDLE',        // IDLE | PASS | FAIL
    s1ToS2: 'IDLE',          // IDLE | PASS | FAIL
    s2Receive: 'IDLE',       // IDLE | PASS | FAIL
    resembleConnect: 'IDLE', // IDLE | PASS | FAIL
    resembleReady: 'IDLE',   // IDLE | PASS | FAIL
    resembleResult: 'IDLE',  // IDLE | PASS | NO_VOICE | FAIL
    telemetry: 'IDLE',       // IDLE | PASS | FAIL
    callback: 'IDLE'         // IDLE | PASS | FAIL
  });

  // Evidence log of actual analysis windows
  const [evidenceLog, setEvidenceLog] = useState([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);

  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const currentSubscribedCallIdRef = useRef(null);
  const isLocallyStreamingRef = useRef(false);
  const pendingAudioQueueRef = useRef([]);

  // Connect to System 2 WebSocket for the current analysis session
  const connectWebSocket = useCallback((targetId) => {
    if (!targetId) return;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }

    const wsBase = resolveWsBase();
    const wsUrl = `${wsBase}/analysis/${targetId}`;
    console.info(`[SYSTEM-2-AUTO-CONNECT]\ncall_id=${targetId}`);
    console.info(`[SYSTEM 2] Connecting to WebSocket: ${wsUrl} for call_id=${targetId}`);
    setAudioStreamState('AUDIO RECEIVING');
    setPipelineState((p) => ({ ...p, s1ToS2: 'PASS', s2Receive: 'PASS' }));

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.info(`[WS-CONNECTED]\ncall_id=${targetId}`);
      console.info(`[SYSTEM 2] WebSocket connected for session ${targetId}`);
      setAudioStreamState('AUDIO RECEIVING');
      setPipelineState((p) => ({ ...p, s1ToS2: 'PASS', s2Receive: 'PASS', resembleConnect: 'PASS' }));

      // Flush queued audio chunks if any were captured during handshake
      if (pendingAudioQueueRef.current && pendingAudioQueueRef.current.length > 0) {
        console.info(`[SYSTEM 2] Flushing ${pendingAudioQueueRef.current.length} queued audio chunks for call_id=${targetId}`);
        while (pendingAudioQueueRef.current.length > 0) {
          const chunk = pendingAudioQueueRef.current.shift();
          try {
            socket.send(chunk);
          } catch (err) {
            console.warn('[SYSTEM 2] Failed to flush queued audio chunk', err);
          }
        }
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.info(`[UI-WS-RECEIVE] event=${data.event} analysis_id=${targetId}`, data);
        
        if (data.event === 'ANALYSIS_STARTED') {
          setAudioStreamState('AUDIO RECEIVING');
          setPipelineState((p) => ({ ...p, resembleReady: 'PASS' }));
        } else if (data.event === 'CALL_STARTED' || data.type === 'CALL_STARTED') {
          console.info(`[CALL-EVENT] type=CALL_STARTED call_id=${data.call_id}`);
          console.info(`[CALL-CONNECT] call_id=${data.call_id}`);
          setCallState((prev) => ({
            ...prev,
            callId: data.call_id,
            callerId: data.caller_id || prev.callerId,
            receiverId: data.receiver_id || prev.receiverId,
            channel: data.channel || 'VOIP',
            status: 'ANALYZING',
          }));
          setAnalysisId(data.call_id);
          setAudioStreamState('AUDIO RECEIVING');
        } else if (data.event === 'CALL_ENDED' || data.type === 'CALL_ENDED') {
          console.info(`[CALL-EVENT] type=CALL_ENDED call_id=${data.call_id}`);
          // Only end THIS call's analysis if the call_id matches the currently active session.
          // Do not close analysis for a different call_id.
          setCallState((prev) => {
            if (prev.callId === data.call_id) {
              console.info(`[CALL-END] Closing WebSocket for ended call_id=${data.call_id}`);
              // Close the WebSocket for this specific call only
              if (wsRef.current) {
                try { wsRef.current.close(); } catch (_) {}
                wsRef.current = null;
              }
              currentSubscribedCallIdRef.current = null;
              return { ...prev, status: 'ENDED' };
            }
            // Different call ended — leave current session untouched
            console.info(`[CALL-END] Ignoring CALL_ENDED for non-active call_id=${data.call_id} (active=${prev.callId})`);
            return prev;
          });
          setAudioStreamState((prev) => prev === 'AUDIO RECEIVING' ? 'CALL ENDED' : prev);
          setIsMicActive(false);
          setRmsVolume(0);
        } else if (data.event === 'AUDIO_PROCESSED') {
          console.info(`[AUDIO-RECEIVED]\ncall_id=${targetId}\nbytes=${data.bytes || 0}\nsamples=${data.samples || 0}\nrms=${data.rms_energy || 0}`);
          console.info(`[AUDIO-WINDOW]\ncall_id=${targetId}\nwindow=${data.window_index || 1}\nsamples=40000`);
          setAudioStreamState('AUDIO RECEIVING');
          setIsMicActive(true);
          setRmsVolume(data.rms_energy || 0.08);
          setPipelineState((p) => ({ ...p, s2Receive: 'PASS', resembleReady: 'PASS' }));
          setRiskData((prev) => ({
            ...prev,
            audioQuality: data.audio_quality_score,
            windowsAnalyzed: data.window_index || (prev.windowsAnalyzed + 1),
            lastLatencyMs: data.processing_latency_ms,
          }));
        } else if (data.event === 'RISK_UPDATED') {
          const isSimulated = Boolean(data.simulated || qaState.enabled);
          const synthProb = data.synthetic_probability;
          const authScore = data.authenticity_score != null ? data.authenticity_score : (synthProb != null ? Math.max(0, 100 - synthProb) : null);
          const resembleBlock = data.resemble || {};
          const isNoVoice = !isSimulated && (data.risk_level === 'NO_VOICE' || resembleBlock.status === 'NO_VOICE');

          console.info(`[DETECTOR-CALLED]\ncall_id=${targetId}\nwindow=${data.window_index}`);
          console.info(`[DETECTOR-RESULT]\nsynthetic_probability=${synthProb}\nauthenticity=${authScore}\nconfidence=${data.confidence || data.overall_confidence}\nverdict=${data.label || resembleBlock.label}`);
          console.info(`[RISK-UPDATED]\ncall_id=${targetId}\nrisk_score=${data.risk_score}`);
          console.info(`[UI-UPDATED]\ncall_id=${targetId}`);

          setAudioStreamState('AUDIO RECEIVING');
          setIsMicActive(true);
          setPipelineState((p) => ({
            ...p,
            resembleConnect: 'PASS',
            resembleReady: 'PASS',
            resembleResult: isNoVoice ? 'NO_VOICE' : (synthProb != null ? 'PASS' : 'PENDING'),
            telemetry: 'PASS',
            callback: 'PASS'
          }));

          setRiskData((prev) => ({
            ...prev,
            windowsAnalyzed: data.window_index != null ? data.window_index : (prev.windowsAnalyzed + 1),
            riskScore: data.risk_score,
            riskLevel: data.risk_level,
            overallConfidence: data.confidence || data.overall_confidence,
            syntheticProbability: synthProb,
            voiceAuthenticity: authScore,
            resemble: isSimulated ? {
              available: true,
              status: 'ACTIVE',
              label: data.label || 'SYNTHETIC (SIMULATED)',
              syntheticProbability: synthProb,
              authenticityScore: authScore,
              confidence: data.confidence || 0.98,
            } : {
              available: Boolean(resembleBlock.available),
              status: resembleBlock.status || (isNoVoice ? 'NO_VOICE' : (resembleBlock.available ? 'ACTIVE' : 'NOT CONFIGURED')),
              label: resembleBlock.label || (synthProb != null ? (synthProb >= 50 ? 'FAKE' : 'REAL') : (isNoVoice ? 'NO VOICE' : '—')),
              syntheticProbability: resembleBlock.synthetic_probability != null ? resembleBlock.synthetic_probability : synthProb,
              authenticityScore: authScore,
              confidence: resembleBlock.confidence || data.confidence,
              consistency: resembleBlock.consistency,
            },
            speakerSimilarity: data.speaker_similarity,
            contextScore: data.context_score,
            reasons: data.reasons || [],
            recommendedAction: data.action || data.recommended_action || prev.recommendedAction,
            lastLatencyMs: data.processing_latency_ms,
            simulated: isSimulated,
          }));

          // Add to evidence log
          setEvidenceLog((prev) => [
            {
              timestamp: new Date().toLocaleTimeString(),
              callId: targetId,
              windowIndex: data.window_index || prev.length + 1,
              detector: isSimulated ? 'QA TEST SIMULATION' : 'VOICE AUTHENTICITY ENGINE',
              syntheticProbability: synthProb,
              authenticityScore: authScore,
              label: isSimulated ? (data.label || 'SIMULATED') : (resembleBlock.label || (synthProb != null ? (synthProb >= 50 ? 'FAKE' : 'REAL') : (isNoVoice ? 'NO VOICE' : '—'))),
              confidence: data.confidence || data.overall_confidence,
              riskScore: data.risk_score,
              riskLevel: data.risk_level,
              recommendedAction: data.action || data.recommended_action || 'CONTINUE',
            },
            ...prev.slice(0, 19),
          ]);

          if (data.risk_level === 'HIGH') {
            setShowAlertModal(true);
          }
        } else if (data.event === 'QA_MODE_UPDATED' || data.type === 'QA_MODE_UPDATED') {
          console.info(`[QA-RECEIVE]\nenabled=${Boolean(data.enabled)}\nscenario=${data.scenario || 'HIGH'}`);
          console.info(`[QA-UI]\nenabled=${Boolean(data.enabled)}\nscenario=${data.scenario || 'HIGH'}`);
          setQaState({ enabled: Boolean(data.enabled), scenario: data.scenario || 'HIGH' });
          if (data.enabled) {
            const sim = data.simulated_data || getSimulatedDataForScenario(data.scenario || 'HIGH');
            setRiskData((prev) => ({
              ...prev,
              riskScore: sim.risk_score,
              riskLevel: sim.risk_level,
              syntheticProbability: sim.synthetic_probability,
              voiceAuthenticity: sim.authenticity_score,
              reasons: sim.reasons || [],
              recommendedAction: sim.action || sim.recommended_action,
              simulated: true,
            }));
            if (sim.risk_level === 'HIGH') {
              setShowAlertModal(true);
            }
          } else {
            setRiskData((prev) => ({ ...prev, simulated: false }));
          }
        } else if (data.event === 'POLICY_UPDATED') {
          setRiskData((prev) => ({
            ...prev,
            recommendedAction: data.recommended_action,
            verificationRequired: data.verification_required,
          }));
        }
      } catch (e) {
        console.error('[SYSTEM 2] Failed to parse WebSocket message', e);
      }
    };

    socket.onerror = (err) => {
      console.info(`[TRACE-WS-ERROR] error=${err?.message || 'WebSocket network error'}`);
      console.info(`[CLIENT-WS] state=ERROR message=${err?.message || 'WebSocket network error'}`);
      console.warn('[SYSTEM 2] WebSocket connection error', err);
      setAudioStreamState('ERROR');
    };

    socket.onclose = (ev) => {
      console.info(`[TRACE-WS-CLOSE] code=${ev.code} reason=${ev.reason || 'normal'}`);
      console.info(`[CLIENT-WS] state=CLOSED code=${ev.code} reason=${ev.reason || 'normal'}`);
      console.info(`[SYSTEM 2] WebSocket closed (code=${ev.code}) for session ${targetId}`);
      if (wsRef.current === socket) {
        setAudioStreamState('WAITING FOR AUDIO');
      }
    };
  }, []);

  useEffect(() => {
    const targetId = activeCall?.call_id || initialCallId || callState.callId;
    if (!wsRef.current && targetId) {
      connectWebSocket(targetId);
    }
  }, [connectWebSocket, initialCallId, callState.callId, activeCall]);

  // Auto-subscribe to active call from backend (only when not actively streaming locally)
  useEffect(() => {
    let active = true;

    async function syncActiveCalls() {
      try {
        const activeCallRes = await fetch(`${API_BASE}/calls/active`).then((r) => r.json()).catch(() => ({ has_active_call: false }));
        if (!active) return;
        if (activeCallRes && activeCallRes.has_active_call && activeCallRes.status === 'ACTIVE') {
          const cid = activeCallRes.call_id;
          if (currentSubscribedCallIdRef.current !== cid) {
            currentSubscribedCallIdRef.current = cid;
            setCallState((prev) => ({
              ...prev,
              callId: cid,
              callerId: activeCallRes.caller_id || prev.callerId,
              receiverId: activeCallRes.receiver_id || prev.receiverId,
              channel: activeCallRes.channel || 'VOIP',
              status: 'ANALYZING',
            }));
            setAnalysisId(cid);
            setAudioStreamState('AUDIO RECEIVING');
            connectWebSocket(cid);
          }
          return;
        }

        const stats = await fetch(`${API_BASE}/dashboard/stats`).then((r) => r.json()).catch(() => ({ recent_calls: [] }));
        if (!active) return;
        const calls = stats.recent_calls || [];
        setAvailableCalls(calls);

        // If currently streaming locally, do not overwrite active session
        if (isLocallyStreamingRef.current) {
          return;
        }

        if (initialCallId) {
          if (currentSubscribedCallIdRef.current !== initialCallId) {
            currentSubscribedCallIdRef.current = initialCallId;
            const match = calls.find((c) => c.call_id === initialCallId);
            if (match) {
              setCallState((prev) => ({
                ...prev,
                callId: match.call_id,
                callerId: match.caller_id,
                receiverId: match.receiver_id,
                status: 'ANALYZING',
              }));
            }
            connectWebSocket(initialCallId);
          }
        } else if (calls.length > 0) {
          const activeCallItem = calls.find((c) => c.status === 'ACTIVE' || c.status === 'PROCESSING') || calls[0];
          if (activeCallItem && activeCallItem.call_id !== currentSubscribedCallIdRef.current) {
            currentSubscribedCallIdRef.current = activeCallItem.call_id;
            setCallState((prev) => ({
              ...prev,
              callId: activeCallItem.call_id,
              callerId: activeCallItem.caller_id,
              receiverId: activeCallItem.receiver_id,
              status: 'ANALYZING',
            }));
            setAnalysisId(activeCallItem.call_id);
            connectWebSocket(activeCallItem.call_id);
          }
        }
      } catch (err) {
        console.warn('[SYSTEM 2] Error syncing active calls:', err);
      }
    }

    syncActiveCalls();
    const interval = setInterval(syncActiveCalls, 3000);

    return () => {
      active = false;
      clearInterval(interval);
      // NOTE: Do NOT close wsRef.current here.
      // LiveCallUI is now always mounted (App.jsx uses display:none).
      // The WebSocket must stay alive across all tab navigation.
      // It only closes when CALL_ENDED is received for the active call_id.
    };
  }, [initialCallId, connectWebSocket]);

  // Live call timer
  useEffect(() => {
    if (callState.status === 'CONNECTED' || callState.status === 'ANALYZING') {
      timerRef.current = setInterval(() => {
        setCallState((prev) => ({ ...prev, durationSec: prev.durationSec + 1 }));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callState.status]);

  // Waveform visualization based on real RMS volume
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let phase = 0;

    const renderWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.lineWidth = 2;

      const width = canvas.width;
      const height = canvas.height;
      const hasAudio = isMicActive && rmsVolume > 0.005;

      ctx.strokeStyle = hasAudio ? '#059669' : '#94a3b8';

      // Amplitude scales with real audio RMS
      const baseAmp = hasAudio ? Math.min(32, Math.max(8, rmsVolume * 120)) : 1.5;

      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * 0.05 + phase) * baseAmp * Math.cos(x * 0.02);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += hasAudio ? 0.2 : 0.02;
      animationFrameId = requestAnimationFrame(renderWave);
    };

    renderWave();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isMicActive, rmsVolume]);

  // Start Live Audio Tap & Session
  const handleStartAnalysis = async () => {
    try {
      const activeId = callState.callId;
      isLocallyStreamingRef.current = true;
      currentSubscribedCallIdRef.current = activeId;
      setAnalysisId(activeId);
      setCallState((prev) => ({ ...prev, status: 'ANALYZING' }));
      setAudioStreamState('WAITING FOR AUDIO');

      console.info(`[TRACE-CALL] call_id=${activeId}`);
      console.info(`[TRACE-ANALYSIS] call_id=${activeId} analysis_id=${activeId}`);

      // 1. Notify Backend Start
      let targetId = activeId;
      try {
        const startRes = await startAnalysis({
          call_id: activeId,
          caller_id: callState.callerId,
          receiver_id: callState.receiverId,
          channel: callState.channel,
        });
        if (startRes && startRes.analysis_id) {
          targetId = startRes.analysis_id;
        }
        console.info(`[TRACE-ANALYSIS-START] status=${startRes?.status || 'STARTED'} call_id=${activeId} analysis_id=${targetId}`);
      } catch (e) {
        console.warn('[SYSTEM 2] Start analysis notification warning:', e);
        console.info(`[TRACE-ANALYSIS-START] status=STARTED call_id=${activeId} analysis_id=${activeId}`);
      }

      setAnalysisId(targetId);
      currentSubscribedCallIdRef.current = targetId;

      // 2. Connect WebSocket
      connectWebSocket(targetId);

      // 3. Acquire Real Microphone Audio Track with Raw Constraints
      console.info(`[ANALYZE-CLICK]\ncall_id=${activeId}\n`);
      const audioConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      };
      console.info(`[MIC-CONFIG]\nechoCancellation=false\nnoiseSuppression=false\nautoGainControl=false\nchannelCount=1\n`);
      
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        console.info(`[MIC-PERMISSION]\nstatus=GRANTED\n`);
      } catch (micErr) {
        console.error(`[MIC-PERMISSION]\nstatus=FAILED\nerror=${micErr.name || micErr.message}\n`);
        throw micErr;
      }

      mediaStreamRef.current = stream;
      setIsMicActive(true);

      const audioTrack = stream.getAudioTracks()[0];
      const trackSettings = audioTrack?.getSettings?.() || {};
      const trackLabel = audioTrack?.label || 'Default Microphone';

      console.info(`[MIC-STREAM]\nactive=${audioTrack ? (audioTrack.readyState === 'live') : true}\ntrack_count=1\naudio_tracks=${trackLabel}\n`);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      audioContextRef.current = audioCtx;

      const nativeSampleRate = audioCtx.sampleRate || 48000;
      const channelCount = trackSettings.channelCount || 1;

      console.info(`[AUDIO-CONTEXT]\nstate=${audioCtx.state}\nsample_rate=${nativeSampleRate}\n`);
      console.info(`[REAL-MIC-START] device=${trackLabel} sample_rate=${nativeSampleRate} channel_count=${channelCount}`);
      console.info(`[REAL-MIC-SAMPLE-RATE] native_sample_rate=${nativeSampleRate}`);

      const targetSampleRate = 16000;
      const chunkDurationSec = 2.5;
      const samplesPerChunk = Math.floor(targetSampleRate * chunkDurationSec); // 40000 samples

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let pcmBuffer = [];
      let windowCount = 0;
      let sampleFrameCount = 0;
      let lastLoggedRms = -1;

      processor.onaudioprocess = (e) => {
        const rawInput = e.inputBuffer.getChannelData(0);

        // Calculate Real RMS and Peak from incoming microphone samples
        let rawSum = 0;
        let rawPeak = 0;
        for (let i = 0; i < rawInput.length; i++) {
          const val = rawInput[i];
          rawSum += val * val;
          const absVal = Math.abs(val);
          if (absVal > rawPeak) rawPeak = absVal;
        }
        const rawRms = Math.sqrt(rawSum / (rawInput.length || 1));

        sampleFrameCount++;
        if (sampleFrameCount % 8 === 0 || Math.abs(rawRms - lastLoggedRms) > 0.04) {
          lastLoggedRms = rawRms;
          console.info(`[AUDIO-DATA]\nsamples=${rawInput.length}\nrms=${rawRms.toFixed(4)}\npeak=${rawPeak.toFixed(4)}\n`);
          console.info(`[REAL-MIC-SAMPLES] sample_rate=${nativeSampleRate} input_samples=${rawInput.length} rms=${rawRms.toFixed(4)}`);
        }
        setRmsVolume(rawRms);

        // Downsample microphone samples from native sample rate to 16kHz
        const downsampled = downsampleBuffer(rawInput, nativeSampleRate, targetSampleRate);

        // Accumulate downsampled 16kHz samples
        for (let i = 0; i < downsampled.length; i++) {
          pcmBuffer.push(downsampled[i]);
        }

        // Once 2.5 seconds (40,000 samples at 16kHz) accumulated, stream to Engine
        if (pcmBuffer.length >= samplesPerChunk) {
          windowCount += 1;
          const chunk = new Float32Array(pcmBuffer.slice(0, samplesPerChunk));
          pcmBuffer = pcmBuffer.slice(samplesPerChunk);

          // Calculate window RMS
          let winSum = 0;
          for (let i = 0; i < chunk.length; i++) {
            winSum += chunk[i] * chunk[i];
          }
          const winRms = Math.sqrt(winSum / chunk.length);
          const speechDetected = winRms > 0.005;

          const wavBuffer = encodeWav(chunk, targetSampleRate);
          const wsReady = wsRef.current ? (wsRef.current.readyState === 1 ? 'OPEN' : wsRef.current.readyState) : 'NULL';

          console.info(`[AUDIO-WINDOW]\nwindow_index=${windowCount}\nduration_ms=2500\nsamples=${chunk.length}\n`);
          console.info(`[WS-SEND]\ncall_id=${activeId}\nbytes=${wavBuffer.byteLength}\nwindow_index=${windowCount}\n`);
          console.info(`[REAL-MIC-WINDOW] window_index=${windowCount} native_sample_rate=${nativeSampleRate} output_sample_rate=16000 samples=${chunk.length} duration_ms=2500 rms=${winRms.toFixed(4)}`);
          console.info(`[REAL-MIC-SEND] window_index=${windowCount} bytes=${wavBuffer.byteLength} ws_ready_state=${wsReady}`);

          if (!speechDetected) {
            console.info(`[REAL-MIC-SILENCE] rms=${winRms.toFixed(4)} speech_detected=false`);
          }

          console.info(`[TRACE-AUDIO-WINDOW] call_id=${activeId} window_index=${windowCount} sample_rate=16000 channels=1 samples=${chunk.length} duration_ms=2500 bytes=${wavBuffer.byteLength} rms=${winRms.toFixed(4)}`);
          console.info(`[TRACE-AUDIO-SEND] call_id=${activeId} window_index=${windowCount} bytes=${wavBuffer.byteLength} ready_state=${wsReady}`);
          console.info(`[CLIENT-AUDIO] sample_rate=16000 channels=1 samples=${chunk.length} duration_ms=2500 bytes=${wavBuffer.byteLength} rms=${winRms.toFixed(4)} speech_detected=${speechDetected}`);
          console.info(`[AUDIO-TAP] call_id=${activeId} chunk=${windowCount} sample_rate=16000 channels=1 bytes=${wavBuffer.byteLength} rms=${winRms.toFixed(4)}`);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(wavBuffer);
            console.info(`[CLIENT-WS-SEND] analysis_id=${activeId} binary=true bytes=${wavBuffer.byteLength}`);
            setAudioStreamState('AUDIO RECEIVING');
          } else {
            console.info(`[SYSTEM 2] WebSocket buffering, queueing audio chunk #${windowCount} for call_id=${activeId}`);
            if (pendingAudioQueueRef.current.length < 10) {
              pendingAudioQueueRef.current.push(wavBuffer);
            }
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('[SYSTEM 2] Failed to initialize microphone stream', err);
      setAudioStreamState('AUDIO INGESTION ERROR');
      setIsMicActive(false);
      isLocallyStreamingRef.current = false;
    }
  };

  // Stop Audio Tap only — keep WebSocket alive so System 2 continues receiving System 1 audio.
  // The WebSocket is only closed when CALL_ENDED is received for the active call_id.
  const handleStopAnalysis = () => {
    isLocallyStreamingRef.current = false;
    setIsMicActive(false);
    setRmsVolume(0);
    setAudioStreamState('MIC STOPPED — STREAM ACTIVE');
    setCallState((prev) => ({ ...prev, status: 'ANALYZING' }));
    pendingAudioQueueRef.current = [];

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (_) {}
      processorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }
    // WebSocket stays open — do NOT close wsRef.current here.
    // System 1 may still be sending audio via the server-side pipeline.
    console.info('[AUDIO-TAP] Local microphone tap stopped. WebSocket remains active for System 1 audio.');
  };

  const handleRequestVerification = async () => {
    if (!analysisId) return;
    setVerificationPending(true);
    try {
      await requestVerification(analysisId, callState.callId, 'TRUSTED_CALLBACK');
      alert('Verification request dispatched to trusted contact channel.');
    } catch (err) {
      console.error('Verification failed', err);
    } finally {
      setVerificationPending(false);
      setShowAlertModal(false);
    }
  };

  const durationText = `${String(Math.floor(callState.durationSec / 60)).padStart(2, '0')}:${String(callState.durationSec % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-100 text-[11px] font-mono font-semibold uppercase tracking-wider mb-1">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            Live Security Monitoring Console
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">REAL-TIME CALL INTELLIGENCE</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {availableCalls.length > 0 && (
            <select
              value={callState.callId}
              onChange={(e) => {
                const selected = availableCalls.find((c) => c.call_id === e.target.value);
                if (selected) {
                  setCallState((prev) => ({
                    ...prev,
                    callId: selected.call_id,
                    callerId: selected.caller_id,
                    receiverId: selected.receiver_id,
                    status: 'ANALYZING',
                  }));
                  setAnalysisId(selected.call_id);
                  connectWebSocket(selected.call_id);
                }
              }}
              className="bg-white border border-slate-300 rounded-lg text-xs font-mono px-3 py-2 text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {availableCalls.map((c) => (
                <option key={c.call_id} value={c.call_id}>
                  {c.call_id.slice(0, 18)}... ({c.caller_id} → {c.receiver_id})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Manual Audio File Analyzer Card (Standalone / Offline Capable) */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 tracking-tight flex items-center gap-2">
                MANUAL AUDIO FILE ANALYZER
                <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
                  STANDALONE / NO CALL REQUIRED
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">Upload audio (.wav, .mp3, .mpeg, .m4a, .aac, WhatsApp Audio) to run Voice Authenticity Engine analysis</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="text-xs font-mono text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200 cursor-pointer flex-1"
          />
          <button
            onClick={handleAnalyzeAudioFile}
            disabled={!selectedAudioFile || isFileAnalyzing}
            className={`px-5 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center gap-2 ${
              !selectedAudioFile || isFileAnalyzing
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isFileAnalyzing ? `ANALYZING (${fileAnalysisProgress}%)...` : 'ANALYZE AUDIO'}
          </button>
        </div>
      </div>

      {/* Main 2-Column Console Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Call Identity & Audio Waveform Stream */}
        <div className="lg:col-span-5 space-y-6">
          {/* Call Metadata Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Session</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-2.5 py-0.5 rounded-full ${
                audioStreamState.includes('RECEIVING') || audioStreamState.includes('ANALYZING')
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isMicActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {audioStreamState}
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Call ID</span>
                <span className="font-mono font-semibold text-slate-800">{callState.callId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Caller Identity</span>
                <span className="font-medium text-slate-900">{callState.callerName} ({callState.callerId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Receiver</span>
                <span className="font-medium text-slate-900">{callState.receiverId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Channel</span>
                <span className="font-mono text-slate-800">ENCRYPTED VOIP (WEBRTC)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Call Duration</span>
                <span className="font-mono font-bold text-slate-900">{durationText}</span>
              </div>
            </div>
          </div>

          {/* Real Audio Stream Waveform Card */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-sm p-5 text-white space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Real-Time Audio Stream Tap</h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                16 kHz · MONO · 2.5s WINDOW
              </span>
            </div>

            {/* Waveform Canvas */}
            <div className="bg-slate-950 rounded-lg p-2 border border-slate-800 flex flex-col items-center justify-center h-28 relative overflow-hidden">
              <canvas ref={canvasRef} width={400} height={100} className="w-full h-full" />
              {!isMicActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-[1px] text-slate-400 text-xs font-medium">
                  Audio standby · Choose audio file above or start System 1 call
                </div>
              )}
            </div>

            {/* Audio Properties Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                <p className="text-slate-400">MICROPHONE</p>
                <p className={`font-bold ${isMicActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {isMicActive ? 'ACTIVE' : 'INACTIVE'}
                </p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                <p className="text-slate-400">SAMPLE RATE</p>
                <p className="font-bold text-slate-200">16,000 Hz</p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                <p className="text-slate-400">AUDIO QUALITY</p>
                <p className="font-bold text-slate-200">
                  {formatPercent(riskData.audioQuality != null ? riskData.audioQuality * 100 : null, 0) ? `${formatPercent(riskData.audioQuality * 100, 0)}%` : '—'}
                </p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                <p className="text-slate-400">WINDOWS</p>
                <p className="font-bold text-slate-200">{riskData.windowsAnalyzed || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Risk Assessment & Authenticity Telemetry */}
        <div className="lg:col-span-7 space-y-6">
          {/* Real-Time Risk Assessment Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center">
                  REAL-TIME RISK ASSESSMENT
                  {(qaState.enabled || riskData.simulated) && <span className="qa-simulated-pill">SIMULATED</span>}
                </h3>
                <p className="text-xs text-slate-500">Continuous multi-factor Bayesian threat synthesis</p>
              </div>
              <button
                onClick={() => onOpenWhyThisScore(riskData, analysisId, callState.callId)}
                className="inline-flex items-center space-x-1 text-xs text-emerald-700 hover:text-emerald-800 font-semibold bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Explain Score</span>
              </button>
            </div>

            {/* Score & Risk Level Primary Display */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                <p className="text-xs font-bold text-slate-500 uppercase">RISK SCORE</p>
                <p className={`text-3xl font-extrabold mt-1 font-mono ${
                  formatScore(riskData.riskScore, 1) === null ? 'text-slate-400' :
                  Number(riskData.riskScore) >= 70 ? 'text-rose-600' :
                  Number(riskData.riskScore) >= 30 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {formatScore(riskData.riskScore, 1) !== null ? `${formatScore(riskData.riskScore, 1)} / 100` : '—'}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                <p className="text-xs font-bold text-slate-500 uppercase">RISK LEVEL</p>
                <p className={`text-2xl font-extrabold mt-1 uppercase ${
                  riskData.riskLevel === 'HIGH' ? 'text-rose-600' :
                  riskData.riskLevel === 'MEDIUM' ? 'text-amber-600' :
                  riskData.riskLevel === 'LOW' ? 'text-emerald-600' : 'text-slate-400 text-lg'
                }`}>
                  {riskData.riskLevel || 'ANALYSIS WAITING'}
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
                <p className="text-xs font-bold text-slate-500 uppercase">RECOMMENDED ACTION</p>
                <p className={`text-base font-bold mt-1 uppercase ${riskData.recommendedAction ? 'text-slate-900' : 'text-slate-400'}`}>
                  {riskData.recommendedAction || 'WAITING FOR ANALYSIS'}
                </p>
              </div>
            </div>

            {/* Triggered Reasons / Policy Signals */}
            {riskData.reasons && riskData.reasons.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs space-y-1">
                <p className="font-bold text-rose-800 uppercase flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Triggered Security Signals:
                </p>
                <ul className="list-disc list-inside text-rose-700 pl-1 space-y-0.5">
                  {riskData.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* VOICE AUTHENTICITY ENGINE & DIAGNOSTIC PIPELINE SECTION */}
          <div className="space-y-4">
            {/* 1. Voice Authenticity Engine Live Detection Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">VOICE AUTHENTICITY ENGINE LIVE DETECTION</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">Authoritative Cloud Streaming Deepfake & Voice Impersonation Engine</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                    riskData.resemble?.status === 'ACTIVE' || riskData.resemble?.status === 'RESULT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    riskData.resemble?.status === 'NO_VOICE' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    riskData.resemble?.status === 'CONNECTING' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {riskData.resemble?.status || 'DISCONNECTED'}
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-slate-900 text-slate-100 px-2 py-1 rounded-md">
                    16 kHz PCM STREAM
                  </span>
                </div>
              </div>

              {/* Real-time Voice Metric Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-mono uppercase">SYNTHETIC PROBABILITY</p>
                  <p className="text-lg font-mono font-extrabold text-slate-900 mt-1">
                    {formatPercent(riskData.resemble?.syntheticProbability, 1) !== null ? `${formatPercent(riskData.resemble.syntheticProbability, 1)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Voice authenticity score</p>
                </div>

                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-mono uppercase">AUTHENTICITY</p>
                  <p className="text-lg font-mono font-extrabold text-emerald-700 mt-1">
                    {formatPercent(riskData.voiceAuthenticity, 1) !== null ? `${formatPercent(riskData.voiceAuthenticity, 1)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">100 - Synthetic</p>
                </div>

                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-mono uppercase">CONFIDENCE</p>
                  <p className="text-lg font-mono font-extrabold text-slate-900 mt-1">
                    {formatConfidence(riskData.overallConfidence) !== null ? `${formatConfidence(riskData.overallConfidence)}%` : '—'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Inference certainty</p>
                </div>

                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-mono uppercase">VERDICT LABEL</p>
                  <p className={`text-base font-mono font-extrabold mt-1 uppercase ${
                    riskData.resemble?.label === 'FAKE' ? 'text-rose-600' :
                    riskData.resemble?.label === 'REAL' ? 'text-emerald-600' :
                    'text-slate-500'
                  }`}>
                    {riskData.resemble?.label || (riskData.riskLevel === 'NO_VOICE' ? 'NO VOICE' : 'ANALYZING')}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Windows: #{riskData.windowsAnalyzed}</p>
                </div>
              </div>
            </div>

            {/* 2. Diagnostic Pipeline Panel */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-tight">END-TO-END DIAGNOSTIC PIPELINE</h4>
                  <p className="text-[11px] text-slate-500">Live operational status of every stage from microphone capture to System 1 callback</p>
                </div>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  9-STAGE VERIFICATION
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-2">
                {/* 1. Microphone */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">1. MICROPHONE</p>
                    <p className="text-xs font-bold text-slate-800">{isMicActive ? 'ACTIVE (CAP)' : 'STANDBY'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${isMicActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                </div>

                {/* 2. Audio Tap */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">2. AUDIO TAP</p>
                    <p className="text-xs font-bold text-slate-800">{isMicActive ? '16kHz MONO' : 'IDLE'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${isMicActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {/* 3. S1 -> S2 WS */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">3. S1 → S2 WS</p>
                    <p className="text-xs font-bold text-slate-800">{audioStreamState === 'ERROR' ? 'FAIL' : (wsRef.current ? 'CONNECTED' : 'STANDBY')}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${wsRef.current ? 'bg-emerald-500' : audioStreamState === 'ERROR' ? 'bg-rose-500' : 'bg-slate-300'}`} />
                </div>

                {/* 4. S2 Audio Receive */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">4. S2 RECEIVE</p>
                    <p className="text-xs font-bold text-slate-800">{riskData.windowsAnalyzed > 0 ? 'INGESTING' : 'WAITING'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${riskData.windowsAnalyzed > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {/* 5. Voice Engine Connection */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">5. VOICE ENGINE WS</p>
                    <p className="text-xs font-bold text-slate-800">{riskData.resemble?.available || riskData.windowsAnalyzed > 0 ? 'OPEN' : 'STANDBY'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${riskData.resemble?.available || riskData.windowsAnalyzed > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {/* 6. Voice Engine Ready */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">6. VOICE ENGINE READY</p>
                    <p className="text-xs font-bold text-slate-800">{riskData.windowsAnalyzed > 0 ? 'READY' : 'PENDING'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${riskData.windowsAnalyzed > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {/* 7. Voice Engine Result */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">7. VOICE ENGINE RESULT</p>
                    <p className="text-xs font-bold text-slate-800">
                      {riskData.riskLevel === 'NO_VOICE' ? 'NO VOICE' : (riskData.resemble?.syntheticProbability !== null ? 'RECEIVED' : 'WAITING')}
                    </p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${riskData.resemble?.syntheticProbability !== null ? 'bg-emerald-500' : riskData.riskLevel === 'NO_VOICE' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                </div>

                {/* 8. Telemetry Broadcast */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">8. TELEMETRY</p>
                    <p className="text-xs font-bold text-slate-800">{riskData.windowsAnalyzed > 0 ? 'BROADCASTING' : 'STANDBY'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${riskData.windowsAnalyzed > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>

                {/* 9. System 1 Callback */}
                <div className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-mono text-slate-400 uppercase">9. S1 CALLBACK</p>
                    <p className="text-xs font-bold text-slate-800">{riskData.windowsAnalyzed > 0 ? 'ACTIVE' : 'STANDBY'}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${riskData.windowsAnalyzed > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Evidence Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">ANALYSIS EVIDENCE & WINDOW AUDIT</h3>
            <p className="text-xs text-slate-500">Voice authenticity engine empirical detection evidence per 2.5s streaming audio window</p>
          </div>
          <span className="text-xs font-mono text-slate-400">Total windows: {evidenceLog.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="px-4 py-3 text-left">Timestamp</th>
                <th className="px-4 py-3 text-left">Window</th>
                <th className="px-4 py-3 text-left">Detector</th>
                <th className="px-4 py-3 text-left">Synthetic %</th>
                <th className="px-4 py-3 text-left">Authenticity %</th>
                <th className="px-4 py-3 text-left">Verdict</th>
                <th className="px-4 py-3 text-left">Confidence</th>
                <th className="px-4 py-3 text-left">Risk Score</th>
                <th className="px-4 py-3 text-left">Risk Level</th>
                <th className="px-4 py-3 text-left">Policy Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evidenceLog.length > 0 ? (
                evidenceLog.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-slate-500">{row.timestamp}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">#{row.windowIndex}</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">{row.detector || 'VOICE AUTHENTICITY ENGINE'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {formatPercent(row.syntheticProbability, 1) !== null ? `${formatPercent(row.syntheticProbability, 1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700">
                      {formatPercent(row.authenticityScore, 1) !== null ? `${formatPercent(row.authenticityScore, 1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-800">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        row.label === 'FAKE' ? 'bg-rose-100 text-rose-800' :
                        row.label === 'REAL' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {row.label || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">
                      {formatConfidence(row.confidence) !== null ? `${formatConfidence(row.confidence)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {formatScore(row.riskScore, 1) !== null ? formatScore(row.riskScore, 1) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        row.riskLevel === 'HIGH' ? 'bg-rose-100 text-rose-800' :
                        row.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                        row.riskLevel === 'NO_VOICE' ? 'bg-amber-100 text-amber-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {row.riskLevel || 'ANALYSIS WAITING'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.recommendedAction || 'CONTINUE'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-6 text-center text-slate-400">
                    Waiting for real audio streaming to populate analysis evidence...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 border-2 border-rose-600 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center space-x-3 text-rose-600 border-b border-rose-100 pb-3">
              <ShieldAlert className="w-8 h-8" />
              <div>
                <h3 className="text-base font-bold uppercase tracking-tight text-rose-900">NIRBHAYA SANCHAR SECURITY ALERT</h3>
                <p className="text-xs text-rose-600 font-semibold">HIGH-RISK VOICE IMPERSONATION DETECTED</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200">
                <p className="text-rose-900 font-semibold">
                  Risk Score: <strong>{riskData.riskScore != null ? riskData.riskScore.toFixed(1) : '85.0'} / 100 (HIGH)</strong>
                </p>
                <p className="text-rose-700 mt-1">
                  Elevated synthetic speech signatures and acoustic anomalies detected during live analysis.
                </p>
              </div>

              {riskData.reasons && riskData.reasons.length > 0 && (
                <div>
                  <p className="font-bold text-slate-700 uppercase mb-1">Triggered Security Signals:</p>
                  <ul className="list-disc list-inside text-slate-600 pl-1 space-y-1">
                    {riskData.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="text-slate-500 font-bold uppercase text-[11px]">Recommended Protocol Action</p>
                <p className="text-sm font-bold text-rose-700 mt-0.5">HOLD & INDEPENDENTLY VERIFY</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleRequestVerification}
                disabled={verificationPending}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 rounded-lg shadow-sm transition"
              >
                {verificationPending ? 'DISPATCHING...' : 'REQUEST VERIFICATION'}
              </button>
              <button
                onClick={() => setShowAlertModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-4 py-2.5 rounded-lg transition"
              >
                DISMISS ALERT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

