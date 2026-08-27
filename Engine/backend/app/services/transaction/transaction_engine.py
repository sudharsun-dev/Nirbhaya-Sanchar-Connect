from typing import Optional

class TransactionRiskEngine:
    """
    Transaction Risk Engine.
    Evaluates transaction risk based on action type, requested amount, sensitivity level,
    and beneficiary status.
    """
    def __init__(self):
        self.type_risk_weights = {
            "TRANSFER": 40.0,
            "NEW_BENEFICIARY": 50.0,
            "CREDENTIAL_REQUEST": 60.0,
            "OTP_REQUEST": 55.0,
            "PASSWORD_RESET": 45.0,
            "ACCOUNT_CHANGE": 50.0,
            "CARD_CHANGE": 45.0,
            "PAYMENT": 30.0,
        }

    def analyze_transaction(
        self,
        tx_type: Optional[str] = "TRANSFER",
        amount: float = 0.0,
        currency: str = "INR",
        sensitivity: str = "NORMAL",
        beneficiary: Optional[str] = None
    ) -> dict:
        """
        Calculates transaction risk score (0-100) and identifies explicit risk factors.
        """
        if not tx_type:
            return {"transaction_score": 0.0, "risk_factors": []}

        tx_type_upper = tx_type.upper()
        base_score = self.type_risk_weights.get(tx_type_upper, 20.0)
        risk_factors = []

        risk_factors.append(f"Transaction action type: {tx_type_upper}")

        # Amount risk scaling (for INR)
        amount_score = 0.0
        if amount >= 1000000: # >= ₹10 Lakhs
            amount_score = 40.0
            risk_factors.append(f"Critical transaction value: {currency} {amount:,.2f}")
        elif amount >= 500000: # >= ₹5 Lakhs
            amount_score = 30.0
            risk_factors.append(f"High-value transaction request: {currency} {amount:,.2f}")
        elif amount >= 100000: # >= ₹1 Lakh
            amount_score = 20.0
            risk_factors.append(f"Elevated transaction value: {currency} {amount:,.2f}")
        elif amount > 0:
            amount_score = 10.0

        # Sensitivity multiplier
        sensitivity_score = 0.0
        sens_upper = sensitivity.upper()
        if sens_upper == "CRITICAL":
            sensitivity_score = 30.0
            risk_factors.append("Critical sensitivity classification applied")
        elif sens_upper == "HIGH":
            sensitivity_score = 20.0
            risk_factors.append("High sensitivity classification applied")
        elif sens_upper == "NORMAL":
            sensitivity_score = 5.0

        if beneficiary:
            risk_factors.append(f"Beneficiary target specified: {beneficiary}")

        total_score = min(100.0, base_score + amount_score + sensitivity_score)

        return {
            "transaction_score": round(total_score, 2),
            "risk_factors": risk_factors
        }

transaction_engine = TransactionRiskEngine()
