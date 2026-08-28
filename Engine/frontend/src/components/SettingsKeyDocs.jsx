import React, { useState, useEffect } from 'react';
import { Key, Shield, FileCode, Lock, BookOpen, Sliders, CheckCircle2, AlertTriangle, Radio } from 'lucide-react';
import { fetchQAState } from '../services/api';
import { setQAState } from '../services/globalControl';

export default function SettingsKeyDocs({ globalQAState, onQAStateChange }) {
  const [localQA, setLocalQA] = useState(globalQAState || { enabled: false, scenario: 'LOW' });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (globalQAState) {
      setLocalQA(globalQAState);
    }
  }, [globalQAState]);

  useEffect(() => {
    fetchQAState().then((res) => {
      if (res && res.enabled !== undefined) {
        setLocalQA(res);
        if (onQAStateChange) onQAStateChange(res);
      }
    });
  }, [onQAStateChange]);

  const qaState = globalQAState || localQA;

  const handleScenarioChange = () => {};
  const handleToggle = () => {};

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">API KEYS & CREDENTIAL CONFIGURATION GUIDE</h2>
        <p className="text-xs text-slate-500">Security documentation for external AI services, database credentials, and QA test simulation controls</p>
      </div>

      {/* 1. INTERACTIVE QA TEST CONTROLS CARD (MOVED TO REMOTE CONTROL) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                QA TEST CONTROLS HAVE MOVED
              </h3>
              <p className="text-xs text-slate-500">Please visit the /remote-control page to manage System 2 scenarios.</p>
            </div>
          </div>
        </div>
      </div>


      {/* 2. QA TEST CONTROLS DOCUMENTATION & SPECIFICATION */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              DATABASE-BACKED QA TEST CONTROLS SPECIFICATION
            </h3>
            <span className="text-xs font-mono font-bold text-slate-500">DATABASE SOURCE OF TRUTH</span>
          </div>

          <p className="text-xs text-slate-600">
            <strong>Purpose:</strong> Provides database-backed deterministic test scenarios for validating the System 2 interface, policy actions, and end-to-end telemetry without altering real AI model weights.
          </p>

          <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-900">
            <p className="font-bold flex items-center gap-1.5">
              ⚠️ TEST MODE INTEGRITY POLICY
            </p>
            <p className="mt-1 text-amber-800">
              <strong>"QA results are simulated database test values and are not real detector predictions."</strong> When QA mode is enabled, telemetry on Live Analysis displays a prominent <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono font-bold">SIMULATED</code> badge. Real fraud callbacks and DB persistence of genuine records are automatically bypassed.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900 uppercase text-[11px]">Operational Modes (Fixed Database Values)</p>
              <div className="space-y-1.5 text-slate-600 text-[11.5px]">
                <p><strong>OFF:</strong> Real microphone audio is processed continuously through the local AI Voice Authenticity Engine; genuine detector probability and risk scores are displayed in real-time.</p>
                <p><strong>LOW:</strong> Fixed database test result (<span className="font-mono">Score: 15.0</span>, Authenticity: <span className="font-mono">85.0</span>, Action: <span className="font-mono">CONTINUE</span>).</p>
                <p><strong>MEDIUM:</strong> Fixed database test result (<span className="font-mono">Score: 55.0</span>, Authenticity: <span className="font-mono">45.0</span>, Action: <span className="font-mono">VERIFY</span>).</p>
                <p><strong>HIGH:</strong> Fixed database test result (<span className="font-mono">Score: 95.0</span>, Authenticity: <span className="font-mono">5.0</span>, Action: <span className="font-mono">HOLD</span>).</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900 uppercase text-[11px]">Database Single Source of Truth</p>
              <p className="text-slate-600 text-[11.5px]">
                All QA states and metrics are stored in the <span className="font-mono bg-slate-200 px-1 py-0.5 rounded font-bold">qa_control</span> database table. No client-side random numbers are generated. All connected laptops and browsers receive the exact same database records via WebSocket broadcast.
              </p>
            </div>
          </div>

          {/* Endpoints & WebSocket Specs */}
          <div className="space-y-3 pt-2">
            <p className="font-bold text-slate-900 text-xs">REST API & WEBSOCKET SPECIFICATION</p>

            <div className="space-y-2">
              <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                <span className="text-emerald-400 font-bold">GET</span> /api/v1/qa/state
                <pre className="text-slate-300 text-[11px] mt-1">{`{
  "enabled": false,
  "scenario": "LOW",
  "updated_at": "2026-08-28T20:30:00Z"
}`}</pre>
              </div>

              <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                <span className="text-blue-400 font-bold">POST</span> /api/v1/qa/state
                <pre className="text-slate-300 text-[11px] mt-1">{`// Request Body
{
  "enabled": true,
  "scenario": "HIGH"
}`}</pre>
              </div>

              <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                <span className="text-purple-400 font-bold">WebSocket Event:</span> QA_MODE_UPDATED (Broadcast to all connected clients)
                <pre className="text-slate-300 text-[11px] mt-1">{`{
  "event": "QA_MODE_UPDATED",
  "enabled": true,
  "scenario": "HIGH",
  "updated_at": "2026-08-28T20:30:00Z",
  "simulated_data": {
    "risk_score": 95.4,
    "risk_level": "HIGH",
    "synthetic_probability": 95.4,
    "authenticity_score": 4.6,
    "label": "SYNTHETIC",
    "verdict": "SYNTHETIC (SIMULATED)",
    "action": "HOLD / VERIFY",
    "simulated": true
  }
}`}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ENVIRONMENT VARIABLES DIRECTORY */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 text-xs text-blue-900 flex items-start space-x-3">
          <Shield className="w-5 h-5 text-blue-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">SECURITY NOTICE</p>
            <p className="mt-0.5 text-blue-800">
              Never expose API keys in public files or Git repositories. All secret credentials must be set inside the server environment file (<code className="font-mono bg-blue-100 px-1 py-0.5 rounded text-blue-900">.env</code>).
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">ENVIRONMENT VARIABLES DIRECTORY</h3>
          
          <div className="divide-y divide-slate-200 text-xs">
            {[
              {
                key: 'DATABASE_URL',
                status: 'REQUIRED',
                desc: 'SQL Database connection string.',
                defaultVal: 'sqlite+aiosqlite:///./nirbhaya_engine.db'
              },
              {
                key: 'SYSTEM1_CALLBACK_URL',
                status: 'REQUIRED',
                desc: 'System 1 webhook endpoint URL for real-time security alerts.',
                defaultVal: 'http://localhost:3001/api/nirbhaya/callback'
              },
              {
                key: 'VOICE_DETECTION_API_KEY',
                status: 'OPTIONAL',
                desc: 'External voice detection API key if using cloud anti-spoof provider.',
                defaultVal: 'Unset (Uses Free Local AI Vocoder Engine)'
              },
              {
                key: 'ASR_API_KEY',
                status: 'OPTIONAL',
                desc: 'OpenAI Whisper or Deepgram ASR API key for multi-language speech-to-text.',
                defaultVal: 'Unset (Reports ASR_UNAVAILABLE cleanly)'
              },
              {
                key: 'JWT_SECRET',
                status: 'REQUIRED',
                desc: 'Secret key for signing service JWT tokens.',
                defaultVal: 'Configured in .env'
              }
            ].map((item, i) => (
              <div key={i} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between space-y-1 sm:space-y-0">
                <div>
                  <span className="font-mono font-bold text-slate-900 text-xs">{item.key}</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">{item.desc}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.status === 'REQUIRED' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {item.status}
                  </span>
                  <span className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {item.defaultVal}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
