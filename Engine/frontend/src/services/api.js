// System 2 API Client

function resolveApiBase() {
  const configured = (import.meta.env.VITE_ENGINE_HTTP_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (!configured || configured.includes('nirbhaya-connect-server') || configured.includes(':3001')) {
    return import.meta.env.DEV ? 'http://localhost:8000/api/v1' : 'https://nirbhaya-sanchar-connect-1.onrender.com/api/v1';
  }
  return configured.endsWith('/api/v1') ? configured : `${configured}/api/v1`;
}

export function resolveWsBase() {
  const configuredWs = import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_ENGINE_WS_URL;
  if (configuredWs && !configuredWs.includes('nirbhaya-connect-server') && !configuredWs.includes(':3001')) {
    let ws = configuredWs.replace(/\/$/, '');
    if (!ws.endsWith('/ws')) ws = `${ws}/ws`;
    return ws;
  }
  const apiBase = resolveApiBase();
  let wsUrl = apiBase.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  wsUrl = wsUrl.replace(/\/api\/v1\/?$/i, '');
  if (!wsUrl.endsWith('/ws')) {
    wsUrl = `${wsUrl}/ws`;
  }
  return wsUrl;
}

export const API_BASE = resolveApiBase();
export const WS_BASE = resolveWsBase();

export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[SYSTEM 2 API] Health check offline:', err.message);
    return { status: 'OFFLINE', services: {} };
  }
}

export async function fetchDashboardStats() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) throw new Error(`Stats returned ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[SYSTEM 2 API] Stats fetch failed:', err.message);
    return {
      active_calls: 0,
      calls_analyzed: 0,
      high_risk_calls: 0,
      pending_verifications: 0,
      recent_calls: [],
    };
  }
}

export async function startAnalysis(callData) {
  const res = await fetch(`${API_BASE}/analysis/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callData),
  });
  if (!res.ok) throw new Error(`Start analysis failed with HTTP ${res.status}`);
  return await res.json();
}

export async function getAnalysisRisk(analysisId) {
  const res = await fetch(`${API_BASE}/analysis/${analysisId}/risk`);
  if (!res.ok) throw new Error(`Get risk failed with HTTP ${res.status}`);
  return await res.json();
}

export async function getAnalysisExplanation(analysisId) {
  const res = await fetch(`${API_BASE}/analysis/${analysisId}/explanation`);
  if (!res.ok) throw new Error(`Get explanation failed with HTTP ${res.status}`);
  return await res.json();
}

export async function evaluatePolicy(analysisId, policyProfile = 'BANK') {
  const res = await fetch(`${API_BASE}/policy/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis_id: analysisId, policy_profile: policyProfile }),
  });
  if (!res.ok) throw new Error(`Evaluate policy failed with HTTP ${res.status}`);
  return await res.json();
}

export async function requestVerification(analysisId, callId, method = 'TRUSTED_CALLBACK') {
  const res = await fetch(`${API_BASE}/verification/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis_id: analysisId, call_id: callId, verification_method: method }),
  });
  if (!res.ok) throw new Error(`Verification request failed with HTTP ${res.status}`);
  return await res.json();
}

export async function fetchAuditLogs() {
  try {
    const res = await fetch(`${API_BASE}/audit/logs`);
    if (!res.ok) throw new Error(`Audit logs returned ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[SYSTEM 2 API] Audit logs failed:', err.message);
    return [];
  }
}
