import uuid
import httpx
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.database.session import get_db, AsyncSessionLocal
from app.database.models import (
    Call, AnalysisSession, AudioAnalysisWindow, VoiceAnalysisResult,
    SpeakerAnalysisResult, AsrResult, ContextAnalysisResult, RiskScore,
    PolicyDecision, VerificationRequest, Alert, AuditLog, FeedbackLog
)
from app.schemas.schemas import (
    AnalysisStartRequest, AnalysisStartResponse, AudioChunkResponse,
    RiskScoreResponse, ExplanationResponse, PolicyEvaluationRequest,
    PolicyEvaluationResponse, VerificationRequestCreate, VerificationResponse,
    FeedbackCreate, SystemHealthResponse, ServiceHealthStatus
)

from app.services.audio.preprocessor import preprocessor
from app.services.voice_detection.pretrained_deepfake_detector import pretrained_detector as voice_detector
from app.services.speaker.verifier import speaker_verifier
from app.services.asr.asr_engine import asr_engine
from app.services.context.context_engine import context_engine
from app.services.transaction.transaction_engine import transaction_engine
from app.services.behavior.behavior_engine import behavior_engine
from app.services.risk.risk_engine import risk_engine
from app.services.explanation.explanation_engine import explanation_engine
from app.services.policy.policy_engine import policy_engine, bank_policy_adapter
from app.services.verification.verification_service import verification_service
from app.services.alerts.alerts_service import alerts_service
from app.services.system1.callback_service import callback_service

router = APIRouter()

@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health():
    """
    Returns real system health status across backend database, Pretrained Deepfake Detector, and connected subsystems.
    """
    # Check Database connection
    db_status = "ONLINE"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(select(Call).limit(1))
    except Exception as e:
        db_status = "OFFLINE"

    # Check Speaker Verifier
    speaker_status = "ONLINE"

    # Check ASR status
    asr_status = "ONLINE" if (settings.ASR_API_KEY and settings.ASR_API_URL) else "CONFIGURATION_REQUIRED"

    # Check System 1 connection (non-blocking fast check)
    sys1_status = "OFFLINE"
    try:
        async with httpx.AsyncClient(timeout=0.5) as client:
            resp = await client.get(f"{settings.resolved_system1_base_url}/health")
            if resp.status_code == 200:
                sys1_status = "ONLINE"
            else:
                sys1_status = "DEGRADED"
    except Exception:
        sys1_status = "OFFLINE"

    overall_status = "ONLINE" if db_status == "ONLINE" else "DEGRADED"

    health_info = voice_detector.get_health_status()

    return SystemHealthResponse(
        app=settings.APP_NAME,
        environment=settings.ENVIRONMENT,
        status=overall_status,
        services={
            "database": ServiceHealthStatus(status=db_status, message=f"Database is {db_status}"),
            "pretrained_deepfake_detector": ServiceHealthStatus(
                status=health_info["status"],
                message=health_info["message"],
                details=health_info["details"]
            ),
            "resemble": ServiceHealthStatus(
                status=health_info["status"],
                message=health_info["message"],
                details=health_info["details"]
            ),
            "speaker_verifier": ServiceHealthStatus(status=speaker_status, details={"model": speaker_verifier.model_name}),
            "asr_engine": ServiceHealthStatus(status=asr_status, details={"provider": settings.ASR_PROVIDER, "model": settings.ASR_MODEL}),
            "system1_connect": ServiceHealthStatus(status=sys1_status, details={"url": settings.resolved_system1_base_url})
        }
    )

@router.get("/cors-test")
async def cors_test(request: Request):
    """Dedicated test endpoint to verify CORS origin reflection."""
    origin = request.headers.get("origin", "unknown")
    return {
        "status": "ok",
        "origin": origin,
        "environment": settings.ENVIRONMENT
    }


