import { supabase } from './supabase';

const VALID_MODES = ['REAL', 'LOW', 'MEDIUM', 'HIGH'];

let currentMode = 'REAL';
let isInitialized = false;
let subscription = null;
const listeners = new Set();

function validateMode(mode) {
  if (!mode || typeof mode !== 'string') return 'REAL';
  const upper = mode.toUpperCase();
  return VALID_MODES.includes(upper) ? upper : 'REAL';
}

function notifyListeners(mode) {
  listeners.forEach((callback) => {
    try {
      callback(mode);
    } catch (err) {
      console.warn('[GLOBAL-CONTROL] Callback execution error:', err);
    }
  });
}

/**
 * Initializes the global control service:
 * 1. Fetches current mode from global_system_control (id = 1).
 * 2. Subscribes to Supabase Realtime UPDATE events for public.global_system_control.
 */
export async function initGlobalControl() {
  if (isInitialized) return currentMode;
  isInitialized = true;
  console.info('[GLOBAL-CONTROL] initializing');

  if (!supabase) {
    console.warn('[GLOBAL-CONTROL] status=OFFLINE');
    console.info(`[GLOBAL-CONTROL] mode=${currentMode}`);
    return currentMode;
  }

  try {
    const { data, error } = await supabase
      .from('global_system_control')
      .select('id, mode, updated_at')
      .eq('id', 1)
      .single();

    if (error) {
      console.warn('[GLOBAL-CONTROL] status=OFFLINE');
      console.info(`[GLOBAL-CONTROL] mode=${currentMode}`);
    } else if (data && data.mode) {
      const mode = validateMode(data.mode);
      currentMode = mode;
      console.info(`[GLOBAL-CONTROL] mode=${currentMode}`);
      notifyListeners(currentMode);
    }
  } catch (err) {
    console.warn('[GLOBAL-CONTROL] status=OFFLINE');
    console.info(`[GLOBAL-CONTROL] mode=${currentMode}`);
  }

  // Subscribe to Realtime UPDATE events for global_system_control
  try {
    subscription = supabase
      .channel('global_system_control_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'global_system_control',
          filter: 'id=eq.1',
        },
        (payload) => {
          if (payload.new && payload.new.mode) {
            const newMode = validateMode(payload.new.mode);
            console.info(`[GLOBAL-CONTROL] database-update=${newMode}`);
            console.info(`[GLOBAL-CONTROL] mode=${newMode}`);
            currentMode = newMode;
            notifyListeners(currentMode);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.info('[GLOBAL-CONTROL] realtime=SUBSCRIBED');
          console.info('[GLOBAL-CONTROL] status=CONNECTED');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[GLOBAL-CONTROL] status=OFFLINE`);
        }
      });
  } catch (subErr) {
    console.warn('[GLOBAL-CONTROL] status=OFFLINE');
  }

  return currentMode;
}

/**
 * Returns the currently active global control mode ('REAL', 'LOW', 'MEDIUM', 'HIGH').
 */
export function getCurrentMode() {
  return currentMode;
}

/**
 * Updates the global control mode in Supabase database (global_system_control, id = 1).
 * Validates mode, updates row, updates local memory, and notifies listeners.
 */
export async function setMode(newMode) {
  const mode = validateMode(newMode);
  console.info(`[GLOBAL-CONTROL] mode=${mode}`);

  currentMode = mode;
  notifyListeners(currentMode);

  if (!supabase) {
    console.warn('[GLOBAL-CONTROL] status=OFFLINE');
    return currentMode;
  }

  try {
    const { data, error } = await supabase
      .from('global_system_control')
      .upsert({
        id: 1,
        mode: mode,
        updated_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.warn('[GLOBAL-CONTROL] status=OFFLINE');
    } else {
      console.info(`[GLOBAL-CONTROL] database-update=${mode}`);
    }
  } catch (err) {
    console.warn('[GLOBAL-CONTROL] status=OFFLINE');
  }

  return currentMode;
}

/**
 * Subscribes a listener callback (mode => void) to mode changes.
 * Returns an unsubscribe function.
 */
export function subscribeToModeChanges(callback) {
  if (typeof callback !== 'function') return () => {};

  listeners.add(callback);
  // Immediately call with current mode
  callback(currentMode);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Unsubscribes the realtime channel.
 */
export function unsubscribe() {
  if (subscription && supabase) {
    supabase.removeChannel(subscription);
    subscription = null;
  }
}
