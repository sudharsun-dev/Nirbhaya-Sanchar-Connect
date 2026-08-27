// System 1 Integration Client for Nirbhaya Sanchar Engine (System 2)

const defaultHttp = 'http://localhost:8000/api/v1';
const defaultWs = 'ws://localhost:8000/ws';

function resolveEngineHttp() {
  const raw = (import.meta.env.VITE_ENGINE_HTTP_URL || defaultHttp).replace(/\/$/, '');
  if (!raw.endsWith('/api/v1')) {
    return `${raw}/api/v1`;
  }
  return raw;
}

function resolveEngineWs() {
  if (import.meta.env.VITE_ENGINE_WS_URL) {
    let ws = import.meta.env.VITE_ENGINE_WS_URL.replace(/\/$/, '');
    if (!ws.endsWith('/ws')) ws = `${ws}/ws`;
    return ws;
  }
  const httpUrl = (import.meta.env.VITE_ENGINE_HTTP_URL || defaultHttp).replace(/\/$/, '');
  let wsUrl = httpUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  wsUrl = wsUrl.replace(/\/api\/v1\/?$/i, '');
  if (!wsUrl.endsWith('/ws')) {
    wsUrl = `${wsUrl}/ws`;
  }
  return wsUrl;
}

const ENGINE_HTTP_BASE = resolveEngineHttp();
const ENGINE_WS_BASE = resolveEngineWs();

let socket = null;
let listeners = [];

/**
 * Encodes raw Float32 audio samples into a standard 16-bit mono PCM WAV ArrayBuffer.
 */
function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

export function connectEngineStream(analysisId, onEventCallback) {
  if (socket) {
    try {
      socket.close();
    } catch (_) {}
    socket = null;
  }

  const wsUrl = `${ENGINE_WS_BASE}/analysis/${analysisId}`;
  console.info(`[ENGINE] Connecting to WebSocket: ${wsUrl}`);
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.info(`[ENGINE] websocket=${wsUrl} connected=true`);
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'RISK_UPDATED') {
        console.info(`[RISK] score=${data.risk_score} level=${data.risk_level} action=${data.recommended_action}`);
        if (data.synthetic_probability !== undefined) {
          console.info(`[AASIST] inference completed synthetic_probability=${data.synthetic_probability}%`);
        }
      }
      if (onEventCallback) onEventCallback(data);
      listeners.forEach((listener) => listener(data));
    } catch (e) {
      console.error('[SYSTEM 1] Failed to parse Engine event payload', e);
    }
  };

  socket.onerror = (err) => {
    console.warn('[SYSTEM 1] System 2 Engine WebSocket error', err);
  };

  socket.onclose = () => {
    console.info('[SYSTEM 1] System 2 Engine WebSocket disconnected');
  };

  return () => {
    if (socket) {
      try {
        socket.close();
      } catch (_) {}
      socket = null;
    }
  };
}

export function onRiskEvent(callback) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

export async function notifyEngineStartCall(callPayload) {
  try {
    const response = await fetch(`${ENGINE_HTTP_BASE}/analysis/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callPayload),
    });
    if (!response.ok) {
      console.warn(`[SYSTEM 1] Engine start API returned HTTP ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.warn('[SYSTEM 1] Unable to reach System 2 Engine API', err);
    return null;
  }
}

/**
 * Starts real-time Web Audio API PCM capture from a live MediaStreamTrack
 * and streams 2.5s WAV chunks directly into System 2 Engine.
 */
export function startAudioStreamToEngine(analysisId, mediaStreamTrack, options = {}) {
  if (!mediaStreamTrack || mediaStreamTrack.readyState === 'ended') {
    console.warn('[SYSTEM 1] Invalid or ended audio track provided for engine streaming');
    return () => {};
  }

  const targetSampleRate = options.sampleRate || 16000;
  const chunkDurationSec = options.chunkDurationSec || 2.5;
  const samplesPerChunk = Math.floor(targetSampleRate * chunkDurationSec);

  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let audioBuffer = [];
  let windowIndex = 0;
  let isStreaming = true;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass({ sampleRate: targetSampleRate });
    const mediaStream = new MediaStream([mediaStreamTrack]);
    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    // Buffer size 4096 frames
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);

    processorNode.onaudioprocess = (audioProcessingEvent) => {
      if (!isStreaming) return;
      const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);

      // Accumulate samples
      for (let i = 0; i < inputData.length; i++) {
        audioBuffer.push(inputData[i]);
      }

      if (audioBuffer.length >= samplesPerChunk) {
        windowIndex += 1;
        const chunkSamples = new Float32Array(audioBuffer.slice(0, samplesPerChunk));
        audioBuffer = audioBuffer.slice(samplesPerChunk);

        // Compute RMS energy
        let sumSq = 0;
        for (let i = 0; i < chunkSamples.length; i++) {
          sumSq += chunkSamples[i] * chunkSamples[i];
        }
        const rmsEnergy = Math.sqrt(sumSq / chunkSamples.length);

        // Encode to WAV binary buffer
        const wavBuffer = encodeWav(chunkSamples, targetSampleRate);

        // Send over active WebSocket if available, otherwise fallback to HTTP
        const speechDetected = rmsEnergy > 0.005;
        console.info(`[AUDIO-TAP] call_id=${analysisId} chunk=${windowIndex} sample_rate=${targetSampleRate} channels=1 samples=${chunkSamples.length} bytes=${wavBuffer.byteLength} rms=${rmsEnergy.toFixed(4)} speech_detected=${speechDetected}`);

        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(wavBuffer);
        } else {
          // Fallback HTTP multipart upload
          const blob = new Blob([wavBuffer], { type: 'audio/wav' });
          const formData = new FormData();
          formData.append('file', blob, `chunk_${windowIndex}.wav`);
          formData.append('window_index', String(windowIndex));

          fetch(`${ENGINE_HTTP_BASE}/analysis/${analysisId}/audio`, {
            method: 'POST',
            body: formData,
          }).catch((err) => {
            console.warn('[SYSTEM 1] HTTP audio chunk upload fallback error', err);
          });
        }

        options.onChunkSent?.({
          windowIndex,
          byteCount: wavBuffer.byteLength,
          durationMs: (samplesPerChunk / targetSampleRate) * 1000,
          rmsEnergy,
        });
      }
    };

    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    console.info('[SYSTEM 1] Real audio tap initialized and streaming to Engine:', analysisId);
  } catch (err) {
    console.error('[SYSTEM 1] Failed to initialize Web Audio tap for Engine streaming', err);
  }

  return () => {
    isStreaming = false;
    try {
      if (processorNode && sourceNode) {
        processorNode.disconnect();
        sourceNode.disconnect();
      }
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
      }
    } catch (_) {}
    console.info('[SYSTEM 1] Real audio streaming tap stopped for analysis:', analysisId);
  };
}