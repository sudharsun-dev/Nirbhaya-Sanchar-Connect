import pytest
from starlette.testclient import TestClient
from app.main import app
from app.services.qa import qa_service

def test_qa_service_initial_state_and_set():
    """Verifies GlobalQAService state transitions and simulated payload generation."""
    qa_service.set_state(False, "HIGH")
    assert qa_service.is_enabled() is False
    assert qa_service.get_scenario() == "HIGH"
    state = qa_service.get_state()
    assert state["enabled"] is False
    assert state["scenario"] == "HIGH"

    # Set HIGH
    qa_service.set_state(True, "HIGH")
    assert qa_service.is_enabled() is True
    high_payload = qa_service.get_simulated_payload()
    assert high_payload["risk_level"] == "HIGH"
    assert high_payload["synthetic_probability"] > 90.0
    assert high_payload["simulated"] is True

    # Set MEDIUM
    qa_service.set_state(True, "MEDIUM")
    med_payload = qa_service.get_simulated_payload()
    assert med_payload["risk_level"] == "MEDIUM"
    assert 40.0 <= med_payload["synthetic_probability"] <= 70.0

    # Set LOW
    qa_service.set_state(True, "LOW")
    low_payload = qa_service.get_simulated_payload()
    assert low_payload["risk_level"] == "LOW"
    assert low_payload["synthetic_probability"] < 20.0

    # Reset
    qa_service.set_state(False, "HIGH")
    assert qa_service.is_enabled() is False

def test_qa_rest_endpoints():
    """Verifies GET /api/v1/qa/state and POST /api/v1/qa/state."""
    client = TestClient(app)
    
    # 1. GET state
    res = client.get("/api/v1/qa/state")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "scenario" in data

    # 2. POST state -> enable HIGH
    post_res = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "HIGH"})
    assert post_res.status_code == 200
    post_data = post_res.json()
    assert post_data["status"] == "SUCCESS"
    assert post_data["qa_state"]["enabled"] is True
    assert post_data["qa_state"]["scenario"] == "HIGH"

    # Verify GET reflects update
    res = client.get("/api/v1/qa/state")
    assert res.json()["enabled"] is True
    assert res.json()["scenario"] == "HIGH"

    # 3. POST state -> disable
    post_res = client.post("/api/v1/qa/state", json={"enabled": False, "scenario": "HIGH"})
    assert post_res.status_code == 200
    assert post_res.json()["qa_state"]["enabled"] is False

def test_websocket_receives_qa_mode_updated():
    """Verifies that WebSocket connections receive QA_MODE_UPDATED on connection and when updated."""
    client = TestClient(app)
    call_id = "test_qa_sync_call"

    with client.websocket_connect(f"/ws/analysis/{call_id}") as ws:
        # First message is QA_MODE_UPDATED
        msg1 = ws.receive_json()
        assert msg1["event"] == "QA_MODE_UPDATED"
        assert "enabled" in msg1

        # Second message is ANALYSIS_STARTED
        msg2 = ws.receive_json()
        assert msg2["event"] == "ANALYSIS_STARTED"

        # Now trigger POST /api/v1/qa/state while connected
        client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "HIGH"})

        # WebSocket should receive real-time broadcast of QA_MODE_UPDATED
        msg3 = ws.receive_json()
        assert msg3["event"] == "QA_MODE_UPDATED"
        assert msg3["enabled"] is True
        assert msg3["scenario"] == "HIGH"
        assert msg3["simulated_data"]["risk_level"] == "HIGH"

        # Reset QA mode
        client.post("/api/v1/qa/state", json={"enabled": False, "scenario": "HIGH"})
        msg4 = ws.receive_json()
        assert msg4["event"] == "QA_MODE_UPDATED"
        assert msg4["enabled"] is False
