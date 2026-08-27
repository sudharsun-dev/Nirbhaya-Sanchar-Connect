import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic, MicOff, Volume2, ShieldAlert, AlertCircle, HelpCircle,
  Play, Square, CheckCircle2, RefreshCw, AlertTriangle, ShieldCheck,
  Radio, Clock, Database, ChevronRight, Activity, FileText
} from 'lucide-react';
import { startAnalysis, sendAudioChunk, requestVerification, resolveWsBase, API_BASE } from '../services/api';

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

export default function LiveCallUI({ onOpenWhyThisScore, initialCallId }) {
  const [callState, setCallState] = useState({
    callId: initialCallId || `nirbhaya-call-${Date.now().toString(36)}`,
    callerName: 'Official Caller',
    callerId: 'officer@sanchar.gov.in',
    receiverId: 'analyst@sanchar.gov.in',
    channel: 'VOIP',
    durationSec: 0,
    status: initialCallId ? 'ANALYZING' : 'IDLE', // IDLE, CONNECTED, ANALYZING
  });

  const [availableCalls, setAvailableCalls] = useState([]);
  const [audioStreamState, setAudioStreamState] = useState(initialCallId ? 'AUDIO RECEIVING' : 'WAITING FOR AUDIO');
  const [isMicActive, setIsMicActive] = useState(false);
  const [rmsVolume, setRmsVolume] = useState(0);
  const [analysisId, setAnalysisId] = useState(initialCallId || null);

  // Real AI Outputs from backend AASIST & Risk Engine
  const [riskData, setRiskData] = useState({
    riskScore: null,
    riskLevel: null, // null until real risk received
    overallConfidence: null,
    syntheticProbability: null,
    voiceAuthenticity: null,
    speakerSimilarity: null,
    audioQuality: null,
    contextScore: null,
    transactionScore: null,
    behaviorScore: null,
    reasons: [],
    recommendedAction: null, // null until real policy evaluated
    verificationRequired: false,
    windowsAnalyzed: 0,
    lastLatencyMs: null,
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

  // Connect to System 2 WebSocket for the current analysis session
  const connectWebSocket = useCallback((targetId) => {
    if (!targetId) return;
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }

    const wsBase = resolveWsBase();
    const wsUrl = `${wsBase}/analysis/${targetId}`;
    console.info(`[SYSTEM 2] Connecting to WebSocket: ${wsUrl} for call_id=${targetId}`);
    setAudioStreamState('CONNECTING');

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.info(`[SYSTEM 2] WebSocket connected for session ${targetId}`);
      setAudioStreamState('AUDIO RECEIVING');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.info(`[UI-EVENT] call_id=${targetId} event=${data.event}`, data);
        if (data.event === 'ANALYSIS_STARTED') {
          setAudioStreamState('AUDIO RECEIVING');
        } else if (data.event === 'AUDIO_PROCESSED') {
          setAudioStreamState('ANALYZING AUDIO');
          setRiskData((prev) => ({
            ...prev,
            audioQuality: data.audio_quality_score,
            windowsAnalyzed: data.window_index || prev.windowsAnalyzed + 1,
            lastLatencyMs: data.processing_latency_ms,
          }));
        } else if (data.event === 'RISK_UPDATED') {
          setAudioStreamState('ANALYSIS READY');
          const authScore = data.synthetic_probability != null ? Math.max(0, 100 - data.synthetic_probability) : null;
          setRiskData((prev) => ({
            ...prev,
            riskScore: data.risk_score,
            riskLevel: data.risk_level,
            overallConfidence: data.overall_confidence,
            syntheticProbability: data.synthetic_probability,
            voiceAuthenticity: authScore,
            speakerSimilarity: data.speaker_similarity,
            contextScore: data.context_score,
            reasons: data.reasons || [],
            recommendedAction: data.recommended_action || prev.recommendedAction,
            lastLatencyMs: data.processing_latency_ms,
          }));

          // Add to real evidence log
          setEvidenceLog((prev) => [
            {
              timestamp: new Date().toLocaleTimeString(),
              callId: targetId,
              windowIndex: data.window_index || prev.length + 1,
              syntheticProbability: data.synthetic_probability,
              modelConfidence: data.overall_confidence,
              riskScore: data.risk_score,
              riskLevel: data.risk_level,
              recommendedAction: data.recommended_action,
            },
            ...prev.slice(0, 19),
          ]);

          if (data.risk_level === 'HIGH') {
            setShowAlertModal(true);
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
      console.warn('[SYSTEM 2] WebSocket connection error', err);
      setAudioStreamState('ERROR');
    };

    socket.onclose = (ev) => {
      console.info(`[SYSTEM 2] WebSocket closed (code=${ev.code}) for session ${targetId}`);
      if (wsRef.current === socket) {
        setAudioStreamState('RECONNECTING');
      }
    };
  }, []);

  // Auto-subscribe to initialCallId or active call from backend
  useEffect(() => {
    let active = true;

    async function syncActiveCalls() {
      try {
        const stats = await fetch(`${API_BASE}/dashboard/stats`).then((r) => r.json()).catch(() => ({ recent_calls: [] }));
        if (!active) return;
        const calls = stats.recent_calls || [];
        setAvailableCalls(calls);

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
          const activeCall = calls.find((c) => c.status === 'ACTIVE' || c.status === 'PROCESSING') || calls[0];
          if (activeCall && activeCall.call_id !== currentSubscribedCallIdRef.current) {
            currentSubscribedCallIdRef.current = activeCall.call_id;
            setCallState((prev) => ({
              ...prev,
              callId: activeCall.call_id,
              callerId: activeCall.caller_id,
              receiverId: activeCall.receiver_id,
              status: 'ANALYZING',
            }));
            setAnalysisId(activeCall.call_id);
            setRiskData({
              riskScore: null,
              riskLevel: null,
              overallConfidence: null,
              syntheticProbability: null,
              voiceAuthenticity: null,
              speakerSimilarity: null,
              audioQuality: null,
              contextScore: null,
              transactionScore: null,
              behaviorScore: null,
              reasons: [],
              recommendedAction: null,
              verificationRequired: false,
              windowsAnalyzed: 0,
              lastLatencyMs: null,
            });
            setEvidenceLog([]);
            connectWebSocket(activeCall.call_id);
          }
        }
      } catch (e) {
        console.warn('[SYSTEM 2] Failed to sync active calls', e);
      }
    }

    syncActiveCalls();
    const interval = setInterval(syncActiveCalls, 3000);

    return () => {
      active = false;
      clearInterval(interval);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
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
      setAnalysisId(activeId);
      setCallState((prev) => ({ ...prev, status: 'ANALYZING' }));
      setAudioStreamState('WAITING FOR AUDIO');

      // 1. Notify Backend Start
      await startAnalysis({
        call_id: activeId,
        caller_id: callState.callerId,
        receiver_id: callState.receiverId,
        channel: callState.channel,
      }).catch((e) => console.warn('[SYSTEM 2] Start analysis notification warning:', e));

      // 2. Connect WebSocket
      connectWebSocket(activeId);

      // 3. Acquire Real Microphone Audio Track
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setIsMicActive(true);

      const targetSampleRate = 16000;
      const chunkDurationSec = 2.5;
      const samplesPerChunk = Math.floor(targetSampleRate * chunkDurationSec);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass({ sampleRate: targetSampleRate });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let pcmBuffer = [];
      let windowCount = 0;

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);

        // Calculate Real RMS for Waveform
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
          pcmBuffer.push(input[i]);
        }
        const rms = Math.sqrt(sum / input.length);
        setRmsVolume(rms);

        // Once 2.5 seconds (40,000 samples at 16kHz) accumulated, stream to Engine
        if (pcmBuffer.length >= samplesPerChunk) {
          windowCount += 1;
          const chunk = new Float32Array(pcmBuffer.slice(0, samplesPerChunk));
          pcmBuffer = pcmBuffer.slice(samplesPerChunk);

          const wavBuffer = encodeWav(chunk, targetSampleRate);
          console.info(`[AUDIO-TAP] call_id=${activeId} chunk=${windowCount} sample_rate=16000 channels=1 bytes=${wavBuffer.byteLength} rms=${rms.toFixed(4)}`);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(wavBuffer);
            setAudioStreamState('AUDIO RECEIVING');
          } else {
            // Fallback HTTP POST
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            sendAudioChunk(activeId, blob, windowCount).catch(() => {});
          }
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
    } catch (err) {
      console.error('[SYSTEM 2] Failed to initialize microphone stream', err);
      setAudioStreamState('AUDIO INGESTION ERROR');
      setIsMicActive(false);
    }
  };

  // Stop Audio Tap & Session
  const handleStopAnalysis = () => {
    setIsMicActive(false);
    setRmsVolume(0);
    setAudioStreamState('ANALYSIS COMPLETE');
    setCallState((prev) => ({ ...prev, status: 'IDLE' }));

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
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }
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

          {isMicActive ? (
            <button
              onClick={handleStopAnalysis}
              className="inline-flex items-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>Stop Audio Tap</span>
            </button>
          ) : (
            <button
              onClick={handleStartAnalysis}
              className="inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition"
            >
              <Mic className="w-4 h-4" />
              <span>Start Local Mic Tap</span>
            </button>
          )}
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
                  Microphone standby · Click "Start Real Audio Tap"
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
                  {riskData.audioQuality != null ? `${(riskData.audioQuality * 100).toFixed(0)}%` : '—'}
                </p>
              </div>
              <div className="bg-slate-800/80 p-2 rounded border border-slate-700/60">
                <p className="text-slate-400">WINDOWS</p>
                <p className="font-bold text-slate-200">{riskData.windowsAnalyzed}</p>
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
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">REAL-TIME RISK ASSESSMENT</h3>
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
                  riskData.riskScore == null ? 'text-slate-400' :
                  riskData.riskScore >= 70 ? 'text-rose-600' :
                  riskData.riskScore >= 30 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {riskData.riskScore != null ? `${riskData.riskScore.toFixed(1)} / 100` : '—'}
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

          {/* Core AI Cards: Voice Authenticity & Speaker Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Voice Authenticity Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-900 uppercase">VOICE AUTHENTICITY</h4>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  AASIST
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Synthetic Probability</span>
                  <span className="font-mono font-bold text-slate-900">
                    {riskData.syntheticProbability != null ? `${riskData.syntheticProbability.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Voice Authenticity</span>
                  <span className="font-mono font-bold text-slate-900">
                    {riskData.voiceAuthenticity != null ? `${riskData.voiceAuthenticity.toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Model Confidence</span>
                  <span className="font-mono text-slate-800">
                    {riskData.overallConfidence != null ? `${(riskData.overallConfidence * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-500">Model Version</span>
                  <span className="font-mono text-slate-600">ASVspoof2019-LA</span>
                </div>
              </div>
            </div>

            {/* Speaker Identity Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-slate-900 uppercase">SPEAKER IDENTITY</h4>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  ECAPA-TDNN
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Speaker Match Similarity</span>
                  <span className="font-mono font-bold text-slate-900">
                    {riskData.speakerSimilarity != null ? `${riskData.speakerSimilarity.toFixed(1)}%` : 'NO REFERENCE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Identity Status</span>
                  <span className="font-bold text-slate-700">
                    {riskData.speakerSimilarity != null
                      ? riskData.speakerSimilarity >= 70 ? 'MATCH' : 'MISMATCH'
                      : 'NO REFERENCE'}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-500">Embedding Extraction</span>
                  <span className="font-mono text-slate-600">Active</span>
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
            <p className="text-xs text-slate-500">Empirical inference evidence generated across consecutive 2.5s audio chunks</p>
          </div>
          <span className="text-xs font-mono text-slate-400">Total windows: {evidenceLog.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-[10px]">
              <tr>
                <th className="px-6 py-3 text-left">Timestamp</th>
                <th className="px-6 py-3 text-left">Window</th>
                <th className="px-6 py-3 text-left">Synthetic Prob</th>
                <th className="px-6 py-3 text-left">Confidence</th>
                <th className="px-6 py-3 text-left">Risk Score</th>
                <th className="px-6 py-3 text-left">Risk Level</th>
                <th className="px-6 py-3 text-left">Policy Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evidenceLog.length > 0 ? (
                evidenceLog.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-6 py-3 font-mono text-slate-500">{row.timestamp}</td>
                    <td className="px-6 py-3 font-mono font-bold text-slate-700">#{row.windowIndex}</td>
                    <td className="px-6 py-3 font-mono text-slate-900">
                      {row.syntheticProbability != null ? `${row.syntheticProbability.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-6 py-3 font-mono text-slate-700">
                      {row.modelConfidence != null ? `${(row.modelConfidence * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-6 py-3 font-mono font-bold text-slate-900">
                      {row.riskScore != null ? row.riskScore.toFixed(1) : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        row.riskLevel === 'HIGH' ? 'bg-rose-100 text-rose-800' :
                        row.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {row.riskLevel || 'LOW'}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-semibold text-slate-800">{row.recommendedAction || 'CONTINUE'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-slate-400">
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
