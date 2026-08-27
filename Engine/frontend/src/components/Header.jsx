import React from 'react';
import { Shield, Radio, Activity, ExternalLink } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, healthStatus }) {
  const isOnline = healthStatus?.status === 'ONLINE';

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-white">NIRBHAYA SANCHAR</h1>
                <span className="bg-blue-600/30 border border-blue-400/30 text-blue-300 text-xs px-2 py-0.5 rounded font-mono font-semibold">
                  SYSTEM 2
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">AI-POWERED VOICE IMPERSONATION SECURITY & FRAUD PREVENTION</p>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span className="text-xs font-semibold text-slate-300">
                ENGINE STATUS: {healthStatus?.status || 'CHECKING...'}
              </span>
            </div>

            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center space-x-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md transition border border-slate-700"
            >
              <span>System 1 Connect</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="bg-slate-800/50 border-t border-slate-800 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex space-x-1 overflow-x-auto py-2">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'live-call', label: 'Live Analysis' },
            { id: 'transaction', label: 'Transaction Risk' },
            { id: 'alerts', label: 'Risk Alerts & Verification' },
            { id: 'policies', label: 'Policies' },
            { id: 'audit', label: 'Audit Log' },
            { id: 'health', label: 'System Health' },
            { id: 'settings', label: 'API Keys & Docs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}
