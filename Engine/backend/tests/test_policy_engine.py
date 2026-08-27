import pytest
from app.services.policy.policy_engine import policy_engine, bank_policy_adapter

def test_policy_evaluation_high_risk_hold():
    risk_output = {
        "risk_score": 85.0,
        "risk_level": "HIGH",
        "reasons": ["Elevated synthetic probability (85%)", "High value transfer ₹500,000"]
    }
    tx_meta = {"type": "TRANSFER", "amount": 500000.0, "sensitivity": "HIGH"}

    policy_res = policy_engine.evaluate(risk_output, profile_name="BANK", transaction=tx_meta)

    assert policy_res["recommended_action"] == "HOLD"
    assert policy_res["verification_required"] is True

    sec_msg = bank_policy_adapter.format_system1_message(risk_output, policy_res)
    assert "NIRBHAYA SANCHAR SECURITY ALERT" in sec_msg
    assert "HOLD & INDEPENDENTLY VERIFY" in sec_msg

def test_policy_evaluation_low_risk_continue():
    risk_output = {
        "risk_score": 15.0,
        "risk_level": "LOW",
        "reasons": ["Normal caller interaction"]
    }
    policy_res = policy_engine.evaluate(risk_output, profile_name="BANK")

    assert policy_res["recommended_action"] == "CONTINUE"
    assert policy_res["verification_required"] is False
