import React from 'react';
import { Server, Database, Cpu, Radio, ShieldCheck, Activity, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SystemHealth({ healthStatus }) {
  const services = healthStatus?.services || {};

  const getStatusBadge = (status) => {
    if (status === 'ONLINE') {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> ONLINE
        </span>
      );
    }
    if (status === 'CONFIGURATION_REQUIRED' || status === 'DEGRADED') {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> DEGRADED
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> OFFLINE
      </span>
    );
  };

  const voiceAiDetails = services.voice_ai?.details || {};

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-100 text-[11px] font-mono font-semibold uppercase tracking-wider mb-1">
          <Server className="w-3.5 h-3.5 text-emerald-400" />
          Empirical Health Observability
        </div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">SYSTEM 2 ENGINE HEALTH & SUBSYSTEM STATUS</h2>
        <p className="text-xs text-slate-500">Live operational status across REST API, WebSocket streams, neural anti-spoof model, and database</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Core FastAPI Engine */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">FastAPI Backend Engine</h3>
            </div>
            {getStatusBadge(healthStatus?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500">REST APIs & Binary WebSocket Streaming Server</p>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between font-mono">
            <span>Environment:</span>
            <span className="font-semibold text-slate-800">{healthStatus?.environment || 'production'}</span>
          </div>
        </div>

        {/* Database */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-teal-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">SQL Database</h3>
            </div>
            {getStatusBadge(services.database?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500">Async Session Pool & Session State Store</p>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between font-mono">
            <span>Engine:</span>
            <span className="font-semibold text-slate-800">SQLAlchemy 2.0 Async</span>
          </div>
        </div>

        {/* Voice Authenticity Engine */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-cyan-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">VOICE AUTHENTICITY ENGINE</h3>
            </div>
            {services.resemble?.status === 'CONFIGURED' ? (
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> CONFIGURED
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-amber-200">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> NOT CONFIGURED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">Real‑time Voice Authenticity & Fraud Detection Engine</p>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1 font-mono">
            <div className="flex justify-between">
              <span>Provider:</span>
              <span className="font-semibold text-slate-800">VOICE AUTHENTICITY ENGINE</span>
            </div>
            <div className="flex justify-between">
              <span>Engine:</span>
              <span className="font-semibold text-slate-800">Streaming WebSocket</span>
            </div>
            <div className="flex justify-between">
              <span>Audio Format:</span>
              <span className="font-semibold text-slate-800">16 kHz Mono PCM</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-semibold text-emerald-700">{services.resemble?.status || 'CONFIGURED'}</span>
            </div>
          </div>
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
          <p className="text-xs text-slate-500">ECAPA-TDNN Acoustic Spectral Embedding</p>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between font-mono">
            <span>Architecture:</span>
            <span className="font-semibold text-slate-800">VOICE AUTHENTICITY ENGINE</span>
          </div>
        </div>

        {/* WebSocket Pipeline */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Radio className="w-5 h-5 text-blue-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">WebSocket Stream Router</h3>
            </div>
            {getStatusBadge(healthStatus?.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE')}
          </div>
          <p className="text-xs text-slate-500">Low-latency 16 kHz Audio Chunk Ingestion</p>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between font-mono">
            <span>Protocol:</span>
            <span className="font-semibold text-slate-800">Binary PCM / JSON Telemetry</span>
          </div>
        </div>

        {/* System 1 Connect */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-900 uppercase">System 1 Callback</h3>
            </div>
            {getStatusBadge(services.system1_connect?.status || 'ONLINE')}
          </div>
          <p className="text-xs text-slate-500">Security Telemetry Callback Dispatcher</p>
          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex justify-between font-mono">
            <span>Target:</span>
            <span className="font-semibold text-slate-800 truncate max-w-[140px]">
              {services.system1_connect?.details?.url || 'https://nirbhaya-connect-server.onrender.com'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
