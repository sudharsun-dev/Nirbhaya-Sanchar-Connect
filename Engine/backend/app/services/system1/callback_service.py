import time
import httpx
from datetime import datetime
from app.config import settings

class CallbackService:
    """
    System 1 Callback Service.
    Dispatches real-time risk updates, policy decisions, and security alerts to System 1.
    """
    def __init__(self):
        self.callback_url = settings.resolved_system1_callback_url
        self.api_key = settings.SYSTEM1_API_KEY

    async def send_callback(
        self,
        event: str,
        call_id: str,
        analysis_id: str,
        risk_output: dict,
        policy_output: dict,
        verification_required: bool = False,
        ensemble_res: Optional[dict] = None,
        window_index: int = 1
    ) -> dict:
        """
        Sends HTTP POST callback payload to System 1.
        """
        if not self.callback_url:
            return {"status": "SKIPPED", "reason": "SYSTEM1_CALLBACK_URL not configured"}

        aasist_data = ensemble_res.get("aasist", {}) if ensemble_res else {}
        resemble_data = ensemble_res.get("resemble", {}) if ensemble_res else {}
        synth_prob = risk_output.get("synthetic_probability")
        auth_score = round(100.0 - synth_prob, 2) if synth_prob is not None else None

        payload = {
            "event": event,
            "call_id": call_id,
            "analysis_id": analysis_id,
            "window_index": window_index,
            "risk_score": risk_output.get("risk_score", 0.0),
            "risk_level": risk_output.get("risk_level", "LOW"),
            "action": policy_output.get("recommended_action", "CONTINUE"),
            "recommended_action": policy_output.get("recommended_action", "CONTINUE"),
            "policy_decision": policy_output.get("recommended_action", "CONTINUE"),
            "synthetic_probability": synth_prob,
            "authenticity_score": auth_score,
            "confidence": risk_output.get("overall_confidence", 0.0),
            "model_confidence": risk_output.get("overall_confidence", 0.0),
            "speaker_similarity": risk_output.get("speaker_similarity"),
            "audio_quality": risk_output.get("audio_quality", 1.0),
            "detectors": {
                "aasist": aasist_data.get("synthetic_probability") is not None or aasist_data.get("status") == "SUCCESS",
                "resemble": resemble_data.get("synthetic_probability") is not None or resemble_data.get("status") in ["ACTIVE", "SUCCESS"]
            },
            "aasist_synthetic_probability": aasist_data.get("synthetic_probability"),
            "resemble_synthetic_probability": resemble_data.get("synthetic_probability"),
            "detector_agreement": ensemble_res.get("detector_agreement", "UNAVAILABLE") if ensemble_res else "UNAVAILABLE",
            "context_score": risk_output.get("context_score"),
            "transaction_score": risk_output.get("transaction_score"),
            "behavior_score": risk_output.get("behavior_score"),
            "reasons": policy_output.get("reasons", risk_output.get("reasons", [])),
            "verification_required": verification_required,
            "timestamp": datetime.utcnow().isoformat()
        }

        key_val = str(self.api_key or settings.INTERNAL_API_KEY or "nirbhaya_default_engine_key")
        headers = {
            "Content-Type": "application/json",
            "X-Nirbhaya-Engine-Key": key_val
        }

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.post(self.callback_url, json=payload, headers=headers)
                return {
                    "status": "SENT" if response.status_code < 400 else "FAILED",
                    "http_status": response.status_code
                }
        except Exception as e:
            # System 1 offline gracefully reported
            return {
                "status": "OFFLINE",
                "error": str(e)
            }

callback_service = CallbackService()
