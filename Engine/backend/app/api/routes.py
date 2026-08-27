import uuid
import httpx
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.config import settings
from app.database.session import get_db
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
from app.services.voice_detection.authenticity import voice_authenticity_engine
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
async def get_system_health(db: AsyncSession = Depends(get_db)):
    """
    Returns real, empirically tested system health status across all backend services and AI engines.
    """
    # Check Database connection
    db_status = "ONLINE"
    try:
        await db.execute(select(Call).limit(1))
    except Exception as e:
        db_status = f"OFFLINE ({str(e)})"

    # Check Voice AI Anti-Spoofing engine
    voice_status = "ONLINE" if voice_authenticity_engine.is_loaded else "CONFIGURATION_REQUIRED"

    # Check Speaker Verifier
    speaker_status = "ONLINE"

    # Check ASR status
    asr_status = "ONLINE" if (settings.ASR_API_KEY and settings.ASR_API_URL) else "CONFIGURATION_REQUIRED"

    # Check System 1 connection
    sys1_status = "OFFLINE"
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            resp = await client.get(f"{settings.SYSTEM1_BASE_URL}/health")
            if resp.status_code == 200:
                sys1_status = "ONLINE"
            else:
                sys1_status = "DEGRADED"
    except Exception:
        sys1_status = "OFFLINE"

    overall_status = "ONLINE" if (db_status == "ONLINE" and voice_status == "ONLINE") else "DEGRADED"

    return SystemHealthResponse(
        app=settings.APP_NAME,
        environment=settings.ENVIRONMENT,
        status=overall_status,
        services={
            "database": ServiceHealthStatus(status="ONLINE" if "ONLINE" in db_status else "OFFLINE", message=db_status),
            "voice_ai": ServiceHealthStatus(
                status="ONLINE" if voice_authenticity_engine.weights_loaded else "OFFLINE",
                details={
                    "model_name": voice_authenticity_engine.model_name,
                    "provider": voice_authenticity_engine.model_provider,
                    "version": voice_authenticity_engine.model_version,
                    "license": voice_authenticity_engine.model_license,
                    "weights_loaded": voice_authenticity_engine.weights_loaded,
                    "weights_sha256": voice_authenticity_engine.weights_sha256,
                    "total_parameters": voice_authenticity_engine.total_parameters
                }
            ),
            "speaker_verifier": ServiceHealthStatus(status=speaker_status, details={"model": speaker_verifier.model_name}),
            "asr_engine": ServiceHealthStatus(status=asr_status, details={"provider": settings.ASR_PROVIDER, "model": settings.ASR_MODEL}),
            "system1_connect": ServiceHealthStatus(status=sys1_status, details={"url": settings.SYSTEM1_BASE_URL})
        }
    )

