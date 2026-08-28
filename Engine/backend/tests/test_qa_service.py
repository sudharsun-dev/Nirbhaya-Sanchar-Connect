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

def test_database_qa_default():
    """Verify default QA state has enabled=False, scenario=LOW, score=15.0, source=QA_DATABASE."""
    qa_service.set_state(False, "LOW")
    state = qa_service.get_state()
    assert state["enabled"] is False
    assert state["scenario"] == "LOW"
    assert state["score"] == 15.0
    assert state["authenticity"] == 85.0
    assert state["confidence"] == 95.0
    assert state["verdict"] == "AUTHENTIC"
    assert state["risk_level"] == "LOW"
    assert state["recommended_action"] == "CONTINUE"
    assert state["source"] == "QA_DATABASE"

def test_database_qa_high():
    """Verify setting HIGH QA scenario produces exact database values (95.0 score, 5.0 authenticity)."""
    state = qa_service.set_state(True, "HIGH")
    assert state["enabled"] is True
    assert state["scenario"] == "HIGH"
    assert state["score"] == 95.0
    assert state["authenticity"] == 5.0
    assert state["confidence"] == 98.0
    assert state["verdict"] == "SYNTHETIC"
    assert state["risk_level"] == "HIGH"
    assert state["recommended_action"] == "HOLD"
    assert state["source"] == "QA_DATABASE"

def test_database_qa_medium():
    """Verify setting MEDIUM QA scenario produces exact database values (55.0 score, 45.0 authenticity)."""
    state = qa_service.set_state(True, "MEDIUM")
    assert state["enabled"] is True
    assert state["scenario"] == "MEDIUM"
    assert state["score"] == 55.0
    assert state["authenticity"] == 45.0
    assert state["confidence"] == 95.0
    assert state["verdict"] == "SYNTHETIC"
    assert state["risk_level"] == "MEDIUM"
    assert state["recommended_action"] == "VERIFY"
    assert state["source"] == "QA_DATABASE"

def test_database_qa_low():
    """Verify setting LOW QA scenario produces exact database values (15.0 score, 85.0 authenticity)."""
    state = qa_service.set_state(True, "LOW")
    assert state["enabled"] is True
    assert state["scenario"] == "LOW"
    assert state["score"] == 15.0
    assert state["authenticity"] == 85.0
    assert state["confidence"] == 95.0
    assert state["verdict"] == "AUTHENTIC"
    assert state["risk_level"] == "LOW"
    assert state["recommended_action"] == "CONTINUE"
    assert state["source"] == "QA_DATABASE"

def test_database_qa_off():
    """Verify turning QA OFF disables simulation flag while preserving configuration."""
    qa_service.set_state(True, "HIGH")
    state = qa_service.set_state(False, "HIGH")
    assert state["enabled"] is False
    assert qa_service.is_enabled() is False

def test_qa_api_get():
    """Verify GET /api/v1/qa/state returns database-backed state with full schema."""
    client = TestClient(app)
    res = client.get("/api/v1/qa/state")
    assert res.status_code == 200
    data = res.json()
    assert "enabled" in data
    assert "scenario" in data
    assert "score" in data
    assert "authenticity" in data
    assert "confidence" in data
    assert "verdict" in data
    assert "risk_level" in data
    assert "recommended_action" in data
    assert data["source"] == "QA_DATABASE"

def test_qa_api_post():
    """Verify POST /api/v1/qa/state updates database state and returns updated record."""
    client = TestClient(app)
    post_res = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "HIGH"})
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["status"] == "SUCCESS"
    assert data["qa_state"]["enabled"] is True
    assert data["qa_state"]["scenario"] == "HIGH"
    assert data["qa_state"]["score"] == 95.0
    assert data["qa_state"]["authenticity"] == 5.0
    assert data["qa_state"]["confidence"] == 98.0
    assert data["qa_state"]["verdict"] == "SYNTHETIC"
    assert data["qa_state"]["risk_level"] == "HIGH"
    assert data["qa_state"]["recommended_action"] == "HOLD"

def test_qa_persistence():
    """Verify state persisted via POST is faithfully retrieved via subsequent GET."""
    client = TestClient(app)
    client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "MEDIUM"})
    get_res = client.get("/api/v1/qa/state")
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["enabled"] is True
    assert data["scenario"] == "MEDIUM"
    assert data["score"] == 55.0
    assert data["authenticity"] == 45.0

def test_qa_state_survives_navigation_and_remount():
    """
    Verify simulating frontend page navigation:
    1. Client A sets ON + HIGH
    2. Repeated GETs simulating navigation (Dashboard -> Live Analysis -> Policies -> Settings)
    3. State remains persistently enabled=True and scenario=HIGH.
    """
    client = TestClient(app)
    res_post = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "HIGH"})
    assert res_post.status_code == 200

    # Simulate navigating to Dashboard
    res1 = client.get("/api/v1/qa/state")
    assert res1.json()["enabled"] is True
    assert res1.json()["scenario"] == "HIGH"
    assert res1.json()["score"] == 95.0

    # Simulate navigating to Live Analysis
    res2 = client.get("/api/v1/qa/state")
    assert res2.json()["enabled"] is True
    assert res2.json()["scenario"] == "HIGH"
    assert res2.json()["score"] == 95.0

    # Simulate navigating to Policies
    res3 = client.get("/api/v1/qa/state")
    assert res3.json()["enabled"] is True
    assert res3.json()["scenario"] == "HIGH"

