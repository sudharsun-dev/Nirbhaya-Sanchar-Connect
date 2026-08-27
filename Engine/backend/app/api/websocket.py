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
    print(f"[S2-WS-CONNECT] call_id={analysis_id} timestamp={time.time()}")
    
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
            if message.get("type") == "websocket.disconnect":
                break

            if "bytes" in message:
                start_pipeline_time = time.time()
                audio_bytes = message["bytes"]
                window_index += 1
                
                print(f"[S2-AUDIO-RECEIVED] call_id={analysis_id} window={window_index} bytes={len(audio_bytes)} timestamp={start_pipeline_time}")
                print(f"[AUDIO-RECEIVED] call_id={analysis_id} bytes={len(audio_bytes)} timestamp={start_pipeline_time}")

                try:
                    # 1. Process pipeline (in-memory)
                    processed_audio = preprocessor.process_audio_bytes(audio_bytes)
                    samples_count = processed_audio['tensor'].shape[-1] if 'tensor' in processed_audio and hasattr(processed_audio['tensor'], 'shape') else len(audio_bytes) // 2
                    print(f"[S2-AUDIO-DECODE] call_id={analysis_id} window={window_index} sample_rate={processed_audio['sample_rate']} channels={processed_audio['channels']} samples={samples_count} duration={processed_audio['duration_ms']} rms={processed_audio['rms_energy']}")
                    print(f"[AUDIO-DECODE] call_id={analysis_id} sample_rate={processed_audio['sample_rate']} channels={processed_audio['channels']} samples={samples_count} duration={processed_audio['duration_ms']} rms={processed_audio['rms_energy']}")
                    print(f"[S2-VAD] call_id={analysis_id} window={window_index} rms={processed_audio['rms_energy']} speech_detected={processed_audio['speech_detected']}")
                    print(f"[VAD] call_id={analysis_id} rms={processed_audio['rms_energy']} speech_detected={processed_audio['speech_detected']}")

                    print(f"[S2-AASIST-START] call_id={analysis_id} window={window_index} samples={samples_count}")
                    print(f"[AASIST-START] call_id={analysis_id} samples={samples_count}")
                    voice_res = voice_authenticity_engine.analyze_audio(processed_audio)
                    print(f"[S2-AASIST-RESULT] call_id={analysis_id} window={window_index} status={voice_res.get('status')} synthetic_probability={voice_res.get('synthetic_probability')} authenticity_score={voice_res.get('authenticity_score')} confidence={voice_res.get('confidence')}")
                    print(f"[AASIST-RESULT] call_id={analysis_id} spoof_logit={voice_res.get('spoof_logit')} bonafide_logit={voice_res.get('bonafide_logit')} synthetic_probability={voice_res.get('synthetic_probability')} authenticity_probability={voice_res.get('authenticity_score')} confidence={voice_res.get('confidence')}")

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

                    print(f"[S2-RISK-RESULT] call_id={analysis_id} window={window_index} risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} action={policy_output.get('recommended_action')} synthetic_probability={risk_output.get('synthetic_probability')}")
                    print(f"[RISK-ENGINE] call_id={analysis_id} synthetic_probability={risk_output.get('synthetic_probability')} speaker_score={risk_output.get('speaker_similarity')} context_score={risk_output.get('context_score')} behavior_score={risk_output.get('behavior_score')} risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} action={policy_output.get('recommended_action')}")

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
                    print(f"[S2-TELEMETRY-BROADCAST] call_id={analysis_id} window={window_index} synthetic_probability={risk_output['synthetic_probability']} risk_score={risk_output['risk_score']} risk_level={risk_output['risk_level']} action={policy_output['recommended_action']}")
                    print(f"[TELEMETRY-SEND] call_id={analysis_id} event=RISK_UPDATED risk_score={risk_output['risk_score']} risk_level={risk_output['risk_level']} synthetic_probability={risk_output['synthetic_probability']} confidence={risk_output['overall_confidence']}")
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

                    # 8. Persist Telemetry Metadata to DB safely
                    try:
                        async with AsyncSessionLocal() as db:
                            call_res = await db.execute(select(Call).where(Call.id == analysis_id))
                            call_obj = call_res.scalars().first()
                            if not call_obj:
                                call_obj = Call(
                                    id=analysis_id,
                                    caller_id="caller_stream",
                                    receiver_id="receiver_stream",
                                    channel="VOIP",
                                    status="ACTIVE"
                                )
                                db.add(call_obj)
                                await db.flush()

                            session_res = await db.execute(
                                select(AnalysisSession).where((AnalysisSession.id == analysis_id) | (AnalysisSession.call_id == analysis_id))
                            )
                            session_obj = session_res.scalars().first()
                            if not session_obj:
                                session_obj = AnalysisSession(
                                    id=analysis_id,
                                    call_id=call_obj.id,
                                    caller_id=call_obj.caller_id,
                                    receiver_id=call_obj.receiver_id,
                                    status="PROCESSING"
                                )
                                db.add(session_obj)
                                await db.flush()
                            else:
                                session_obj.status = "PROCESSING"

                            window_rec = AudioAnalysisWindow(
                                id=str(uuid.uuid4()),
                                analysis_id=session_obj.id,
                                window_index=window_index,
                                duration_ms=processed_audio.get("duration_ms", 2500.0),
                                sample_rate=processed_audio.get("sample_rate", 16000),
                                channels=processed_audio.get("channels", 1),
                                speech_detected=processed_audio.get("speech_detected", True),
                                audio_quality_score=processed_audio.get("audio_quality_score", 1.0)
                            )
                            db.add(window_rec)
                            await db.flush()

                            voice_rec = VoiceAnalysisResult(
                                analysis_id=session_obj.id,
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

                            risk_rec = RiskScore(
                                analysis_id=session_obj.id,
                                risk_score=risk_output.get("risk_score", 0.0),
                                risk_level=risk_output.get("risk_level", "LOW"),
                                overall_confidence=risk_output.get("overall_confidence", 0.0),
                                synthetic_probability=risk_output.get("synthetic_probability"),
                                speaker_similarity=risk_output.get("speaker_similarity"),
                                context_score=risk_output.get("context_score"),
                                transaction_score=risk_output.get("transaction_score"),
                                behavior_score=risk_output.get("behavior_score"),
                                reasons=risk_output.get("reasons", [])
                            )
                            db.add(risk_rec)

                            policy_rec = PolicyDecision(
                                analysis_id=session_obj.id,
                                policy_profile=policy_output.get("policy_profile", "BANK"),
                                recommended_action=policy_output.get("recommended_action", "CONTINUE"),
                                verification_required=policy_output.get("verification_required", False),
                                reasons=policy_output.get("reasons", [])
                            )
                            db.add(policy_rec)

                            await db.commit()
                    except Exception as db_err:
                        logger.warn(f"[DB LOG ERROR] Failed to persist window telemetry: {db_err}")

                except Exception as pipe_err:
                    print(f"[AASIST-ERROR] call_id={analysis_id} window={window_index} error={pipe_err}")
                    logger.exception(f"[PIPELINE ERROR] Audio analysis failed for window {window_index}: {pipe_err}")

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
        manager.disconnect(analysis_id, websocket)
    finally:
        manager.disconnect(analysis_id, websocket)
