import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.database.session import Base

def generate_uuid():
    return str(uuid.uuid4())

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    org_type = Column(String, default="BANK") # BANK, ENTERPRISE, GOVERNMENT, CONTACT_CENTER
    policy_config = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="ANALYST") # ADMIN, ANALYST, AUDITOR
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    voice_print_embedding = Column(JSON, nullable=True) # Protected speaker reference embedding
    created_at = Column(DateTime, default=datetime.utcnow)

class Call(Base):
    __tablename__ = "calls"

    id = Column(String, primary_key=True, default=generate_uuid) # call_id from System 1
    caller_id = Column(String, nullable=False, index=True)
    receiver_id = Column(String, nullable=False, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True)
    channel = Column(String, default="VOIP") # VOIP, PSTN, TEST
    status = Column(String, default="ACTIVE") # ACTIVE, ENDED, HELD, ESCALATED
    created_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    call_id = Column(String, ForeignKey("calls.id"), nullable=False, index=True)
    caller_id = Column(String, nullable=False)
    receiver_id = Column(String, nullable=False)
    organization_id = Column(String, nullable=True)
    status = Column(String, default="STARTED") # STARTED, PROCESSING, COMPLETED, ERROR
    transaction_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AudioAnalysisWindow(Base):
    __tablename__ = "audio_analysis_windows"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    window_index = Column(Integer, nullable=False)
    duration_ms = Column(Float, nullable=False)
    sample_rate = Column(Integer, default=16000)
    channels = Column(Integer, default=1)
    speech_detected = Column(Boolean, default=True)
    audio_quality_score = Column(Float, default=1.0)
    processed_at = Column(DateTime, default=datetime.utcnow)

class VoiceAnalysisResult(Base):
    __tablename__ = "voice_analysis_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    window_id = Column(String, ForeignKey("audio_analysis_windows.id"), nullable=True)
    synthetic_probability = Column(Float, nullable=True)
    authenticity_score = Column(Float, nullable=True) # 100 - synthetic_probability
    confidence = Column(Float, nullable=False, default=0.0)
    audio_quality = Column(Float, default=1.0)
    model_name = Column(String, nullable=False)
    model_version = Column(String, nullable=False)
    inference_time_ms = Column(Float, default=0.0)
    status = Column(String, default="SUCCESS") # SUCCESS, MODEL_UNAVAILABLE, ERROR
    timestamp = Column(DateTime, default=datetime.utcnow)

class SpeakerAnalysisResult(Base):
    __tablename__ = "speaker_analysis_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    identity_status = Column(String, default="UNKNOWN") # MATCHED, MISMATCH, UNKNOWN, INSUFFICIENT_AUDIO
    similarity_score = Column(Float, nullable=True)
    confidence = Column(Float, default=0.0)
    model_name = Column(String, default="ECAPA-TDNN / Spectral Embedding")
    timestamp = Column(DateTime, default=datetime.utcnow)

class AsrResult(Base):
    __tablename__ = "asr_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    transcript = Column(Text, nullable=True)
    language = Column(String, default="en")
    confidence = Column(Float, default=0.0)
    status = Column(String, default="SUCCESS") # SUCCESS, ASR_UNAVAILABLE
    timestamp = Column(DateTime, default=datetime.utcnow)

class ContextAnalysisResult(Base):
    __tablename__ = "context_analysis_results"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    context_score = Column(Float, default=0.0) # 0 to 100 risk score
    urgency_level = Column(String, default="NORMAL") # NORMAL, ELEVATED, HIGH
    suspicious_phrases = Column(JSON, default=list)
    risk_flags = Column(JSON, default=list)
    timestamp = Column(DateTime, default=datetime.utcnow)

class RiskScore(Base):
    __tablename__ = "risk_scores"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    risk_score = Column(Float, nullable=False) # 0 to 100
    risk_level = Column(String, nullable=False) # LOW, MEDIUM, HIGH
    overall_confidence = Column(Float, nullable=False)
    synthetic_probability = Column(Float, nullable=True)
    speaker_similarity = Column(Float, nullable=True)
    context_score = Column(Float, nullable=True)
    transaction_score = Column(Float, nullable=True)
    behavior_score = Column(Float, nullable=True)
    reasons = Column(JSON, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

class PolicyDecision(Base):
    __tablename__ = "policy_decisions"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    policy_profile = Column(String, default="BANK")
    recommended_action = Column(String, nullable=False) # CONTINUE, VERIFY, HOLD, ESCALATE
    verification_required = Column(Boolean, default=False)
    reasons = Column(JSON, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

class VerificationRequest(Base):
    __tablename__ = "verification_requests"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    call_id = Column(String, nullable=False)
    verification_method = Column(String, default="TRUSTED_CALLBACK") # TRUSTED_CALLBACK, MFA, STAFF_CONFIRMATION
    status = Column(String, default="PENDING") # PENDING, VERIFIED, FAILED, EXPIRED
    requested_by = Column(String, default="SYSTEM2_POLICY")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    call_id = Column(String, nullable=False)
    alert_level = Column(String, nullable=False) # LOW, MEDIUM, HIGH
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    reasons = Column(JSON, nullable=False)
    status = Column(String, default="ACTIVE") # ACTIVE, ACKNOWLEDGED, RESOLVED
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    timestamp = Column(DateTime, default=datetime.utcnow)
    call_id = Column(String, nullable=True, index=True)
    analysis_id = Column(String, nullable=True, index=True)
    event_type = Column(String, nullable=False)
    risk_score = Column(Float, nullable=True)
    risk_level = Column(String, nullable=True)
    policy_decision = Column(String, nullable=True)
    recommended_action = Column(String, nullable=True)
    actor = Column(String, default="SYSTEM2_ENGINE")
    details = Column(JSON, nullable=True)

class FeedbackLog(Base):
    __tablename__ = "feedback_logs"

    id = Column(String, primary_key=True, default=generate_uuid)
    analysis_id = Column(String, ForeignKey("analysis_sessions.id"), nullable=False, index=True)
    label = Column(String, nullable=False) # GENUINE, FRAUD, FALSE_POSITIVE, FALSE_NEGATIVE, UNKNOWN
    user_id = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class QAStateRecord(Base):
    __tablename__ = "qa_state"

    id = Column(String, primary_key=True, default="global_qa")
    enabled = Column(Boolean, default=False, nullable=False)
    scenario = Column(String, default="LOW", nullable=False) # LOW, MEDIUM, HIGH
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
