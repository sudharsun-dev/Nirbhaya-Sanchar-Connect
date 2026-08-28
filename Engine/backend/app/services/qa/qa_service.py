import time
from typing import Dict, Any, Literal
from datetime import datetime, timezone

QAScenarioType = Literal["LOW", "MEDIUM", "HIGH"]

class GlobalQAService:
    """
    Global QA Test State Manager for Nirbhaya Sanchar System 2.
    Synchronizes test scenario state across all connected browser clients via Render backend.
    Protects production fraud callbacks and DB from simulated data.
    """
    def __init__(self):
        self._enabled: bool = False
        self._scenario: QAScenarioType = "HIGH"
        self._updated_at: str = datetime.now(timezone.utc).isoformat()

    def get_state(self) -> Dict[str, Any]:
        return {
            "enabled": self._enabled,
            "scenario": self._scenario,
            "updated_at": self._updated_at
        }

    def set_state(self, enabled: bool, scenario: QAScenarioType = "HIGH") -> Dict[str, Any]:
        self._enabled = bool(enabled)
        if scenario in ["LOW", "MEDIUM", "HIGH"]:
            self._scenario = scenario
        self._updated_at = datetime.now(timezone.utc).isoformat()
        return self.get_state()

    def is_enabled(self) -> bool:
        return self._enabled

    def get_scenario(self) -> QAScenarioType:
        return self._scenario

    def get_simulated_payload(self) -> Dict[str, Any]:
        """
        Generates simulated telemetry payload according to the selected QA scenario.
        Only used for UI visual testing when QA mode is active.
        """
        if self._scenario == "HIGH":
            return {
                "synthetic_probability": 98.6,
                "authenticity_score": 1.4,
                "confidence": 0.99,
                "risk_score": 98.6,
                "risk_level": "HIGH",
                "label": "SYNTHETIC",
                "verdict": "SYNTHETIC",
                "action": "HOLD",
                "recommended_action": "HOLD & INDEPENDENTLY VERIFY",
                "reasons": ["QA Simulated: Severe acoustic vocoder anomaly detected (Test Mode)"],
                "simulated": True
            }
        elif self._scenario == "MEDIUM":
            return {
                "synthetic_probability": 55.4,
                "authenticity_score": 44.6,
                "confidence": 0.85,
                "risk_score": 55.4,
                "risk_level": "MEDIUM",
                "label": "SUSPICIOUS",
                "verdict": "UNCERTAIN",
                "action": "VERIFY",
                "recommended_action": "STEP-UP AUTHENTICATION REQUIRED",
                "reasons": ["QA Simulated: Mild spectral phase inconsistency (Test Mode)"],
                "simulated": True
            }
        else: # LOW
            return {
                "synthetic_probability": 6.8,
                "authenticity_score": 93.2,
                "confidence": 0.95,
                "risk_score": 6.8,
                "risk_level": "LOW",
                "label": "REAL",
                "verdict": "AUTHENTIC",
                "action": "CONTINUE",
                "recommended_action": "CONTINUE",
                "reasons": ["QA Simulated: Natural human bio-signal verified (Test Mode)"],
                "simulated": True
            }

qa_service = GlobalQAService()
