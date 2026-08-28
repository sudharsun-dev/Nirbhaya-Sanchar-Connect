import asyncio
import json
import logging
import time
from typing import Optional, Dict, Any
import websockets
from app.config import settings

logger = logging.getLogger(__name__)

class ResembleStreamSession:
    """
    State container for an active Resemble AI streaming detection session.
    Maintains one persistent WebSocket stream per active call_id.
    """
    def __init__(self, call_id: str, ws: Any):
        self.call_id = call_id
        self.ws = ws
        self.is_connected = True
        self.ready_event = asyncio.Event()
        self.result_updated = asyncio.Event()
        self.chunks_sent = 0
        self.latest_result: Dict[str, Any] = {
            "available": True,
            "status": "PROCESSING",
            "source": "RESEMBLE",
            "label": None,
            "synthetic_probability": None,
            "authenticity_score": None,
            "confidence": None,
            "aggregated_score": None,
            "consistency": None,
            "raw": None,
            "duration_analyzed_s": 0.0,
            "last_updated": time.time()
        }
        self.receiver_task: Optional[asyncio.Task] = None
        self.error: Optional[str] = None


class ResembleStreamingDetector:
    """
    Dedicated Resemble AI Streaming Voice Deepfake Detection Service (Authoritative Engine).
    Connects to official Resemble WebSocket (wss://stream.resemble.ai/api/v1/detect/audio)
    using server-side credentials and streams 16kHz mono 16-bit PCM audio chunks.
    
    Score Mapping Documentation:
    Resemble Deepfake Detection streaming API returns:
      - `score` / `aggregated_score`: A float from 0.0 to 1.0 indicating probability of synthetic/AI-generated speech.
        * 1.0 = Highly confident synthetic/deepfake speech.
        * 0.0 = Highly confident authentic human speech.
      - Conversion:
        * synthetic_probability = score * 100.0  (0.0% to 100.0%)
        * authenticity_score = 100.0 - synthetic_probability
        * confidence = consistency (if provided by Resemble, 0.0 to 1.0)
    """
    def __init__(self):
        self.stream_url = settings.RESEMBLE_STREAM_URL
        self.active_sessions: Dict[str, ResembleStreamSession] = {}
        self._lock = asyncio.Lock()

    @property
    def is_configured(self) -> bool:
        return settings.is_resemble_configured

    async def get_or_create_session(self, call_id: str) -> Optional[ResembleStreamSession]:
        """
        Retrieves or initializes a dedicated Resemble streaming connection for a call.
        Strictly one stream per active call_id.
        """
        if not self.is_configured:
            return None

        async with self._lock:
            # Check existing active connection
            if call_id in self.active_sessions:
                session = self.active_sessions[call_id]
                if session.is_connected and not session.ws.closed:
                    return session
                else:
                    # Clean dead session
                    await self._cleanup_session(call_id)

            api_key = settings.RESEMBLE_API_KEY
            headers = {
                "Authorization": f"Bearer {api_key}"
            }

            try:
                print(f"[RESEMBLE-CONNECT] call_id={call_id}")
                ws = await websockets.connect(
                    self.stream_url,
                    additional_headers=headers,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=5
                )
                session = ResembleStreamSession(call_id=call_id, ws=ws)
                session.receiver_task = asyncio.create_task(self._listen_resemble_responses(session))
                self.active_sessions[call_id] = session
                
                # Wait briefly for ready handshake
                try:
                    await asyncio.wait_for(session.ready_event.wait(), timeout=1.5)
                except asyncio.TimeoutError:
                    # If Resemble doesn't send explicit ready message, mark ready to send
                    session.ready_event.set()

                print(f"[RESEMBLE-READY] call_id={call_id}")
                return session
            except (websockets.exceptions.InvalidStatus, getattr(websockets.exceptions, 'InvalidStatusCode', Exception)) as status_err:
                status_code = getattr(status_err, 'status_code', getattr(getattr(status_err, 'response', None), 'status_code', 'UNKNOWN'))
                print(f"[RESEMBLE-ERROR] call_id={call_id} HTTP_{status_code}: {status_err}")
                return None
            except Exception as e:
                print(f"[RESEMBLE-ERROR] call_id={call_id} Connection failed: {e}")
                return None

    async def send_audio_chunk(self, call_id: str, audio_bytes: bytes, window_index: int = 1) -> dict:
        """
        Streams a 16kHz mono audio chunk to the active Resemble WebSocket for this call.
        Returns the latest normalized detection result.
        """
        if not self.is_configured:
            return {
                "available": False,
                "status": "NOT_CONFIGURED",
                "source": "RESEMBLE",
                "label": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": None,
                "aggregated_score": None,
                "consistency": None,
                "detail": "RESEMBLE_API_KEY not configured on server."
            }

        session = await self.get_or_create_session(call_id)
        if not session or not session.is_connected:
            return {
                "available": False,
                "status": "UNAVAILABLE",
                "source": "RESEMBLE",
                "label": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": None,
                "aggregated_score": None,
                "consistency": None,
                "detail": session.error if session else "Unable to establish Resemble stream."
            }

        try:
            # Wait if ready_event not yet set
            if not session.ready_event.is_set():
                try:
                    await asyncio.wait_for(session.ready_event.wait(), timeout=0.5)
                except asyncio.TimeoutError:
                    session.ready_event.set()

            # Clear event so we wait for the NEXT Resemble result
            session.result_updated.clear()

            print(f"[RESEMBLE-SEND] call_id={call_id} window={window_index} bytes={len(audio_bytes)}")
            await session.ws.send(audio_bytes)
            session.chunks_sent += 1

            # Wait for the Resemble listener to receive a real response (up to 5s)
            try:
                await asyncio.wait_for(session.result_updated.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                print(f"[RESEMBLE-TIMEOUT] call_id={call_id} window={window_index} no response in 5s")

            res = dict(session.latest_result)
            print(f"[RESEMBLE-RESULT] call_id={call_id} window={window_index} status={res.get('status')} label={res.get('label')} score={res.get('aggregated_score')}")
            return res
        except Exception as send_err:
            print(f"[RESEMBLE-ERROR] call_id={call_id} send_failed: {send_err}")
            session.is_connected = False
            session.error = str(send_err)
            return {
                "available": False,
                "status": "ERROR",
                "source": "RESEMBLE",
                "label": None,
                "synthetic_probability": None,
                "authenticity_score": None,
                "confidence": None,
                "aggregated_score": None,
                "consistency": None,
                "detail": f"Stream write failed: {send_err}"
            }

    async def _listen_resemble_responses(self, session: ResembleStreamSession):
        """
        Background listener task ingesting streaming detection results from Resemble AI.
        """
        try:
            async for raw_message in session.ws:
                try:
                    data = json.loads(raw_message) if isinstance(raw_message, str) else json.loads(raw_message.decode("utf-8"))
                    msg_type = data.get("type") or data.get("event")

                    if msg_type in ["ready", "START"]:
                        session.ready_event.set()
                        print(f"[RESEMBLE-READY] call_id={session.call_id}")
                        continue

                    # Handle error messages from Resemble
                    if "error" in data or "error_code" in data:
                        err_msg = data.get("error") or data.get("message") or "Resemble API error"
                        print(f"[RESEMBLE-ERROR] call_id={session.call_id} api_error: {err_msg}")
                        session.error = str(err_msg)
                        session.latest_result["status"] = "ERROR"
                        session.latest_result["detail"] = str(err_msg)
                        session.result_updated.set()
                        continue

                    label = data.get("label")  # "real", "fake", or None
                    aggregated_score = data.get("aggregated_score")  # 0.0 to 1.0 or None
                    score = data.get("score")  # instant chunk score
                    consistency = data.get("consistency")  # 0.0 to 1.0 or None
                    chunk_info = data.get("chunk_info")
                    duration = data.get("duration", 0.0)

                    session.ready_event.set()

                    # Handle NO_VOICE / insufficient voice activity
                    # When Resemble detects no voice or silence, do NOT invent fake 0% scores
                    if aggregated_score is None and score is None and label is None:
                        session.latest_result = {
                            "available": True,
                            "status": "NO_VOICE",
                            "source": "RESEMBLE",
                            "label": None,
                            "synthetic_probability": None,
                            "authenticity_score": None,
                            "confidence": None,
                            "aggregated_score": None,
                            "consistency": consistency,
                            "chunk_info": chunk_info,
                            "duration_analyzed_s": duration,
                            "raw": data,
                            "last_updated": time.time()
                        }
                        session.result_updated.set()
                        continue

                    # Score Normalization:
                    # Resemble score represents synthetic probability in range [0.0, 1.0].
                    # We normalize this to 0.0% to 100.0%.
                    synth_prob = None
                    auth_score = None
                    eff_score = aggregated_score if aggregated_score is not None else score
                    if eff_score is not None and isinstance(eff_score, (int, float)):
                        synth_prob = round(float(eff_score) * 100.0, 2)
                        auth_score = round(max(0.0, min(100.0, 100.0 - synth_prob)), 2)

                    norm_label = str(label).upper() if label else ("FAKE" if synth_prob and synth_prob >= 50.0 else "REAL" if synth_prob is not None else None)
                    norm_confidence = round(float(consistency), 2) if consistency is not None and isinstance(consistency, (int, float)) else (0.90 if synth_prob is not None else None)

                    session.latest_result = {
                        "available": True,
                        "status": "ACTIVE",
                        "source": "RESEMBLE",
                        "label": norm_label,
                        "synthetic_probability": synth_prob,
                        "authenticity_score": auth_score,
                        "confidence": norm_confidence,
                        "aggregated_score": eff_score,
                        "consistency": consistency,
                        "chunk_info": chunk_info,
                        "duration_analyzed_s": duration,
                        "raw": data,
                        "last_updated": time.time()
                    }
                    session.result_updated.set()

                    print(f"[RESEMBLE-CHUNK] call_id={session.call_id} label={norm_label} score={eff_score} synthetic_probability={synth_prob}% consistency={consistency}")
                except json.JSONDecodeError as json_err:
                    logger.warn(f"[RESEMBLE JSON ERROR] {json_err}")
        except websockets.ConnectionClosed as cc:
            print(f"[RESEMBLE-CLOSED] call_id={session.call_id} code={cc.code} reason={cc.reason}")
            session.is_connected = False
            session.result_updated.set()
        except Exception as e:
            print(f"[RESEMBLE-ERROR] call_id={session.call_id} receiver_error: {e}")
            session.is_connected = False
            session.error = str(e)
            session.result_updated.set()

    async def close_stream(self, call_id: str) -> Optional[dict]:
        """
        Cleanly concludes and closes the Resemble stream for a terminated call.
        """
        async with self._lock:
            return await self._cleanup_session(call_id)

    async def _cleanup_session(self, call_id: str) -> Optional[dict]:
        session = self.active_sessions.pop(call_id, None)
        if not session:
            return None

        print(f"[RESEMBLE-FINAL] call_id={call_id} chunks_sent={session.chunks_sent}")
        final_result = dict(session.latest_result)

        if session.ws and not session.ws.closed:
            try:
                # Send explicit end payload to Resemble API
                await session.ws.send(json.dumps({"type": "end"}))
                await asyncio.sleep(0.01)
                await session.ws.close()
            except Exception as close_err:
                print(f"[RESEMBLE-ERROR] call_id={call_id} close_error: {close_err}")

        if session.receiver_task and not session.receiver_task.done():
            session.receiver_task.cancel()
            try:
                await session.receiver_task
            except (asyncio.CancelledError, Exception):
                pass

        print(f"[RESEMBLE-CLOSED] call_id={call_id}")
        return final_result

    def get_health_status(self) -> dict:
        """
        Safe health report for /api/v1/health without revealing any secrets.
        """
        if not self.is_configured:
            return {
                "status": "NOT_CONFIGURED",
                "message": "RESEMBLE_API_KEY not configured",
                "details": {
                    "provider": "Resemble AI",
                    "endpoint": self.stream_url,
                    "configured": False
                }
            }
        return {
            "status": "CONFIGURED",
            "message": "Resemble AI streaming detector ready",
            "details": {
                "provider": "Resemble AI",
                "endpoint": self.stream_url,
                "configured": True,
                "active_streams": len(self.active_sessions)
            }
        }

resemble_detector = ResembleStreamingDetector()

