import { supabase } from './supabase';

const SCORE_MAP = {
  LOW: 15.0,
  MEDIUM: 55.0,
  HIGH: 95.0,
};

let _activeCall = null;
let _listeners = new Set();
let _realtimeChannel = null;
let _initialized = false;

function _notify(state) {
  _listeners.forEach((cb) => {
    try { cb(state); } catch (_) {}
  });
}

export function getActiveSystem2Call() {
  return _activeCall;
}

export function subscribeToSystem2Calls(callback) {
  if (typeof callback !== 'function') return () => {};
  _listeners.add(callback);
  if (_activeCall !== undefined) {
    try { callback(_activeCall); } catch (_) {}
  }
  return () => _listeners.delete(callback);
}

export async function initSystem2Calls() {
  if (_initialized) return _activeCall;
  _initialized = true;

  if (!supabase) {
    console.warn('[SYSTEM2] Supabase client not available — sync disabled');
    return null;
  }

  // 1. Fetch current active call from database
  try {
    const { data, error } = await supabase
      .from('system2_calls')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[SYSTEM2] Could not read system2_calls from Supabase:', error.message);
    } else if (data) {
      _activeCall = data;
      _notify(_activeCall);
    } else {
      _activeCall = null;
      _notify(_activeCall);
    }
  } catch (err) {
    console.warn('[SYSTEM2] Supabase fetch error:', err.message);
  }

  // 2. Subscribe to Realtime changes on system2_calls
  try {
    _realtimeChannel = supabase
      .channel('system2_calls_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'system2_calls',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new;
            if (row.status === 'ACTIVE') {
              _activeCall = row;
              _notify(_activeCall);
            } else if (row.status === 'ENDED' && _activeCall?.call_id === row.call_id) {
              _activeCall = null;
              _notify(_activeCall);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[SYSTEM2] Supabase Realtime subscribed for calls');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('[SYSTEM2] Supabase Realtime disconnected');
        }
      });
  } catch (err) {
    console.warn('[SYSTEM2] Supabase Realtime subscription failed:', err.message);
  }

  return _activeCall;
}

export async function startSystem2Call(scenario = 'HIGH') {
  if (!supabase) return null;
  const validScenarios = ['LOW', 'MEDIUM', 'HIGH'];
  const safeScenario = validScenarios.includes(scenario) ? scenario : 'LOW';
  const score = SCORE_MAP[safeScenario];
  const risk_level = safeScenario;
  const recommended_action = safeScenario === 'HIGH' ? 'HOLD' : safeScenario === 'MEDIUM' ? 'VERIFY' : 'CONTINUE';
  const call_id = 'system2-call-' + Math.random().toString(36).substring(2, 9);

  try {
    const { data, error } = await supabase
      .from('system2_calls')
      .insert({
        call_id,
        caller_id: 'System 2 Device A',
        receiver_id: 'System 2 Device B',
        status: 'ACTIVE',
        scenario: safeScenario,
        score,
        risk_level,
        recommended_action,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn('[SYSTEM2] Supabase insert failed:', error.message);
    } else {
      _activeCall = data;
      _notify(_activeCall);
      return data;
    }
  } catch (err) {
    console.warn('[SYSTEM2] Supabase insert error:', err.message);
  }
  return null;
}

export async function updateSystem2CallScenario(call_id, scenario) {
  if (!supabase) return null;
  const validScenarios = ['LOW', 'MEDIUM', 'HIGH'];
  const safeScenario = validScenarios.includes(scenario) ? scenario : 'LOW';
  const score = SCORE_MAP[safeScenario];
  const risk_level = safeScenario;
  const recommended_action = safeScenario === 'HIGH' ? 'HOLD' : safeScenario === 'MEDIUM' ? 'VERIFY' : 'CONTINUE';

  try {
    const { data, error } = await supabase
      .from('system2_calls')
      .update({
        scenario: safeScenario,
        score,
        risk_level,
        recommended_action,
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', call_id)
      .select()
      .single();

    if (error) {
      console.warn('[SYSTEM2] Supabase update failed:', error.message);
    } else {
      _activeCall = data;
      _notify(_activeCall);
      return data;
    }
  } catch (err) {
    console.warn('[SYSTEM2] Supabase update error:', err.message);
  }
  return null;
}

export async function endSystem2Call(call_id) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('system2_calls')
      .update({
        status: 'ENDED',
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', call_id);
    
    if (error) {
      console.warn('[SYSTEM2] Supabase end call failed:', error.message);
    } else {
      if (_activeCall?.call_id === call_id) {
        _activeCall = null;
        _notify(_activeCall);
      }
    }
  } catch (err) {
    console.warn('[SYSTEM2] Supabase end call error:', err.message);
  }
}
