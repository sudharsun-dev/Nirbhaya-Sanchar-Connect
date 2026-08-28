from typing import Optional, Dict, Any, List

class RiskEngine:
    """
    Risk Intelligence Engine.
    Evaluates real-time fraud and impersonation risk primarily based on
    authoritative Resemble AI streaming deepfake detection results.
    Deterministic risk mapping:
      - 0–29: LOW (CONTINUE)
      - 30–69: MEDIUM (VERIFY)
      - 70–100: HIGH (HOLD)
    When no real detection result exists yet or NO_VOICE is reported,
    scores remain None/null to prevent false 0% or false LOW displays.
    """
    def __init__(self):
        self.default_weights = {
            "voice_authenticity": 0.60,
            "speaker_similarity": 0.15,
            "context_score": 0.15,
            "transaction_score": 0.10
        }

    def compute_risk(
        self,
        voice_result: Optional[dict] = None,
        speaker_result: Optional[dict] = None,
        context_result: Optional[dict] = None,
        transaction_result: Optional[dict] = None,
        behavior_result: Optional[dict] = None
    ) -> dict:
        """
        Calculates deterministic overall risk score (0-100), risk level, and reasons.
        """
        reasons = []
        synth_prob = None
        auth_score = None
        voice_status = voice_result.get("status") if voice_result else None

        # Handle NO_VOICE state explicitly
        if voice_status == "NO_VOICE":
            return {
                "risk_score": None,
                "risk_level": "NO_VOICE",
                "action": "NO_VOICE",
                "overall_confidence": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "speaker_similarity": None,
                "context_score": None,
                "transaction_score": None,
                "behavior_score": None,
                "reasons": ["No voice detected in audio stream"]
            }

        # 1. Authoritative Voice Detection (Resemble AI)
        if voice_result and voice_status in ["ACTIVE", "SUCCESS"]:
            synth_prob = voice_result.get("synthetic_probability")
            if synth_prob is not None:
                auth_score = voice_result.get("authenticity_score")
                if auth_score is None:
                    auth_score = round(max(0.0, min(100.0, 100.0 - synth_prob)), 2)
                
                label = voice_result.get("label", "UNKNOWN")
                if synth_prob >= 70.0:
                    reasons.append(f"Voice AI Engine detected high deepfake probability ({synth_prob:.1f}% - {label})")
                elif synth_prob >= 30.0:
                    reasons.append(f"Voice AI Engine detected moderate synthetic voice indicators ({synth_prob:.1f}%)")
                else:
                    reasons.append(f"Voice AI Engine verified authentic voice patterns ({auth_score:.1f}% authenticity)")

        # If voice analysis is still pending/waiting
        if synth_prob is None:
            return {
                "risk_score": None,
                "risk_level": "ANALYSIS_WAITING",
                "action": "WAITING FOR ANALYSIS",
                "overall_confidence": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "speaker_similarity": None,
                "context_score": None,
                "transaction_score": None,
                "behavior_score": None,
                "reasons": ["Analysis waiting for incoming voice stream"]
            }

        # Compute deterministic risk score directly from Resemble AI detection
        overall_risk_score = round(max(0.0, min(100.0, float(synth_prob))), 2)

        # Contextual modifiers (e.g. suspicious transaction / phishing keywords)
        if context_result and context_result.get("context_score", 0.0) > 40.0:
            ctx_score = context_result["context_score"]
            overall_risk_score = round(min(100.0, overall_risk_score * 0.85 + ctx_score * 0.15), 2)
            for flag in context_result.get("risk_flags", []):
                reasons.append(f"Context risk: {flag}")

        # Deterministic Risk Level & Action mapping:
        # 0–29: LOW (CONTINUE)
        # 30–69: MEDIUM (VERIFY)
        # 70–100: HIGH (HOLD)
        if overall_risk_score >= 70.0:
            risk_level = "HIGH"
            action = "HOLD"
        elif overall_risk_score >= 30.0:
            risk_level = "MEDIUM"
            action = "VERIFY"
        else:
            risk_level = "LOW"
            action = "CONTINUE"

        confidence = voice_result.get("confidence")
        if confidence is None:
            confidence = 0.90 if synth_prob is not None else 0.0

        speaker_sim = speaker_result.get("similarity_score") if speaker_result else None
        context_score = context_result.get("context_score") if context_result else None
        tx_score = transaction_result.get("transaction_score") if transaction_result else None
        beh_score = behavior_result.get("behavior_score") if behavior_result else None

        return {
            "risk_score": overall_risk_score,
            "risk_level": risk_level,
            "action": action,
            "overall_confidence": confidence,
            "synthetic_probability": synth_prob,
            "authenticity_score": auth_score,
            "speaker_similarity": speaker_sim,
            "context_score": context_score,
            "transaction_score": tx_score,
            "behavior_score": beh_score,
            "reasons": list(dict.fromkeys(reasons))
        }

risk_engine = RiskEngine()

