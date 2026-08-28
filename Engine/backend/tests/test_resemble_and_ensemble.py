import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.voice_detection.resemble_detector import ResembleStreamingDetector
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

def test_risk_engine_with_resemble():
    risk_eng = RiskEngine()
    resemble_res = {
        "available": True,
        "status": "ACTIVE",
        "label": "FAKE",
        "synthetic_probability": 82.0,
        "authenticity_score": 18.0,
        "confidence": 0.90
    }
    
    risk_out = risk_eng.compute_risk(voice_result=resemble_res)
    assert risk_out["risk_score"] == 82.0
    assert risk_out["risk_level"] == "HIGH"
    assert risk_out["synthetic_probability"] == 82.0
    assert risk_out["authenticity_score"] == 18.0
    assert risk_out["action"] == "HOLD"

def test_risk_engine_no_voice():
    risk_eng = RiskEngine()
    resemble_res = {
        "available": True,
        "status": "NO_VOICE",
        "label": None,
        "synthetic_probability": None,
        "authenticity_score": None,
        "confidence": None
    }
    
    risk_out = risk_eng.compute_risk(voice_result=resemble_res)
    assert risk_out["risk_score"] is None
    assert risk_out["risk_level"] == "NO_VOICE"
    assert risk_out["synthetic_probability"] is None
    assert risk_out["authenticity_score"] is None

def test_risk_engine_waiting():
    risk_eng = RiskEngine()
    risk_out = risk_eng.compute_risk(voice_result=None)
    assert risk_out["risk_score"] is None
    assert risk_out["risk_level"] == "ANALYSIS_WAITING"
    assert risk_out["synthetic_probability"] is None
    assert risk_out["authenticity_score"] is None

@pytest.mark.asyncio
async def test_callback_service_with_resemble_payload():
    cb_service = CallbackService()
    cb_service.callback_url = "http://test-server:3001/api/nirbhaya/callback"
    
    risk_output = {
        "risk_score": 78.5,
        "risk_level": "HIGH",
        "action": "HOLD",
        "synthetic_probability": 78.5,
        "authenticity_score": 21.5,
        "overall_confidence": 0.91,
        "speaker_similarity": None,
        "context_score": 0.0,
        "transaction_score": None,
        "behavior_score": 0.0,
        "reasons": ["Resemble AI detected high deepfake probability (78.5%)"]
    }
    policy_output = {
        "recommended_action": "HOLD & INDEPENDENTLY VERIFY",
        "verification_required": True,
        "reasons": ["Elevated synthetic voice signal"]
    }
    resemble_res = {
        "available": True,
        "status": "ACTIVE",
        "label": "FAKE",
        "synthetic_probability": 78.5,
        "authenticity_score": 21.5,
        "confidence": 0.91
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
            resemble_res=resemble_res,
            window_index=4
        )
        assert res["status"] == "SENT"
        assert mock_post.called
        sent_payload = mock_post.call_args[1]["json"]
        assert sent_payload["risk_score"] == 78.5
        assert sent_payload["window_index"] == 4
        assert sent_payload["detector"] == "RESEMBLE"
        assert sent_payload["synthetic_probability"] == 78.5
        assert sent_payload["authenticity_score"] == 21.5
        assert sent_payload["action"] == "HOLD & INDEPENDENTLY VERIFY"