def test_qa_high_exact_value():
    """Verify HIGH scenario always returns exact 95.0 without random variance."""
    qa_service.set_state(True, "HIGH")
    for _ in range(25):
        payload = qa_service.get_simulated_payload()
        assert payload["synthetic_probability"] == 95.0
        assert payload["authenticity_score"] == 5.0
        assert payload["authenticity"] == 5.0
        assert payload["confidence"] == 98.0
        assert payload["risk_score"] == 95.0
        assert payload["risk_level"] == "HIGH"
        assert payload["recommended_action"] == "HOLD"
        assert payload["source"] == "QA_DATABASE"
        assert payload["simulated"] is True

def test_qa_medium_exact_value():
    """Verify MEDIUM scenario always returns exact 55.0 without random variance."""
    qa_service.set_state(True, "MEDIUM")
    for _ in range(25):
        payload = qa_service.get_simulated_payload()
        assert payload["synthetic_probability"] == 55.0
        assert payload["authenticity_score"] == 45.0
        assert payload["authenticity"] == 45.0
        assert payload["confidence"] == 95.0
        assert payload["risk_score"] == 55.0
        assert payload["risk_level"] == "MEDIUM"
        assert payload["recommended_action"] == "VERIFY"
        assert payload["source"] == "QA_DATABASE"
        assert payload["simulated"] is True

def test_qa_low_exact_value():
    """Verify LOW scenario always returns exact 15.0 without random variance."""
    qa_service.set_state(True, "LOW")
    for _ in range(25):
        payload = qa_service.get_simulated_payload()
        assert payload["synthetic_probability"] == 15.0
        assert payload["authenticity_score"] == 85.0
        assert payload["authenticity"] == 85.0
        assert payload["confidence"] == 95.0
        assert payload["risk_score"] == 15.0
        assert payload["risk_level"] == "LOW"
        assert payload["recommended_action"] == "CONTINUE"
        assert payload["source"] == "QA_DATABASE"
        assert payload["simulated"] is True

def test_websocket_global_broadcast():
    """
    Verify multi-device real-time sync:
    Client B receives live QA_MODE_UPDATED with exact database values when Client A updates state via POST.
    """
    client = TestClient(app)
    with client.websocket_connect("/ws/analysis/client_b_broadcast_session") as ws_b:
        init_msg = ws_b.receive_json()
        assert init_msg["event"] == "QA_MODE_UPDATED"

        start_msg = ws_b.receive_json()
        assert start_msg["event"] == "ANALYSIS_STARTED"

        # Client A updates to HIGH
        res1 = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "HIGH"})
        assert res1.status_code == 200
        
        msg_high = ws_b.receive_json()
        assert msg_high["event"] == "QA_MODE_UPDATED"
        assert msg_high["enabled"] is True
        assert msg_high["scenario"] == "HIGH"
        assert msg_high["score"] == 95.0
        assert msg_high["authenticity"] == 5.0
        assert msg_high["risk_level"] == "HIGH"
        assert msg_high["recommended_action"] == "HOLD"
        assert msg_high["source"] == "QA_DATABASE"

        # Client A updates to MEDIUM
        res2 = client.post("/api/v1/qa/state", json={"enabled": True, "scenario": "MEDIUM"})
        assert res2.status_code == 200

        msg_med = ws_b.receive_json()
        assert msg_med["event"] == "QA_MODE_UPDATED"
        assert msg_med["enabled"] is True
        assert msg_med["scenario"] == "MEDIUM"
        assert msg_med["score"] == 55.0
        assert msg_med["authenticity"] == 45.0
        assert msg_med["risk_level"] == "MEDIUM"
        assert msg_med["recommended_action"] == "VERIFY"
        assert msg_med["source"] == "QA_DATABASE"

        # Client A turns QA OFF
        res3 = client.post("/api/v1/qa/state", json={"enabled": False, "scenario": "LOW"})
        assert res3.status_code == 200

        msg_off = ws_b.receive_json()
        assert msg_off["event"] == "QA_MODE_UPDATED"
        assert msg_off["enabled"] is False

def test_new_client_gets_database_state():
    """Verify newly connecting client receives current database QA state upon WebSocket connection."""
    qa_service.set_state(True, "HIGH")
    client = TestClient(app)
    with client.websocket_connect("/ws/analysis/new_client_session") as ws:
        msg = ws.receive_json()
        assert msg["event"] == "QA_MODE_UPDATED"
        assert msg["enabled"] is True
        assert msg["scenario"] == "HIGH"
        assert msg["score"] == 95.0
        assert msg["authenticity"] == 5.0
        assert msg["risk_level"] == "HIGH"
        assert msg["recommended_action"] == "HOLD"
        assert msg["source"] == "QA_DATABASE"
