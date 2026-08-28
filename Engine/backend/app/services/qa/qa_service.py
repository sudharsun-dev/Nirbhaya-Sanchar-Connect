import random
import asyncio
import logging
from typing import Dict, Any, Literal, Optional
from datetime import datetime, timezone

logger = logging.getLogger("nirbhaya.qa_service")

QAScenarioType = Literal["LOW", "MEDIUM", "HIGH"]

class GlobalQAService:
    """
    Global QA Test State Manager for Nirbhaya Sanchar System 2.
    Synchronizes test scenario state across all connected browser clients via Render backend.
    Persists configuration in the backend database (qa_state table).
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

        # Try to asynchronously persist to database if event loop is running
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(self.sync_to_db(self._enabled, self._scenario))
        except Exception:
            pass

        return self.get_state()

    async def load_from_db(self) -> Dict[str, Any]:
        """
        Loads the persistent QA state from the database on startup.
        """
        try:
            from app.database.session import AsyncSessionLocal
            from app.database.models import QAStateRecord
            from sqlalchemy.future import select

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(QAStateRecord).where(QAStateRecord.id == "global_qa")
                )
                record = result.scalars().first()
                if record:
                    self._enabled = record.enabled
                    self._scenario = record.scenario if record.scenario in ["LOW", "MEDIUM", "HIGH"] else "LOW"
                    if record.updated_at:
                        self._updated_at = record.updated_at.isoformat()
                    if self._scenario == "HIGH":
                        self._current_score = 95.4
                    elif self._scenario == "MEDIUM":
                        self._current_score = 55.1
                    else:
                        self._current_score = 14.2
                    logger.info(f"[QA-DB-LOAD] Successfully restored QA state: enabled={self._enabled} scenario={self._scenario}")
                    print(f"[QA-DB-LOAD] Restored QA state from DB: enabled={self._enabled} scenario={self._scenario}")
        except Exception as e:
            logger.warning(f"[QA-DB-LOAD] Notice: Could not load QA state from DB: {e}")
        return self.get_state()

    async def sync_to_db(self, enabled: bool, scenario: str):
        """
        Persists QA state into the database record.
        """
        try:
            from app.database.session import AsyncSessionLocal
            from app.database.models import QAStateRecord
            from sqlalchemy.future import select

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(QAStateRecord).where(QAStateRecord.id == "global_qa")
                )
                record = result.scalars().first()
                now = datetime.now(timezone.utc)
                if record:
                    record.enabled = enabled
                    record.scenario = scenario
                    record.updated_at = now
                else:
                    record = QAStateRecord(
                        id="global_qa",
                        enabled=enabled,
                        scenario=scenario,
                        updated_at=now
                    )
                    session.add(record)
                await session.commit()
                logger.info(f"[QA-DB-SAVE] Persisted QA state to DB: enabled={enabled} scenario={scenario}")
        except Exception as e:
            logger.warning(f"[QA-DB-SAVE] Warning persisting QA state to DB: {e}")

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

        # Controlled random walk step (maximum +/- 1.2, drift slightly towards center)
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