@pytest.mark.asyncio
async def test_resemble_stream_lifecycle_and_chunk():
    detector = ResembleStreamingDetector()
    
    class FakeWs:
        def __init__(self):
            self.closed = False
            self.sent_msgs = []
        async def send(self, data):
            self.sent_msgs.append(data)
        async def close(self):
            self.closed = True
        def __aiter__(self):
            return self
        async def __anext__(self):
            await asyncio.sleep(10)
            raise StopAsyncIteration

    mock_ws = FakeWs()
    
    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", "real_key_mock_12345"):
        with patch("websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = await detector.get_or_create_session("call_lifecycle_test")
            assert session is not None
            assert session.is_connected is True

            # Ingest fake Resemble chunk
            session.latest_result = {
                "available": True,
                "status": "ACTIVE",
                "source": "RESEMBLE",
                "label": "REAL",
                "synthetic_probability": 14.5,
                "authenticity_score": 85.5,
                "confidence": 0.92,
                "aggregated_score": 0.145,
                "consistency": 0.92
            }

            res = await detector.send_audio_chunk("call_lifecycle_test", b"dummy_pcm_bytes", window_index=1)
            assert res["status"] == "ACTIVE"
            assert res["label"] == "REAL"
            assert res["synthetic_probability"] == 14.5
            assert res["authenticity_score"] == 85.5
            assert len(mock_ws.sent_msgs) >= 1

@pytest.mark.asyncio
async def test_resemble_detector_http_402_billing():
    detector = ResembleStreamingDetector()
    
    class FakeInvalidStatus(Exception):
        def __init__(self):
            super().__init__("server rejected WebSocket connection: HTTP 402")
            self.status_code = 402

    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", "real_key_mock_12345"):
        with patch("websockets.connect", side_effect=FakeInvalidStatus()):
            res = await detector.send_audio_chunk("call_test_402", b"dummy_audio_bytes", window_index=1)
            assert res["available"] is False
            assert res["status"] == "PROVIDER_UNAVAILABLE"
            assert res["provider_status"] == 402
            assert res["provider_access"] == "BILLING_REQUIRED"
            assert res["synthetic_probability"] is None
            assert detector.provider_access_state == "BILLING_REQUIRED"

@pytest.mark.asyncio
async def test_resemble_detector_http_401_unauthorized():
    detector = ResembleStreamingDetector()
    
    class FakeInvalidStatus(Exception):
        def __init__(self):
            super().__init__("server rejected WebSocket connection: HTTP 401")
            self.status_code = 401

    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", "real_key_mock_12345"):
        with patch("websockets.connect", side_effect=FakeInvalidStatus()):
            res = await detector.send_audio_chunk("call_test_401", b"dummy_audio_bytes", window_index=1)
            assert res["available"] is False
            assert res["status"] == "PROVIDER_UNAVAILABLE"
            assert res["provider_status"] == 401
            assert res["provider_access"] == "UNAUTHORIZED"
            assert res["synthetic_probability"] is None

@pytest.mark.asyncio
async def test_resemble_detector_http_403_forbidden():
    detector = ResembleStreamingDetector()
    
    class FakeInvalidStatus(Exception):
        def __init__(self):
            super().__init__("server rejected WebSocket connection: HTTP 403")
            self.status_code = 403

    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", "real_key_mock_12345"):
        with patch("websockets.connect", side_effect=FakeInvalidStatus()):
            res = await detector.send_audio_chunk("call_test_403", b"dummy_audio_bytes", window_index=1)
            assert res["available"] is False
            assert res["status"] == "PROVIDER_UNAVAILABLE"
            assert res["provider_status"] == 403
            assert res["provider_access"] == "FORBIDDEN"
            assert res["synthetic_probability"] is None

@pytest.mark.asyncio
async def test_resemble_detector_malformed_json_resilience():
    detector = ResembleStreamingDetector()
    
    class FakeWsWithMalformedJson:
        def __init__(self):
            self.closed = False
            self.sent_msgs = []
            self.messages = [
                '{"type": "ready"}',
                'INVALID_NON_JSON_FRAME',
                '{"label": "real", "score": 0.12, "consistency": 0.95, "duration": 1.5}'
            ]
        async def send(self, data):
            self.sent_msgs.append(data)
        async def close(self):
            self.closed = True
        def __aiter__(self):
            return self
        async def __anext__(self):
            if self.messages:
                return self.messages.pop(0)
            await asyncio.sleep(10)
            raise StopAsyncIteration

    mock_ws = FakeWsWithMalformedJson()
    
    with patch("app.services.voice_detection.resemble_detector.settings.RESEMBLE_API_KEY", "real_key_mock_12345"):
        with patch("websockets.connect", new_callable=AsyncMock, return_value=mock_ws):
            session = await detector.get_or_create_session("call_malformed_test")
            assert session is not None
            # Wait for listener to process frames
            await asyncio.sleep(0.1)
            res = await detector.send_audio_chunk("call_malformed_test", b"dummy_audio_bytes", window_index=1)
            assert res["status"] == "ACTIVE"
            assert res["synthetic_probability"] == 12.0
            assert res["authenticity_score"] == 88.0
            await detector.close_stream("call_malformed_test")

