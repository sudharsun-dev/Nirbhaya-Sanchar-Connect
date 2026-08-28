/**
 * globalControl.js
 *
 * QA Control Service — Supabase qa_control table is the SINGLE PERSISTENT SOURCE OF TRUTH.
 *
 * Table schema (Supabase):
 *   qa_control { id: 'global_qa', enabled: boolean, scenario: 'LOW'|'MEDIUM'|'HIGH', score: float, updated_at: timestamptz }
 *
 * Deterministic scores (NEVER random):
 *   LOW    → score = 15,  enabled = true
 *   MEDIUM → score = 55,  enabled = true
 *   HIGH   → score = 95,  enabled = true
 *   OFF    → enabled = false (scenario/score preserved)
 *
 * Rules:
 *  - NEVER overwrite database state with a default on startup failure.
 *  - NEVER reset enabled to false on navigation/unmount.
 *  - Supabase Realtime propagates changes to ALL open browsers instantly.
 *  - Backend POST /api/v1/qa/state is also called to broadcast QA_MODE_UPDATED via WebSocket.
 */

import { supabase } from './supabase';
import { updateQAState } from './api';

const QA_ROW_ID = 'global_qa';

const SCORE_MAP = {
  LOW: 15.0,
  MEDIUM: 55.0,
  HIGH: 95.0,
};

// In-memory state — only set from database reads, never defaulted on error
let _state = null; // null = not yet loaded
let _listeners = new Set();
let _realtimeChannel = null;
let _initialized = false;

function _notify(state) {
  _listeners.forEach((cb) => {
    try { cb(state); } catch (_) {}
  });
}

/**
 * Returns the current in-memory QA state, or null if not yet loaded.
 */
export function getQAState() {
  return _state;
}

/**
 * Subscribe to QA state changes. Callback is called immediately with current state (if loaded).
 * Returns an unsubscribe function.
 */
export function subscribeToQAChanges(callback) {
  if (typeof callback !== 'function') return () => {};
  _listeners.add(callback);
  // Immediately call with current state if available
  if (_state !== null) {
    try { callback(_state); } catch (_) {}
  }
  return () => _listeners.delete(callback);
}

/**
 * Initializes QA control:
 * 1. Fetches current row from Supabase qa_control.
 * 2. Subscribes to Supabase Realtime for instant cross-device sync.
 * Called once at App startup.
 */
export async function initQAControl() {
  if (_initialized) return _state;
  _initialized = true;

  console.info('[QA-CONTROL] Initializing from Supabase qa_control table');

  if (!supabase) {
    console.warn('[QA-CONTROL] Supabase client not available — QA sync disabled');
    return _state;
  }

  // 1. Fetch current authoritative state from database
  try {
    const { data, error } = await supabase
      .from('qa_control')
      .select('id, enabled, scenario, score, updated_at')
      .eq('id', QA_ROW_ID)
      .single();

    if (error) {
      console.warn('[QA-CONTROL] Could not read qa_control from Supabase:', error.message);
      // Do NOT set _state to a default — keep null so consumers know it's unloaded
    } else if (data) {
      _state = {
        enabled: Boolean(data.enabled),
        scenario: data.scenario || 'LOW',
        score: data.score ?? SCORE_MAP[data.scenario] ?? 15.0,
        updated_at: data.updated_at,
      };
      console.info(`[QA-DB-READ] enabled=${_state.enabled} scenario=${_state.scenario} score=${_state.score}`);
      _notify(_state);
    }
  } catch (err) {
    console.warn('[QA-CONTROL] Supabase fetch error:', err.message);
  }

  // 2. Subscribe to Realtime changes on qa_control
  try {
    _realtimeChannel = supabase
      .channel('qa_control_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qa_control',
          filter: `id=eq.${QA_ROW_ID}`,
        },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          const newState = {
            enabled: Boolean(row.enabled),
            scenario: row.scenario || 'LOW',
            score: row.score ?? SCORE_MAP[row.scenario] ?? 15.0,
            updated_at: row.updated_at,
          };
          _state = newState;
          console.info(`[QA-REALTIME] enabled=${newState.enabled} scenario=${newState.scenario} score=${newState.score}`);
          _notify(newState);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[QA-CONTROL] Supabase Realtime subscribed — multi-device sync ACTIVE');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[QA-CONTROL] Supabase Realtime disconnected');
        }
      });
  } catch (err) {
    console.warn('[QA-CONTROL] Supabase Realtime subscription failed:', err.message);
  }

  return _state;
}

