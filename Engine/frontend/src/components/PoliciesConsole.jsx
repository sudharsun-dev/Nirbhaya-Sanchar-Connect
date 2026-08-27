import React, { useState } from 'react';
import { Sliders, Save, Building2, ShieldCheck } from 'lucide-react';

export default function PoliciesConsole() {
  const [profile, setProfile] = useState('BANK');
  const [mediumThreshold, setMediumThreshold] = useState(30);
  const [highThreshold, setHighThreshold] = useState(70);
  const [autoHoldHighSensitivity, setAutoHoldHighSensitivity] = useState(true);

  const handleSave = () => {
    alert(`Policy threshold updates saved for ${profile} profile.`);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">ORGANIZATIONAL POLICY CONSOLE</h2>
        <p className="text-xs text-slate-500">Configure risk score thresholds, sensitivity rules, and action mapping</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 max-w-3xl">
        {/* Profile Selector */}
        <div>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2">Select Organization Profile</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['BANK', 'ENTERPRISE', 'GOVERNMENT', 'CONTACT_CENTER'].map((p) => (
              <button
                key={p}
                onClick={() => setProfile(p)}
                className={`p-3 rounded-lg border text-xs font-bold transition ${
                  profile === p ? 'bg-blue-50 border-blue-600 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Threshold Sliders */}
        <div className="space-y-4 pt-2">
          <div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
              <span>Medium Risk Threshold Score (VERIFY)</span>
              <span className="text-blue-700 font-mono">{mediumThreshold} / 100</span>
            </div>
            <input
              type="range"
              min="10"
              max="50"
              value={mediumThreshold}
              onChange={(e) => setMediumThreshold(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div>
            <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
              <span>High Risk Threshold Score (HOLD / ESCALATE)</span>
              <span className="text-red-600 font-mono">{highThreshold} / 100</span>
            </div>
            <input
              type="range"
              min="50"
              max="90"
              value={highThreshold}
              onChange={(e) => setHighThreshold(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
          </div>
        </div>

        {/* Action Controls */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-900">Automatic Transaction HOLD</p>
            <p className="text-xs text-slate-500">Require independent step-up verification for high sensitivity financial transfers</p>
          </div>
          <input
            type="checkbox"
            checked={autoHoldHighSensitivity}
            onChange={(e) => setAutoHoldHighSensitivity(e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 border-slate-300"
          />
        </div>

        <div className="pt-4 border-t border-slate-200">
          <button
            onClick={handleSave}
            className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-sm transition"
          >
            <Save className="w-4 h-4" />
            <span>SAVE POLICY CONFIGURATION</span>
          </button>
        </div>
      </div>
    </div>
  );
}
