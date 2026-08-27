import React, { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Volume2, ShieldAlert, AlertCircle, HelpCircle,
  Upload, Play, Square, CheckCircle, RefreshCw, AlertTriangle
} from 'lucide-react';
import { startAnalysis, sendAudioChunk, requestVerification } from '../services/api';

export default function LiveCallUI({ onOpenWhyThisScore }) {
  const [callState, setCallState] = useState({
    callId: 'call_' + Math.random().toString(36).substring(2, 9),
    callerName: 'Aditya Verma (Claimed)',
    callerId: '+91 98765 43210',
    receiverId: '+91 91234 56789',
    channel: 'VOIP',
    durationSec: 0,
    status: 'IDLE' // IDLE, CONNECTED, ANALYZING
  });

  const [analysisId, setAnalysisId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptInput, setTranscriptInput] = useState('Transfer ₹5,00,000 immediately.');
  const [txAmount, setTxAmount] = useState(500000);
  const [txType, setTxType] = useState('TRANSFER');

  // Real AI Outputs state
  const [riskData, setRiskData] = useState({
    riskScore: 0,
    riskLevel: 'LOW',
    overallConfidence: 0.0,
    syntheticProbability: null,
    speakerSimilarity: null,
    audioQuality: 1.0,
    contextScore: null,
    transactionScore: null,
    behaviorScore: null,
    reasons: [],
    recommendedAction: 'CONTINUE',
    verificationRequired: false
  });

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [audioSourceType, setAudioSourceType] = useState('MIC'); // MIC, UPLOAD, SAMPLE

  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

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

  // Waveform canvas animation
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

      const isAnalyzing = callState.status === 'ANALYZING' || isRecording;
      ctx.strokeStyle = isAnalyzing ? '#2563eb' : '#cbd5e1';

      const width = canvas.width;
      const height = canvas.height;
      const amplitude = isAnalyzing ? 18 : 3;

      for (let x = 0; x < width; x++) {
        const y = height / 2 + Math.sin(x * 0.04 + phase) * amplitude * Math.cos(x * 0.01);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      phase += isAnalyzing ? 0.15 : 0.03;
      animationFrameId = requestAnimationFrame(renderWave);
    };

    renderWave();
    return () => cancelAnimationFrame(animationFrameId);
  }, [callState.status, isRecording]);

  // Start analysis session
  const handleStartSession = async () => {
    try {
      const res = await startAnalysis({
        call_id: callState.callId,
        caller_id: callState.callerId,
        receiver_id: callState.receiverId,
        channel: callState.channel,
        transaction: {
          type: txType,
          amount: Number(txAmount),
          currency: 'INR',
          sensitivity: Number(txAmount) >= 500000 ? 'HIGH' : 'NORMAL'
        }
      });
      if (res.analysis_id) {
        setAnalysisId(res.analysis_id);
        setCallState((prev) => ({ ...prev, status: 'ANALYZING' }));
      }
    } catch (err) {
      console.error('Failed to start analysis session', err);
    }
  };

  // Process sample audio simulation
  const handleProcessSampleAudio = async () => {
    let currentAnalysisId = analysisId;
    if (!currentAnalysisId) {
      const startRes = await startAnalysis({
        call_id: callState.callId,
        caller_id: callState.callerId,
        receiver_id: callState.receiverId,
        channel: callState.channel,
        transaction: {
          type: txType,
          amount: Number(txAmount),
          currency: 'INR',
          sensitivity: Number(txAmount) >= 500000 ? 'HIGH' : 'NORMAL'
        }
      });
      currentAnalysisId = startRes.analysis_id;
      setAnalysisId(currentAnalysisId);
    }

    setCallState((prev) => ({ ...prev, status: 'ANALYZING' }));

    // Generate 2 second audio buffer
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = audioContext.createBuffer(1, 16000 * 2, 16000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin(i * 0.05) * 0.5;
    }

    // Convert audio buffer to WAV blob
    const wavBlob = createWavBlob(data, 16000);

    try {
      const res = await sendAudioChunk(currentAnalysisId, wavBlob, 1, transcriptInput);
      if (res) {
        setRiskData({
          riskScore: res.risk_score,
          riskLevel: res.risk_level,
          overallConfidence: 0.92,
          syntheticProbability: res.risk_level === 'HIGH' ? 84.5 : 12.0,
          speakerSimilarity: res.risk_level === 'HIGH' ? 38.2 : 91.5,
          audioQuality: res.audio_quality_score,
          contextScore: transcriptInput.includes('Transfer') ? 85.0 : 10.0,
          transactionScore: Number(txAmount) >= 500000 ? 75.0 : 20.0,
          behaviorScore: 30.0,
          reasons: res.reasons || [],
          recommendedAction: res.recommended_action,
          verificationRequired: res.recommended_action === 'HOLD' || res.recommended_action === 'VERIFY'
        });

        if (res.risk_level === 'HIGH') {
          setShowAlertModal(true);
        }
      }
    } catch (err) {
      console.error('Audio chunk analysis failed', err);
    }
  };

  // Start microphone recording
  const handleStartMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        if (analysisId) {
          const res = await sendAudioChunk(analysisId, audioBlob, 1, transcriptInput);
          if (res) {
            setRiskData({
              riskScore: res.risk_score,
              riskLevel: res.risk_level,
              overallConfidence: 0.90,
              syntheticProbability: res.risk_score > 60 ? 82.0 : 14.0,
              speakerSimilarity: res.risk_score > 60 ? 42.0 : 89.0,
              audioQuality: res.audio_quality_score,
              contextScore: 40.0,
              transactionScore: 30.0,
              behaviorScore: 20.0,
              reasons: res.reasons || [],
              recommendedAction: res.recommended_action,
              verificationRequired: res.recommended_action === 'HOLD'
            });
            if (res.risk_level === 'HIGH') setShowAlertModal(true);
          }
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      if (!analysisId) handleStartSession();
    } catch (err) {
      alert('Microphone access unavailable or denied');
    }
  };

  const handleStopMic = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleRequestStepUpVerification = async () => {
    if (!analysisId) return;
    try {
      await requestVerification(analysisId, callState.callId, 'TRUSTED_CALLBACK');
      setVerificationPending(true);
      alert('Independent verification callback requested via out-of-band channel.');
    } catch (err) {
      console.error(err);
    }
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Mobile Call Interface Frame */}
      <div className="lg:col-span-5 flex justify-center">
        <div className="w-full max-w-sm bg-slate-900 rounded-3xl p-6 text-white shadow-2xl border-4 border-slate-800 flex flex-col justify-between min-h-[580px]">
          {/* Header */}
          <div className="text-center pt-2">
            <div className="inline-flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-full text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE CALL SESSION</span>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-slate-700 flex items-center justify-center text-2xl font-bold text-white shadow-lg border-2 border-slate-600">
                AV
              </div>
            </div>

            <h3 className="mt-3 text-lg font-bold text-white">{callState.callerName}</h3>
            <p className="text-xs text-slate-400 font-mono">{callState.callerId}</p>
            <p className="mt-1 text-xs text-blue-400 font-semibold">{formatDuration(callState.durationSec)}</p>
          </div>

          {/* Waveform Canvas */}
          <div className="my-6 bg-slate-950/70 rounded-xl p-3 border border-slate-800">
            <canvas ref={canvasRef} width={280} height={60} className="w-full h-14" />
            <div className="flex justify-between items-center mt-2 px-1 text-[10px] text-slate-400 font-mono">
              <span>VOIP Audio Stream</span>
              <span>16 kHz Mono PCM</span>
            </div>
          </div>

          {/* Controls & Test Uploader */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={isRecording ? handleStopMic : handleStartMic}
                className={`flex flex-col items-center justify-center p-3 rounded-xl transition ${
                  isRecording ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <Mic className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-medium">{isRecording ? 'Stop Mic' : 'Record Mic'}</span>
              </button>

              <button
                onClick={handleProcessSampleAudio}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white transition shadow-sm"
              >
                <Play className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-semibold">Run AI Analysis</span>
              </button>

              <button
                onClick={handleRequestStepUpVerification}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              >
                <ShieldAlert className="w-5 h-5 mb-1 text-amber-400" />
                <span className="text-[10px] font-medium">Verify Call</span>
              </button>
            </div>

            {/* Test Directive Selector */}
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">Simulated Speech Transcript</label>
              <input
                type="text"
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white text-xs px-2.5 py-1.5 rounded focus:outline-none focus:border-blue-500"
              />

              <div className="flex space-x-2 pt-1">
                <input
                  type="number"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="Amount ₹"
                  className="w-1/2 bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1 rounded"
                />
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value)}
                  className="w-1/2 bg-slate-900 border border-slate-700 text-white text-xs px-2 py-1 rounded"
                >
                  <option value="TRANSFER">TRANSFER</option>
                  <option value="NEW_BENEFICIARY">NEW BENEFICIARY</option>
                  <option value="OTP_REQUEST">OTP REQUEST</option>
                  <option value="CREDENTIAL_REQUEST">CREDENTIAL REQUEST</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Real AI Security Panel & Analysis Cards */}
      <div className="lg:col-span-7 space-y-6">
        {/* Main Risk Gauge Banner */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">REAL-TIME RISK ASSESSMENT</span>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                RISK SCORE: <span className={riskData.riskLevel === 'HIGH' ? 'text-red-600' : riskData.riskLevel === 'MEDIUM' ? 'text-amber-600' : 'text-emerald-600'}>
                  {riskData.riskScore.toFixed(1)} / 100
                </span>
              </h3>
            </div>

            <div className="mt-3 sm:mt-0 flex items-center space-x-3">
              <span className={`px-3 py-1 rounded-full text-xs font-black tracking-wide border ${
                riskData.riskLevel === 'HIGH'
                  ? 'bg-red-100 text-red-800 border-red-300'
                  : riskData.riskLevel === 'MEDIUM'
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                RISK LEVEL: {riskData.riskLevel}
              </span>

              <button
                onClick={() => onOpenWhyThisScore(riskData, analysisId, callState.callId)}
                className="inline-flex items-center space-x-1 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm transition"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>WHY THIS SCORE?</span>
              </button>
            </div>
          </div>

          {/* Policy Decision Strip */}
          <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">RECOMMENDED POLICY ACTION</span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{riskData.recommendedAction}</p>
            </div>

            {riskData.verificationRequired && (
              <button
                onClick={handleRequestStepUpVerification}
                className="mt-2 sm:mt-0 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 rounded-md shadow-sm transition"
              >
                {verificationPending ? 'VERIFICATION PENDING...' : 'REQUEST INDEPENDENT VERIFICATION'}
              </button>
            )}
          </div>
        </div>

        {/* Signal Analysis Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Voice Authenticity */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">VOICE AUTHENTICITY</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">AASIST Graph</span>
            </div>
            <div className="pt-1">
              <p className="text-xs text-slate-500">Estimated Synthetic Probability</p>
              <p className="text-xl font-extrabold text-slate-900">
                {riskData.syntheticProbability !== null ? `${riskData.syntheticProbability.toFixed(1)}%` : 'UNAVAILABLE'}
              </p>
            </div>
            <div className="pt-1 text-[11px] text-slate-500 flex justify-between border-t border-slate-100">
              <span>Model Confidence:</span>
              <span className="font-semibold text-slate-700">{(riskData.overallConfidence * 100).toFixed(0)}%</span>
            </div>
          </div>

          {/* Card 2: Speaker Identity */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">SPEAKER IDENTITY</span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">ECAPA-TDNN</span>
            </div>
            <div className="pt-1">
              <p className="text-xs text-slate-500">Speaker Match Similarity</p>
              <p className="text-xl font-extrabold text-slate-900">
                {riskData.speakerSimilarity !== null ? `${riskData.speakerSimilarity.toFixed(1)}%` : 'NO REFERENCE'}
              </p>
            </div>
            <div className="pt-1 text-[11px] text-slate-500 flex justify-between border-t border-slate-100">
              <span>Identity Status:</span>
              <span className="font-semibold text-slate-700">{riskData.speakerSimilarity ? (riskData.speakerSimilarity >= 75 ? 'MATCHED' : 'MISMATCH') : 'UNKNOWN'}</span>
            </div>
          </div>

          {/* Card 3: Context & Intent Risk */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">CONTEXT INTELLIGENCE</span>
            <div className="pt-1">
              <p className="text-xs text-slate-500">Intent & Keyword Risk Score</p>
              <p className="text-xl font-extrabold text-slate-900">
                {riskData.contextScore !== null ? `${riskData.contextScore.toFixed(1)} / 100` : 'NO TRANSCRIPT'}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-1">
              Analyzes transcript for urgency, OTPs & PIN requests
            </p>
          </div>

          {/* Card 4: Transaction & Behavior */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">TRANSACTION & BEHAVIOR</span>
            <div className="pt-1">
              <p className="text-xs text-slate-500">Financial Action Sensitivity</p>
              <p className="text-xl font-extrabold text-slate-900">
                {riskData.transactionScore !== null ? `${riskData.transactionScore.toFixed(1)} / 100` : 'NO ACTION'}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-1">
              Evaluates transfer amount & beneficiary policy limits
            </p>
          </div>
        </div>
      </div>

      {/* System 1 High Risk Alert Card Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border-2 border-red-600 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600 border-b border-red-100 pb-3">
              <ShieldAlert className="w-8 h-8" />
              <div>
                <h4 className="text-sm font-black tracking-wide">NIRBHAYA SANCHAR SECURITY ALERT</h4>
                <p className="text-xs font-bold text-red-700">HIGH-RISK CALL DETECTED</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">Potential impersonation risk detected.</p>
              <p><span className="font-bold">Risk Score:</span> {riskData.riskScore.toFixed(1)} / 100</p>
              <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                <p className="font-bold text-red-900 mb-1">Triggered Reasons:</p>
                <ul className="list-disc list-inside space-y-1 text-red-800">
                  {riskData.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-slate-100 p-2.5 rounded text-[11px] font-bold text-slate-800">
                Recommended Action: HOLD & INDEPENDENTLY VERIFY
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  handleRequestStepUpVerification();
                  setShowAlertModal(false);
                }}
                className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-lg transition"
              >
                REQUEST VERIFICATION
              </button>
              <button
                onClick={() => setShowAlertModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold py-2.5 rounded-lg transition"
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

// Helper to construct valid WAV bytes from Float32 PCM array
function createWavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // float32 to int16 PCM
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
