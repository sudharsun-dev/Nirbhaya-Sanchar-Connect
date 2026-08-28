import time
import numpy as np
from scipy import signal
from app.config import settings

class SpeakerVerificationEngine:
    """
    Speaker Identity & Verification Engine.
    Extracts acoustic speaker embeddings from audio windows and computes cosine similarity
    against registered reference voice embeddings using pure NumPy and SciPy.
    """
    def __init__(self):
        self.model_name = settings.SPEAKER_MODEL
        self.sample_rate = 16000

    def extract_embedding(self, processed_audio: dict) -> np.ndarray:
        """
        Extracts an 80-dimensional acoustic speaker feature embedding vector using pure NumPy/SciPy.
        """
        audio = processed_audio.get("audio_data")
        if audio is None:
            tensor = processed_audio.get("tensor")
            if tensor is not None:
                audio = np.asarray(tensor).flatten()
        if audio is None or len(audio) < 1600:
            return None

        try:
            # Compute STFT spectrogram
            f, t, zxx = signal.stft(audio, fs=self.sample_rate, nperseg=512, noverlap=352)
            spec_mag = np.abs(zxx)  # (freq_bins, time_frames)
            
            # Log magnitude
            log_spec = np.log(np.maximum(spec_mag, 1e-6))
            
            # Pool into 40 frequency bands
            n_bands = 40
            band_size = max(1, log_spec.shape[0] // n_bands)
            bands = []
            for i in range(n_bands):
                start = i * band_size
                end = (i + 1) * band_size if i < n_bands - 1 else log_spec.shape[0]
                bands.append(np.mean(log_spec[start:end, :], axis=0))
            band_matrix = np.array(bands)  # (40, time_frames)
            
            # Mean and Std pooling across time dimension -> 80 dimensions
            mean_pool = np.mean(band_matrix, axis=1)  # (40,)
            std_pool = np.std(band_matrix, axis=1)    # (40,)
            embedding = np.concatenate([mean_pool, std_pool], axis=0).astype(np.float32)  # (80,)

            # L2 normalize embedding
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding = embedding / norm
            
            return embedding
        except Exception:
            return None

    def compare_speaker(self, processed_audio: dict, reference_embedding: list = None) -> dict:
        """
        Compares current call audio embedding against target user's reference embedding.
        """
        if reference_embedding is None:
            return {
                "identity_status": "UNKNOWN",
                "similarity_score": None,
                "confidence": 0.0,
                "status": "NO_REFERENCE_VOICE_PROFILE",
                "model_name": self.model_name
            }

        current_emb = self.extract_embedding(processed_audio)
        if current_emb is None:
            return {
                "identity_status": "INSUFFICIENT_AUDIO",
                "similarity_score": None,
                "confidence": 0.0,
                "status": "INSUFFICIENT_AUDIO_SAMPLES",
                "model_name": self.model_name
            }

        try:
            ref_emb = np.array(reference_embedding, dtype=np.float32)
            
            # Cosine similarity
            dot_product = float(np.dot(current_emb, ref_emb))
            norm_a = float(np.linalg.norm(current_emb))
            norm_b = float(np.linalg.norm(ref_emb))

            if norm_a == 0 or norm_b == 0:
                similarity = 0.0
            else:
                similarity = dot_product / (norm_a * norm_b)

            similarity_pct = round(max(0.0, min(100.0, (similarity + 1.0) / 2.0 * 100.0)), 2)

            # Assign identity status based on similarity threshold
            if similarity_pct >= 75.0:
                status = "MATCHED"
            elif similarity_pct <= 45.0:
                status = "MISMATCH"
            else:
                status = "UNKNOWN"

            audio_quality = processed_audio.get("audio_quality_score", 1.0)
            confidence = round(max(0.30, min(0.95, audio_quality * 0.90)), 2)

            return {
                "identity_status": status,
                "similarity_score": similarity_pct,
                "confidence": confidence,
                "status": "SUCCESS",
                "model_name": self.model_name
            }

        except Exception as e:
            return {
                "identity_status": "UNKNOWN",
                "similarity_score": None,
                "confidence": 0.0,
                "status": f"ERROR: {str(e)}",
                "model_name": self.model_name
            }

speaker_verifier = SpeakerVerificationEngine()

