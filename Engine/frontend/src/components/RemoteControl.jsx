import React, { useState, useEffect } from 'react';
import { Shield, Sliders, CheckCircle2, Radio, Zap, Phone, PhoneOff } from 'lucide-react';
import { startSystem2Call, updateSystem2CallScenario, endSystem2Call, subscribeToSystem2Calls, getActiveSystem2Call } from '../services/system2CallProvider';

export default function RemoteControl() {
  const [activeCall, setActiveCall] = useState(getActiveSystem2Call());
  const [selectedScenario, setSelectedScenario] = useState('HIGH');
  const [updating, setUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const unsub = subscribeToSystem2Calls((call) => {
      setActiveCall(call);
      if (call) {
        setSelectedScenario(call.scenario);
      }
    });
    return () => unsub();
  }, []);

  const handleSelectScenario = async (scenario) => {
    setSelectedScenario(scenario);
    if (activeCall && activeCall.status === 'ACTIVE') {
      setUpdating(true);
      try {
        await updateSystem2CallScenario(activeCall.call_id, scenario);
        setSuccessMsg(`Call updated to ${scenario}`);
        setTimeout(() => setSuccessMsg(''), 2000);
      } catch (err) {
        console.error('Failed to update call:', err);
      } finally {
        setUpdating(false);
      }
    }
  };

  const handleCall = async () => {
    setUpdating(true);
    try {
      await startSystem2Call(selectedScenario);
      setSuccessMsg(`System 2 Call Started (${selectedScenario})`);
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      console.error('Failed to start call:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    setUpdating(true);
    try {
      await endSystem2Call(activeCall.call_id);
      setSuccessMsg('Call Ended');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (err) {
      console.error('Failed to end call:', err);
    } finally {
      setUpdating(false);
    }
  };

  const isCallActive = activeCall && activeCall.status === 'ACTIVE';

  return (
    <div className="min-h-[85vh] bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-emerald-400 font-bold uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          NIRBHAYA SANCHAR
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">SECRET REMOTE CONTROL</h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-sm">
          System 2 Independent Master Controller
        </p>
      </div>

      <div className="w-full max-w-md bg-slate-800/90 rounded-2xl border border-slate-700 p-6 space-y-4 shadow-2xl backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-slate-700 pb-3">
          <span className="text-xs font-mono text-slate-400 uppercase font-semibold flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-indigo-400" /> SYSTEM 2 CALL STATE
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
            isCallActive ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-slate-700 text-slate-300 border-slate-600'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isCallActive ? 'bg-rose-400 animate-pulse' : 'bg-slate-400'}`} />
            {isCallActive ? 'CALL ACTIVE' : 'NO ACTIVE CALL'}
          </span>
        </div>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            disabled={updating}
            onClick={() => handleSelectScenario('HIGH')}
            className={`w-full py-4 rounded-xl font-black text-sm transition shadow-lg flex items-center justify-between px-5 ${
              selectedScenario === 'HIGH'
                ? 'bg-rose-600 text-white ring-2 ring-rose-400 scale-[1.02]'
                : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border border-slate-600'
            }`}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-300" /> HIGH RISK SCENARIO
            </span>
            <span className="font-mono text-xs bg-black/40 px-3 py-1 rounded-lg border border-white/10 font-extrabold">
              SCORE 95
            </span>
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={() => handleSelectScenario('MEDIUM')}
            className={`w-full py-4 rounded-xl font-black text-sm transition shadow-lg flex items-center justify-between px-5 ${
              selectedScenario === 'MEDIUM'
                ? 'bg-amber-600 text-white ring-2 ring-amber-400 scale-[1.02]'
                : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border border-slate-600'
            }`}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300" /> MEDIUM RISK SCENARIO
            </span>
            <span className="font-mono text-xs bg-black/40 px-3 py-1 rounded-lg border border-white/10 font-extrabold">
              SCORE 55
            </span>
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={() => handleSelectScenario('LOW')}
            className={`w-full py-4 rounded-xl font-black text-sm transition shadow-lg flex items-center justify-between px-5 ${
              selectedScenario === 'LOW'
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 scale-[1.02]'
                : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border border-slate-600'
            }`}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-300" /> LOW RISK SCENARIO
            </span>
            <span className="font-mono text-xs bg-black/40 px-3 py-1 rounded-lg border border-white/10 font-extrabold">
              SCORE 15
            </span>
          </button>
          
          <div className="flex gap-3 pt-4">
            {!isCallActive ? (
              <button
                type="button"
                disabled={updating}
                onClick={handleCall}
                className="w-full py-4 rounded-xl font-black text-sm transition shadow-lg flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Phone className="w-5 h-5" /> START CALL
              </button>
            ) : (
              <button
                type="button"
                disabled={updating}
                onClick={handleEndCall}
                className="w-full py-4 rounded-xl font-black text-sm transition shadow-lg flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white"
              >
                <PhoneOff className="w-5 h-5" /> END CALL
              </button>
            )}
          </div>
        </div>

        {successMsg && (
          <div className="p-3 bg-emerald-950/80 border border-emerald-600/50 rounded-xl text-emerald-300 text-xs font-mono flex items-center justify-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      <div className="text-[11px] font-mono text-slate-500 text-center space-y-1">
        <p>Supabase system2_calls Table Sync</p>
        <p>Changes propagate immediately to all open System 2 devices</p>
      </div>
    </div>
  );
}
