import React from 'react';
import { Shield, ExternalLink, Radio, Activity, Lock } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, healthStatus }) {
  const isOnline = healthStatus?.status === 'ONLINE';

  return (
    <header className="bg-slate-950 text-white border-b border-slate-800 sticky top-0 z-40 shadow-lg">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden shadow-md border border-emerald-500/30">
              <img src="/logo.png" alt="Nirbhaya Sanchar Logo" className="w-full h-full object-contain p-0.5" onError={(e) => { e.target.onerror = null; e.target.src = '/logo.svg'; }} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  NIRBHAYA <span className="text-emerald-400">SANCHAR</span>
                </h1>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wider">
                  SYSTEM 2
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-wide uppercase">
                SECURE VOICE COMMUNICATION & AUTHENTICITY ENGINE
              </p>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1.5 rounded-full border border-slate-800">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`} />
              <span className="text-xs font-semibold text-slate-200">
                {isOnline ? 'ENGINE ONLINE' : 'ENGINE OFFLINE'}
              </span>
            </div>

            <a
              href="https://nirbhaya-sanchar-connect-vv3g.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-md transition border border-slate-700/80 font-medium shadow-sm"
              title="Open System 1 Secure VoIP Application"
            >
              <span>System 1 Connect</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="bg-slate-900/80 border-t border-slate-800/80 px-4 sm:px-6 lg:px-8">
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
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
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
