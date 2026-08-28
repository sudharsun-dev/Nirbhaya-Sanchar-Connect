from typing import Optional, Dict, Any

class MultiModelVoiceEnsemble:
    """
    Multi-Model Voice Anti-Spoofing & Impersonation Ensemble Layer.
    Combines local AASIST Spectro-Temporal Graph Attention model predictions with
    external Resemble AI streaming deepfake detection telemetry.
    """
    def __init__(self):
        self.method_label = "prototype ensemble weighting"
        self.default_aasist_weight = 0.50
        self.default_resemble_weight = 0.50

    def calculate_detector_agreement(
        self,
        aasist_synth: Optional[float],
        resemble_synth: Optional[float]
    ) -> str:
        """
        Determines the agreement level between AASIST and Resemble detection outputs.
        - HIGH: |AASIST - Resemble| <= 15.0%
        - MEDIUM: 15.0% < |AASIST - Resemble| <= 35.0%
        - LOW: |AASIST - Resemble| > 35.0%
        - UNAVAILABLE: One or both models missing valid predictions
        """
        if aasist_synth is None or resemble_synth is None:
            return "UNAVAILABLE"

        diff = abs(aasist_synth - resemble_synth)
        if diff <= 15.0:
            return "HIGH"
        elif diff <= 35.0:
            return "MEDIUM"
        else:
            return "LOW"

    def combine_voice_detectors(
        self,
        aasist_res: Optional[dict] = None,
        resemble_res: Optional[dict] = None
    ) -> dict:
        """
        Fuses AASIST and Resemble detections into a unified ensemble voice intelligence signal.
        Transparently exposes individual model contributions and agreement telemetry.
        """
        # Extract AASIST metrics
        aasist_synth = None
        aasist_conf = 0.80
        aasist_status = "OFFLINE"
        if aasist_res:
            aasist_status = aasist_res.get("status", "OFFLINE")
            if aasist_status == "SUCCESS":
                aasist_synth = aasist_res.get("synthetic_probability")
                aasist_conf = float(aasist_res.get("confidence", 0.80))

        # Extract Resemble metrics
        resemble_synth = None
        resemble_conf = 0.85
        resemble_status = "NOT_CONFIGURED"
        resemble_avail = False
        resemble_label = None
        resemble_agg_score = None
        resemble_consistency = None

        if resemble_res:
            resemble_avail = bool(resemble_res.get("available", False))
            resemble_status = resemble_res.get("status", "NOT_CONFIGURED")
            resemble_label = resemble_res.get("label")
            resemble_agg_score = resemble_res.get("aggregated_score")
            resemble_consistency = resemble_res.get("consistency")
            if resemble_avail and resemble_status in ["ACTIVE", "SUCCESS"]:
                resemble_synth = resemble_res.get("synthetic_probability")
                if resemble_consistency is not None and isinstance(resemble_consistency, (int, float)):
                    resemble_conf = float(resemble_consistency)

        detector_agreement = self.calculate_detector_agreement(aasist_synth, resemble_synth)
        discrepancy_reasons = []

        # Multi-model combination
        if aasist_synth is not None and resemble_synth is not None:
            # Both detectors active -> 50/50 prototype weighting
            ensemble_synth = (
                self.default_aasist_weight * aasist_synth +
                self.default_resemble_weight * resemble_synth
            )
            if detector_agreement == "HIGH":
                ensemble_conf = min(0.99, (aasist_conf + 0.90) / 2.0)
            elif detector_agreement == "MEDIUM":
                ensemble_conf = round(((aasist_conf + 0.80) / 2.0) * 0.90, 2)
            else: # LOW agreement
                ensemble_conf = round(((aasist_conf + 0.70) / 2.0) * 0.75, 2)
                discrepancy_reasons.append(
                    f"Model discrepancy: AASIST predicts {aasist_synth:.1f}% synthetic, while Resemble predicts {resemble_synth:.1f}%"
                )
        elif aasist_synth is not None:
            # AASIST only fallback
            ensemble_synth = aasist_synth
            ensemble_conf = round(aasist_conf * 0.85, 2)
        elif resemble_synth is not None:
            # Resemble only fallback
            ensemble_synth = resemble_synth
            ensemble_conf = round(resemble_conf * 0.80, 2)
        else:
            # Neither detector produced valid output
            ensemble_synth = None
            ensemble_conf = 0.0

        ensemble_synth_rounded = round(ensemble_synth, 2) if ensemble_synth is not None else None
        authenticity_rounded = round(100.0 - ensemble_synth_rounded, 2) if ensemble_synth_rounded is not None else None

        combined_block = {
            "synthetic_probability": ensemble_synth_rounded,
            "authenticity": authenticity_rounded,
            "authenticity_score": authenticity_rounded,
            "confidence": ensemble_conf,
            "detector_agreement": detector_agreement,
            "method": self.method_label,
            "detectors_available": [
                name for name, val in [("AASIST", aasist_synth is not None), ("RESEMBLE", resemble_synth is not None)] if val
            ]
        }

        return {
            "status": "SUCCESS" if ensemble_synth_rounded is not None else "UNAVAILABLE",
            "synthetic_probability": ensemble_synth_rounded,
            "authenticity_score": authenticity_rounded,
            "confidence": ensemble_conf,
            "detector_agreement": detector_agreement,
            "method": self.method_label,
            "discrepancy_reasons": discrepancy_reasons,
            "aasist": {
                "status": aasist_status,
                "synthetic_probability": aasist_synth,
                "authenticity": aasist_res.get("authenticity_score") if aasist_res else None,
                "authenticity_score": aasist_res.get("authenticity_score") if aasist_res else None,
                "confidence": aasist_conf if aasist_synth is not None else 0.0,
                "model_name": "AASIST",
                "version": "ASVspoof2019-LA"
            },
            "resemble": {
                "available": resemble_avail,
                "status": resemble_status,
                "label": resemble_label,
                "synthetic_probability": resemble_synth,
                "confidence": resemble_conf if resemble_synth is not None else 0.0,
                "aggregated_score": resemble_agg_score,
                "consistency": resemble_consistency
            },
            "combined": combined_block,
            "discrepancy_flag": bool(detector_agreement == "LOW")
        }

voice_ensemble = MultiModelVoiceEnsemble()
