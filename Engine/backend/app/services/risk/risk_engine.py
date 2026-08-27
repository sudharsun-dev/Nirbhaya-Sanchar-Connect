from typing import Optional, Dict, Any, List

class RiskEngine:
    """
    Risk Intelligence Engine.
    Aggregates multi-modal signals (Voice Authenticity, Speaker Verification, Context Intelligence,
    Transaction Risk, Behavioral Signals) into a calibrated 0-100 overall risk score and risk level.
    Uses confidence-aware dynamic weighting so that unavailable models/signals do not distort the score.
    """
    def __init__(self):
        # Base signal weights when all models are available
        self.default_weights = {
            "voice_authenticity": 0.40,
            "speaker_similarity": 0.20,
            "context_score": 0.20,
            "transaction_score": 0.15,
            "behavior_score": 0.05
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
        Calculates confidence-weighted overall risk score (0-100), overall confidence, and risk level.
        """
        active_signals = {}
        confidence_factors = []
        reasons = []

        # 1. Voice Authenticity Signal (Synthetic Speech Anti-Spoofing)
        synth_prob = None
        if voice_result and voice_result.get("status") == "SUCCESS":
            synth_prob = voice_result.get("synthetic_probability")
            if synth_prob is not None:
                active_signals["voice_authenticity"] = synth_prob
                conf = voice_result.get("confidence", 0.8)
                confidence_factors.append(conf)
                if synth_prob >= 70.0:
                    reasons.append(f"Elevated synthetic-speech / voice impersonation signal ({synth_prob:.1f}% estimated synthetic probability)")
                elif synth_prob >= 40.0:
                    reasons.append(f"Moderate synthetic-speech signal detected ({synth_prob:.1f}% estimated synthetic probability)")

        # 2. Speaker Verification Signal
        speaker_sim = None
        if speaker_result and speaker_result.get("status") == "SUCCESS":
            speaker_sim = speaker_result.get("similarity_score")
            identity_status = speaker_result.get("identity_status")
            if speaker_sim is not None:
                # Convert similarity to risk (lower similarity = higher risk)
                speaker_risk = max(0.0, 100.0 - speaker_sim)
                active_signals["speaker_similarity"] = speaker_risk
                confidence_factors.append(speaker_result.get("confidence", 0.7))
                if identity_status == "MISMATCH":
                    reasons.append(f"Speaker identity mismatch (Similarity: {speaker_sim:.1f}%)")
                elif identity_status == "UNKNOWN":
                    reasons.append("Speaker identity unverified against target reference profile")

        # 3. Context Intelligence Signal
        context_score = None
        if context_result:
            context_score = context_result.get("context_score", 0.0)
            active_signals["context_score"] = context_score
            confidence_factors.append(0.90) # Rule-based context confidence
            risk_flags = context_result.get("risk_flags", [])
            for flag in risk_flags:
                reasons.append(f"Context risk: {flag}")

        # 4. Transaction Risk Signal
        tx_score = None
        if transaction_result:
            tx_score = transaction_result.get("transaction_score", 0.0)
            active_signals["transaction_score"] = tx_score
            confidence_factors.append(0.95) # Transaction schema confidence
            tx_factors = transaction_result.get("risk_factors", [])
            for factor in tx_factors:
                reasons.append(f"Transaction risk: {factor}")

        # 5. Behavioral Signals
        behavior_score = None
        if behavior_result:
            behavior_score = behavior_result.get("behavior_score", 0.0)
            active_signals["behavior_score"] = behavior_score
            confidence_factors.append(0.70)
            anomalies = behavior_result.get("anomalies", [])
            for anomaly in anomalies:
                reasons.append(f"Behavioral anomaly: {anomaly}")

        # Dynamic weight rescaling among active signals
        if not active_signals:
            # No active signals available
            return {
                "risk_score": 0.0,
                "risk_level": "LOW",
                "overall_confidence": 0.0,
                "synthetic_probability": None,
                "speaker_similarity": None,
                "context_score": None,
                "transaction_score": None,
                "behavior_score": None,
                "reasons": ["Insufficient data available to compute risk score"]
            }

        total_weight = sum(self.default_weights[k] for k in active_signals if k in self.default_weights)
        if total_weight == 0:
            total_weight = 1.0

        weighted_risk_sum = 0.0
        for signal_name, signal_val in active_signals.items():
            norm_weight = self.default_weights.get(signal_name, 0.1) / total_weight
            weighted_risk_sum += signal_val * norm_weight

        overall_risk_score = round(max(0.0, min(100.0, weighted_risk_sum)), 2)

        # Assign risk level (0-29 LOW, 30-69 MEDIUM, 70-100 HIGH)
        if overall_risk_score >= 70.0:
            risk_level = "HIGH"
        elif overall_risk_score >= 30.0:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        overall_confidence = round(sum(confidence_factors) / max(1, len(confidence_factors)), 2)

        if not reasons:
            reasons.append("Standard caller interactions within normal parameters")

        return {
            "risk_score": overall_risk_score,
            "risk_level": risk_level,
            "overall_confidence": overall_confidence,
            "synthetic_probability": synth_prob,
            "speaker_similarity": speaker_sim,
            "context_score": context_score,
            "transaction_score": tx_score,
            "behavior_score": behavior_score,
            "reasons": list(set(reasons))
        }

risk_engine = RiskEngine()