/**
 * Updates QA state:
 * 1. Writes to Supabase qa_control (persists across devices and refreshes).
 * 2. Calls backend POST /api/v1/qa/state (broadcasts QA_MODE_UPDATED via WebSocket to all browsers).
 *
 * Deterministic scores only — never random.
 *
 * @param {boolean} enabled
 * @param {'LOW'|'MEDIUM'|'HIGH'} scenario
 */
export async function setQAState(enabled, scenario = 'HIGH') {
  const validScenarios = ['LOW', 'MEDIUM', 'HIGH'];
  const safeScenario = validScenarios.includes(scenario) ? scenario : 'LOW';
  const score = enabled ? (SCORE_MAP[safeScenario] ?? 15.0) : (_state?.score ?? 15.0);

  console.info(`[QA-SET] enabled=${enabled} scenario=${safeScenario} score=${score}`);

  // Optimistic local update (Realtime will also confirm this)
  const optimistic = { enabled: Boolean(enabled), scenario: safeScenario, score, updated_at: new Date().toISOString() };
  _state = optimistic;
  _notify(_state);

  // 1. Write to Supabase (persistent, cross-device)
  if (supabase) {
    try {
      const { error } = await supabase
        .from('qa_control')
        .upsert({
          id: QA_ROW_ID,
          enabled: Boolean(enabled),
          scenario: safeScenario,
          score,
          updated_at: new Date().toISOString(),
        });
      if (error) {
        console.warn('[QA-CONTROL] Supabase write failed:', error.message);
      } else {
        console.info(`[QA-DB-WRITE] enabled=${enabled} scenario=${safeScenario} score=${score}`);
      }
    } catch (err) {
      console.warn('[QA-CONTROL] Supabase upsert error:', err.message);
    }
  }

  // 2. Notify backend (for WebSocket QA_MODE_UPDATED broadcast)
  try {
    await updateQAState(Boolean(enabled), safeScenario);
    console.info('[QA-CONTROL] Backend notified — QA_MODE_UPDATED broadcast sent');
  } catch (err) {
    console.warn('[QA-CONTROL] Backend notify failed (non-critical):', err.message);
  }

  return _state;
}

/**
 * Unsubscribes the Supabase Realtime channel.
 * Only call this if you intentionally want to stop listening (e.g., app teardown).
 * Do NOT call on component unmount.
 */
export function unsubscribeQAControl() {
  if (_realtimeChannel && supabase) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

// ---------------------------------------------------------------------------
// Legacy compat shims — used by any remaining imports of the old API.
// These delegate to the new implementation.
// ---------------------------------------------------------------------------

export async function initGlobalControl() {
  return initQAControl();
}

export function getCurrentMode() {
  if (!_state) return 'REAL';
  if (!_state.enabled) return 'REAL';
  return _state.scenario || 'LOW';
}

export async function setMode(newMode) {
  if (newMode === 'REAL') {
    return setQAState(false, _state?.scenario || 'LOW');
  }
  return setQAState(true, newMode);
}

export function subscribeToModeChanges(callback) {
  // Bridge: convert new {enabled, scenario} state to the old 'REAL'/'LOW'/'MEDIUM'/'HIGH' string
  return subscribeToQAChanges((state) => {
    const mode = state && state.enabled ? (state.scenario || 'LOW') : 'REAL';
    try { callback(mode); } catch (_) {}
  });
}

export function unsubscribe() {
  unsubscribeQAControl();
}
