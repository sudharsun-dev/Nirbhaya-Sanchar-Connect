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
from app.services.voice_detection.resemble_detector import resemble_detector
from app.services.voice_detection.ensemble import voice_ensemble
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
    client_host = websocket.client.host if websocket.client else 'unknown'
    print(f"[WS-CONNECT] analysis_id={analysis_id} client={client_host}")
    print(f"[WS-STARTED] analysis_id={analysis_id}")
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

            audio_bytes = message.get("bytes")
            text_data = message.get("text")

            if audio_bytes:
                start_pipeline_time = time.time()
                window_index += 1
                
                print(f"[REAL-MIC-BACKEND-RECEIVE] call_id={analysis_id} window_index={window_index} bytes={len(audio_bytes)}")
                print(f"[TRACE-S2-AUDIO-RECEIVE] call_id={analysis_id} message_type=bytes bytes={len(audio_bytes)} window_index={window_index}")
                print(f"[SERVER-WS-RECEIVE] analysis_id={analysis_id} message_type=bytes bytes={len(audio_bytes)}")
                print(f"[S2-AUDIO-RECEIVED] call_id={analysis_id} window={window_index} bytes={len(audio_bytes)} timestamp={start_pipeline_time}")
                print(f"[AUDIO-RECEIVED] call_id={analysis_id} bytes={len(audio_bytes)} timestamp={start_pipeline_time}")

                # 1. Audio Preprocessing & VAD
                try:
                    processed_audio = preprocessor.process_audio_bytes(audio_bytes)
                except Exception as prep_err:
                    print(f"[AUDIO-DECODE-ERROR] call_id={analysis_id} window={window_index} error={prep_err}")
                    print(f"[TRACE-AUDIO-DECODE-ERROR] error={prep_err} bytes={len(audio_bytes)}")
                    continue

                tensor = processed_audio.get("tensor")
                samples_count = tensor.shape[-1] if tensor is not None and hasattr(tensor, "shape") else len(audio_bytes) // 2
                sr = processed_audio.get("sample_rate", 16000)
                ch = processed_audio.get("channels", 1)
                dur_ms = processed_audio.get("duration_ms", 2500.0)
                rms = processed_audio.get("rms_energy", 0.0)
                vad = processed_audio.get("speech_detected", True)

                print(f"[REAL-MIC-BACKEND-DECODE] sample_rate={sr} channels={ch} samples={samples_count} duration_ms={dur_ms} rms={rms}")
                if not vad or rms <= 0.005:
                    print(f"[REAL-MIC-SILENCE] rms={rms} speech_detected={vad}")

                print(f"[TRACE-AUDIO-DECODE] call_id={analysis_id} window_index={window_index} sample_rate={sr} channels={ch} samples={samples_count} duration_ms={dur_ms} rms={rms}")
                print(f"[S2-AUDIO-DECODE] call_id={analysis_id} window={window_index} sample_rate={sr} channels={ch} samples={samples_count} duration={dur_ms} rms={rms}")
                print(f"[AUDIO-DECODE] sample_rate={sr} channels={ch} samples={samples_count} duration_ms={dur_ms} rms={rms}")
                print(f"[TRACE-VAD] call_id={analysis_id} window_index={window_index} rms={rms} speech_detected={vad}")
                print(f"[S2-VAD] call_id={analysis_id} window={window_index} rms={rms} speech_detected={vad}")
                print(f"[VAD] speech_detected={vad} rms={rms}")

                # 2. AASIST Voice Authenticity Inference (Independent)
                voice_res = None
                try:
                    print(f"[TRACE-AASIST-START] call_id={analysis_id} window_index={window_index} samples={samples_count}")
                    print(f"[S2-AASIST-START] call_id={analysis_id} window={window_index} samples={samples_count}")
                    print(f"[AASIST-START] model=AASIST sample_rate={sr} samples={samples_count} window_index={window_index}")
                    print(f"[AASIST-INPUT] shape={list(tensor.shape) if tensor is not None else []} dtype={str(tensor.dtype) if tensor is not None else 'unknown'} device={str(tensor.device) if tensor is not None else 'cpu'} sample_rate={sr} samples={samples_count}")
                    voice_res = voice_authenticity_engine.analyze_audio(processed_audio)
                    print(f"[TRACE-AASIST-RESULT] call_id={analysis_id} window_index={window_index} synthetic_probability={voice_res.get('synthetic_probability')} authenticity_score={voice_res.get('authenticity_score')} confidence={voice_res.get('confidence')}")
                    print(f"[S2-AASIST-RESULT] call_id={analysis_id} window={window_index} status={voice_res.get('status')} synthetic_probability={voice_res.get('synthetic_probability')} authenticity_score={voice_res.get('authenticity_score')} confidence={voice_res.get('confidence')}")
                    print(f"[AASIST-OUTPUT] raw_output={{'spoof': {voice_res.get('spoof_logit')}, 'bonafide': {voice_res.get('bonafide_logit')}}} synthetic_probability={voice_res.get('synthetic_probability')} authenticity_score={voice_res.get('authenticity_score')} confidence={voice_res.get('confidence')}")
                    print(f"[AASIST-RESULT] synthetic_probability={voice_res.get('synthetic_probability')} authenticity_score={voice_res.get('authenticity_score')} confidence={voice_res.get('confidence')}")
                except Exception as aasist_err:
                    print(f"[AASIST-ERROR] call_id={analysis_id} window={window_index} error={aasist_err}")
                    voice_res = {
                        "status": "ERROR",
                        "synthetic_probability": None,
                        "authenticity_score": None,
                        "confidence": 0.0,
                        "audio_quality": processed_audio.get("audio_quality_score", 1.0),
                        "model_name": settings.VOICE_MODEL_NAME,
                        "model_version": settings.VOICE_MODEL_VERSION,
                        "weights_loaded": voice_authenticity_engine.weights_loaded,
                        "status_detail": str(aasist_err)
                    }

                # 3. Resemble AI Streaming Deepfake Detection (Independent)
                resemble_res = None
                try:
                    resemble_res = await resemble_detector.send_audio_chunk(
                        call_id=analysis_id,
                        audio_bytes=audio_bytes,
                        window_index=window_index
                    )
                except Exception as res_err:
                    print(f"[RESEMBLE-ERROR] call_id={analysis_id} window={window_index} error={res_err}")
                    resemble_res = {
                        "available": False,
                        "status": "ERROR",
                        "label": None,
                        "synthetic_probability": None,
                        "aggregated_score": None,
                        "consistency": None,
                        "detail": str(res_err)
                    }

                # 4. Multi-Model Voice Ensemble (AASIST + Resemble)
                print(f"[ENSEMBLE-INPUT] call_id={analysis_id} aasist_synth={voice_res.get('synthetic_probability')} resemble_synth={resemble_res.get('synthetic_probability') if resemble_res else None}")
                ensemble_res = voice_ensemble.combine_voice_detectors(
                    aasist_res=voice_res,
                    resemble_res=resemble_res
                )
                print(f"[TRACE-COMBINED-RESULT] call_id={analysis_id} window_index={window_index} synthetic_probability={ensemble_res.get('synthetic_probability')} agreement={ensemble_res.get('detector_agreement')} confidence={ensemble_res.get('confidence')}")
                print(f"[ENSEMBLE-RESULT] call_id={analysis_id} synthetic_probability={ensemble_res.get('synthetic_probability')} agreement={ensemble_res.get('detector_agreement')} confidence={ensemble_res.get('confidence')}")

                # 5. Speaker Verification (Independent)
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

                # 6. ASR Speech-To-Text (Independent)
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

                # 7. Context Intelligence (Independent)
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

                # 8. Behavioral Signals (Independent)
                behavior_res = None
                try:
                    behavior_res = behavior_engine.analyze_behavior(processed_audio, text_transcript=asr_res.get("text", "") if asr_res else "")
                except Exception as beh_err:
                    logger.warn(f"[BEHAVIOR ERROR] {beh_err}")
                    behavior_res = {
                        "behavior_score": 0.0,
                        "anomalies": []
                    }

                # 9. Deterministic Risk & Policy Computation using Ensemble Voice Signal
                synth_val = ensemble_res.get("synthetic_probability")
                spk_val = speaker_res.get("similarity_score") if speaker_res else None
                ctx_val = context_res.get("context_score", 0.0) if context_res else 0.0
                beh_val = behavior_res.get("behavior_score", 0.0) if behavior_res else 0.0

                print(f"[RISK-INPUT] synthetic_probability={synth_val} speaker_similarity={spk_val} context_score={ctx_val} behavior_score={beh_val} transaction_score=None")
                risk_output = risk_engine.compute_risk(
                    voice_result=ensemble_res,
                    speaker_result=speaker_res,
                    context_result=context_res,
                    transaction_result=None,
                    behavior_result=behavior_res
                )
                policy_output = policy_engine.evaluate(risk_output=risk_output, profile_name="BANK")
                pipeline_latency_ms = round((time.time() - start_pipeline_time) * 1000, 2)
                auth_score = ensemble_res.get("authenticity_score")

                print(f"[TRACE-RISK-RESULT] call_id={analysis_id} window_index={window_index} synthetic_probability={risk_output.get('synthetic_probability')} authenticity_score={auth_score} confidence={risk_output.get('overall_confidence')} risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} recommended_action={policy_output.get('recommended_action')}")
                print(f"[TRACE-RISK] call_id={analysis_id} window_index={window_index} synthetic_probability={risk_output.get('synthetic_probability')} authenticity_score={auth_score} confidence={risk_output.get('overall_confidence')} risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} recommended_action={policy_output.get('recommended_action')}")
                print(f"[S2-RISK-RESULT] call_id={analysis_id} window={window_index} risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} action={policy_output.get('recommended_action')} synthetic_probability={risk_output.get('synthetic_probability')}")
                print(f"[RISK-OUTPUT] risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} overall_confidence={risk_output.get('overall_confidence')}")
                print(f"[RISK-ENGINE] call_id={analysis_id} synthetic_probability={risk_output.get('synthetic_probability')} speaker_score={risk_output.get('speaker_similarity')} context_score={risk_output.get('context_score')} behavior_score={risk_output.get('behavior_score')} risk_score={risk_output.get('risk_score')} risk_level={risk_output.get('risk_level')} action={policy_output.get('recommended_action')}")

                # 10. Broadcast AUDIO_PROCESSED
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

                # 11. Broadcast Multi-Model RISK_UPDATED (Comprehensive & Backward-Compatible)
                risk_event_payload = {
                    "event": "RISK_UPDATED",
                    "call_id": analysis_id,
                    "analysis_id": analysis_id,
                    "window_index": window_index,
                    "audio": {
                        "sample_rate": sr,
                        "channels": ch,
                        "duration_ms": dur_ms
                    },
                    "risk_score": risk_output["risk_score"],
                    "risk_level": risk_output["risk_level"],
                    "overall_confidence": risk_output["overall_confidence"],
                    "synthetic_probability": risk_output["synthetic_probability"],
                    "authenticity_score": auth_score,
                    "aasist": ensemble_res["aasist"],
                    "resemble": ensemble_res["resemble"],
                    "combined": ensemble_res.get("combined", {
                        "synthetic_probability": ensemble_res["synthetic_probability"],
                        "authenticity": auth_score,
                        "confidence": ensemble_res["confidence"],
                        "detector_agreement": ensemble_res["detector_agreement"]
                    }),
                    "ensemble": {
                        "synthetic_probability": ensemble_res["synthetic_probability"],
                        "confidence": ensemble_res["confidence"],
                        "detector_agreement": ensemble_res["detector_agreement"],
                        "method": ensemble_res["method"]
                    },
                    "risk": {
                        "score": risk_output["risk_score"],
                        "level": risk_output["risk_level"],
                        "action": policy_output["recommended_action"]
                    },
                    "speaker_similarity": risk_output["speaker_similarity"],
                    "context_score": risk_output["context_score"],
                    "reasons": risk_output["reasons"],
                    "recommended_action": policy_output["recommended_action"],
                    "processing_latency_ms": pipeline_latency_ms
                }
                print(f"[TRACE-TELEMETRY-BROADCAST] call_id={analysis_id} window_index={window_index} event=RISK_UPDATED risk_score={risk_output['risk_score']} synthetic_probability={risk_output['synthetic_probability']}")
                print(f"[TRACE-TELEMETRY-SEND] call_id={analysis_id} window_index={window_index} event=RISK_UPDATED risk_score={risk_output['risk_score']} synthetic_probability={risk_output['synthetic_probability']}")
                print(f"[S2-TELEMETRY-BROADCAST] call_id={analysis_id} window={window_index} synthetic_probability={risk_output['synthetic_probability']} risk_score={risk_output['risk_score']} risk_level={risk_output['risk_level']} action={policy_output['recommended_action']}")
                print(f"[TELEMETRY-SEND] analysis_id={analysis_id} window={window_index} risk_score={risk_output['risk_score']} synthetic_probability={risk_output['synthetic_probability']} risk_level={risk_output['risk_level']} action={policy_output['recommended_action']}")
                await manager.broadcast_event(analysis_id, risk_event_payload)

                # 10. Broadcast POLICY_UPDATED
                await manager.broadcast_event(analysis_id, {
                    "event": "POLICY_UPDATED",
                    "call_id": analysis_id,
                    "analysis_id": analysis_id,
                    "recommended_action": policy_output["recommended_action"],
                    "verification_required": policy_output["verification_required"],
                    "reasons": policy_output["reasons"]
                })

                # 11. Broadcast ALERT_CREATED if HIGH risk
                if risk_output["risk_level"] == "HIGH":
                    sec_msg = bank_policy_adapter.format_system1_message(risk_output, policy_output)
                    await manager.broadcast_event(analysis_id, {
                        "event": "ALERT_CREATED",
                        "call_id": analysis_id,
                        "analysis_id": analysis_id,
                        "alert_level": "HIGH",
                        "security_message": sec_msg,
                        "recommended_action": "HOLD & INDEPENDENTLY VERIFY"
                    })

                # 12. Asynchronously Trigger System 1 Server Callback (Non-blocking)
                try:
                    cb_res = await callback_service.send_callback(
                        event="RISK_UPDATED",
                        call_id=analysis_id,
                        analysis_id=analysis_id,
                        risk_output=risk_output,
                        policy_output=policy_output,
                        verification_required=policy_output["verification_required"],
                        ensemble_res=ensemble_res,
                        window_index=window_index
                    )
                    print(f"[TRACE-SYSTEM1-CALLBACK] call_id={analysis_id} window_index={window_index} risk_score={risk_output['risk_score']} risk_level={risk_output['risk_level']} status={cb_res.get('status')}")
                    print(f"[CALLBACK] status={cb_res.get('status')} HTTP={cb_res.get('http_status')} error={cb_res.get('error')}")
                except Exception as cb_err:
                    print(f"[TRACE-SYSTEM1-CALLBACK] call_id={analysis_id} window_index={window_index} risk_score={risk_output['risk_score']} risk_level={risk_output['risk_level']} status=FAILED")
                    print(f"[CALLBACK] status=FAILED HTTP=None error={cb_err}")

                # 13. Persist Telemetry Metadata to DB safely (Non-blocking)
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
                            synthetic_probability=voice_res.get("synthetic_probability") if voice_res else None,
                            authenticity_score=voice_res.get("authenticity_score") if voice_res else None,
                            confidence=voice_res.get("confidence", 0.0) if voice_res else 0.0,
                            audio_quality=voice_res.get("audio_quality", 1.0) if voice_res else 1.0,
                            model_name=voice_res.get("model_name", settings.VOICE_MODEL_NAME) if voice_res else settings.VOICE_MODEL_NAME,
                            model_version=voice_res.get("model_version", settings.VOICE_MODEL_VERSION) if voice_res else settings.VOICE_MODEL_VERSION,
                            inference_time_ms=voice_res.get("inference_time_ms", 0.0) if voice_res else 0.0,
                            status=voice_res.get("status", "SUCCESS") if voice_res else "ERROR"
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
            await resemble_detector.close_stream(analysis_id)
        except Exception:
            pass
    except Exception as e:
        logger.error(f"[WS EXCEPTION] WebSocket error: {e}")
        manager.disconnect(analysis_id, websocket)
        try:
            await resemble_detector.close_stream(analysis_id)
        except Exception:
            pass
    finally:
        manager.disconnect(analysis_id, websocket)
        try:
            await resemble_detector.close_stream(analysis_id)
        except Exception:
            pass
