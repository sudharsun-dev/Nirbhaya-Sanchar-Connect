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
import { fetchHealth, fetchQAState, fetchActiveCall, WS_BASE } from './services/api';

// initGlobalControl is kept for Supabase mode-change subscription (read-only listener)
import { initGlobalControl } from './services/globalControl';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [healthStatus, setHealthStatus] = useState(null);
  const [selectedCallId, setSelectedCallId] = useState(null);
  const [activeCall, setActiveCall] = useState(null);

  // Initialize Supabase Global Control on app startup (passive listener only)
  useEffect(() => {
    initGlobalControl();
  }, []);

  // Persistent Global QA State at App root — survives ALL tab navigation.
  // This is initialised to an explicit null-like state; the first successful
  // database fetch will populate it with the real authoritative values.
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

  // Health check & Active Call polling
  useEffect(() => {
    async function loadHealthAndCalls() {
      try {
        const data = await fetchHealth();
        setHealthStatus(data);
      } catch (err) {
        console.error('Failed to connect to System 2 Backend Engine', err);
      }

      try {
        const callInfo = await fetchActiveCall();
        if (callInfo && callInfo.has_active_call && callInfo.status === 'ACTIVE') {
          setActiveCall(callInfo);
          setSelectedCallId(callInfo.call_id);
        } else if (callInfo && !callInfo.has_active_call) {
          setActiveCall((prev) => (prev?.status === 'ACTIVE' ? null : prev));
        }
      } catch (_) {}
    }

    loadHealthAndCalls();
    const interval = setInterval(loadHealthAndCalls, 3000);
    return () => clearInterval(interval);
  }, []);

  // Global QA State & Call Signal Synchronization at App Root
  useEffect(() => {
    let isMounted = true;

    const syncQAState = async () => {
      // fetchQAState returns null on error — do NOT overwrite existing state on null
      const state = await fetchQAState();
      if (!isMounted) return;
      if (state && state.enabled !== undefined) {
        // Valid state from database — update authoritative QA state
        setQaState(state);
      }
      // If state is null (network error / backend down) — keep existing state unchanged
    };

    // Initial database load
    syncQAState();

    // 2.5s database polling fallback (guarantees multi-device sync even if WebSocket disconnects)
    const qaTimer = setInterval(syncQAState, 2500);

    // Persistent App-level WebSocket for global events (CALL_STARTED, CALL_ENDED, QA_MODE_UPDATED)
    // This stays alive for the lifetime of the app regardless of which tab is active.
    let ws = null;
    let wsReconnectTimer = null;

    function connectAppWs() {
      if (!isMounted) return;
      try {
        const wsUrl = `${WS_BASE}/events`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.info('[APP-WS] Global events WebSocket connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.event === 'CALL_STARTED' || data.type === 'CALL_STARTED') {
              console.info(`[CALL-EVENT] type=CALL_STARTED call_id=${data.call_id}`);
              console.info(`[CALL-CONNECT] call_id=${data.call_id}`);
              if (isMounted) {
                setActiveCall(data);
                setSelectedCallId(data.call_id);
                // AUTO-NAVIGATE to Live Analysis so the analyst sees the call immediately
                setActiveTab('live-call');
              }
            } else if (data.event === 'CALL_ENDED' || data.type === 'CALL_ENDED') {
              console.info(`[CALL-EVENT] type=CALL_ENDED call_id=${data.call_id}`);
              if (isMounted) {
                // Only clear activeCall if it matches the ended call_id
                setActiveCall((prev) => {
                  if (!prev) return null;
                  if (prev.call_id === data.call_id) return null;
                  return prev;
                });
              }
            } else if (data.event === 'QA_MODE_UPDATED' || data.type === 'QA_MODE_UPDATED') {
              // Real-time QA mode broadcast from backend — this is the authoritative push channel
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

        ws.onerror = () => {
          console.warn('[APP-WS] Global events WebSocket error');
        };

        ws.onclose = (ev) => {
          console.info(`[APP-WS] Global events WebSocket closed (code=${ev.code})`);
          // Auto-reconnect after 3 seconds if app is still mounted
          if (isMounted) {
            wsReconnectTimer = setTimeout(connectAppWs, 3000);
          }
        };
      } catch (err) {
        console.warn('[APP-WS] Failed to open global events WebSocket:', err);
        if (isMounted) {
          wsReconnectTimer = setTimeout(connectAppWs, 5000);
        }
      }
    }

    connectAppWs();

    return () => {
      isMounted = false;
      clearInterval(qaTimer);
      clearTimeout(wsReconnectTimer);
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

        {/* LiveCallUI is ALWAYS mounted and its visibility is toggled via CSS.
            This preserves the WebSocket connection and audio pipeline across all tab navigation.
            The WebSocket only closes when CALL_ENDED is received for the active call_id. */}
        <div style={{ display: activeTab === 'live-call' ? 'block' : 'none' }}>
          <LiveCallUI
            initialCallId={selectedCallId}
            activeCall={activeCall}
            onOpenWhyThisScore={handleOpenWhyThisScore}
            globalQAState={qaState}
          />
        </div>

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
