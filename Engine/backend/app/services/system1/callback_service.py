import time
import httpx
from datetime import datetime
from typing import Optional
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
        resemble_res: Optional[dict] = None,
        window_index: int = 1
    ) -> dict:
        """
        Sends HTTP POST callback payload to System 1.
        """
        if not self.callback_url:
            return {"status": "SKIPPED", "reason": "SYSTEM1_CALLBACK_URL not configured"}

        synth_prob = risk_output.get("synthetic_probability")
        auth_score = risk_output.get("authenticity_score")
        label = resemble_res.get("label") if resemble_res else ("FAKE" if synth_prob and synth_prob >= 50.0 else "REAL" if synth_prob is not None else None)

        payload = {
            "event": event,
            "call_id": call_id,
            "analysis_id": analysis_id,
            "window_index": window_index,
            "detector": "RESEMBLE",
            "synthetic_probability": synth_prob,
            "authenticity_score": auth_score,
            "confidence": risk_output.get("overall_confidence"),
            "risk_score": risk_output.get("risk_score"),
            "risk_level": risk_output.get("risk_level", "LOW"),
            "action": policy_output.get("recommended_action", risk_output.get("action", "CONTINUE")),
            "recommended_action": policy_output.get("recommended_action", risk_output.get("action", "CONTINUE")),
            "label": label,
            "speaker_similarity": risk_output.get("speaker_similarity"),
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

