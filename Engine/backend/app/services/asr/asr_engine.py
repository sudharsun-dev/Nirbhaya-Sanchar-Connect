import time
import httpx
from app.config import settings

class AsrEngine:
    """
    Speech-To-Text (ASR) Engine supporting English and Indian languages (Hindi, Tamil, Telugu, etc.).
    Leverages external ASR API if configured, or returns transparent ASR status.
    """
    def __init__(self):
        self.provider = settings.ASR_PROVIDER
        self.model = settings.ASR_MODEL
        self.api_key = settings.ASR_API_KEY
        self.api_url = settings.ASR_API_URL

    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> dict:
        """
        Transcribes speech audio bytes.
        """
        start_time = time.time()

        if not self.api_key or not self.api_url:
            # Report ASR_UNAVAILABLE cleanly if credentials are missing
            return {
                "text": None,
                "language": language,
                "confidence": 0.0,
                "status": "ASR_UNAVAILABLE",
                "status_detail": "ASR API key or API URL not configured in .env",
                "provider": self.provider
            }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                files = {"file": ("audio.wav", audio_bytes, "audio/wav")}
                data = {"model": self.model, "language": language}
                headers = {"Authorization": f"Bearer {self.api_key}"}

                response = await client.post(self.api_url, headers=headers, files=files, data=data)
                
                if response.status_code == 200:
                    res_json = response.json()
                    transcript = res_json.get("text", "")
                    detected_lang = res_json.get("language", language)
                    confidence = float(res_json.get("confidence", 0.92))

                    return {
                        "text": transcript.strip(),
                        "language": detected_lang,
                        "confidence": confidence,
                        "status": "SUCCESS",
                        "provider": self.provider
                    }
                else:
                    return {
                        "text": None,
                        "language": language,
                        "confidence": 0.0,
                        "status": "ASR_ERROR",
                        "status_detail": f"ASR Provider returned HTTP {response.status_code}",
                        "provider": self.provider
                    }

        except Exception as e:
            return {
                "text": None,
                "language": language,
                "confidence": 0.0,
                "status": "ASR_ERROR",
                "status_detail": str(e),
                "provider": self.provider
            }

asr_engine = AsrEngine()
