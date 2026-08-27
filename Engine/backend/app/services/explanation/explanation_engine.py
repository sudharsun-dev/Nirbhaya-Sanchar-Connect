class ExplanationEngine:
    """
    Explanation Engine.
    Provides complete, transparent, and auditable evidence summaries for every security decision.
    Matches actual triggered signals to human-readable explanations.
    """
    def generate_explanation(self, risk_output: dict, analysis_id: str, call_id: str) -> dict:
        """
        Builds the explanation response object.
        """
        reasons = risk_output.get("reasons", [])
        risk_score = risk_output.get("risk_score", 0.0)
        risk_level = risk_output.get("risk_level", "LOW")

        signals_breakdown = {
            "synthetic_speech": {
                "signal_name": "Voice Anti-Spoofing (Synthetic Probability)",
                "value": risk_output.get("synthetic_probability"),
                "unit": "%",
                "status": "EVALUATED" if risk_output.get("synthetic_probability") is not None else "UNAVAILABLE"
            },
            "speaker_identity": {
                "signal_name": "Speaker Identity Match",
                "value": risk_output.get("speaker_similarity"),
                "unit": "% Similarity",
                "status": "EVALUATED" if risk_output.get("speaker_similarity") is not None else "NO_REFERENCE_PROFILE"
            },
            "context_intelligence": {
                "signal_name": "Transcript & Intent Analysis",
                "value": risk_output.get("context_score"),
                "unit": "/ 100",
                "status": "EVALUATED" if risk_output.get("context_score") is not None else "NO_TRANSCRIPT"
            },
            "transaction_risk": {
                "signal_name": "Financial Action Risk",
                "value": risk_output.get("transaction_score"),
                "unit": "/ 100",
                "status": "EVALUATED" if risk_output.get("transaction_score") is not None else "NO_TRANSACTION"
            },
            "behavioral_signals": {
                "signal_name": "Acoustic Speech Cadence",
                "value": risk_output.get("behavior_score"),
                "unit": "/ 100",
                "status": "EVALUATED" if risk_output.get("behavior_score") is not None else "UNAVAILABLE"
            }
        }

        return {
            "analysis_id": analysis_id,
            "call_id": call_id,
            "risk_score": risk_score,
            "risk_level": risk_level,
            "reasons": reasons,
            "signals_breakdown": signals_breakdown
        }

explanation_engine = ExplanationEngine()
