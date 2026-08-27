class BehavioralSignalsEngine:
    """
    Behavioral Signals Engine.
    Extracts speech cadence, pause frequencies, turn-taking dynamics, and hesitation signals.
    Employs objective acoustic-statistical terms ("Behavioral anomaly signal").
    """
    def analyze_behavior(self, processed_audio: dict, text_transcript: str = None) -> dict:
        """
        Calculates acoustic behavior anomaly score.
        """
        tensor = processed_audio.get("tensor")
        duration_ms = processed_audio.get("duration_ms", 0.0)
        speech_detected = processed_audio.get("speech_detected", True)

        anomalies = []
        behavior_score = 0.0

        if not speech_detected or duration_ms < 500:
            return {"behavior_score": 0.0, "anomalies": []}

        # Analyze speech rate if transcript exists
        if text_transcript and len(text_transcript.split()) > 0:
            word_count = len(text_transcript.split())
            words_per_minute = (word_count / (duration_ms / 1000.0)) * 60.0

            if words_per_minute > 210:
                behavior_score += 25.0
                anomalies.append("Elevated speech rate detected (high pace anomaly)")
            elif words_per_minute < 70:
                behavior_score += 20.0
                anomalies.append("Unusually slow speech cadence with hesitation pauses")

        # Energy fluctuation / hesitation analysis
        rms_energy = processed_audio.get("rms_energy", 0.05)
        if rms_energy < 0.015:
            behavior_score += 15.0
            anomalies.append("Speech energy hesitation signal detected")

        return {
            "behavior_score": round(min(100.0, behavior_score), 2),
            "anomalies": anomalies
        }

behavior_engine = BehavioralSignalsEngine()
