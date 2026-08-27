from typing import Optional, List, Dict, Any

class PolicyEngine:
    """
    Policy Engine.
    Maps risk scores, context flags, and transaction metadata to policy actions
    across organization types (BANK, ENTERPRISE, GOVERNMENT, CONTACT_CENTER).
    """
    def __init__(self):
        # Default policy thresholds per profile
        self.profiles = {
            "BANK": {
                "medium_threshold": 30.0,
                "high_threshold": 70.0,
                "high_sensitivity_auto_hold": True
            },
            "ENTERPRISE": {
                "medium_threshold": 40.0,
                "high_threshold": 75.0,
                "high_sensitivity_auto_hold": False
            },
            "GOVERNMENT": {
                "medium_threshold": 25.0,
                "high_threshold": 65.0,
                "high_sensitivity_auto_hold": True
            },
            "CONTACT_CENTER": {
                "medium_threshold": 35.0,
                "high_threshold": 70.0,
                "high_sensitivity_auto_hold": False
            }
        }

    def evaluate(self, risk_output: dict, profile_name: str = "BANK", transaction: Optional[dict] = None) -> dict:
        """
        Evaluates policy rules and determines recommended action.
        Actions: CONTINUE, VERIFY, HOLD, ESCALATE.
        """
        config = self.profiles.get(profile_name.upper(), self.profiles["BANK"])
        risk_score = risk_output.get("risk_score", 0.0)
        risk_level = risk_output.get("risk_level", "LOW")
        reasons = risk_output.get("reasons", [])

        action = "CONTINUE"
        verification_required = False
        policy_reasons = list(reasons)

        tx_sensitivity = (transaction.get("sensitivity") if transaction else "NORMAL") or "NORMAL"
        tx_amount = (transaction.get("amount") if transaction else 0.0) or 0.0

        # Policy Rule Evaluation Matrix
        if risk_level == "HIGH":
            if tx_sensitivity.upper() in ["HIGH", "CRITICAL"] or tx_amount >= 500000 or config["high_sensitivity_auto_hold"]:
                action = "HOLD"
                verification_required = True
                policy_reasons.append("High risk combined with high-value/sensitive transaction triggered policy transaction HOLD")
            else:
                action = "ESCALATE"
                verification_required = True
                policy_reasons.append("High risk score exceeded escalation threshold; security escalation required")

        elif risk_level == "MEDIUM":
            action = "VERIFY"
            verification_required = True
            policy_reasons.append("Medium risk detected; independent step-up verification recommended before proceeding")

        else:
            action = "CONTINUE"
            verification_required = False
            policy_reasons.append("Risk score within normal threshold; continue call under monitoring")

        return {
            "policy_profile": profile_name,
            "recommended_action": action,
            "verification_required": verification_required,
            "reasons": policy_reasons
        }

class BankPolicyAdapter:
    """
    Bank Policy Adapter.
    Formats security alerts and transaction hold payloads specifically for System 1 integration.
    Never claims a real bank transaction was blocked (demo simulation mode).
    """
    def format_system1_message(self, risk_output: dict, policy_output: dict) -> str:
        """
        Generates the standard Nirbhaya Sanchar Security Alert formatted text payload for System 1 UI.
        """
        risk_score = risk_output.get("risk_score", 0.0)
        risk_level = risk_output.get("risk_level", "LOW")
        reasons = policy_output.get("reasons", risk_output.get("reasons", []))
        
        reasons_bulleted = "\n".join([f"• {r}" for r in reasons[:3]])

        if risk_level == "HIGH":
            return f"""NIRBHAYA SANCHAR SECURITY ALERT

HIGH-RISK CALL
Potential impersonation risk detected.

Risk Score:
{risk_score:.1f} / 100

Reasons:
{reasons_bulleted}

Recommended:
HOLD & INDEPENDENTLY VERIFY (Transaction HOLD requested by policy engine)"""

        elif risk_level == "MEDIUM":
            return f"""NIRBHAYA SANCHAR SECURITY ALERT

MEDIUM-RISK CALL
Caution advised before sharing sensitive information.

Risk Score:
{risk_score:.1f} / 100

Reasons:
{reasons_bulleted}

Recommended:
STEP-UP VERIFICATION REQUIRED"""

        else:
            return f"""NIRBHAYA SANCHAR SECURITY NOTICE

LOW-RISK CALL
Normal call processing under active AI monitoring.

Risk Score:
{risk_score:.1f} / 100"""

policy_engine = PolicyEngine()
bank_policy_adapter = BankPolicyAdapter()