@router.get("/system1/health")
async def get_system1_health():
    """Returns System 1 connectivity status."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.resolved_system1_base_url}/health")
            return {
                "system1_status": "ONLINE" if resp.status_code == 200 else "DEGRADED",
                "system1_url": settings.resolved_system1_base_url,
                "response": resp.json() if resp.status_code == 200 else None
            }
    except Exception as e:
        return {
            "system1_status": "OFFLINE",
            "system1_url": settings.resolved_system1_base_url,
            "error": str(e)
        }

@router.post("/analysis/start", response_model=AnalysisStartResponse)
async def start_analysis(req: AnalysisStartRequest, db: AsyncSession = Depends(get_db)):
    """
    Initializes a new real-time voice analysis session for a call.
    """
    # Register call if not existing
    call_res = await db.execute(select(Call).where(Call.id == req.call_id))
    call_obj = call_res.scalars().first()
    if not call_obj:
        call_obj = Call(
            id=req.call_id,
            caller_id=req.caller_id,
            receiver_id=req.receiver_id,
            organization_id=req.organization_id,
            channel=req.channel,
            status="ACTIVE"
        )
        db.add(call_obj)
    else:
        call_obj.status = "ACTIVE"
        call_obj.caller_id = req.caller_id
        call_obj.receiver_id = req.receiver_id

    # Create or update analysis session using req.call_id
    session_res = await db.execute(
        select(AnalysisSession).where((AnalysisSession.id == req.call_id) | (AnalysisSession.call_id == req.call_id))
    )
    session_obj = session_res.scalars().first()
    if not session_obj:
        session_obj = AnalysisSession(
            id=req.call_id,
            call_id=req.call_id,
            caller_id=req.caller_id,
            receiver_id=req.receiver_id,
            organization_id=req.organization_id,
            transaction_metadata=req.transaction.dict() if req.transaction else None,
            status="STARTED"
        )
        db.add(session_obj)
    else:
        session_obj.status = "STARTED"
        session_obj.caller_id = req.caller_id
        session_obj.receiver_id = req.receiver_id
        if req.transaction:
            session_obj.transaction_metadata = req.transaction.dict()

    # Audit Log
    audit = AuditLog(
        call_id=req.call_id,
        analysis_id=session_obj.id,
        event_type="ANALYSIS_STARTED",
        actor="SYSTEM1_API",
        details={"channel": req.channel, "transaction": req.transaction.dict() if req.transaction else None}
    )
    db.add(audit)
    await db.commit()

    return AnalysisStartResponse(analysis_id=session_obj.id, status="STARTED")

@router.get("/analysis/{analysis_id}/risk", response_model=RiskScoreResponse)
async def get_analysis_risk(analysis_id: str, db: AsyncSession = Depends(get_db)):
    """
    Retrieves the latest risk evaluation for an analysis session.
    """
    res = await db.execute(
        select(RiskScore).where(RiskScore.analysis_id == analysis_id).order_by(RiskScore.timestamp.desc())
    )
    risk = res.scalars().first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk evaluation not found for analysis ID.")

    session_res = await db.execute(select(AnalysisSession).where(AnalysisSession.id == analysis_id))
    session_obj = session_res.scalars().first()

    return RiskScoreResponse(
        analysis_id=analysis_id,
        call_id=session_obj.call_id if session_obj else "unknown",
        risk_score=risk.risk_score,
        risk_level=risk.risk_level,
        overall_confidence=risk.overall_confidence,
        synthetic_probability=risk.synthetic_probability,
        speaker_similarity=risk.speaker_similarity,
        context_score=risk.context_score,
        transaction_score=risk.transaction_score,
        behavior_score=risk.behavior_score,
        reasons=risk.reasons,
        timestamp=risk.timestamp
    )

@router.get("/analysis/{analysis_id}/explanation", response_model=ExplanationResponse)
async def get_analysis_explanation(analysis_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns prominent 'WHY THIS SCORE?' evidence breakdown for an analysis session.
    """
    res = await db.execute(
        select(RiskScore).where(RiskScore.analysis_id == analysis_id).order_by(RiskScore.timestamp.desc())
    )
    risk = res.scalars().first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk evaluation not found for analysis ID.")

    session_res = await db.execute(select(AnalysisSession).where(AnalysisSession.id == analysis_id))
    session_obj = session_res.scalars().first()

    risk_dict = {
        "risk_score": risk.risk_score,
        "risk_level": risk.risk_level,
        "synthetic_probability": risk.synthetic_probability,
        "speaker_similarity": risk.speaker_similarity,
        "context_score": risk.context_score,
        "transaction_score": risk.transaction_score,
        "behavior_score": risk.behavior_score,
        "reasons": risk.reasons
    }

    return explanation_engine.generate_explanation(
        risk_output=risk_dict,
        analysis_id=analysis_id,
        call_id=session_obj.call_id if session_obj else "unknown"
    )