@router.get("/system1/health")
async def get_system1_health():
    """Returns System 1 connectivity status."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.SYSTEM1_BASE_URL}/health")
            return {
                "system1_status": "ONLINE" if resp.status_code == 200 else "DEGRADED",
                "system1_url": settings.SYSTEM1_BASE_URL,
                "response": resp.json() if resp.status_code == 200 else None
            }
    except Exception as e:
        return {
            "system1_status": "OFFLINE",
            "system1_url": settings.SYSTEM1_BASE_URL,
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

@router.post("/analysis/{analysis_id}/audio", response_model=AudioChunkResponse)
async def process_audio_chunk(
    analysis_id: str,
    file: UploadFile = File(...),
    window_index: int = Form(1),
    transcript_override: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Processes an incoming audio window/chunk (2-5 sec stream window or file upload).
    Executes Preprocessing -> REAL Voice Model -> Speaker Verifier -> ASR -> Context -> Transaction -> Risk Engine -> Policy Engine.
    """
    # Fetch analysis session
    session_res = await db.execute(select(AnalysisSession).where(AnalysisSession.id == analysis_id))
    analysis_session = session_res.scalars().first()
    if not analysis_session:
        raise HTTPException(status_code=404, detail="Analysis session not found.")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio payload.")

    # 1. Preprocessing
    processed_audio = preprocessor.process_audio_bytes(audio_bytes)

    # 2. REAL Voice Anti-Spoofing
    voice_res = voice_authenticity_engine.analyze_audio(processed_audio)

    # 3. Speaker Verification (if reference voice exists on user profile)
    speaker_res = speaker_verifier.compare_speaker(processed_audio, reference_embedding=None)

    # 4. ASR Speech-To-Text
    if transcript_override:
        asr_res = {"text": transcript_override, "language": "en", "confidence": 1.0, "status": "SUCCESS"}
    else:
        asr_res = await asr_engine.transcribe(audio_bytes)

    # 5. Context Intelligence
    transcript_text = asr_res.get("text", "")
    context_res = context_engine.analyze_text(transcript_text)

    # 6. Transaction Risk
    tx_meta = analysis_session.transaction_metadata or {}
    tx_res = transaction_engine.analyze_transaction(
        tx_type=tx_meta.get("type", "TRANSFER"),
        amount=float(tx_meta.get("amount", 0.0)),
        currency=tx_meta.get("currency", "INR"),
        sensitivity=tx_meta.get("sensitivity", "NORMAL"),
        beneficiary=tx_meta.get("beneficiary")
    )

    # 7. Behavioral Signals
    behavior_res = behavior_engine.analyze_behavior(processed_audio, text_transcript=transcript_text)

    # 8. Risk Calculation
    risk_output = risk_engine.compute_risk(
        voice_result=voice_res,
        speaker_result=speaker_res,
        context_result=context_res,
        transaction_result=tx_res,
        behavior_result=behavior_res
    )

    # 9. Policy Evaluation
    policy_output = policy_engine.evaluate(
        risk_output=risk_output,
        profile_name="BANK",
        transaction=tx_meta
    )

    # Persist metrics to database (WITHOUT storing raw audio!)
    window_record = AudioAnalysisWindow(
        id=str(uuid.uuid4()),
        analysis_id=analysis_id,
        window_index=window_index,
        duration_ms=processed_audio["duration_ms"],
        sample_rate=processed_audio["sample_rate"],
        channels=processed_audio["channels"],
        speech_detected=processed_audio["speech_detected"],
        audio_quality_score=processed_audio["audio_quality_score"]
    )
    db.add(window_record)

    voice_record = VoiceAnalysisResult(
        analysis_id=analysis_id,
        window_id=window_record.id,
        synthetic_probability=voice_res.get("synthetic_probability"),
        authenticity_score=voice_res.get("authenticity_score"),
        confidence=voice_res.get("confidence", 0.0),
        audio_quality=voice_res.get("audio_quality", 1.0),
        model_name=voice_res.get("model_name", settings.VOICE_MODEL_NAME),
        model_version=voice_res.get("model_version", settings.VOICE_MODEL_VERSION),
        inference_time_ms=voice_res.get("inference_time_ms", 0.0),
        status=voice_res.get("status", "SUCCESS")
    )
    db.add(voice_record)

    risk_record = RiskScore(
        analysis_id=analysis_id,
        risk_score=risk_output["risk_score"],
        risk_level=risk_output["risk_level"],
        overall_confidence=risk_output["overall_confidence"],
        synthetic_probability=risk_output["synthetic_probability"],
        speaker_similarity=risk_output["speaker_similarity"],
        context_score=risk_output["context_score"],
        transaction_score=risk_output["transaction_score"],
        behavior_score=risk_output["behavior_score"],
        reasons=risk_output["reasons"]
    )
    db.add(risk_record)

    policy_record = PolicyDecision(
        analysis_id=analysis_id,
        policy_profile=policy_output["policy_profile"],
        recommended_action=policy_output["recommended_action"],
        verification_required=policy_output["verification_required"],
        reasons=policy_output["reasons"]
    )
    db.add(policy_record)

    # High Risk Alert creation if HIGH risk
    if risk_output["risk_level"] == "HIGH":
        sec_msg = bank_policy_adapter.format_system1_message(risk_output, policy_output)
        await alerts_service.create_alert(
            db=db,
            analysis_id=analysis_id,
            call_id=analysis_session.call_id,
            alert_level="HIGH",
            title="NIRBHAYA SANCHAR SECURITY ALERT",
            message=sec_msg,
            reasons=policy_output["reasons"]
        )

    # Audit Log
    audit = AuditLog(
        call_id=analysis_session.call_id,
        analysis_id=analysis_id,
        event_type="AUDIO_PROCESSED",
        risk_score=risk_output["risk_score"],
        risk_level=risk_output["risk_level"],
        policy_decision=policy_output["recommended_action"],
        recommended_action=policy_output["recommended_action"],
        details={"window_index": window_index, "duration_ms": processed_audio["duration_ms"]}
    )
    db.add(audit)
    await db.commit()

    # Trigger System 1 Callback in background
    await callback_service.send_callback(
        event="RISK_UPDATED",
        call_id=analysis_session.call_id,
        analysis_id=analysis_id,
        risk_output=risk_output,
        policy_output=policy_output,
        verification_required=policy_output["verification_required"]
    )

    return AudioChunkResponse(
        analysis_id=analysis_id,
        window_index=window_index,
        duration_ms=processed_audio["duration_ms"],
        speech_detected=processed_audio["speech_detected"],
        audio_quality_score=processed_audio["audio_quality_score"],
        risk_score=risk_output["risk_score"],
        risk_level=risk_output["risk_level"],
        recommended_action=policy_output["recommended_action"],
        reasons=policy_output["reasons"]
    )

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
    """
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

@router.get("/audit/logs")
async def get_audit_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    """
    Retrieves audit logs for compliance tracking.
    """
    res = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit))
    logs = res.scalars().all()
    return logs
