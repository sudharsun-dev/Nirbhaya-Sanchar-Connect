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
    """
    def __init__(self, call_id: str, ws: websockets.WebSocketClientProtocol):
        self.call_id = call_id
        self.ws = ws
        self.is_connected = True
        self.ready_event = asyncio.Event()
        self.chunks_sent = 0
        self.latest_result: Dict[str, Any] = {
            "available": True,
            "status": "PROCESSING",
            "label": None,
            "synthetic_probability": None,
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
    Dedicated Resemble AI Streaming Voice Deepfake Detection Service.
    Connects to official Resemble WebSocket (wss://stream.resemble.ai/api/v1/detect/audio)
    using server-side credentials and streams 16kHz mono audio chunks.
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
                print(f"[RESEMBLE-CONNECTING] call_id={call_id} url={self.stream_url}")
                print(f"[TRACE-RESEMBLE-CONNECT] call_id={call_id} url={self.stream_url}")
                ws = await websockets.connect(
                    self.stream_url,
                    extra_headers=headers,
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
                    # If Resemble doesn't send explicit ready message, assume ready to send
                    session.ready_event.set()

                print(f"[RESEMBLE-READY] call_id={call_id} session_active=true")
                print(f"[TRACE-RESEMBLE-READY] call_id={call_id} ready=true")
                return session
            except websockets.exceptions.InvalidStatusCode as status_err:
                print(f"[RESEMBLE-ERROR] call_id={call_id} HTTP_{status_err.status_code}: {status_err}")
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
                "label": None,
                "synthetic_probability": None,
                "aggregated_score": None,
                "consistency": None,
                "detail": "RESEMBLE_API_KEY not configured on server."
            }

        session = await self.get_or_create_session(call_id)
        if not session or not session.is_connected:
            return {
                "available": False,
                "status": "UNAVAILABLE",
                "label": None,
                "synthetic_probability": None,
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

            print(f"[RESEMBLE-AUDIO-SEND] call_id={call_id} window={window_index} bytes={len(audio_bytes)}")
            print(f"[TRACE-RESEMBLE-SEND] call_id={call_id} window_index={window_index} bytes={len(audio_bytes)}")
            await session.ws.send(audio_bytes)
            session.chunks_sent += 1
            # Give receiver event loop a tiny yield to process any inbound frame
            await asyncio.sleep(0.005)
            res = dict(session.latest_result)
            print(f"[TRACE-RESEMBLE-RESULT] call_id={call_id} window_index={window_index} status={res.get('status')} synthetic_probability={res.get('synthetic_probability')} label={res.get('label')}")
            return res
        except Exception as send_err:
            print(f"[RESEMBLE-ERROR] call_id={call_id} send_failed: {send_err}")
            session.is_connected = False
            session.error = str(send_err)
            return {
                "available": False,
                "status": "ERROR",
                "label": None,
                "synthetic_probability": None,
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
                        print(f"[RESEMBLE-READY] call_id={session.call_id} handshake=received")
                        continue

                    # Handle error messages from Resemble
                    if "error" in data or "error_code" in data:
                        err_msg = data.get("error") or data.get("message") or "Resemble API error"
                        print(f"[RESEMBLE-ERROR] call_id={session.call_id} api_error: {err_msg}")
                        session.error = str(err_msg)
                        session.latest_result["status"] = "ERROR"
                        session.latest_result["detail"] = str(err_msg)
                        continue

                    label = data.get("label") # "real", "fake", or None
                    aggregated_score = data.get("aggregated_score") # 0.0 to 1.0 or None
                    score = data.get("score") # instant chunk score
                    consistency = data.get("consistency")
                    chunk_info = data.get("chunk_info")
                    duration = data.get("duration", 0.0)

                    session.ready_event.set()

                    # Handle NO_VOICE / insufficient voice activity
                    if aggregated_score is None and label is None:
                        session.latest_result = {
                            "available": True,
                            "status": "NO_VOICE",
                            "label": None,
                            "synthetic_probability": None,
                            "aggregated_score": None,
                            "consistency": consistency,
                            "chunk_info": chunk_info,
                            "duration_analyzed_s": duration,
                            "raw": data,
                            "last_updated": time.time()
                        }
                        continue

                    # Normalize synthetic probability (0.0 to 100.0%)
                    synth_prob = None
                    eff_score = aggregated_score if aggregated_score is not None else score
                    if eff_score is not None and isinstance(eff_score, (int, float)):
                        synth_prob = round(float(eff_score) * 100.0, 2)

                    norm_label = str(label).upper() if label else ("FAKE" if synth_prob and synth_prob >= 50.0 else "REAL" if synth_prob is not None else "PROCESSING")

                    session.latest_result = {
                        "available": True,
                        "status": "ACTIVE",
                        "label": norm_label,
                        "synthetic_probability": synth_prob,
                        "aggregated_score": aggregated_score,
                        "consistency": consistency,
                        "chunk_info": chunk_info,
                        "duration_analyzed_s": duration,
                        "raw": data,
                        "last_updated": time.time()
                    }

                    print(f"[RESEMBLE-CHUNK] call_id={session.call_id} label={norm_label} score={aggregated_score} synthetic_probability={synth_prob}% consistency={consistency}")
                except json.JSONDecodeError as json_err:
                    logger.warn(f"[RESEMBLE JSON ERROR] {json_err}")
        except websockets.ConnectionClosed as cc:
            print(f"[RESEMBLE-CLOSED] call_id={session.call_id} code={cc.code} reason={cc.reason}")
            session.is_connected = False
        except Exception as e:
            print(f"[RESEMBLE-ERROR] call_id={session.call_id} receiver_error: {e}")
            session.is_connected = False
            session.error = str(e)

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
