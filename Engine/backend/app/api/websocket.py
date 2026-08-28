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
from app.services.audio.preprocessor import preprocessor
from app.services.voice_detection import voice_detector
from app.services.speaker.verifier import speaker_verifier
from app.services.asr.asr_engine import asr_engine
from app.services.context.context_engine import context_engine
from app.services.transaction.transaction_engine import transaction_engine
from app.services.behavior.behavior_engine import behavior_engine
from app.services.risk.risk_engine import risk_engine
from app.services.policy.policy_engine import policy_engine, bank_policy_adapter
from app.services.system1.callback_service import callback_service
from app.services.qa import qa_service

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

    async def broadcast_event(self, analysis_id: str, event_data: dict):
        if analysis_id in self.active_connections:
            dead_sockets = set()
            for ws in list(self.active_connections[analysis_id]):
                try:
                    await ws.send_text(json.dumps(event_data))
                except Exception:
                    dead_sockets.add(ws)
            for dead in dead_sockets:
                self.active_connections[analysis_id].discard(dead)

    async def broadcast_all(self, event_data: dict):
        """Broadcasts event to all connected WebSocket clients across all active calls."""
        for analysis_id in list(self.active_connections.keys()):
            await self.broadcast_event(analysis_id, event_data)

manager = ConnectionManager()

