import io
import time
import math
import numpy as np
import soundfile as sf
from scipy import signal

class AudioPreprocessor:
    def __init__(self, target_sample_rate: int = 16000):
        self.target_sample_rate = target_sample_rate

    def process_audio_bytes(self, audio_bytes: bytes) -> dict:
        """
        Processes raw audio bytes in memory (short-term buffer).
        Resamples, converts to mono, normalizes amplitude, runs VAD, and measures audio quality.
        Pure NumPy / SciPy implementation without PyTorch.
        Does NOT save audio to disk.
        """
        start_time = time.time()
        
        # Load audio from memory buffer
        try:
            audio_data, sr = sf.read(io.BytesIO(audio_bytes), dtype='float32')
        except Exception:
            # Fallback for raw PCM 16kHz 16-bit mono bytes
            audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            audio_data, sr = audio_array, 16000

        # Convert to mono by averaging channels if multi-channel
        if audio_data.ndim > 1:
            audio_data = np.mean(audio_data, axis=-1)
        
        # Ensure 1D array of float32
        audio_data = np.asarray(audio_data, dtype=np.float32).flatten()

        # Resample to target sample rate if necessary
        if sr != self.target_sample_rate and len(audio_data) > 0:
            gcd = math.gcd(int(sr), int(self.target_sample_rate))
            up = self.target_sample_rate // gcd
            down = sr // gcd
            audio_data = signal.resample_poly(audio_data, up, down).astype(np.float32)
            sr = self.target_sample_rate

        samples = len(audio_data)
        duration_ms = (samples / max(1, sr)) * 1000.0

        # Normalization (Peak amplitude scaling)
        max_val = float(np.max(np.abs(audio_data))) if samples > 0 else 0.0
        if max_val > 0:
            normalized_audio = audio_data / max_val
        else:
            normalized_audio = audio_data

        # Energy-based Voice Activity Detection (VAD)
        rms_energy = float(np.sqrt(np.mean(normalized_audio ** 2))) if samples > 0 else 0.0
        speech_detected = rms_energy > 0.005  # VAD threshold

        # Audio Quality measurement (SNR estimate & clipping check)
        clipped_count = int(np.sum(np.abs(audio_data) >= 0.99))
        clipped_ratio = float(clipped_count / max(1, samples))
        snr_db = 20.0 * math.log10(max(rms_energy, 1e-6) / 1e-4)
        
        # Quality score 0.0 to 1.0 based on clipping and SNR
        quality_penalty = min(1.0, clipped_ratio * 5.0)
        audio_quality_score = max(0.1, min(1.0, (snr_db / 40.0) - quality_penalty))

        processing_time_ms = (time.time() - start_time) * 1000.0

        return {
            "audio_data": normalized_audio,
            "sample_rate": sr,
            "channels": 1,
            "samples_count": samples,
            "duration_ms": round(duration_ms, 2),
            "speech_detected": speech_detected,
            "rms_energy": round(rms_energy, 4),
            "audio_quality_score": round(audio_quality_score, 2),
            "preprocessing_time_ms": round(processing_time_ms, 2)
        }

preprocessor = AudioPreprocessor()

