import React from 'react';
import { Key, Shield, FileCode, Lock, BookOpen } from 'lucide-react';

export default function SettingsKeyDocs() {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">API KEYS & CREDENTIAL CONFIGURATION GUIDE</h2>
        <p className="text-xs text-slate-500">Security documentation for external AI services, database credentials, and secret keys</p>
      </div>

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
                defaultVal: 'Unset (Uses PyTorch LFCC-ResNet engine)'
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

        {/* QA / TEST CONTROL DOCUMENTATION SECTION */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              QA / TEST CONTROL SPECIFICATION
            </h3>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              GLOBAL / SYNCED
            </span>
          </div>

          <p className="text-xs text-slate-600">
            <strong>Purpose:</strong> Control QA simulation states for testing the System 2 interface, policy actions, and UI telemetry without manipulating real AI model weights.
          </p>

          <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-900">
            <p className="font-bold flex items-center gap-1.5">
              ⚠️ TEST MODE INTEGRITY POLICY
            </p>
            <p className="mt-1 text-amber-800">
              <strong>"Simulated results are not real AI detections."</strong> When QA mode is enabled, simulated telemetry is visibly badged as <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono font-bold">SIMULATED</code>. Real fraud callbacks and DB storage of genuine analysis are protected and bypassed during simulation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900 uppercase text-[11px]">Operational Behavior</p>
              <div className="space-y-1.5 text-slate-600 text-[11.5px]">
                <p><strong>QA OFF:</strong> Real microphone audio is processed through the local AI Voice Authenticity Engine; genuine probability & risk scores are computed and displayed.</p>
                <p><strong>QA ON:</strong> Simulated <code>LOW</code>, <code>MEDIUM</code>, or <code>HIGH</code> test states are displayed for interface verification.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <p className="font-bold text-slate-900 uppercase text-[11px]">Available Test Scenarios</p>
              <ul className="list-disc list-inside text-slate-600 space-y-1 text-[11.5px]">
                <li><strong className="text-emerald-700">LOW:</strong> Authentic voice profile (<span className="font-mono">Risk: ~6.8</span>, Action: <span className="font-mono">CONTINUE</span>).</li>
                <li><strong className="text-amber-700">MEDIUM:</strong> Suspicious artifact pattern (<span className="font-mono">Risk: ~55.4</span>, Action: <span className="font-mono">VERIFY</span>).</li>
                <li><strong className="text-rose-700">HIGH:</strong> Synthetic clone alert (<span className="font-mono">Risk: ~98.6</span>, Action: <span className="font-mono">HOLD</span>).</li>
              </ul>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <p className="font-bold text-slate-900 text-xs">REST API & WEBSOCKET SPECIFICATION</p>

            <div className="space-y-2">
              <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                <span className="text-emerald-400 font-bold">GET</span> /api/v1/qa/state
                <pre className="text-slate-300 text-[11px] mt-1">{`{
  "enabled": false,
  "scenario": "LOW",
  "updated_at": "2026-08-28T19:40:00Z"
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
                <span className="text-purple-400 font-bold">WebSocket Event:</span> QA_MODE_UPDATED (Broadcasted to all active clients)
                <pre className="text-slate-300 text-[11px] mt-1">{`{
  "event": "QA_MODE_UPDATED",
  "enabled": true,
  "scenario": "HIGH",
  "updated_at": "2026-08-28T19:40:00Z",
  "simulated_data": {
    "risk_score": 98.6,
    "risk_level": "HIGH",
    "synthetic_probability": 98.6,
    "label": "SYNTHETIC",
    "action": "HOLD",
    "simulated": true
  }
}`}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
