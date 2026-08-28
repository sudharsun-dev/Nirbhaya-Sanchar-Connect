import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.voice_detection.resemble_detector import ResembleStreamingDetector
from app.services.voice_detection.ensemble import MultiModelVoiceEnsemble
from app.services.risk.risk_engine import RiskEngine
from app.services.system1.callback_service import CallbackService

@pytest.mark.asyncio
async def test_resemble_detector_not_configured():
    detector = ResembleStreamingDetector()
    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", None):
        res = await detector.send_audio_chunk("call_test_1", b"dummy_audio_bytes", window_index=1)
        assert res["available"] is False
        assert res["status"] == "NOT_CONFIGURED"
        assert res["synthetic_probability"] is None

@pytest.mark.asyncio
async def test_resemble_detector_error_isolation():
    detector = ResembleStreamingDetector()
    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", "real_key_mock_12345"):
        with patch("websockets.connect", side_effect=Exception("Connection refused")):
            res = await detector.send_audio_chunk("call_test_err", b"dummy_audio_bytes", window_index=1)
            assert res["available"] is False
            assert res["status"] in ["UNAVAILABLE", "ERROR"]
            assert res["synthetic_probability"] is None

def test_detector_agreement_calculations():
    ensemble = MultiModelVoiceEnsemble()
    
    # 1. High agreement (diff <= 15)
    assert ensemble.calculate_detector_agreement(80.0, 75.0) == "HIGH"
    assert ensemble.calculate_detector_agreement(20.0, 10.0) == "HIGH"
    
    # 2. Medium agreement (15 < diff <= 35)
    assert ensemble.calculate_detector_agreement(80.0, 60.0) == "MEDIUM"
    assert ensemble.calculate_detector_agreement(30.0, 55.0) == "MEDIUM"
    
    # 3. Low agreement (diff > 35)
    assert ensemble.calculate_detector_agreement(90.0, 20.0) == "LOW"
    assert ensemble.calculate_detector_agreement(10.0, 85.0) == "LOW"
    
    # 4. Unavailable
    assert ensemble.calculate_detector_agreement(None, 75.0) == "UNAVAILABLE"
    assert ensemble.calculate_detector_agreement(80.0, None) == "UNAVAILABLE"
    assert ensemble.calculate_detector_agreement(None, None) == "UNAVAILABLE"

def test_ensemble_fusion_both_detectors_high_agreement():
    ensemble = MultiModelVoiceEnsemble()
    aasist_res = {
        "status": "SUCCESS",
        "synthetic_probability": 80.0,
        "authenticity_score": 20.0,
        "confidence": 0.90
    }
    resemble_res = {
        "available": True,
        "status": "ACTIVE",
        "label": "FAKE",
        "synthetic_probability": 70.0,
        "aggregated_score": 0.70,
        "consistency": 0.85
    }
    
    res = ensemble.combine_voice_detectors(aasist_res=aasist_res, resemble_res=resemble_res)
    assert res["status"] == "SUCCESS"
    assert res["synthetic_probability"] == 75.0 # (0.5 * 80 + 0.5 * 70)
    assert res["authenticity_score"] == 25.0
    assert res["detector_agreement"] == "HIGH"
    assert res["discrepancy_flag"] is False
    assert res["aasist"]["synthetic_probability"] == 80.0
    assert res["resemble"]["synthetic_probability"] == 70.0

def test_ensemble_fusion_low_agreement_discrepancy_flag():
    ensemble = MultiModelVoiceEnsemble()
    aasist_res = {
        "status": "SUCCESS",
        "synthetic_probability": 95.0,
        "authenticity_score": 5.0,
        "confidence": 0.92
    }
    resemble_res = {
        "available": True,
        "status": "ACTIVE",
        "label": "REAL",
        "synthetic_probability": 20.0,
        "aggregated_score": 0.20,
        "consistency": 0.80
    }
    
    res = ensemble.combine_voice_detectors(aasist_res=aasist_res, resemble_res=resemble_res)
    assert res["status"] == "SUCCESS"
    assert res["synthetic_probability"] == 57.5 # (0.5 * 95 + 0.5 * 20)
    assert res["detector_agreement"] == "LOW"
    assert res["discrepancy_flag"] is True
    assert len(res["discrepancy_reasons"]) > 0
    # Confidence should be penalized for disagreement
    assert res["confidence"] < 0.80

def test_ensemble_fusion_aasist_only():
    ensemble = MultiModelVoiceEnsemble()
    aasist_res = {
        "status": "SUCCESS",
        "synthetic_probability": 85.0,
        "authenticity_score": 15.0,
        "confidence": 0.90
    }
    resemble_res = {
        "available": False,
        "status": "NOT_CONFIGURED",
        "synthetic_probability": None
    }
    
    res = ensemble.combine_voice_detectors(aasist_res=aasist_res, resemble_res=resemble_res)
    assert res["status"] == "SUCCESS"
    assert res["synthetic_probability"] == 85.0
    assert res["authenticity_score"] == 15.0
    assert res["detector_agreement"] == "UNAVAILABLE"
    assert res["discrepancy_flag"] is False

def test_risk_engine_with_ensemble():
    risk_eng = RiskEngine()
    ensemble_res = {
        "status": "SUCCESS",
        "synthetic_probability": 82.0,
        "confidence": 0.90,
        "detector_agreement": "HIGH",
        "discrepancy_reasons": []
    }
    
    risk_out = risk_eng.compute_risk(voice_result=ensemble_res)
    assert risk_out["risk_score"] == 82.0 # 100% active voice signal weight
    assert risk_out["risk_level"] == "HIGH"
    assert risk_out["synthetic_probability"] == 82.0

@pytest.mark.asyncio
async def test_callback_service_with_ensemble_payload():
    cb_service = CallbackService()
    cb_service.callback_url = "http://test-server:3001/api/nirbhaya/callback"
    
    risk_output = {
        "risk_score": 78.5,
        "risk_level": "HIGH",
        "synthetic_probability": 78.5,
        "overall_confidence": 0.91,
        "speaker_similarity": None,
        "context_score": 0.0,
        "transaction_score": None,
        "behavior_score": 0.0
    }
    policy_output = {
        "recommended_action": "HOLD & INDEPENDENTLY VERIFY",
        "verification_required": True,
        "reasons": ["Elevated synthetic voice signal"]
    }
    ensemble_res = {
        "aasist": {"synthetic_probability": 82.0},
        "resemble": {"synthetic_probability": 75.0},
        "detector_agreement": "HIGH"
    }
    
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp
        
        res = await cb_service.send_callback(
            event="RISK_UPDATED",
            call_id="call_123",
            analysis_id="call_123",
            risk_output=risk_output,
            policy_output=policy_output,
            verification_required=True,
            ensemble_res=ensemble_res
        )
        assert res["status"] == "SENT"
        assert mock_post.called
        sent_payload = mock_post.call_args[1]["json"]
        assert sent_payload["risk_score"] == 78.5
        assert sent_payload["aasist_synthetic_probability"] == 82.0
        assert sent_payload["resemble_synthetic_probability"] == 75.0
        assert sent_payload["detector_agreement"] == "HIGH"
