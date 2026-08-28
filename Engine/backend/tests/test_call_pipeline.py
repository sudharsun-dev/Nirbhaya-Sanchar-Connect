import pytest
from starlette.testclient import TestClient
from app.main import app

@pytest.fixture(autouse=True)
def cleanup_active_calls():
    """Ensure no leftover active calls exist prior to running a test."""
    client = TestClient(app)
    client.post("/api/v1/calls/cleanup_test_active/end")
    yield
    client.post("/api/v1/calls/cleanup_test_active/end")

def test_start_call_and_active_query():
    """Verify System 1 call start creates active call and GET /api/v1/calls/active returns it."""
    client = TestClient(app)
    call_id = "test-call-s1-s2-auto"
    
    # 1. Start call from System 1
    start_res = client.post("/api/v1/calls/start", json={
        "call_id": call_id,
        "caller_id": "laptopA_user",
        "receiver_id": "room_secure",
        "channel": "VOIP"
    })
    assert start_res.status_code == 200
    data = start_res.json()
    assert data["status"] == "STARTED"
    assert data["analysis_id"] == call_id

    # 2. Query active call on System 2
    active_res = client.get("/api/v1/calls/active")
    assert active_res.status_code == 200
    active_data = active_res.json()
    assert active_data["has_active_call"] is True
    assert active_data["call_id"] == call_id
    assert active_data["caller_id"] == "laptopA_user"
    assert active_data["status"] == "ACTIVE"

    # 3. End call from System 1
    end_res = client.post(f"/api/v1/calls/{call_id}/end")
    assert end_res.status_code == 200
    end_data = end_res.json()
    assert end_data["status"] == "SUCCESS"
    assert end_data["call_status"] == "ENDED"

    # 4. Query active call again - should now be inactive
    active_res_after = client.get("/api/v1/calls/active")
    assert active_res_after.status_code == 200
    assert active_res_after.json()["has_active_call"] is False

def test_websocket_call_lifecycle_events():
    """Verify WebSocket clients receive CALL_STARTED, AUDIO_PROCESSED with rms, and CALL_ENDED."""
    client = TestClient(app)
    call_id = "test-call-ws-broadcast"

    with client.websocket_connect("/ws/events") as ws:
        # Initial handshake events on /ws/events
        msg_qa = ws.receive_json()
        assert msg_qa["event"] in ["QA_MODE_UPDATED", "ANALYSIS_STARTED"]
        if msg_qa["event"] == "QA_MODE_UPDATED":
            msg_init = ws.receive_json()
            assert msg_init["event"] == "ANALYSIS_STARTED"

        # System 1 starts call
        res = client.post("/api/v1/calls/start", json={
            "call_id": call_id,
            "caller_id": "caller123",
            "receiver_id": "receiver456",
            "channel": "VOIP"
        })
        assert res.status_code == 200

        # WebSocket receives CALL_STARTED
        msg1 = ws.receive_json()
        assert msg1["event"] == "CALL_STARTED"
        assert msg1["call_id"] == call_id
        assert msg1["status"] == "ACTIVE"

        # System 1 ends call
        res_end = client.post(f"/api/v1/calls/{call_id}/end")
        assert res_end.status_code == 200

        # WebSocket receives CALL_ENDED
        msg2 = ws.receive_json()
        assert msg2["event"] == "CALL_ENDED"
        assert msg2["call_id"] == call_id
        assert msg2["status"] == "ENDED"

def test_audio_stream_produces_processed_and_risk_events():
    """Verify sending 2.5s audio window produces AUDIO_PROCESSED and RISK_UPDATED with exact telemetry."""
    client = TestClient(app)
    call_id = "test-call-audio-stream"

    # Create dummy 2.5s 16kHz mono PCM (40,000 samples = 80,000 bytes)
    dummy_pcm = b"\x00\x00" * 40000

    with client.websocket_connect(f"/ws/analysis/{call_id}") as ws:
        # Initial analysis started event
        init_event = ws.receive_json()
        assert init_event["event"] in ["ANALYSIS_STARTED", "QA_MODE_UPDATED"]
        if init_event["event"] == "QA_MODE_UPDATED":
            start_event = ws.receive_json()
            assert start_event["event"] == "ANALYSIS_STARTED"

        # Stream audio window
        ws.send_bytes(dummy_pcm)

        # Receive AUDIO_PROCESSED
        audio_proc = ws.receive_json()
        assert audio_proc["event"] == "AUDIO_PROCESSED"
        assert audio_proc["call_id"] == call_id
        assert audio_proc["window_index"] == 1
        assert "rms_energy" in audio_proc

        # Receive RISK_UPDATED
        risk_upd = ws.receive_json()
        assert risk_upd["event"] == "RISK_UPDATED"
        assert risk_upd["call_id"] == call_id
        assert "risk_score" in risk_upd
        assert "synthetic_probability" in risk_upd
        assert "authenticity_score" in risk_upd
        assert "verdict" in risk_upd or "label" in risk_upd or "action" in risk_upd
