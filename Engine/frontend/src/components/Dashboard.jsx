import React, { useEffect, useState } from 'react';
import { PhoneCall, ShieldAlert, CheckCircle2, Clock, AlertTriangle, ArrowRight, Play } from 'lucide-react';
import { fetchDashboardStats } from '../services/api';

export default function Dashboard({ onStartCallClick }) {
  const [stats, setStats] = useState({
    active_calls: 0,
    calls_analyzed: 0,
    high_risk_calls: 0,
    pending_verifications: 0,
    recent_calls: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await fetchDashboardStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load dashboard stats', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">SECURITY OPERATIONS DASHBOARD</h2>
          <p className="text-xs text-slate-500">Real-time voice anti-spoofing and security decision oversight</p>
        </div>
        <button
          onClick={onStartCallClick}
          className="mt-3 sm:mt-0 inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition"
        >
          <Play className="w-4 h-4" />
          <span>Launch Live Call Analysis</span>
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Calls</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.active_calls}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
            <PhoneCall className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calls Analyzed</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.calls_analyzed}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">High-Risk Calls</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{stats.high_risk_calls}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Verification</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{stats.pending_verifications}</p>
          </div>
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Live Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 tracking-tight">ACTIVE & RECENT CALL RISK FEED</h3>
          <span className="text-xs text-slate-400 font-mono">Live updates active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Caller ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Call ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk Score</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Level</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Policy Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {stats.recent_calls.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-xs text-slate-400">
                    No calls analyzed yet. Launch a Live Call Analysis to stream audio.
                  </td>
                </tr>
              ) : (
                stats.recent_calls.map((call, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-900">{call.caller_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-slate-500">{call.call_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">{new Date(call.created_at).toLocaleTimeString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold font-mono text-slate-900">{call.risk_score.toFixed(1)} / 100</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        call.risk_level === 'HIGH'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : call.risk_level === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {call.risk_level}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold text-slate-700">
                      {call.risk_level === 'HIGH' ? 'HOLD & VERIFY' : call.risk_level === 'MEDIUM' ? 'STEP-UP VERIFICATION' : 'CONTINUE'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
