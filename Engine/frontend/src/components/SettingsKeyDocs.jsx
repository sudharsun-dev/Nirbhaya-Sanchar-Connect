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
      </div>
    </div>
  );
}
