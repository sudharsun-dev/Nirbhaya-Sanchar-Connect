import json
import time
import uuid
import logging
from datetime import datetime
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.future import select

from app.database.session import AsyncSessionLocal
from app.database.models import (
    Call, AnalysisSession, AudioAnalysisWindow, VoiceAnalysisResult,
    SpeakerAnalysisResult, AsrResult, ContextAnalysisResult, RiskScore,
    PolicyDecision, Alert, AuditLog
)
from app.config import settings
from app.services.audio.preprocessor import preprocessor
from app.services.voice_detection.authenticity import voice_authenticity_engine
from app.services.speaker.verifier import speaker_verifier
from app.services.asr.asr_engine import asr_engine
from app.services.context.context_engine import context_engine
from app.services.transaction.transaction_engine import transaction_engine
from app.services.behavior.behavior_engine import behavior_engine
from app.services.risk.risk_engine import risk_engine
from app.services.policy.policy_engine import policy_engine, bank_policy_adapter
from app.services.system1.callback_service import callback_service

logger = logging.getLogger("nirbhaya.websocket")
ws_router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # Maps analysis_id -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, analysis_id: str, websocket: WebSocket):
        await websocket.accept()
        if analysis_id not in self.active_connections:
            self.active_connections[analysis_id] = set()
        self.active_connections[analysis_id].add(websocket)

    def disconnect(self, analysis_id: str, websocket: WebSocket):
        if analysis_id in self.active_connections:
            self.active_connections[analysis_id].discard(websocket)
            if not self.active_connections[analysis_id]:
                del self.active_connections[analysis_id]

    async def broadcast_event(self, analysis_id: str, payload: dict):
        if analysis_id in self.active_connections:
            connections = list(self.active_connections[analysis_id])
            for connection in connections:
                try:
                    await connection.send_text(json.dumps(payload))
                except Exception:
                    self.disconnect(analysis_id, connection)

manager = ConnectionManager()

