import pytest
from app.services.risk.risk_engine import risk_engine

def test_risk_calculation_low_risk():
    voice_res = {"status": "SUCCESS", "synthetic_probability": 15.0, "confidence": 0.90}
    speaker_res = {"status": "SUCCESS", "similarity_score": 88.0, "identity_status": "MATCHED", "confidence": 0.85}
    context_res = {"context_score": 0.0, "risk_flags": []}
    tx_res = {"transaction_score": 10.0, "risk_factors": []}

    result = risk_engine.compute_risk(voice_res, speaker_res, context_res, tx_res)

    assert result["risk_score"] < 30.0
    assert result["risk_level"] == "LOW"
    assert result["synthetic_probability"] == 15.0
    assert result["speaker_similarity"] == 88.0

def test_risk_calculation_high_risk():
    voice_res = {"status": "SUCCESS", "synthetic_probability": 85.0, "confidence": 0.95}
    speaker_res = {"status": "SUCCESS", "similarity_score": 30.0, "identity_status": "MISMATCH", "confidence": 0.85}
    context_res = {"context_score": 80.0, "risk_flags": ["High urgency", "OTP request"]}
    tx_res = {"transaction_score": 75.0, "risk_factors": ["High value ₹500,000"]}

    result = risk_engine.compute_risk(voice_res, speaker_res, context_res, tx_res)

    assert result["risk_score"] >= 70.0
    assert result["risk_level"] == "HIGH"
    assert len(result["reasons"]) > 0

def test_risk_calculation_missing_models_no_fake_values():
    # If voice model is unavailable, engine rescales weight dynamically without fake data
    voice_res = {"status": "MODEL_UNAVAILABLE", "synthetic_probability": None}
    context_res = {"context_score": 40.0, "risk_flags": ["Suspicious phrase"]}

    result = risk_engine.compute_risk(voice_res, None, context_res, None)

    assert result["synthetic_probability"] is None
    assert result["speaker_similarity"] is None
    assert result["context_score"] == 40.0
    assert result["risk_score"] > 0.0
