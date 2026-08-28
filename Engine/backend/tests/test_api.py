import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.session import init_db

@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/health")
    assert response.status_code == 200
    json_data = response.json()
    assert json_data["app"] == "NIRBHAYA_SANCHAR_ENGINE"
    assert "services" in json_data
    assert json_data["services"]["voice_ai"]["status"] in ["ONLINE", "CONFIGURATION_REQUIRED"]

@pytest.mark.asyncio
async def test_analysis_start_and_risk_endpoints():
    transport = ASGITransport(app=app)
    fresh_id = f"test_call_{uuid.uuid4().hex[:8]}"
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Start analysis
        payload = {
            "call_id": fresh_id,
            "caller_id": "+919876543210",
            "receiver_id": "+919123456789",
            "channel": "VOIP",
            "transaction": {
                "type": "TRANSFER",
                "amount": 500000,
                "currency": "INR",
                "sensitivity": "HIGH"
            }
        }
        resp = await ac.post("/api/v1/analysis/start", json=payload)
        assert resp.status_code == 200
        start_data = resp.json()
        assert "analysis_id" in start_data
        analysis_id = start_data["analysis_id"]

        # Confirm legacy HTTP audio endpoint is permanently 404 (WebSocket-only live audio)
        audio_payload = b"\x00" * 32000
        files = {"file": ("chunk.wav", audio_payload, "audio/wav")}
        data = {"window_index": 1}
        audio_resp = await ac.post(f"/api/v1/analysis/{analysis_id}/audio", files=files, data=data)
        assert audio_resp.status_code == 404

        # Fresh session before streaming audio has no risk evaluations yet
        exp_resp = await ac.get(f"/api/v1/analysis/{analysis_id}/explanation")
        assert exp_resp.status_code == 404

        # Test policy engine direct evaluation
        from app.services.policy.policy_engine import policy_engine
        pol_out = policy_engine.evaluate(
            risk_output={"risk_score": 85.0, "risk_level": "HIGH", "reasons": ["Synthetic voice detected"]},
            profile_name="BANK"
        )
        assert pol_out["recommended_action"] in ["HOLD", "HOLD & INDEPENDENTLY VERIFY"]
        assert pol_out["verification_required"] is True
