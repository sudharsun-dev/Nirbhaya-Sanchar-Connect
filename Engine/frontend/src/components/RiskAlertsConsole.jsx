import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, PhoneCall, Clock, AlertTriangle } from 'lucide-react';

export default function RiskAlertsConsole() {
  const [alerts, setAlerts] = useState([
    {
      id: 'ALT-101',
      callId: 'call_9812401',
      callerId: '+91 98765 43210',
      riskScore: 84.5,
      riskLevel: 'HIGH',
      reasons: ['Elevated synthetic speech (84.5%)', 'High-value transfer ₹500,000 requested'],
      action: 'HOLD & VERIFY',
      status: 'ACTIVE',
      time: '2 mins ago'
    },
    {
      id: 'ALT-102',
      callId: 'call_4412098',
      callerId: '+91 91234 56789',
      riskScore: 52.0,
      riskLevel: 'MEDIUM',
      reasons: ['Speaker identity unverified', 'Urgent language detected'],
      action: 'STEP-UP VERIFICATION',
      status: 'PENDING',
      time: '15 mins ago'
    }
  ]);

  const handleResolve = (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'RESOLVED' } : a)));
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">RISK ALERTS & STEP-UP VERIFICATION CONSOLE</h2>
        <p className="text-xs text-slate-500">Manage high-risk security alerts and independent verification workflows</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">SECURITY ALERTS QUEUE</h3>
          <span className="text-xs text-slate-400 font-mono">{alerts.filter(a => a.status !== 'RESOLVED').length} Active Alerts</span>
        </div>

        <div className="divide-y divide-slate-200">
          {alerts.map((alert) => (
            <div key={alert.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    alert.riskLevel === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {alert.riskLevel} ({alert.riskScore.toFixed(1)} / 100)
                  </span>
                  <span className="text-xs font-bold text-slate-900">{alert.callerId}</span>
                  <span className="text-xs font-mono text-slate-400">{alert.callId}</span>
                  <span className="text-xs text-slate-400">{alert.time}</span>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                  <p className="font-bold text-slate-900">Empirical Signals:</p>
                  <ul className="list-disc list-inside text-slate-700">
                    {alert.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {alert.status !== 'RESOLVED' ? (
                  <>
                    <button
                      onClick={() => alert('Step-up verification callback launched')}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition"
                    >
                      REQUEST VERIFICATION
                    </button>
                    <button
                      onClick={() => handleResolve(alert.id)}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-3.5 py-2 rounded-lg transition"
                    >
                      RESOLVE
                    </button>
                  </>
                ) : (
                  <span className="text-xs font-bold text-emerald-600 flex items-center space-x-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>VERIFIED & RESOLVED</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
