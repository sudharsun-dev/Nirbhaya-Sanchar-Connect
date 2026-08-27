import re

class ContextIntelligenceEngine:
    """
    Context Intelligence Engine.
    Analyzes spoken text transcripts for high-risk social engineering patterns, urgent financial directives,
    credential requests, secrecy pressure, and unauthorized account manipulation indicators.
    """
    def __init__(self):
        # Risk keywords and intent regex patterns
        self.suspicious_patterns = [
            (r"\b(transfer|send|wire|deposit|remit)\s+(₹|rs\.?|rupees|usd|\$)?\s*[\d,]+", "High-value financial transfer directive requested", 40.0),
            (r"\b(immediately|right now|urgent|urgently|emergency|asap|fast)\b", "High urgency and pressure language detected", 20.0),
            (r"\b(otp|one time password|verification code|security code)\b", "OTP / Verification Code request detected", 35.0),
            (r"\b(pin|password|credential|cvv|card number|login)\b", "Account PIN / Password / Credential request detected", 35.0),
            (r"\b(don'?t tell|keep (it|this) secret|confidential|nobody else|silent|between us)\b", "Secrecy directive and isolation tactic detected", 25.0),
            (r"\b(open your (banking|bank|upi|gpay|phonepe|paytm) app)\b", "Instruction to open mobile banking application", 30.0),
            (r"\b(add (new )?beneficiary|change account|update details|card blocked)\b", "Account modification / Beneficiary change directive", 25.0),
            (r"\b(police|cbi|tax department|rbi|customs|legal action)\b", "Impersonation of authority / law enforcement threat", 30.0),
        ]

    def analyze_text(self, text: str) -> dict:
        """
        Analyzes speech transcript for context risk indicators.
        """
        if not text or not text.strip():
            return {
                "context_score": 0.0,
                "urgency_level": "NORMAL",
                "suspicious_phrases": [],
                "risk_flags": []
            }

        text_lower = text.lower()
        score_accumulator = 0.0
        triggered_phrases = []
        risk_flags = []

        for pattern, flag_description, risk_weight in self.suspicious_patterns:
            matches = re.findall(pattern, text_lower)
            if matches:
                score_accumulator += risk_weight
                risk_flags.append(flag_description)
                matched_text = " ".join([m if isinstance(m, str) else m[0] for m in matches])
                triggered_phrases.append(matched_text.strip())

        normalized_score = round(min(100.0, score_accumulator), 2)

        if normalized_score >= 60.0:
            urgency_level = "HIGH"
        elif normalized_score >= 30.0:
            urgency_level = "ELEVATED"
        else:
            urgency_level = "NORMAL"

        return {
            "context_score": normalized_score,
            "urgency_level": urgency_level,
            "suspicious_phrases": list(set(triggered_phrases)),
            "risk_flags": risk_flags
        }

context_engine = ContextIntelligenceEngine()
