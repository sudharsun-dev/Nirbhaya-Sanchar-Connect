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
import { fetchHealth } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [healthStatus, setHealthStatus] = useState(null);
  const [whyThisScoreModal, setWhyThisScoreModal] = useState({
    isOpen: false,
    riskData: null,
    analysisId: null,
    callId: null
  });

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
          <Dashboard onStartCallClick={() => setActiveTab('live-call')} />
        )}
        {activeTab === 'live-call' && (
          <LiveCallUI onOpenWhyThisScore={handleOpenWhyThisScore} />
        )}
        {activeTab === 'transaction' && <TransactionSecurity />}
        {activeTab === 'alerts' && <RiskAlertsConsole />}
        {activeTab === 'policies' && <PoliciesConsole />}
        {activeTab === 'audit' && <AuditLogConsole />}
        {activeTab === 'health' && <SystemHealth healthStatus={healthStatus} />}
        {activeTab === 'settings' && <SettingsKeyDocs />}
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
