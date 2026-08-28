import asyncio
import logging
from typing import Dict, Any, Literal, Optional
from datetime import datetime, timezone

logger = logging.getLogger("nirbhaya.qa_service")

QAScenarioType = Literal["LOW", "MEDIUM", "HIGH"]

FIXED_QA_DATABASE_VALUES = {
    "LOW": {
        "score": 15.0,
        "authenticity": 85.0,
        "confidence": 95.0,
        "verdict": "AUTHENTIC",
        "risk_level": "LOW",
        "recommended_action": "CONTINUE",
        "reasons": ["QA Database: Natural human acoustic profile verified"]
    },
    "MEDIUM": {
        "score": 55.0,
        "authenticity": 45.0,
        "confidence": 95.0,
        "verdict": "SYNTHETIC",
        "risk_level": "MEDIUM",
        "recommended_action": "VERIFY",
        "reasons": ["QA Database: Spectral phase anomaly and vocoder artifacts detected"]
    },
    "HIGH": {
        "score": 95.0,
        "authenticity": 5.0,
        "confidence": 98.0,
        "verdict": "SYNTHETIC",
        "risk_level": "HIGH",
        "recommended_action": "HOLD",
        "reasons": ["QA Database: High-confidence synthetic voice clone identified"]
    }
}

class GlobalQAService:
    """
    Database-Backed Global QA Control Service for Nirbhaya Sanchar System 2.
    The database (qa_control table) is the AUTHORITATIVE SINGLE SOURCE OF TRUTH.
    Provides strictly deterministic, fixed database test values:
      LOW:    score = 15.0, authenticity = 85.0, confidence = 95.0, verdict = AUTHENTIC, risk_level = LOW, action = CONTINUE
      MEDIUM: score = 55.0, authenticity = 45.0, confidence = 95.0, verdict = SYNTHETIC, risk_level = MEDIUM, action = VERIFY
      HIGH:   score = 95.0, authenticity = 5.0,  confidence = 98.0, verdict = SYNTHETIC, risk_level = HIGH, action = HOLD
    NO random numbers or random walks.
    """
    def __init__(self):
        self._enabled: bool = False
        self._scenario: QAScenarioType = "LOW"
        self._updated_at: str = datetime.now(timezone.utc).isoformat()

    def get_state(self) -> Dict[str, Any]:
        spec = FIXED_QA_DATABASE_VALUES.get(self._scenario, FIXED_QA_DATABASE_VALUES["LOW"])
        return {
            "enabled": self._enabled,
            "scenario": self._scenario,
            "score": spec["score"],
            "authenticity": spec["authenticity"],
            "confidence": spec["confidence"],
            "verdict": spec["verdict"],
            "risk_level": spec["risk_level"],
            "recommended_action": spec["recommended_action"],
            "source": "QA_DATABASE",
            "updated_at": self._updated_at
        }

    def set_state(self, enabled: bool, scenario: QAScenarioType = "LOW") -> Dict[str, Any]:
        self._enabled = bool(enabled)
        if scenario in ["LOW", "MEDIUM", "HIGH"]:
            self._scenario = scenario
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
        Loads the authoritative persistent QA state from the database.
        If no record exists, creates the default row (enabled=False, scenario=LOW).
        NEVER resets enabled state if the row exists in database.
        """
        try:
            from app.database.session import AsyncSessionLocal
            from app.database.models import QAControlRecord
            from sqlalchemy.future import select

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(QAControlRecord).where(QAControlRecord.id == "global_qa")
                )
                record = result.scalars().first()
                if record:
                    self._enabled = bool(record.enabled)
                    self._scenario = record.scenario if record.scenario in ["LOW", "MEDIUM", "HIGH"] else "LOW"
                    if record.updated_at:
                        self._updated_at = record.updated_at.isoformat()
                    logger.info(f"[QA-DB-LOAD] Authoritative DB QA state loaded: enabled={self._enabled} scenario={self._scenario} score={record.score}")
                else:
                    # Initialize default record only once
                    spec = FIXED_QA_DATABASE_VALUES["LOW"]
                    now = datetime.now(timezone.utc)
                    new_record = QAControlRecord(
                        id="global_qa",
                        enabled=False,
                        scenario="LOW",
                        score=spec["score"],
                        authenticity=spec["authenticity"],
                        confidence=spec["confidence"],
                        verdict=spec["verdict"],
                        risk_level=spec["risk_level"],
                        recommended_action=spec["recommended_action"],
                        updated_at=now
                    )
                    session.add(new_record)
                    await session.commit()
                    self._enabled = False
                    self._scenario = "LOW"
                    self._updated_at = now.isoformat()
                    logger.info("[QA-DB-INIT] Initialized new qa_control record in database: enabled=False scenario=LOW")
        except Exception as e:
            logger.warning(f"[QA-DB-LOAD] Notice: Could not load QA state from DB: {e}")
        return self.get_state()

    async def sync_to_db(self, enabled: bool, scenario: str):
        """
        Persists authoritative QA control state into the qa_control database table.
        """
        self._enabled = bool(enabled)
        self._scenario = scenario if scenario in ["LOW", "MEDIUM", "HIGH"] else "LOW"
        spec = FIXED_QA_DATABASE_VALUES.get(self._scenario, FIXED_QA_DATABASE_VALUES["LOW"])
        now = datetime.now(timezone.utc)
        try:
            from app.database.session import AsyncSessionLocal
            from app.database.models import QAControlRecord
            from sqlalchemy.future import select

            spec = FIXED_QA_DATABASE_VALUES.get(scenario, FIXED_QA_DATABASE_VALUES["LOW"])
            now = datetime.now(timezone.utc)

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(QAControlRecord).where(QAControlRecord.id == "global_qa")
                )
                record = result.scalars().first()
                if record:
                    record.enabled = enabled
                    record.scenario = scenario
                    record.score = spec["score"]
                    record.authenticity = spec["authenticity"]
                    record.confidence = spec["confidence"]
                    record.verdict = spec["verdict"]
                    record.risk_level = spec["risk_level"]
                    record.recommended_action = spec["recommended_action"]
                    record.updated_at = now
                else:
                    record = QAControlRecord(
                        id="global_qa",
                        enabled=enabled,
                        scenario=scenario,
                        score=spec["score"],
                        authenticity=spec["authenticity"],
                        confidence=spec["confidence"],
                        verdict=spec["verdict"],
                        risk_level=spec["risk_level"],
                        updated_at=now
                    )
                    session.add(record)

                self._enabled = bool(enabled)
                self._scenario = scenario
                self._updated_at = now.isoformat()
                await session.commit()
                logger.info(f"[QA-DB-SAVE] Committed QA state to DB: enabled={enabled} scenario={scenario} score={spec['score']}")
        except Exception as e:
            logger.warning(f"[QA-DB-SAVE] Warning persisting QA state to DB: {e}")

    def is_enabled(self) -> bool:
        return self._enabled

    def get_scenario(self) -> QAScenarioType:
        return self._scenario

    def get_simulated_payload(self) -> Dict[str, Any]:
        """
        Returns the exact database-backed deterministic telemetry payload.
        """
        return self._build_payload()

    def get_next_simulated_payload(self) -> Dict[str, Any]:
        """
        Returns the exact database-backed deterministic telemetry payload.
        """
        return self._build_payload()

    def _build_payload(self) -> Dict[str, Any]:
        spec = FIXED_QA_DATABASE_VALUES.get(self._scenario, FIXED_QA_DATABASE_VALUES["LOW"])
        score = spec["score"]
        auth_score = spec["authenticity"]
        confidence = spec["confidence"]
        verdict = f"{spec['verdict']} (SIMULATED)" if self._enabled else spec["verdict"]
        risk_level = spec["risk_level"]
        action = spec["recommended_action"]
        reasons = spec["reasons"]

        return {
            "synthetic_probability": score,
            "authenticity_score": auth_score,
            "authenticity": auth_score,
            "confidence": confidence,
            "score": score,
            "risk_score": score,
            "risk_level": risk_level,
            "label": "SYNTHETIC" if score >= 50.0 else "REAL",
            "verdict": verdict,
            "action": action,
            "recommended_action": action,
            "reasons": reasons,
            "source": "QA_DATABASE",
            "simulated": True
        }

qa_service = GlobalQAService()
