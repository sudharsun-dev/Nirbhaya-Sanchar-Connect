import React, { useState } from 'react';
import { Landmark, ArrowUpRight, ShieldCheck, AlertOctagon } from 'lucide-react';

export default function TransactionSecurity() {
  const [txData, setTxData] = useState({
    type: 'TRANSFER',
    amount: 500000,
    currency: 'INR',
    beneficiary: 'M. Sharma (Account ***8921)',
    sensitivity: 'HIGH',
    policyDecision: 'HOLD',
    verificationRequired: true
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">TRANSACTION RISK & BANK ADAPTER REVIEW</h2>
        <p className="text-xs text-slate-500">Evaluates sensitive financial actions against organizational policy limits</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Details */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <Landmark className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">HIGH-VALUE TRANSFER REQUEST</h3>
                <p className="text-xs text-slate-500 font-mono">Reference: TX-891024-SANCHAR</p>
              </div>
            </div>

            <span className="bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full border border-red-200">
              POLICY HOLD REQUESTED
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">TYPE</span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{txData.type}</p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">AMOUNT</span>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{txData.currency} {txData.amount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">SENSITIVITY</span>
              <p className="text-sm font-bold text-red-600 mt-0.5">{txData.sensitivity}</p>
            </div>
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">BENEFICIARY</span>
              <p className="text-xs font-bold text-slate-900 mt-0.5">{txData.beneficiary}</p>
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 space-y-2 text-xs text-amber-900">
            <p className="font-bold flex items-center space-x-2">
              <AlertOctagon className="w-4 h-4 text-amber-600" />
              <span>BANK POLICY ADAPTER EVALUATION</span>
            </p>
            <p className="text-amber-800">
              High risk score combined with high-value transfer (₹5,00,000) triggered automatic Bank Policy transaction HOLD. Independent out-of-band verification required before release.
            </p>
          </div>
        </div>

        {/* Verification Status */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">INDEPENDENT STEP-UP VERIFICATION</h3>
            <div className="mt-4 space-y-3 text-xs text-slate-600">
              <div className="flex justify-between items-center">
                <span>Method:</span>
                <span className="font-bold text-slate-900">Trusted Out-of-Band Callback</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Status:</span>
                <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[11px]">PENDING</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => alert('Independent out-of-band verification callback dispatched.')}
            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 rounded-lg transition shadow-sm"
          >
            DISPATCH VERIFICATION CALLBACK
          </button>
        </div>
      </div>
    </div>
  );
}
