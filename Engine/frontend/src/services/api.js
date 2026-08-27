const configuredBase = import.meta.env.VITE_API_BASE_URL ? import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '') : '';
const API_BASE = `${configuredBase}/api/v1`;

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchDashboardStats() {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  return res.json();
}

export async function startAnalysis(callData) {
  const res = await fetch(`${API_BASE}/analysis/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callData)
  });
  return res.json();
}

export async function sendAudioChunk(analysisId, blob, windowIndex = 1, transcriptOverride = '') {
  const formData = new FormData();
  formData.append('file', blob, 'chunk.wav');
  formData.append('window_index', windowIndex);
  if (transcriptOverride) {
    formData.append('transcript_override', transcriptOverride);
  }

  const res = await fetch(`${API_BASE}/analysis/${analysisId}/audio`, {
    method: 'POST',
    body: formData
  });
  return res.json();
}

export async function getAnalysisRisk(analysisId) {
  const res = await fetch(`${API_BASE}/analysis/${analysisId}/risk`);
  return res.json();
}

export async function getAnalysisExplanation(analysisId) {
  const res = await fetch(`${API_BASE}/analysis/${analysisId}/explanation`);
  return res.json();
}

export async function evaluatePolicy(analysisId, policyProfile = 'BANK') {
  const res = await fetch(`${API_BASE}/policy/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis_id: analysisId, policy_profile: policyProfile })
  });
  return res.json();
}

export async function requestVerification(analysisId, callId, method = 'TRUSTED_CALLBACK') {
  const res = await fetch(`${API_BASE}/verification/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ analysis_id: analysisId, call_id: callId, verification_method: method })
  });
  return res.json();
}

export async function fetchAuditLogs() {
  const res = await fetch(`${API_BASE}/audit/logs`);
  return res.json();
}
