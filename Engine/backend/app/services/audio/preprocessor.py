import io
import time
import math
import numpy as np
import soundfile as sf
import torch
import torchaudio

class AudioPreprocessor:
    def __init__(self, target_sample_rate: int = 16000):
        self.target_sample_rate = target_sample_rate

    def process_audio_bytes(self, audio_bytes: bytes) -> dict:
        """
        Processes raw audio bytes in memory (short-term buffer).
        Resamples, converts to mono, normalizes amplitude, runs VAD, and measures audio quality.
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

        # Ensure 2D tensor (channels, samples)
        if audio_data.ndim == 1:
            tensor = torch.from_numpy(audio_data).unsqueeze(0)
        else:
            tensor = torch.from_numpy(audio_data.T)

        channels = tensor.shape[0]

        # Convert to mono by averaging channels if multi-channel
        if channels > 1:
            tensor = torch.mean(tensor, dim=0, keepdim=True)
            channels = 1

        # Resample to target sample rate if necessary
        if sr != self.target_sample_rate:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=self.target_sample_rate)
            tensor = resampler(tensor)
            sr = self.target_sample_rate

        samples = tensor.shape[1]
        duration_ms = (samples / sr) * 1000.0

        # Normalization (Peak / RMS amplitude scaling)
        max_val = torch.max(torch.abs(tensor))
        if max_val > 0:
            normalized_tensor = tensor / max_val
        else:
            normalized_tensor = tensor

        # Energy-based Voice Activity Detection (VAD)
        rms_energy = torch.sqrt(torch.mean(normalized_tensor ** 2)).item()
        speech_detected = rms_energy > 0.005 # VAD threshold

        # Audio Quality measurement (SNR estimate & clipping check)
        clipped_ratio = (torch.sum(torch.abs(tensor) >= 0.99).item() / max(1, samples))
        snr_db = 20.0 * math.log10(max(rms_energy, 1e-6) / 1e-4)
        
        # Quality score 0.0 to 1.0 based on clipping and SNR
        quality_penalty = min(1.0, clipped_ratio * 5.0)
        audio_quality_score = max(0.1, min(1.0, (snr_db / 40.0) - quality_penalty))

        processing_time_ms = (time.time() - start_time) * 1000.0

        return {
            "tensor": normalized_tensor,
            "sample_rate": sr,
            "channels": channels,
            "duration_ms": round(duration_ms, 2),
            "speech_detected": speech_detected,
            "rms_energy": round(rms_energy, 4),
            "audio_quality_score": round(audio_quality_score, 2),
            "preprocessing_time_ms": round(processing_time_ms, 2)
        }

preprocessor = AudioPreprocessor()