@ws_router.websocket("/ws/analysis/{analysis_id}")
async def websocket_analysis_endpoint(websocket: WebSocket, analysis_id: str):
    """
    WebSocket endpoint for real-time audio chunk streaming and instant risk update notifications.
    Streams 16kHz mono audio directly to the free local Voice Authenticity Engine.
    """
    await manager.connect(analysis_id, websocket)
    client_host = websocket.client.host if websocket.client else 'unknown'
    print(f"[WS-CONNECT] analysis_id={analysis_id} client={client_host}")
    print(f"[WS-STARTED] analysis_id={analysis_id}")
    
    # Send current global QA state to newly connected client
    qa_state = qa_service.get_state()
    try:
        await websocket.send_text(json.dumps({
            "event": "QA_MODE_UPDATED",
            "enabled": qa_state["enabled"],
            "scenario": qa_state["scenario"],
            "updated_at": qa_state["updated_at"],
            "simulated_data": qa_service.get_simulated_payload() if qa_state["enabled"] else None
        }))
    except Exception:
        pass

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

            audio_bytes = message.get("bytes")
            text_data = message.get("text")

            if audio_bytes:
                start_pipeline_time = time.time()
                window_index += 1
                
                print(f"[AUDIO-RECEIVED]\ncall_id={analysis_id}\nbytes={len(audio_bytes)}\nwindow_index={window_index}\n")

                # 1. Audio Preprocessing & VAD (Pure NumPy)
                try:
                    processed_audio = preprocessor.process_audio_bytes(audio_bytes)
                except Exception as prep_err:
                    print(f"[AUDIO-DECODE-ERROR] call_id={analysis_id} window={window_index} error={prep_err}")
                    continue

                samples_count = processed_audio.get("samples_count", len(audio_bytes) // 2)
                sr = processed_audio.get("sample_rate", 16000)
                ch = processed_audio.get("channels", 1)
                dur_ms = processed_audio.get("duration_ms", 2500.0)
                rms = processed_audio.get("rms_energy", 0.0)
                vad = processed_audio.get("speech_detected", True)

                print(f"[AUDIO-DECODED]\nsample_rate={sr}\nchannels={ch}\nsamples={samples_count}\nduration_ms={dur_ms}\nrms={rms:.4f}\n")

                # 2. Local Voice Authenticity & Deepfake Audio Detection (Free Local Engine)
                voice_res = None
                print(f"[DETECTOR-CALL]\ncall_id={analysis_id}\nwindow_index={window_index}\n")
                try:
                    voice_res = await voice_detector.send_audio_chunk(
                        call_id=analysis_id,
                        audio_bytes=audio_bytes,
                        window_index=window_index
                    )
                except Exception as res_err:
                    print(f"[VOICE-DETECTOR-ERROR] call_id={analysis_id} window={window_index} error={res_err}")
                    voice_res = {
                        "available": False,
                        "status": "ERROR",
                        "source": "LOCAL_AI",
                        "label": None,
                        "synthetic_probability": None,
                        "authenticity_score": None,
                        "confidence": None,
                        "aggregated_score": None,
                        "consistency": None,
                        "detail": str(res_err)
                    }

                print(f"[DETECTOR-RESULT]\nsynthetic_probability={voice_res.get('synthetic_probability') if voice_res else None}\nauthenticity={voice_res.get('authenticity_score') if voice_res else None}\nconfidence={voice_res.get('confidence') if voice_res else None}\nverdict={voice_res.get('verdict') if voice_res else None}\n")

                # 3. Speaker Verification (Pure NumPy/SciPy)
                speaker_res = None
                try:
                    speaker_res = speaker_verifier.compare_speaker(processed_audio)
                except Exception as spk_err:
                    logger.warn(f"[SPEAKER ERROR] {spk_err}")
                    speaker_res = {
                        "identity_status": "UNKNOWN",
                        "similarity_score": None,
                        "confidence": 0.0,
                        "status": "SPEAKER_UNAVAILABLE"
                    }

                # 4. ASR Speech-To-Text (Independent)
                asr_res = None
                try:
                    asr_res = await asr_engine.transcribe(audio_bytes)
                except Exception as asr_err:
                    logger.warn(f"[ASR ERROR] {asr_err}")
                    asr_res = {
                        "text": None,
                        "language": "en",
                        "confidence": 0.0,
                        "status": "ASR_UNAVAILABLE"
                    }

                # 5. Context Intelligence (Independent)
                context_res = None
                try:
                    context_res = context_engine.analyze_text(asr_res.get("text", "") if asr_res else "")
                except Exception as ctx_err:
                    logger.warn(f"[CONTEXT ERROR] {ctx_err}")
                    context_res = {
                        "context_score": 0.0,
                        "urgency_level": "NORMAL",
                        "suspicious_phrases": [],
                        "risk_flags": []
                    }

                # 6. Behavioral Signals (Independent)
                behavior_res = None
                try:
                    behavior_res = behavior_engine.analyze_behavior(processed_audio, text_transcript=asr_res.get("text", "") if asr_res else "")
                except Exception as beh_err:
                    logger.warn(f"[BEHAVIOR ERROR] {beh_err}")
                    behavior_res = {
                        "behavior_score": 0.0,
                        "anomalies": []
                    }

                # 7. Deterministic Risk & Policy Computation
                risk_output = risk_engine.compute_risk(
                    voice_result=voice_res,
                    speaker_result=speaker_res,
                    context_result=context_res,
                    transaction_result=None,
                    behavior_result=behavior_res
                )
                policy_output = policy_engine.evaluate(risk_output=risk_output, profile_name="BANK")
                pipeline_latency_ms = round((time.time() - start_pipeline_time) * 1000, 2)
                
                synth_prob = risk_output.get("synthetic_probability")
                auth_score = risk_output.get("authenticity_score")
                risk_score_val = risk_output.get("risk_score")
                risk_level_val = risk_output.get("risk_level")
                rec_action = policy_output.get("recommended_action", risk_output.get("action", "CONTINUE"))

                print(f"[RISK-RESULT]\nrisk_score={risk_score_val}\nrisk_level={risk_level_val}\naction={rec_action}\n")

                # 8. Broadcast AUDIO_PROCESSED
                await manager.broadcast_event(analysis_id, {
                    "event": "AUDIO_PROCESSED",
                    "call_id": analysis_id,
                    "analysis_id": analysis_id,
                    "window_index": window_index,
                    "duration_ms": processed_audio["duration_ms"],
                    "speech_detected": processed_audio["speech_detected"],
                    "audio_quality_score": processed_audio["audio_quality_score"],
                    "processing_latency_ms": pipeline_latency_ms
                })

                # 9. Broadcast Authoritative RISK_UPDATED Telemetry
                is_qa = qa_service.is_enabled()
                qa_sim_data = qa_service.get_simulated_payload() if is_qa else None

                effective_synth_prob = qa_sim_data["synthetic_probability"] if is_qa else synth_prob
                effective_auth_score = qa_sim_data["authenticity_score"] if is_qa else auth_score
                effective_risk_score = qa_sim_data["risk_score"] if is_qa else risk_score_val
                effective_risk_level = qa_sim_data["risk_level"] if is_qa else risk_level_val
                effective_label = qa_sim_data["label"] if is_qa else (voice_res.get("label") if voice_res else None)
                effective_action = qa_sim_data["action"] if is_qa else rec_action
                effective_reasons = qa_sim_data["reasons"] if is_qa else policy_output.get("reasons", risk_output.get("reasons", []))

                risk_event_payload = {
                    "event": "RISK_UPDATED",
                    "call_id": analysis_id,
                    "analysis_id": analysis_id,
                    "window_index": window_index,
                    "detector": "LOCAL_AI",
                    "detector_source": voice_res.get("detector_source", "LOCAL_AI") if voice_res else "LOCAL_AI",
                    "model": voice_res.get("model", voice_res.get("model_name", "Acoustic-Spectral-Vocoder-Artifact-Detector (v1.2)")) if voice_res else "Acoustic-Spectral-Vocoder-Artifact-Detector (v1.2)",
                    "synthetic_probability": effective_synth_prob,
                    "authenticity_score": effective_auth_score,
                    "confidence": qa_sim_data["confidence"] if is_qa else risk_output.get("overall_confidence", voice_res.get("confidence") if voice_res else None),
                    "risk_score": effective_risk_score,
                    "risk_level": effective_risk_level,
                    "action": effective_action,
                    "label": effective_label,
                    "voice_authenticity": voice_res,
                    "pretrained_deepfake_detector": voice_res,
                    "resemble": voice_res,
                    "risk": {
                        "score": effective_risk_score,
                        "level": effective_risk_level,
                        "action": effective_action
                    },
                    "speaker_similarity": risk_output.get("speaker_similarity"),
                    "context_score": risk_output.get("context_score"),
                    "reasons": effective_reasons,
                    "recommended_action": effective_action,
                    "processing_latency_ms": pipeline_latency_ms,
                    "simulated": is_qa,
                    "qa_scenario": qa_service.get_scenario() if is_qa else None
                }
                
                print(f"[WS-SEND]\nevent=RISK_UPDATED\n")
                print(f"[TELEMETRY-BROADCAST] call_id={analysis_id} window={window_index} risk_score={effective_risk_score} synthetic_probability={effective_synth_prob} risk_level={effective_risk_level} action={effective_action} simulated={is_qa}")
                await manager.broadcast_event(analysis_id, risk_event_payload)

                # 10. Broadcast POLICY_UPDATED
                await manager.broadcast_event(analysis_id, {
                    "event": "POLICY_UPDATED",
                    "call_id": analysis_id,
                    "analysis_id": analysis_id,
                    "recommended_action": effective_action,
                    "verification_required": policy_output.get("verification_required", False),
                    "reasons": effective_reasons,
                    "simulated": is_qa
                })

                # 11. Broadcast ALERT_CREATED if HIGH risk
                if effective_risk_level == "HIGH":
                    sec_msg = bank_policy_adapter.format_system1_message(risk_output, policy_output)
                    await manager.broadcast_event(analysis_id, {
                        "event": "ALERT_CREATED",
                        "call_id": analysis_id,
                        "analysis_id": analysis_id,
                        "alert_level": "HIGH",
                        "security_message": f"[SIMULATED QA] {sec_msg}" if is_qa else sec_msg,
                        "recommended_action": "HOLD & INDEPENDENTLY VERIFY",
                        "simulated": is_qa
                    })

                # 12. Asynchronously Trigger System 1 Server Callback ONLY when NOT in QA mode
                if not is_qa:
                    try:
                        cb_res = await callback_service.send_callback(
                            event="RISK_UPDATED",
                            call_id=analysis_id,
                            analysis_id=analysis_id,
                            risk_output=risk_output,
                            policy_output=policy_output,
                            verification_required=policy_output.get("verification_required", False),
                            resemble_res=voice_res,
                            window_index=window_index
                        )
                        print(f"[CALLBACK] status={cb_res.get('status')} HTTP={cb_res.get('http_status')} error={cb_res.get('error')}")
                    except Exception as cb_err:
                        print(f"[CALLBACK] status=FAILED HTTP=None error={cb_err}")
                else:
                    print(f"[CALLBACK-BYPASS] QA Mode active ({qa_service.get_scenario()}). Protected real fraud callback.")

                # 13. Persist Telemetry Metadata to DB safely ONLY when NOT in QA mode
                if not is_qa:
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
                                synthetic_probability=synth_prob,
                                authenticity_score=auth_score,
                                confidence=risk_output.get("overall_confidence", 0.0) or 0.0,
                                audio_quality=processed_audio.get("audio_quality_score", 1.0),
                                model_name=voice_res.get("model", "Sara1708/deepfake-audio-wav2vec2") if voice_res else "Sara1708/deepfake-audio-wav2vec2",
                                model_version="1.0",
                                inference_time_ms=pipeline_latency_ms,
                                status=voice_res.get("status", "SUCCESS") if voice_res else "ERROR"
                            )
                            db.add(voice_rec)

                            risk_rec = RiskScore(
                                analysis_id=session_obj.id,
                                risk_score=risk_score_val if risk_score_val is not None else 0.0,
                                risk_level=risk_level_val if risk_level_val is not None else "LOW",
                                overall_confidence=risk_output.get("overall_confidence", 0.0) or 0.0,
                                synthetic_probability=synth_prob,
                                speaker_similarity=risk_output.get("speaker_similarity"),
                                context_score=risk_output.get("context_score"),
                                transaction_score=risk_output.get("transaction_score"),
                                behavior_score=risk_output.get("behavior_score"),
                                reasons=policy_output.get("reasons", [])
                            )
                            db.add(risk_rec)

                            policy_rec = PolicyDecision(
                                analysis_id=session_obj.id,
                                policy_profile=policy_output.get("policy_profile", "BANK"),
                                recommended_action=rec_action,
                                verification_required=policy_output.get("verification_required", False),
                                reasons=policy_output.get("reasons", [])
                            )
                            db.add(policy_rec)

                            await db.commit()
                    except Exception as db_err:
                        print(f"[DB-ERROR] Failed to persist window telemetry: {db_err}")

            elif text_data:
                try:
                    json_msg = json.loads(text_data)
                    if json_msg.get("type") == "PING":
                        await websocket.send_text(json.dumps({"type": "PONG"}))
                except Exception:
                    pass

    except WebSocketDisconnect:
        manager.disconnect(analysis_id, websocket)
        try:
            await voice_detector.close_stream(analysis_id)
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[WS EXCEPTION] WebSocket error: {e}")
        manager.disconnect(analysis_id, websocket)
        try:
            await voice_detector.close_stream(analysis_id)
        except Exception:
            pass
    finally:
        manager.disconnect(analysis_id, websocket)
        try:
            await voice_detector.close_stream(analysis_id)
        except Exception:
            pass

