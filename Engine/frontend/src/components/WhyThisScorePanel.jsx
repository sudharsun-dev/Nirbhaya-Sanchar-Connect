import React, { useEffect, useState } from 'react';
import { X, ShieldAlert, CheckCircle2, HelpCircle, FileText, Cpu } from 'lucide-react';
import { getAnalysisExplanation } from '../services/api';

export default function WhyThisScorePanel({ riskData, analysisId, callId, onClose }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExplanation() {
      if (analysisId) {
        try {
          const data = await getAnalysisExplanation(analysisId);
          setExplanation(data);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    }
    loadExplanation();
  }, [analysisId]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">WHY THIS SCORE? — EMPIRICAL EVIDENCE BREAKDOWN</h3>
              <p className="text-xs text-slate-500 font-mono">Analysis ID: {analysisId || 'Demo Session'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Risk Score Summary Banner */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">CALCULATED OVERALL RISK</span>
            <div className="flex items-baseline space-x-2 mt-1">
              <span className="text-3xl font-black text-slate-900">{(riskData?.riskScore || 0).toFixed(1)}</span>
              <span className="text-sm font-bold text-slate-500">/ 100</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">RISK LEVEL</span>
            <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-black ${
              riskData?.riskLevel === 'HIGH'
                ? 'bg-red-100 text-red-800 border border-red-300'
                : riskData?.riskLevel === 'MEDIUM'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            }`}>
              {riskData?.riskLevel || 'LOW'}
            </span>
          </div>
        </div>

        {/* Triggered Reasons List */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">TRIGGERED RISK SIGNALS</h4>
          <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200/80 space-y-2">
            {riskData?.reasons && riskData.reasons.length > 0 ? (
              <ul className="space-y-2">
                {riskData.reasons.map((reason, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs font-semibold text-amber-900">
                    <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-600">Standard caller interaction within expected normal parameters.</p>
            )}
          </div>
        </div>

        {/* Signals Breakdown Grid */}
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">MULTI-MODAL SIGNAL BREAKDOWN</h4>
          <div className="space-y-3">
            {[
              {
                title: 'Voice Anti-Spoofing Model',
                value: riskData?.syntheticProbability !== null ? `${riskData?.syntheticProbability}% Synthetic Probability` : 'UNAVAILABLE',
                desc: 'Evaluates Linear Frequency Cepstral Coefficients (LFCC), spectral centroid anomalies, and neural vocoder artifacts.'
              },
              {
                title: 'Speaker Identity Match',
                value: riskData?.speakerSimilarity !== null ? `${riskData?.speakerSimilarity}% Cosine Similarity` : 'NO REFERENCE VOICE',
                desc: 'Compares acoustic spectral feature embeddings against target registered voice profile.'
              },
              {
                title: 'Context & Intent Intelligence',
                value: riskData?.contextScore !== null ? `Score ${riskData?.contextScore} / 100` : 'NO TRANSCRIPT',
                desc: 'Detects financial pressure, OTP / PIN credential directives, and secrecy isolation keywords.'
              },
              {
                title: 'Transaction Risk Engine',
                value: riskData?.transactionScore !== null ? `Score ${riskData?.transactionScore} / 100` : 'NO TRANSACTION',
                desc: 'Evaluates transaction action type, transfer amount limits, and target beneficiary status.'
              }
            ].map((sig, i) => (
              <div key={i} className="p-3 bg-white rounded-lg border border-slate-200 flex justify-between items-center text-xs">
                <div>
                  <p className="font-bold text-slate-900">{sig.title}</p>
                  <p className="text-slate-500 mt-0.5">{sig.desc}</p>
                </div>
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
                  {sig.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center border-t border-slate-200 pt-4">
          <span className="text-[11px] text-slate-400 font-mono">NIRBHAYA SANCHAR EXPLAINABILITY ENGINE v1.0</span>
          <button
            onClick={onClose}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
          >
            CLOSE EVIDENCE REPORT
          </button>
        </div>
      </div>
    </div>
  );
}
