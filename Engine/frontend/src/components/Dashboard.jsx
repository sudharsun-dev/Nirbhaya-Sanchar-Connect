import React, { useEffect, useState } from 'react';
import { PhoneCall, ShieldAlert, CheckCircle2, Clock, AlertTriangle, ArrowRight, Play, Server, Cpu, Database, Radio } from 'lucide-react';
import { fetchDashboardStats, fetchHealth } from '../services/api';

export default function Dashboard({ onStartCallClick, onSelectCall }) {
  const [stats, setStats] = useState({
    active_calls: 0,
    calls_analyzed: 0,
    high_risk_calls: 0,
    pending_verifications: 0,
    recent_calls: []
  });
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, healthData] = await Promise.all([
          fetchDashboardStats(),
          fetchHealth()
        ]);
        setStats(statsData);
        setHealth(healthData);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const isOnline = health?.status === 'ONLINE';
  const isDbOnline = health?.services?.database?.status === 'ONLINE';
  const isResembleConfigured = health?.services?.resemble?.status === 'CONFIGURED';

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Real-Time AI Security Monitor
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              NIRBHAYA <span className="text-emerald-400">SANCHAR</span> ENGINE
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl font-normal">
              Detect synthetic voice, impersonation signals and fraud risk during live communication.
            </p>
          </div>
          <button
            onClick={onStartCallClick}
            className="self-start md:self-auto inline-flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-md transition border border-emerald-400/30 tracking-wide"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>OPEN LIVE SECURITY CONSOLE</span>
          </button>
        </div>

        {/* Compact System Indicators Strip */}
        <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2.5">
            <Server className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">ENGINE</p>
              <p className="text-xs font-bold text-slate-100">{isOnline ? 'ONLINE' : 'OFFLINE'}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-teal-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">AUDIO STREAM</p>
              <p className="text-xs font-bold text-slate-100">16 kHz MONO READY</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">RESEMBLE AI</p>
              <p className="text-xs font-bold text-slate-100">{isResembleConfigured ? 'CONFIGURED' : 'NOT CONFIGURED'}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-blue-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">WEBSOCKET</p>
              <p className="text-xs font-bold text-slate-100">{isOnline ? 'CONNECTED' : 'STANDBY'}</p>
            </div>
          </div>
          <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2.5">
            <Database className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="text-[10px] text-slate-400 font-mono uppercase">DATABASE</p>
              <p className="text-xs font-bold text-slate-100">{isDbOnline ? 'ONLINE' : 'OFFLINE'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Calls</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.active_calls ?? 0}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
            <PhoneCall className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calls Analyzed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.calls_analyzed ?? 0}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">High-Risk Calls</p>
            <p className="text-2xl font-bold text-rose-600 mt-1">{stats.high_risk_calls ?? 0}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Verification</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pending_verifications ?? 0}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Live Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">REAL-TIME CALL RISK TELEMETRY FEED</h3>
            <p className="text-xs text-slate-500">Live streams processed by AASIST anti-spoofing engine (Click any call to monitor)</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Feed
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Call ID</th>
                <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Participants</th>
                <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Synthetic Prob</th>
                <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Risk Level</th>
                <th className="px-6 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 text-xs">
              {stats.recent_calls && stats.recent_calls.length > 0 ? (
                stats.recent_calls.map((call, idx) => (
                  <tr
                    key={call.call_id || idx}
                    onClick={() => onSelectCall && onSelectCall(call.call_id)}
                    className="hover:bg-emerald-50/50 cursor-pointer transition"
                  >
                    <td className="px-6 py-3.5 font-mono text-slate-700 font-semibold text-emerald-700 hover:underline">{call.call_id}</td>
                    <td className="px-6 py-3.5 text-slate-900 font-medium">
                      {call.caller_id || 'Caller'} → {call.receiver_id || 'Receiver'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 uppercase">
                        {call.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-700">
                      {call.synthetic_prob != null ? `${call.synthetic_prob.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        call.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800' :
                        call.risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                        'bg-emerald-100 text-emerald-800'
                      }`}>
                        {call.risk_level || 'LOW'}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-semibold text-slate-700">
                      {call.recommended_action || 'ALLOW'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No recent calls recorded. Launch a call from System 1 or click "Open Live Security Console" to analyze live audio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
