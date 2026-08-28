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
import { fetchHealth, fetchQAState, WS_BASE } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [healthStatus, setHealthStatus] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);
  
  // Persistent Global QA State at App root (Survives all tab navigation)
  const [qaState, setQaState] = useState({
    enabled: false,
    scenario: 'LOW',
    score: 15.0,
    authenticity: 85.0,
    confidence: 95.0,
    verdict: 'AUTHENTIC',
    risk_level: 'LOW',
    recommended_action: 'CONTINUE',
    source: 'QA_DATABASE',
  });

  const [whyThisScoreModal, setWhyThisScoreModal] = useState({
    isOpen: false,
    riskData: null,
    analysisId: null,
    callId: null
  });

  // Health check polling
  useEffect(() => {
    async function loadHealth() {
      try {
        const data = await fetchHealth();
        setHealthStatus(data);
      } catch (err) {
        console.error('Failed to connect to System 2 Backend Engine', err);
      }
    }
    loadHealth();
    const interval = setInterval(loadHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Global QA State Synchronization at App Root
  useEffect(() => {
    let isMounted = true;

    const syncQAState = async () => {
      try {
        const state = await fetchQAState();
        if (isMounted && state && state.enabled !== undefined) {
          setQaState(state);
        }
      } catch (err) {
        console.warn('[QA-APP-SYNC] Sync warning:', err);
      }
    };

    // Initial database load
    syncQAState();

    // 2.5s database polling fallback (guarantees multi-device sync across all tabs)
    const qaTimer = setInterval(syncQAState, 2500);

    // Persistent WebSocket sync across all page views
    let ws = null;
    try {
      const wsUrl = `${WS_BASE}/events`;
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === 'QA_MODE_UPDATED' || data.type === 'QA_MODE_UPDATED') {
            if (isMounted) {
              setQaState((prev) => ({
                ...prev,
                enabled: Boolean(data.enabled),
                scenario: data.scenario || prev.scenario || 'LOW',
                score: data.score ?? (data.scenario === 'HIGH' ? 95.0 : data.scenario === 'MEDIUM' ? 55.0 : 15.0),
                authenticity: data.authenticity ?? (data.scenario === 'HIGH' ? 5.0 : data.scenario === 'MEDIUM' ? 45.0 : 85.0),
                confidence: data.confidence ?? 95.0,
                verdict: data.verdict ?? (data.scenario === 'LOW' ? 'AUTHENTIC' : 'SYNTHETIC'),
                risk_level: data.risk_level ?? data.scenario,
                recommended_action: data.recommended_action ?? (data.scenario === 'HIGH' ? 'HOLD' : data.scenario === 'MEDIUM' ? 'VERIFY' : 'CONTINUE'),
                source: 'QA_DATABASE',
              }));
            }
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      isMounted = false;
      clearInterval(qaTimer);
      if (ws) {
        try { ws.close(); } catch (_) {}
      }
    };
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
        {activeTab === 'live-call' && (
          <LiveCallUI
            initialCallId={selectedCallId}
            onOpenWhyThisScore={handleOpenWhyThisScore}
            globalQAState={qaState}
          />
        )}
        {activeTab === 'transaction' && <TransactionSecurity />}
        {activeTab === 'alerts' && <RiskAlertsConsole />}
        {activeTab === 'policies' && <PoliciesConsole />}
        {activeTab === 'audit' && <AuditLogConsole />}
        {activeTab === 'health' && <SystemHealth healthStatus={healthStatus} />}
        {activeTab === 'settings' && (
          <SettingsKeyDocs
            globalQAState={qaState}
            onQAStateChange={setQaState}
          />
        )}
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
