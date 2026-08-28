import pytest
from app.services.risk.risk_engine import risk_engine

def test_risk_calculation_low_risk():
    voice_res = {"status": "ACTIVE", "synthetic_probability": 15.0, "authenticity_score": 85.0, "confidence": 0.90}
    speaker_res = {"status": "SUCCESS", "similarity_score": 88.0, "identity_status": "MATCHED", "confidence": 0.85}
    context_res = {"context_score": 0.0, "risk_flags": []}
    tx_res = {"transaction_score": 10.0, "risk_factors": []}

    result = risk_engine.compute_risk(voice_res, speaker_res, context_res, tx_res)

    assert result["risk_score"] < 30.0
    assert result["risk_level"] == "LOW"
    assert result["action"] == "CONTINUE"
    assert result["synthetic_probability"] == 15.0
    assert result["authenticity_score"] == 85.0

def test_risk_calculation_high_risk():
    voice_res = {"status": "ACTIVE", "synthetic_probability": 85.0, "authenticity_score": 15.0, "confidence": 0.95}
    speaker_res = {"status": "SUCCESS", "similarity_score": 30.0, "identity_status": "MISMATCH", "confidence": 0.85}
    context_res = {"context_score": 80.0, "risk_flags": ["High urgency", "OTP request"]}
    tx_res = {"transaction_score": 75.0, "risk_factors": ["High value ₹500,000"]}

    result = risk_engine.compute_risk(voice_res, speaker_res, context_res, tx_res)

    assert result["risk_score"] >= 70.0
    assert result["risk_level"] == "HIGH"
    assert result["action"] == "HOLD"
    assert len(result["reasons"]) > 0

def test_risk_calculation_waiting_no_fake_values():
    # If voice model is waiting for analysis, scores remain None without fake 0%
    voice_res = {"status": "PROCESSING", "synthetic_probability": None}
    context_res = {"context_score": 40.0, "risk_flags": ["Suspicious phrase"]}

    result = risk_engine.compute_risk(voice_res, None, context_res, None)

    assert result["synthetic_probability"] is None
    assert result["authenticity_score"] is None
    assert result["risk_score"] is None
    assert result["risk_level"] == "ANALYSIS_WAITING"
    assert result["action"] == "WAITING FOR ANALYSIS"

