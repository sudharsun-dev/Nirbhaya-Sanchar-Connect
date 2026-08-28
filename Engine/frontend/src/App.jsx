import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import LiveCallUI from './components/LiveCallUI';
import WhyThisScorePanel from './components/WhyThisScorePanel';
import TransactionSecurity from './components/TransactionSecurity';
import RiskAlertsConsole from './components/RiskAlertsConsole';
import PoliciesConsole from './components/PoliciesConsole';
import AuditLogConsole from './components/AuditLogConsole';
import SystemHealth from './components/SystemHealth';
import SettingsKeyDocs from './components/SettingsKeyDocs';
import { initSystem2Calls, subscribeToSystem2Calls } from './services/system2CallProvider';

import RemoteControl from './components/RemoteControl';

export default function App() {
  const initialTab = typeof window !== 'undefined' && window.location.pathname.includes('remote-control') ? 'remote-control' : 'dashboard';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [healthStatus, setHealthStatus] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  // Initialize Supabase Global Control on app startup & subscribe to Realtime
  useEffect(() => {
    initSystem2Calls().then(call => {
      if (call) {
        setActiveCall(call);
        setSelectedCallId(call.call_id);
      }
    });
    
    const unsub = subscribeToSystem2Calls((call) => {
      setActiveCall(call);
      if (call) {
        setSelectedCallId(call.call_id);
      } else {
        setSelectedCallId(null);
      }
    });
    return () => unsub();
  }, []);

  const [whyThisScoreModal, setWhyThisScoreModal] = useState({
    isOpen: false,
    riskData: null,
    analysisId: null,
    callId: null
  });

  // Health check polling
  useEffect(() => {
    async function loadHealth() {
      // Keep health check if needed, else skip
    }
    loadHealth();
  }, []);


  const handleSelectCall = (callId) => {
    setSelectedCallId(callId);
    setActiveTab('live-call');
  };

  const handleOpenWhyThisScore = (riskData, analysisId, callId) => {
    setWhyThisScoreModal({
      isOpen: true,
      riskData,
      analysisId,
      callId
    });
  };

  const handleCloseWhyThisScore = () => {
    setWhyThisScoreModal((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} healthStatus={healthStatus} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' && (
          <Dashboard
            onStartCallClick={() => { setSelectedCallId(null); setActiveTab('live-call'); }}
            onSelectCall={handleSelectCall}
          />
        )}

        {/* LiveCallUI is ALWAYS mounted and its visibility is toggled via CSS. */}
        <div style={{ display: activeTab === 'live-call' ? 'block' : 'none' }}>
          <LiveCallUI
            activeCall={activeCall}
            onOpenWhyThisScore={handleOpenWhyThisScore}
          />
        </div>

        {activeTab === 'transaction' && <TransactionSecurity />}
        {activeTab === 'alerts' && <RiskAlertsConsole />}
        {activeTab === 'policies' && <PoliciesConsole />}
        {activeTab === 'audit' && <AuditLogConsole />}
        {activeTab === 'health' && <SystemHealth healthStatus={healthStatus} />}
        {activeTab === 'settings' && (
          <SettingsKeyDocs />
        )}
        {activeTab === 'remote-control' && <RemoteControl />}
      </main>

      {/* Why This Score Modal */}
      {whyThisScoreModal.isOpen && (
        <WhyThisScorePanel
          riskData={whyThisScoreModal.riskData}
          analysisId={whyThisScoreModal.analysisId}
          callId={whyThisScoreModal.callId}
          onClose={handleCloseWhyThisScore}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        NIRBHAYA SANCHAR ENGINE (SYSTEM 2) — AI-POWERED VOICE IMPERSONATION SECURITY PLATFORM
      </footer>
    </div>
  );
}
