import time
import math
import numpy as np
import torch
import torchaudio.transforms as T
from app.config import settings

class SpeakerVerificationEngine:
    """
    Speaker Identity & Verification Engine.
    Extracts acoustic speaker embeddings from audio windows and computes cosine similarity
    against registered reference voice embeddings.
    """
    def __init__(self):
        self.model_name = settings.SPEAKER_MODEL
        self.sample_rate = 16000
        self.mfcc_transform = T.MFCC(
            sample_rate=16000,
            n_mfcc=40,
            melkwargs={"n_fft": 512, "hop_length": 160, "n_mels": 60}
        )

    def extract_embedding(self, processed_audio: dict) -> np.ndarray:
        """
        Extracts a protected 80-dimensional acoustic speaker feature embedding vector.
        """
        tensor = processed_audio.get("tensor")
        if tensor is None or tensor.shape[1] < 1600:
            return None

        with torch.no_grad():
            mfcc = self.mfcc_transform(tensor) # (1, 40, frames)
            delta = torchaudio.functional.compute_deltas(mfcc)
            
            # Mean and Std pooling across frame dimension (Acoustic Spectral Vector)
            mean_pool = torch.mean(mfcc, dim=2).squeeze(0)
            std_pool = torch.std(mfcc, dim=2).squeeze(0)
            embedding_tensor = torch.cat([mean_pool, std_pool], dim=0) # (80,)

            # L2 normalize embedding
            norm = torch.norm(embedding_tensor)
            if norm > 0:
                embedding_tensor = embedding_tensor / norm
            
            return embedding_tensor.cpu().numpy()

    def compare_speaker(self, processed_audio: dict, reference_embedding: list = None) -> dict:
        """
        Compares current call audio embedding against target user's reference embedding.
        """
        start_time = time.time()

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
            dot_product = np.dot(current_emb, ref_emb)
            norm_a = np.linalg.norm(current_emb)
            norm_b = np.linalg.norm(ref_emb)

            if norm_a == 0 or norm_b == 0:
                similarity = 0.0
            else:
                similarity = float(dot_product / (norm_a * norm_b))

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
