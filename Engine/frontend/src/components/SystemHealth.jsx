import React from 'react';
import { Activity, Server, Database, Cpu, Radio, ShieldCheck } from 'lucide-react';

export default function SystemHealth({ healthStatus }) {
  const services = healthStatus?.services || {};

  const getStatusBadge = (status) => {
    if (status === 'ONLINE') return <span className="bg-emerald-100 text-emerald-800 font-bold text-xs px-2.5 py-0.5 rounded-full border border-emerald-200">ONLINE</span>;
    if (status === 'CONFIGURATION_REQUIRED') return <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2.5 py-0.5 rounded-full border border-amber-200">CONFIGURATION REQUIRED</span>;
    if (status === 'DEGRADED') return <span className="bg-amber-100 text-amber-800 font-bold text-xs px-2.5 py-0.5 rounded-full border border-amber-200">DEGRADED</span>;
    return <span className="bg-red-100 text-red-800 font-bold text-xs px-2.5 py-0.5 rounded-full border border-red-200">OFFLINE</span>;
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">SYSTEM HEALTH & REAL-TIME ENGINE OBSERVABILITY</h2>
        <p className="text-xs text-slate-500">Real empirical health check status for database, AI models, WebSocket, and System 1</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Core FastAPI Engine */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">FastAPI Backend Engine</h3>
            </div>
            {getStatusBadge(healthStatus?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500">Port 8000 REST & WebSocket Server</p>
        </div>

        {/* Database */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">SQL Database</h3>
            </div>
            {getStatusBadge(services.database?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500">SQLAlchemy 2.0 Async Session Pool</p>
        </div>

        {/* Voice AI Model */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-blue-700" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">Voice Anti-Spoofing AI</h3>
            </div>
            {getStatusBadge(services.voice_ai?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500 font-mono">
            {services.voice_ai?.details?.provider ? `${services.voice_ai.details.provider} (${services.voice_ai.details.model_name})` : 'AASIST Pretrained Graph'}
          </p>
        </div>

        {/* Speaker Verifier */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">Speaker Verification</h3>
            </div>
            {getStatusBadge(services.speaker_verifier?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500 font-mono">ECAPA-TDNN Spectral Embedding</p>
        </div>

        {/* ASR Engine */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-amber-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">ASR Speech-To-Text</h3>
            </div>
            {getStatusBadge(services.asr_engine?.status || 'CONFIGURATION_REQUIRED')}
          </div>
          <p className="text-xs text-slate-500 font-mono">Whisper MultiLang Transcriber</p>
        </div>

        {/* System 1 Connect */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Radio className="w-5 h-5 text-purple-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">System 1 Connection</h3>
            </div>
            {getStatusBadge(services.system1_connect?.status || 'OFFLINE')}
          </div>
          <p className="text-xs text-slate-500 font-mono">{services.system1_connect?.details?.url || 'http://localhost:3001'}</p>
        </div>
      </div>
    </div>
  );
}
