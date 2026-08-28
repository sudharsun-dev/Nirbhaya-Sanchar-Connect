import random
from typing import Dict, Any, Literal, Optional
from datetime import datetime, timezone

QAScenarioType = Literal["LOW", "MEDIUM", "HIGH"]

class GlobalQAService:
    """
    Global QA Test State Manager for Nirbhaya Sanchar System 2.
    Synchronizes test scenario state across all connected browser clients via Render backend.
    Generates realistic, smoothed random-walk variations within each strict scenario range.
    Protects production fraud callbacks and DB from simulated data.
    """
    def __init__(self):
        self._enabled: bool = False
        self._scenario: QAScenarioType = "LOW"
        self._current_score: float = 14.2
        self._updated_at: str = datetime.now(timezone.utc).isoformat()

    def get_state(self) -> Dict[str, Any]:
        return {
            "enabled": self._enabled,
            "scenario": self._scenario,
            "updated_at": self._updated_at
        }

    def set_state(self, enabled: bool, scenario: QAScenarioType = "LOW") -> Dict[str, Any]:
        prev_scenario = self._scenario
        self._enabled = bool(enabled)
        if scenario in ["LOW", "MEDIUM", "HIGH"]:
            self._scenario = scenario
            if prev_scenario != scenario or not self._enabled:
                if scenario == "HIGH":
                    self._current_score = 95.4
                elif scenario == "MEDIUM":
                    self._current_score = 55.1
                else: # LOW
                    self._current_score = 14.2
        self._updated_at = datetime.now(timezone.utc).isoformat()
        return self.get_state()

    def is_enabled(self) -> bool:
        return self._enabled

    def get_scenario(self) -> QAScenarioType:
        return self._scenario

    def get_simulated_payload(self) -> Dict[str, Any]:
        """
        Returns the current simulated telemetry payload without advancing the random walk.
        """
        return self._build_payload(self._current_score)

    def get_next_simulated_payload(self) -> Dict[str, Any]:
        """
        Advances the controlled random walk by <= 3.0 points and returns a smoothed payload.
        Ensures strict range adherence:
          HIGH: 93.0 - 98.0
          MEDIUM: 45.0 - 65.0
          LOW: 5.0 - 25.0
        """
        if self._scenario == "HIGH":
            min_r, max_r, center = 93.0, 98.0, 95.5
        elif self._scenario == "MEDIUM":
            min_r, max_r, center = 45.0, 65.0, 55.0
        else: # LOW
            min_r, max_r, center = 5.0, 25.0, 15.0

        # Controlled random walk step (maximum +/- 1.5, drift slightly towards center)
        drift = (center - self._current_score) * 0.15
        delta = random.uniform(-1.2, 1.2) + drift
        step = max(-3.0, min(3.0, delta))

        self._current_score = max(min_r, min(max_r, self._current_score + step))
        return self._build_payload(self._current_score)

    def _build_payload(self, raw_score: float) -> Dict[str, Any]:
        score = round(raw_score, 1)
        auth_score = round(100.0 - score, 1)

        if self._scenario == "HIGH":
            return {
                "synthetic_probability": score,
                "authenticity_score": auth_score,
                "confidence": 0.98,
                "risk_score": score,
                "risk_level": "HIGH",
                "label": "SYNTHETIC",
                "verdict": "SYNTHETIC (SIMULATED)",
                "action": "HOLD / VERIFY",
                "recommended_action": "HOLD / VERIFY",
                "reasons": ["QA Simulated: Severe acoustic vocoder anomaly detected (Test Mode)"],
                "simulated": True
            }
        elif self._scenario == "MEDIUM":
            return {
                "synthetic_probability": score,
                "authenticity_score": auth_score,
                "confidence": 0.85,
                "risk_score": score,
                "risk_level": "MEDIUM",
                "label": "SUSPICIOUS",
                "verdict": "SUSPICIOUS (SIMULATED)",
                "action": "VERIFY IDENTITY",
                "recommended_action": "VERIFY IDENTITY",
                "reasons": ["QA Simulated: Mild spectral phase inconsistency (Test Mode)"],
                "simulated": True
            }
        else: # LOW
            return {
                "synthetic_probability": score,
                "authenticity_score": auth_score,
                "confidence": 0.95,
                "risk_score": score,
                "risk_level": "LOW",
                "label": "REAL",
                "verdict": "AUTHENTIC (SIMULATED)",
                "action": "CONTINUE",
                "recommended_action": "CONTINUE",
                "reasons": ["QA Simulated: Natural human bio-signal verified (Test Mode)"],
                "simulated": True
            }

qa_service = GlobalQAService()