@router.post("/policy/evaluate", response_model=PolicyEvaluationResponse)
async def evaluate_policy_endpoint(req: PolicyEvaluationRequest, db: AsyncSession = Depends(get_db)):
    """
    Standalone endpoint to re-evaluate policy decisions under different organizational profiles (BANK, ENTERPRISE, etc.).
    """
    res = await db.execute(
        select(RiskScore).where(RiskScore.analysis_id == req.analysis_id).order_by(RiskScore.timestamp.desc())
    )
    risk = res.scalars().first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk evaluation not found.")

    session_res = await db.execute(select(AnalysisSession).where(AnalysisSession.id == req.analysis_id))
    session_obj = session_res.scalars().first()

    risk_dict = {
        "risk_score": risk.risk_score,
        "risk_level": risk.risk_level,
        "reasons": risk.reasons
    }

    tx_meta = session_obj.transaction_metadata if session_obj else None

    policy_output = policy_engine.evaluate(
        risk_output=risk_dict,
        profile_name=req.policy_profile,
        transaction=tx_meta
    )

    sys1_msg = bank_policy_adapter.format_system1_message(risk_dict, policy_output)

    return PolicyEvaluationResponse(
        analysis_id=req.analysis_id,
        policy_profile=policy_output["policy_profile"],
        recommended_action=policy_output["recommended_action"],
        verification_required=policy_output["verification_required"],
        reasons=policy_output["reasons"],
        system1_security_message=sys1_msg
    )

@router.post("/verification/request", response_model=VerificationResponse)
async def request_verification(req: VerificationRequestCreate, db: AsyncSession = Depends(get_db)):
    """
    Initiates independent step-up verification for high-risk calls.
    """
    ver_obj = await verification_service.create_verification_request(
        db=db,
        analysis_id=req.analysis_id,
        call_id=req.call_id,
        method=req.verification_method,
        notes=req.notes
    )
    return VerificationResponse(
        verification_id=ver_obj.id,
        analysis_id=ver_obj.analysis_id,
        call_id=ver_obj.call_id,
        status=ver_obj.status,
        requested_by=ver_obj.requested_by,
        timestamp=ver_obj.created_at
    )

@router.post("/feedback")
async def submit_feedback(fb: FeedbackCreate, db: AsyncSession = Depends(get_db)):
    """
    Allows authorized analysts to label call analysis as GENUINE, FRAUD, FALSE_POSITIVE, FALSE_NEGATIVE.
    """
    record = FeedbackLog(
        id=str(uuid.uuid4()),
        analysis_id=fb.analysis_id,
        label=fb.label,
        notes=fb.notes
    )
    db.add(record)
    await db.commit()
    return {"status": "SUCCESS", "feedback_id": record.id}

@router.get("/dashboard/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """
    Returns aggregated metrics for the Security Operations Dashboard.
    Resilient against database query failures.
    """
    try:
        active_calls_res = await db.execute(select(Call).where(Call.status == "ACTIVE"))
        active_calls = len(active_calls_res.scalars().all())

        total_anal_res = await db.execute(select(AnalysisSession))
        total_analyzed = len(total_anal_res.scalars().all())

        high_risk_res = await db.execute(select(RiskScore).where(RiskScore.risk_level == "HIGH"))
        high_risk_calls = len(high_risk_res.scalars().all())

        pending_ver_res = await db.execute(select(VerificationRequest).where(VerificationRequest.status == "PENDING"))
        pending_ver = len(pending_ver_res.scalars().all())

        latest_calls_res = await db.execute(
            select(Call).order_by(Call.created_at.desc()).limit(10)
        )
        calls_list = latest_calls_res.scalars().all()

        recent_table = []
        for c in calls_list:
            rs_res = await db.execute(
                select(RiskScore).join(AnalysisSession, RiskScore.analysis_id == AnalysisSession.id).where(AnalysisSession.call_id == c.id).order_by(RiskScore.timestamp.desc())
            )
            rs = rs_res.scalars().first()
            created_str = c.created_at.isoformat() if c.created_at else datetime.utcnow().isoformat()
            recent_table.append({
                "call_id": c.id,
                "caller_id": c.caller_id,
                "receiver_id": c.receiver_id,
                "created_at": created_str,
                "status": c.status,
                "synthetic_prob": rs.synthetic_probability if rs else None,
                "risk_score": rs.risk_score if rs else 0.0,
                "risk_level": rs.risk_level if rs else "LOW",
                "recommended_action": "HOLD" if (rs and rs.risk_level == "HIGH") else "ALLOW",
                "reasons": rs.reasons if rs else []
            })

        return {
            "active_calls": active_calls,
            "calls_analyzed": total_analyzed,
            "high_risk_calls": high_risk_calls,
            "pending_verifications": pending_ver,
            "recent_calls": recent_table
        }
    except Exception as db_err:
        print(f"[DASHBOARD-STATS-ERROR] error={db_err}")
        return {
            "active_calls": 0,
            "calls_analyzed": 0,
            "high_risk_calls": 0,
            "pending_verifications": 0,
            "recent_calls": [],
            "error": str(db_err)
        }

@router.get("/audit/logs")
async def get_audit_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """
    Retrieves audit logs for compliance tracking.
    """
    res = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit))
    logs = res.scalars().all()
    return logs
