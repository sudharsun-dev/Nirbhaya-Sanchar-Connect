import React, { useEffect, useState } from 'react';
import { FileText, Search, RefreshCw } from 'lucide-react';
import { fetchAuditLogs } from '../services/api';

export default function AuditLogConsole() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogs();
      setLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">AUDIT & COMPLIANCE TRAIL</h2>
          <p className="text-xs text-slate-500">Immutable log of security decisions, policy evaluations, and risk alerts</p>
        </div>
        <button
          onClick={loadLogs}
          className="inline-flex items-center space-x-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-md transition border border-slate-300"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Call ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Event Type</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk Score</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Policy Action</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actor</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200 text-xs">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-400">
                    No audit records registered yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-slate-500">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{log.call_id || '-'}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{log.event_type}</td>
                    <td className="px-6 py-4 font-mono">{log.risk_score !== null ? `${log.risk_score.toFixed(1)} / 100` : '-'}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">{log.recommended_action || log.policy_decision || '-'}</td>
                    <td className="px-6 py-4 text-slate-500">{log.actor}</td>
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
