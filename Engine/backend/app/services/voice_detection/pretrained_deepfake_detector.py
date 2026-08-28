import os
import io
import time
import math
import logging
from typing import Dict, Optional, List, Union

import numpy as np
import soundfile as sf

from app.services.voice_detection.free_detector import free_detector

logger = logging.getLogger("nirbhaya.pretrained_deepfake_detector")

# Global flag: Set to "true" only when running locally with PyTorch/Transformers installed
PRETRAINED_ENABLED_ENV = os.getenv("PRETRAINED_DETECTOR_ENABLED", "false").lower() in ("true", "1", "yes")


class PretrainedDeepfakeDetector:
    """
    Pretrained Deepfake Audio Detector using Hugging Face model: Sara1708/deepfake-audio-wav2vec2
    Lazy-loaded: Only initialized when PRETRAINED_DETECTOR_ENABLED=true and torch is installed.
    Zero memory overhead in production (<512MB RAM constraint on Render).
    """
    def __init__(self):
        self.model_repo: str = "Sara1708/deepfake-audio-wav2vec2"
        self.backbone_name: str = "facebook/wav2vec2-base"
        self.checkpoint_filename: str = "stage2_best.pt"
        self.target_sample_rate: int = 16000
        self.target_samples_per_window: int = 64000  # 4 seconds at 16kHz
        
        self.enabled: bool = PRETRAINED_ENABLED_ENV
        self.model = None
        self.device: str = "cpu"
        self.is_ready: bool = False
        self.init_error: Optional[str] = None
        
        # Per-call window prediction histories
        self.call_histories: Dict[str, List[float]] = {}
        self.max_history_length: int = 10

        # Lazy initialization only if explicitly enabled
        if self.enabled:
            self.initialize()
        else:
            self.init_error = "PRETRAINED_DETECTOR_DISABLED"

    def initialize(self) -> bool:
        """
        Loads the pretrained Wav2Vec2 backbone and checkpoint weights lazily.
        Does NOT execute during standard production startup or module import.
        """
        if self.is_ready and self.model is not None:
            return True

        if not self.enabled:
            self.is_ready = False
            self.init_error = "PRETRAINED_DETECTOR_DISABLED"
            return False

        start_time = time.time()
        try:
            # Lazy import heavy PyTorch / Transformers dependencies
            import torch
            import torch.nn as nn
            from transformers import Wav2Vec2Model
            from huggingface_hub import hf_hub_download

            class _LazyDeepfakeWav2Vec2Classifier(nn.Module):
                def __init__(self, backbone_name: str = "facebook/wav2vec2-base"):
                    super().__init__()
                    try:
                        self.backbone = Wav2Vec2Model.from_pretrained(backbone_name, local_files_only=True)
                    except Exception:
                        self.backbone = Wav2Vec2Model.from_pretrained(backbone_name)
                    self.classifier = nn.Linear(768, 2)

                def forward(self, input_values: torch.Tensor, attention_mask: Optional[torch.Tensor] = None) -> torch.Tensor:
                    outputs = self.backbone(input_values=input_values, attention_mask=attention_mask)
                    pooled = outputs.last_hidden_state.mean(dim=1)
                    logits = self.classifier(pooled)
                    return logits

            logger.info(f"[PRETRAINED-INIT] Loading backbone {self.backbone_name} and checkpoint {self.model_repo}...")
            print(f"[PRETRAINED-INIT] Initializing {self.model_repo} on {self.device.upper()}...")
            
            # Download/locate cached checkpoint
            try:
                ckpt_path = hf_hub_download(
                    repo_id=self.model_repo,
                    filename=self.checkpoint_filename,
                    local_files_only=True
                )
            except Exception:
                ckpt_path = hf_hub_download(
                    repo_id=self.model_repo,
                    filename=self.checkpoint_filename
                )
            
            classifier_model = _LazyDeepfakeWav2Vec2Classifier(backbone_name=self.backbone_name)
            checkpoint_data = torch.load(ckpt_path, map_location=self.device)
            state_dict = checkpoint_data.get("model_state_dict", checkpoint_data)
            classifier_model.load_state_dict(state_dict, strict=True)
            
            classifier_model.to(self.device)
            classifier_model.eval()
            
            self.model = classifier_model
            self.is_ready = True
            self.init_error = None
            
            load_dur = round((time.time() - start_time), 2)
            logger.info(f"[PRETRAINED-READY] Model {self.model_repo} loaded in {load_dur}s")
            print(f"[PRETRAINED-READY] Model {self.model_repo} loaded successfully in {load_dur}s [STATUS: ONLINE]")
            return True
        except ImportError as ie:
            self.is_ready = False
            self.init_error = f"Dependencies not installed: {ie}"
            logger.info("[PRETRAINED-DETECTOR] PyTorch/Transformers not installed. Using lightweight local detector.")
            return False
        except Exception as e:
            self.is_ready = False
            self.init_error = str(e)
            logger.error(f"[PRETRAINED-INIT-ERROR] Failed to load {self.model_repo}: {e}")
            print(f"[PRETRAINED-INIT-ERROR] Failed to load {self.model_repo}: {e}")
            return False

    def _prepare_waveform(self, raw_audio: Union[np.ndarray, bytes], sample_rate: int = 16000) -> Optional[np.ndarray]:
        """Normalizes input audio to 16kHz mono float32 waveform in [-1.0, 1.0]."""
        try:
            if isinstance(raw_audio, bytes):
                try:
                    audio_array, sr = sf.read(io.BytesIO(raw_audio), dtype='float32')
                except Exception:
                    audio_array = np.frombuffer(raw_audio, dtype=np.int16).astype(np.float32) / 32768.0
                    sr = sample_rate
            elif isinstance(raw_audio, np.ndarray):
                audio_array = raw_audio.astype(np.float32)
                sr = sample_rate
            else:
                return None

            if audio_array.ndim > 1:
                audio_array = np.mean(audio_array, axis=-1)
            audio_array = audio_array.flatten()

            if sr != self.target_sample_rate and len(audio_array) > 0:
                import scipy.signal
                gcd = math.gcd(int(sr), int(self.target_sample_rate))
                up = self.target_sample_rate // gcd
                down = sr // gcd
                audio_array = scipy.signal.resample_poly(audio_array, up, down).astype(np.float32)

            return audio_array
        except Exception as e:
            logger.error(f"[PREPROCESS ERROR] {e}")
            return None

    def _evaluate_tensor_window(self, window_waveform: np.ndarray) -> Dict[str, float]:
        """Runs forward pass on a 4-second (64,000 samples) window waveform."""
        import torch
        target_len = self.target_samples_per_window
        if len(window_waveform) < target_len:
            pad_width = target_len - len(window_waveform)
            window_waveform = np.pad(window_waveform, (0, pad_width), mode='constant')
        elif len(window_waveform) > target_len:
            window_waveform = window_waveform[:target_len]

        input_tensor = torch.tensor(window_waveform, dtype=torch.float32).unsqueeze(0).to(self.device)
        with torch.no_grad():
            logits = self.model(input_tensor)
            probs = torch.softmax(logits, dim=-1)[0]
            bonafide_prob = float(probs[0].item())
            synthetic_prob = float(probs[1].item())

        confidence = float(max(bonafide_prob, synthetic_prob))
        return {
            "bonafide_prob": bonafide_prob,
            "synthetic_prob": synthetic_prob,
            "confidence": confidence
        }

    def predict_window(self, pcm16_bytes: bytes) -> Dict[str, Union[float, str, bool]]:
        """Predicts bonafide vs synthetic on a 16-bit PCM 16kHz mono audio chunk."""
        if not self.is_ready or self.model is None:
            return free_detector.predict_audio_chunk(pcm16_bytes)

        t_start = time.time()
        waveform = self._prepare_waveform(pcm16_bytes, sample_rate=16000)
        if waveform is None or len(waveform) < 1600:
            return {
                "available": True,
                "status": "NO_VOICE",
                "synthetic_probability": None,
                "authenticity": None,
                "confidence": None,
                "label": None,
                "detector_source": "PRETRAINED_WAV2VEC2",
                "model": self.model_repo
            }

        rms = float(np.sqrt(np.mean(waveform ** 2)))
        if rms < 0.005:
            return {
                "available": True,
                "status": "NO_VOICE",
                "synthetic_probability": None,
                "authenticity": None,
                "confidence": None,
                "label": None,
                "detector_source": "PRETRAINED_WAV2VEC2",
                "model": self.model_repo
            }

        eval_res = self._evaluate_tensor_window(waveform)
        synth_prob = eval_res["synthetic_prob"]
        authenticity = eval_res["bonafide_prob"]
        confidence = eval_res["confidence"]

        synth_pct = synth_prob * 100.0
        if synth_pct >= 70.0:
            label = "SYNTHETIC"
            verdict = "SYNTHETIC"
        elif synth_pct >= 30.0:
            label = "SUSPICIOUS"
            verdict = "UNCERTAIN"
        else:
            label = "REAL"
            verdict = "AUTHENTIC"

        latency_ms = round((time.time() - t_start) * 1000.0, 2)
        return {
            "synthetic_probability": round(synth_pct / 100.0, 4),
            "authenticity": round(authenticity, 4),
            "confidence": round(confidence, 4),
            "label": label,
            "verdict": verdict,
            "detector_source": "PRETRAINED_WAV2VEC2",
            "model": self.model_repo,
            "inference_time_ms": latency_ms
        }

    def predict_audio(self, audio_bytes: bytes) -> Dict[str, Union[float, str, bool]]:
        """Processes arbitrary audio bytes (WAV/PCM/etc.) and runs pretrained inference."""
        if not self.is_ready or self.model is None:
            return free_detector.predict_audio_chunk(audio_bytes)

        t_start = time.time()
        waveform = self._prepare_waveform(audio_bytes)
        if waveform is None or len(waveform) < 1600:
            return {
                "available": True,
                "status": "NO_VOICE",
                "synthetic_probability": None,
                "authenticity": None,
                "confidence": None,
                "label": None,
                "detector_source": "PRETRAINED_WAV2VEC2",
                "model": self.model_repo
            }

        target_len = self.target_samples_per_window
        if len(waveform) <= target_len:
            eval_res = self._evaluate_tensor_window(waveform)
            synth_prob = eval_res["synthetic_prob"]
            authenticity = eval_res["bonafide_prob"]
            confidence = eval_res["confidence"]
        else:
            hop = target_len // 2
            window_synth_probs = []
            window_auth_probs = []
            for start_idx in range(0, len(waveform) - target_len + 1, hop):
                chunk = waveform[start_idx:start_idx + target_len]
                res = self._evaluate_tensor_window(chunk)
                window_synth_probs.append(res["synthetic_prob"])
                window_auth_probs.append(res["bonafide_prob"])

            synth_prob = float(np.median(window_synth_probs)) if window_synth_probs else 0.0
            authenticity = float(np.median(window_auth_probs)) if window_auth_probs else 1.0
            confidence = float(max(synth_prob, authenticity))

        synth_pct = synth_prob * 100.0
        if synth_pct >= 70.0:
            label = "SYNTHETIC"
            verdict = "SYNTHETIC"
        elif synth_pct >= 30.0:
            label = "SUSPICIOUS"
            verdict = "UNCERTAIN"
        else:
            label = "REAL"
            verdict = "AUTHENTIC"

        latency_ms = round((time.time() - t_start) * 1000.0, 2)
        return {
            "synthetic_probability": round(synth_pct / 100.0, 4),
            "authenticity": round(authenticity, 4),
            "confidence": round(confidence, 4),
            "label": label,
            "verdict": verdict,
            "detector_source": "PRETRAINED_WAV2VEC2",
            "model": self.model_repo,
            "inference_time_ms": latency_ms
        }

    def predict_file(self, file_path: str) -> Dict[str, Union[float, str, bool]]:
        """Loads an audio file from disk path and predicts deepfake authenticity."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        with open(file_path, "rb") as f:
            audio_bytes = f.read()
        return self.predict_audio(audio_bytes)

    async def send_audio_chunk(self, call_id: str, audio_bytes: bytes, window_index: int) -> Dict:
        """WebSocket stream chunk processing endpoint."""
        if not self.is_ready or self.model is None:
            fallback_res = await free_detector.send_audio_chunk(call_id, audio_bytes, window_index)
            fallback_res["detector_source"] = "LOCAL_AI"
            fallback_res["source"] = "LOCAL_AI"
            return fallback_res

        t_start = time.time()
        waveform = self._prepare_waveform(audio_bytes)
        
        if waveform is None or len(waveform) < 1600:
            return {
                "available": True,
                "status": "NO_VOICE",
                "source": "PRETRAINED_WAV2VEC2",
                "detector_source": "PRETRAINED_WAV2VEC2",
                "model": self.model_repo,
                "model_name": f"{self.model_repo} (Wav2Vec2)",
                "label": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": None,
                "aggregated_score": None,
                "consistency": None,
                "verdict": "NO_VOICE"
            }

        rms = float(np.sqrt(np.mean(waveform ** 2)))
        if rms < 0.005:
            return {
                "available": True,
                "status": "NO_VOICE",
                "source": "PRETRAINED_WAV2VEC2",
                "detector_source": "PRETRAINED_WAV2VEC2",
                "model": self.model_repo,
                "model_name": f"{self.model_repo} (Wav2Vec2)",
                "label": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": None,
                "aggregated_score": None,
                "consistency": None,
                "verdict": "NO_VOICE"
            }

        eval_res = self._evaluate_tensor_window(waveform)
        current_synth_prob = eval_res["synthetic_prob"] * 100.0
        current_auth_score = eval_res["bonafide_prob"] * 100.0
        confidence = eval_res["confidence"]

        if call_id not in self.call_histories:
            self.call_histories[call_id] = []
        
        history = self.call_histories[call_id]
        history.append(current_synth_prob)
        if len(history) > self.max_history_length:
            history.pop(0)

        if len(history) >= 3:
            if len(history) >= 5:
                sorted_hist = sorted(history)
                trimmed = sorted_hist[1:-1]
                agg_synth_prob = float(np.mean(trimmed))
            else:
                agg_synth_prob = float(np.median(history))
        else:
            agg_synth_prob = current_synth_prob

        agg_synth_prob = round(max(0.0, min(100.0, agg_synth_prob)), 2)
        agg_auth_score = round(max(0.0, min(100.0, 100.0 - agg_synth_prob)), 2)

        std_dev = float(np.std(history)) if len(history) > 1 else 0.0
        consistency = round(max(0.70, 1.0 - (std_dev / 50.0)), 2)

        if agg_synth_prob >= 70.0:
            label = "SYNTHETIC"
            verdict = "SYNTHETIC"
        elif agg_synth_prob >= 30.0:
            label = "SUSPICIOUS"
            verdict = "UNCERTAIN"
        else:
            label = "REAL"
            verdict = "AUTHENTIC"

        latency_ms = round((time.time() - t_start) * 1000.0, 2)
        return {
            "available": True,
            "status": "ACTIVE",
            "source": "PRETRAINED_WAV2VEC2",
            "detector_source": "PRETRAINED_WAV2VEC2",
            "model": self.model_repo,
            "model_name": f"{self.model_repo} (Wav2Vec2)",
            "license": "Apache-2.0 / Open-Source Pretrained Model",
            "label": label,
            "synthetic_probability": agg_synth_prob,
            "authenticity_score": agg_auth_score,
            "synthetic_probability_raw": round(agg_synth_prob / 100.0, 4),
            "authenticity": round(agg_auth_score / 100.0, 4),
            "confidence": round(confidence, 4),
            "window_synthetic_probability": round(current_synth_prob, 2),
            "aggregated_synthetic_probability": agg_synth_prob,
            "aggregated_score": round(agg_synth_prob / 100.0, 4),
            "consistency": consistency,
            "verdict": verdict,
            "inference_time_ms": latency_ms,
            "history_length": len(history)
        }

    async def close_stream(self, call_id: str) -> Optional[Dict]:
        """Cleans up session history for a completed call."""
        if call_id in self.call_histories:
            history = self.call_histories.pop(call_id)
            return {"call_id": call_id, "windows_analyzed": len(history)}
        return None

    def get_health_status(self) -> Dict:
        """Health status reporting."""
        if not self.enabled:
            return {
                "status": "DISABLED",
                "message": "Pretrained Wav2Vec2 detector is disabled on production runtime (<512MB RAM mode)",
                "details": {
                    "enabled": False,
                    "status": "DISABLED",
                    "model": self.model_repo,
                    "loaded": False
                }
            }
        return {
            "status": "ONLINE" if self.is_ready else "ERROR",
            "message": "Pretrained Wav2Vec2 Deepfake Detector ready" if self.is_ready else f"Error: {self.init_error}",
            "details": {
                "enabled": True,
                "status": "ONLINE" if self.is_ready else "ERROR",
                "model": self.model_repo,
                "loaded": self.is_ready,
                "sample_rate": self.target_sample_rate,
                "window_seconds": 4
            }
        }


pretrained_detector = PretrainedDeepfakeDetector()
