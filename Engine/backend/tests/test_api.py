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
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Start analysis
        payload = {
            "call_id": "test_call_101",
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

        # Post audio chunk
        audio_payload = b"\x00" * 32000 # 1 sec silent pcm
        files = {"file": ("chunk.wav", audio_payload, "audio/wav")}
        data = {"window_index": 1, "transcript_override": "Transfer ₹5,00,000 immediately."}

        audio_resp = await ac.post(f"/api/v1/analysis/{analysis_id}/audio", files=files, data=data)
        assert audio_resp.status_code == 200
        audio_data = audio_resp.json()
        assert audio_data["analysis_id"] == analysis_id
        assert audio_data["risk_score"] > 0.0

        # Get risk
        risk_resp = await ac.get(f"/api/v1/analysis/{analysis_id}/risk")
        assert risk_resp.status_code == 200
        risk_data = risk_resp.json()
        assert risk_data["analysis_id"] == analysis_id

        # Get explanation
        exp_resp = await ac.get(f"/api/v1/analysis/{analysis_id}/explanation")
        assert exp_resp.status_code == 200
        exp_data = exp_resp.json()
        assert "signals_breakdown" in exp_data
