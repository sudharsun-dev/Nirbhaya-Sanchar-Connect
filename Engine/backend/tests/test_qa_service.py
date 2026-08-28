import pytest
from starlette.testclient import TestClient
from app.main import app
from app.services.qa import qa_service

@pytest.fixture(autouse=True)
def reset_qa_state():
    """Reset QA state to OFF / LOW before each test."""
    qa_service.set_state(False, "LOW")
    yield
    qa_service.set_state(False, "LOW")

def test_qa_default_off():
    """Verify QA defaults to disabled with LOW scenario."""
    qa_service.set_state(False, "LOW")
    state = qa_service.get_state()
    assert state["enabled"] is False
    assert state["scenario"] == "LOW"
    assert qa_service.is_enabled() is False

def test_qa_enable():
    """Verify enabling QA state with HIGH scenario."""
    state = qa_service.set_state(True, "HIGH")
    assert state["enabled"] is True
    assert state["scenario"] == "HIGH"
    assert qa_service.is_enabled() is True
    assert qa_service.get_scenario() == "HIGH"

def test_qa_disable():
    """Verify disabling QA state."""
    qa_service.set_state(True, "HIGH")
    state = qa_service.set_state(False, "HIGH")
    assert state["enabled"] is False
    assert qa_service.is_enabled() is False

def test_qa_high_range():
    """Verify HIGH QA scenario strictly stays in 93.0 - 98.0 range."""
    qa_service.set_state(True, "HIGH")
    for _ in range(50):
        payload = qa_service.get_next_simulated_payload()
        score = payload["risk_score"]
        synth = payload["synthetic_probability"]
        auth = payload["authenticity_score"]
        assert 93.0 <= score <= 98.0, f"HIGH score {score} out of bounds"
        assert 93.0 <= synth <= 98.0
        assert auth == round(100.0 - synth, 1)
        assert payload["risk_level"] == "HIGH"
        assert payload["simulated"] is True

def test_qa_medium_range():
    """Verify MEDIUM QA scenario strictly stays in 45.0 - 65.0 range."""
    qa_service.set_state(True, "MEDIUM")
    for _ in range(50):
        payload = qa_service.get_next_simulated_payload()
        score = payload["risk_score"]
        synth = payload["synthetic_probability"]
        auth = payload["authenticity_score"]
        assert 45.0 <= score <= 65.0, f"MEDIUM score {score} out of bounds"
        assert 45.0 <= synth <= 65.0
        assert auth == round(100.0 - synth, 1)
        assert payload["risk_level"] == "MEDIUM"
        assert payload["simulated"] is True

def test_qa_low_range():
    """Verify LOW QA scenario strictly stays in 5.0 - 25.0 range."""
    qa_service.set_state(True, "LOW")
    for _ in range(50):
        payload = qa_service.get_next_simulated_payload()
        score = payload["risk_score"]
        synth = payload["synthetic_probability"]
        auth = payload["authenticity_score"]
        assert 5.0 <= score <= 25.0, f"LOW score {score} out of bounds"
        assert 5.0 <= synth <= 25.0
        assert auth == round(100.0 - synth, 1)
        assert payload["risk_level"] == "LOW"
        assert payload["simulated"] is True

def test_qa_score_smoothing():
    """Verify consecutive scores never jump by more than 3.0 points."""
    qa_service.set_state(True, "HIGH")
    prev_score = qa_service.get_next_simulated_payload()["risk_score"]
    for _ in range(50):
        curr_payload = qa_service.get_next_simulated_payload()
        curr_score = curr_payload["risk_score"]
        diff = abs(curr_score - prev_score)
        assert diff <= 3.001, f"Consecutive jump {diff} exceeded 3.0 points ({prev_score} -> {curr_score})"
        prev_score = curr_score

def test_qa_state_persistence():
    """Verify REST API GET and POST endpoints persist and retrieve state."""
    client = TestClient(app)
    
    # Set via POST
    post_res = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "MEDIUM"})
    assert post_res.status_code == 200
    assert post_res.json()["qa_state"]["enabled"] is True
    assert post_res.json()["qa_state"]["scenario"] == "MEDIUM"

    # Retrieve via GET
    get_res = client.get("/api/v1/qa/state")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["enabled"] is True
    assert data["scenario"] == "MEDIUM"

def test_qa_websocket_broadcast():
    """Verify WebSocket client immediately receives QA_MODE_UPDATED on connection."""
    qa_service.set_state(True, "HIGH")
    client = TestClient(app)
    with client.websocket_connect("/ws/analysis/test_call_broadcast") as ws:
        msg = ws.receive_json()
        assert msg["event"] == "QA_MODE_UPDATED"
        assert msg["enabled"] is True
        assert msg["scenario"] == "HIGH"
        assert msg["simulated_data"]["risk_level"] == "HIGH"
        assert 93.0 <= msg["simulated_data"]["risk_score"] <= 98.0

def test_real_detector_when_qa_off():
    """Verify when QA is OFF, payload is NOT marked as simulated."""
    qa_service.set_state(False, "LOW")
    assert qa_service.is_enabled() is False

def test_qa_overrides_display_when_enabled():
    """Verify when QA is ON, simulated payload produces stable values."""
    qa_service.set_state(True, "HIGH")
    payload = qa_service.get_next_simulated_payload()
    assert payload["simulated"] is True
    assert payload["label"] == "SYNTHETIC"
    assert "SIMULATED" in payload["verdict"]

def test_multi_client_qa_broadcast():
    """
    Verify multi-device real-time sync:
    Client B receives live QA_MODE_UPDATED whenever Client A updates state via POST.
    """
    client = TestClient(app)
    with client.websocket_connect("/ws/analysis/client_b_session") as ws_b:
        # Client B receives initial state on connect
        init_msg = ws_b.receive_json()
        assert init_msg["event"] == "QA_MODE_UPDATED"

        # Client B receives ANALYSIS_STARTED on connect
        start_msg = ws_b.receive_json()
        assert start_msg["event"] == "ANALYSIS_STARTED"

        # Client A changes to HIGH
        res1 = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "HIGH"})
        assert res1.status_code == 200
        
        # Client B immediately receives HIGH update
        msg_high = ws_b.receive_json()
        assert msg_high["event"] == "QA_MODE_UPDATED"
        assert msg_high["enabled"] is True
        assert msg_high["scenario"] == "HIGH"
        assert msg_high["simulated_data"]["risk_level"] == "HIGH"
        assert 93.0 <= msg_high["simulated_data"]["risk_score"] <= 98.0

        # Client A changes to MEDIUM
        res2 = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "MEDIUM"})
        assert res2.status_code == 200

        # Client B immediately receives MEDIUM update
        msg_med = ws_b.receive_json()
        assert msg_med["event"] == "QA_MODE_UPDATED"
        assert msg_med["enabled"] is True
        assert msg_med["scenario"] == "MEDIUM"
        assert msg_med["simulated_data"]["risk_level"] == "MEDIUM"
        assert 45.0 <= msg_med["simulated_data"]["risk_score"] <= 65.0

        # Client A turns QA OFF
        res3 = client.post("/api/v1/qa/state", json={"enabled": False, "scenario": "LOW"})
        assert res3.status_code == 200

        # Client B immediately receives OFF update
        msg_off = ws_b.receive_json()
        assert msg_off["event"] == "QA_MODE_UPDATED"
        assert msg_off["enabled"] is False