@ws_router.websocket("/ws/analysis/{analysis_id}")
async def websocket_analysis_endpoint(websocket: WebSocket, analysis_id: str):
    """
    WebSocket endpoint for real-time audio chunk streaming and instant risk update notifications.
    Processes real audio in memory buffers without persisting raw audio.
    """
    await manager.connect(analysis_id, websocket)
    
    # Broadcast ANALYSIS_STARTED
    await manager.broadcast_event(analysis_id, {
        "event": "ANALYSIS_STARTED",
        "analysis_id": analysis_id,
        "status": "ACTIVE"
    })

    window_index = 0

    try:
        while True:
            # Receive binary audio chunk or JSON message from client
            message = await websocket.receive()

            if "bytes" in message:
                start_pipeline_time = time.time()
                audio_bytes = message["bytes"]
                window_index += 1
                
                # 1. Process pipeline (in-memory)
                processed_audio = preprocessor.process_audio_bytes(audio_bytes)
                voice_res = voice_authenticity_engine.analyze_audio(processed_audio)
                speaker_res = speaker_verifier.compare_speaker(processed_audio)
                asr_res = await asr_engine.transcribe(audio_bytes)
                context_res = context_engine.analyze_text(asr_res.get("text", ""))
                behavior_res = behavior_engine.analyze_behavior(processed_audio, text_transcript=asr_res.get("text", ""))

                # 2. Calculate Deterministic Risk & Policy
                risk_output = risk_engine.compute_risk(
                    voice_result=voice_res,
                    speaker_result=speaker_res,
                    context_result=context_res,
                    transaction_result=None,
                    behavior_result=behavior_res
                )

                policy_output = policy_engine.evaluate(risk_output=risk_output, profile_name="BANK")
                pipeline_latency_ms = round((time.time() - start_pipeline_time) * 1000, 2)

                # Safe Metadata Logging
                print(f"[AUDIO-INGEST] call_id={analysis_id} chunk={window_index} bytes_received={len(audio_bytes)} sample_rate={processed_audio['sample_rate']} speech_detected={processed_audio['speech_detected']}")
                print(f"[AI-ANALYSIS] call_id={analysis_id} window={window_index} synthetic_probability={voice_res.get('synthetic_probability')} model_confidence={voice_res.get('confidence')} audio_quality={processed_audio['audio_quality_score']}")
                print(f"[RISK] call_id={analysis_id} voice_authenticity={voice_res.get('authenticity_score')} speaker_score={speaker_res.get('similarity_score')} context_score={risk_output.get('context_score')} behavior_score={risk_output.get('behavior_score')} final_risk_score={risk_output['risk_score']} risk_level={risk_output['risk_level']}")

                # 3. Broadcast AUDIO_PROCESSED
                await manager.broadcast_event(analysis_id, {
                    "event": "AUDIO_PROCESSED",
                    "analysis_id": analysis_id,
                    "window_index": window_index,
                    "duration_ms": processed_audio["duration_ms"],
                    "speech_detected": processed_audio["speech_detected"],
                    "audio_quality_score": processed_audio["audio_quality_score"],
                    "processing_latency_ms": pipeline_latency_ms
                })

                # 4. Broadcast RISK_UPDATED
                risk_event_payload = {
                    "event": "RISK_UPDATED",
                    "analysis_id": analysis_id,
                    "window_index": window_index,
                    "risk_score": risk_output["risk_score"],
                    "risk_level": risk_output["risk_level"],
                    "overall_confidence": risk_output["overall_confidence"],
                    "synthetic_probability": risk_output["synthetic_probability"],
                    "speaker_similarity": risk_output["speaker_similarity"],
                    "context_score": risk_output["context_score"],
                    "reasons": risk_output["reasons"],
                    "recommended_action": policy_output["recommended_action"],
                    "processing_latency_ms": pipeline_latency_ms
                }
                await manager.broadcast_event(analysis_id, risk_event_payload)

                # 5. Broadcast POLICY_UPDATED
                await manager.broadcast_event(analysis_id, {
                    "event": "POLICY_UPDATED",
                    "analysis_id": analysis_id,
                    "recommended_action": policy_output["recommended_action"],
                    "verification_required": policy_output["verification_required"],
                    "reasons": policy_output["reasons"]
                })

                # 6. Broadcast ALERT_CREATED if HIGH risk
                if risk_output["risk_level"] == "HIGH":
                    sec_msg = bank_policy_adapter.format_system1_message(risk_output, policy_output)
                    await manager.broadcast_event(analysis_id, {
                        "event": "ALERT_CREATED",
                        "analysis_id": analysis_id,
                        "alert_level": "HIGH",
                        "security_message": sec_msg,
                        "recommended_action": "HOLD & INDEPENDENTLY VERIFY"
                    })

                # 7. Asynchronously Trigger System 1 Server Callback
                try:
                    await callback_service.send_callback(
                        event="RISK_UPDATED",
                        call_id=analysis_id,
                        analysis_id=analysis_id,
                        risk_output=risk_output,
                        policy_output=policy_output,
                        verification_required=policy_output["verification_required"]
                    )
                except Exception as cb_err:
                    logger.warn(f"[CALLBACK ERROR] Failed callback to System 1: {cb_err}")

                # 8. Persist Telemetry Metadata to DB (No raw audio stored)
                try:
                    async with AsyncSessionLocal() as db:
                        # Ensure call and session records exist
                        session_res = await db.execute(select(AnalysisSession).where(AnalysisSession.id == analysis_id))
                        session_obj = session_res.scalars().first()
                        if not session_obj:
                            # Register placeholder session if not initiated via REST
                            call_record = Call(
                                id=analysis_id,
                                caller_id="caller_stream",
                                receiver_id="receiver_stream",
                                channel="VOIP",
                                status="ACTIVE"
                            )
                            db.add(call_record)
                            session_obj = AnalysisSession(
                                id=analysis_id,
                                call_id=analysis_id,
                                caller_id="caller_stream",
                                receiver_id="receiver_stream",
                                status="PROCESSING"
                            )
                            db.add(session_obj)

                        # Window Record
                        window_rec = AudioAnalysisWindow(
                            id=str(uuid.uuid4()),
                            analysis_id=analysis_id,
                            window_index=window_index,
                            duration_ms=processed_audio["duration_ms"],
                            sample_rate=processed_audio["sample_rate"],
                            channels=processed_audio["channels"],
                            speech_detected=processed_audio["speech_detected"],
                            audio_quality_score=processed_audio["audio_quality_score"]
                        )
                        db.add(window_rec)

                        # Voice Result
                        voice_rec = VoiceAnalysisResult(
                            analysis_id=analysis_id,
                            window_id=window_rec.id,
                            synthetic_probability=voice_res.get("synthetic_probability"),
                            authenticity_score=voice_res.get("authenticity_score"),
                            confidence=voice_res.get("confidence", 0.0),
                            audio_quality=voice_res.get("audio_quality", 1.0),
                            model_name=voice_res.get("model_name", settings.VOICE_MODEL_NAME),
                            model_version=voice_res.get("model_version", settings.VOICE_MODEL_VERSION),
                            inference_time_ms=voice_res.get("inference_time_ms", 0.0),
                            status=voice_res.get("status", "SUCCESS")
                        )
                        db.add(voice_rec)

                        # Risk Score
                        risk_rec = RiskScore(
                            analysis_id=analysis_id,
                            risk_score=risk_output["risk_score"],
                            risk_level=risk_output["risk_level"],
                            overall_confidence=risk_output["overall_confidence"],
                            synthetic_probability=risk_output["synthetic_probability"],
                            speaker_similarity=risk_output["speaker_similarity"],
                            context_score=risk_output["context_score"],
                            transaction_score=risk_output["transaction_score"],
                            behavior_score=risk_output["behavior_score"],
                            reasons=risk_output["reasons"]
                        )
                        db.add(risk_rec)

                        # Policy Decision
                        policy_rec = PolicyDecision(
                            analysis_id=analysis_id,
                            policy_profile=policy_output["policy_profile"],
                            recommended_action=policy_output["recommended_action"],
                            verification_required=policy_output["verification_required"],
                            reasons=policy_output["reasons"]
                        )
                        db.add(policy_rec)

                        await db.commit()
                except Exception as db_err:
                    logger.warn(f"[DB LOG ERROR] Failed to persist window telemetry: {db_err}")

            elif "text" in message:
                text_data = message["text"]
                try:
                    json_msg = json.loads(text_data)
                    if json_msg.get("type") == "PING":
                        await websocket.send_text(json.dumps({"type": "PONG"}))
                except Exception:
                    pass

    except WebSocketDisconnect:
        manager.disconnect(analysis_id, websocket)
    except Exception as e:
        logger.error(f"[WS EXCEPTION] WebSocket error: {e}")
        await manager.broadcast_event(analysis_id, {
            "event": "ERROR",
            "analysis_id": analysis_id,
            "error_message": str(e)
        })
        manager.disconnect(analysis_id, websocket)
