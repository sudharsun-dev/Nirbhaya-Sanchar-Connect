from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class TransactionMetadata(BaseModel):
    type: Optional[str] = "TRANSFER" # TRANSFER, NEW_BENEFICIARY, PASSWORD_RESET, OTP_REQUEST, ACCOUNT_CHANGE, CARD_CHANGE, PAYMENT, CREDENTIAL_REQUEST
    amount: float = 0.0
    currency: str = "INR"
    beneficiary: Optional[str] = None
    sensitivity: str = "NORMAL" # LOW, NORMAL, HIGH, CRITICAL

class AnalysisStartRequest(BaseModel):
    call_id: str
    caller_id: str
    receiver_id: str
    organization_id: Optional[str] = None
    channel: str = "VOIP"
    transaction: Optional[TransactionMetadata] = None

class AnalysisStartResponse(BaseModel):
    analysis_id: str
    status: str = "STARTED"
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class AudioChunkResponse(BaseModel):
    analysis_id: str
    window_index: int
    duration_ms: float
    speech_detected: bool
    audio_quality_score: float
    risk_score: float
    risk_level: str
    recommended_action: str
    reasons: List[str]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class VoiceAnalysisOutput(BaseModel):
    synthetic_probability: Optional[float] = None
    authenticity_score: Optional[float] = None
    confidence: float = 0.0
    audio_quality: float = 1.0
    model_name: str
    model_version: str
    model_provider: str
    model_source: str
    model_license: str
    inference_time_ms: float = 0.0
    status: str = "SUCCESS" # SUCCESS, MODEL_UNAVAILABLE, ERROR
    status_detail: Optional[str] = None

class SpeakerAnalysisOutput(BaseModel):
    identity_status: str = "UNKNOWN" # MATCHED, MISMATCH, UNKNOWN, INSUFFICIENT_AUDIO
    similarity_score: Optional[float] = None
    confidence: float = 0.0
    status: str = "SUCCESS" # SUCCESS, SPEAKER_MODEL_UNAVAILABLE

class AsrOutput(BaseModel):
    text: Optional[str] = None
    language: str = "en"
    confidence: float = 0.0
    status: str = "SUCCESS" # SUCCESS, ASR_UNAVAILABLE

class ContextAnalysisOutput(BaseModel):
    context_score: float = 0.0
    urgency_level: str = "NORMAL"
    suspicious_phrases: List[str] = []
    risk_flags: List[str] = []

class TransactionRiskOutput(BaseModel):
    transaction_score: float = 0.0
    risk_factors: List[str] = []

class BehaviorOutput(BaseModel):
    behavior_score: float = 0.0
    anomalies: List[str] = []

class RiskScoreResponse(BaseModel):
    analysis_id: str
    call_id: str
    risk_score: float # 0 - 100
    risk_level: str # LOW, MEDIUM, HIGH
    overall_confidence: float
    synthetic_probability: Optional[float] = None
    speaker_similarity: Optional[float] = None
    context_score: Optional[float] = None
    transaction_score: Optional[float] = None
    behavior_score: Optional[float] = None
    reasons: List[str]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ExplanationResponse(BaseModel):
    analysis_id: str
    call_id: str
    risk_score: float
    risk_level: str
    reasons: List[str]
    signals_breakdown: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class PolicyEvaluationRequest(BaseModel):
    analysis_id: str
    organization_id: Optional[str] = None
    policy_profile: str = "BANK" # BANK, ENTERPRISE, GOVERNMENT, CONTACT_CENTER

class PolicyEvaluationResponse(BaseModel):
    analysis_id: str
    policy_profile: str
    recommended_action: str # CONTINUE, VERIFY, HOLD, ESCALATE
    verification_required: bool
    reasons: List[str]
    system1_security_message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class VerificationRequestCreate(BaseModel):
    analysis_id: str
    call_id: str
    verification_method: str = "TRUSTED_CALLBACK" # TRUSTED_CALLBACK, MFA, STAFF_CONFIRMATION
    notes: Optional[str] = None

class VerificationResponse(BaseModel):
    verification_id: str
    analysis_id: str
    call_id: str
    status: str # PENDING, VERIFIED, FAILED
    requested_by: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class FeedbackCreate(BaseModel):
    analysis_id: str
    label: str # GENUINE, FRAUD, FALSE_POSITIVE, FALSE_NEGATIVE, UNKNOWN
    notes: Optional[str] = None

class System1CallbackPayload(BaseModel):
    event: str # RISK_UPDATED, ALERT_CREATED, POLICY_UPDATED
    call_id: str
    analysis_id: str
    risk_score: float
    risk_level: str
    synthetic_probability: Optional[float]
    speaker_similarity: Optional[float]
    model_confidence: float
    audio_quality: float
    context_score: Optional[float]
    transaction_score: Optional[float]
    behavior_score: Optional[float]
    reasons: List[str]
    recommended_action: str
    policy_decision: str
    verification_required: bool
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ServiceHealthStatus(BaseModel):
    status: str # ONLINE, DEGRADED, OFFLINE, CONFIGURATION_REQUIRED
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

class SystemHealthResponse(BaseModel):
    app: str
    environment: str
    status: str
    services: Dict[str, ServiceHealthStatus]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
