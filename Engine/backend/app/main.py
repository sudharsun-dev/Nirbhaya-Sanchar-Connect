import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database.session import init_db
from app.api.routes import router as api_router, get_system_health
from app.api.websocket import ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[STARTUP] NIRBHAYA SANCHAR ENGINE STARTING")
    print(f"[STARTUP] ENVIRONMENT={settings.ENVIRONMENT}")
    print(f"[SERVER] PORT={settings.API_PORT} HOST={settings.API_HOST}")

    # 1. Database Initialization (Defensive)
    print("[DATABASE] INIT START")
    try:
        await init_db()
        print("[DATABASE] INIT SUCCESS - status=ONLINE")
    except Exception as db_err:
        print(f"[DATABASE] status=OFFLINE error={db_err}")

    # 2. AASIST Model Check (Defensive)
    print("[AASIST] CHECKING MODEL")
    model_exists = os.path.exists(settings.VOICE_MODEL_PATH) if settings.VOICE_MODEL_PATH else False
    print(f"[AASIST] path={settings.VOICE_MODEL_PATH} exists={model_exists}")
    try:
        from app.services.voice_detection.authenticity import voice_authenticity_engine
        print(f"[AASIST] weights_loaded={voice_authenticity_engine.weights_loaded} status={'ONLINE' if voice_authenticity_engine.weights_loaded else 'OFFLINE'}")
    except Exception as m_err:
        print(f"[AASIST] status=OFFLINE error={m_err}")

    # 3. Speaker Verification (Defensive)
    try:
        from app.services.speaker.verifier import speaker_verifier
        print(f"[SPEAKER] model={speaker_verifier.model_name} status=ONLINE")
    except Exception as spk_err:
        print(f"[SPEAKER] status=OFFLINE error={spk_err}")

    # 4. Resemble AI Service Diagnostic (Defensive)
    print(f"[RESEMBLE-CONFIG] configured={'true' if settings.is_resemble_configured else 'false'}")

    # 5. System 1 Callback (Defensive)
    try:
        from app.services.system1.callback_service import callback_service
        print(f"[CALLBACK] target={callback_service.callback_url} status=CONFIGURED")
    except Exception as cb_err:
        print(f"[CALLBACK] status=OFFLINE error={cb_err}")

    print("[STARTUP] ENGINE READY - FASTAPI PROCESS ONLINE")
    yield
    print("[SHUTDOWN] NIRBHAYA SANCHAR ENGINE STOPPING")

app = FastAPI(
    title="Nirbhaya Sanchar Engine (System 2)",
    description="AI-Powered Voice Impersonation Security & Fraud Prevention Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://nirbhaya-sanchar-connect.*\.vercel\.app|https://.*\.onrender\.com|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Exception handler for clean error responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error_code": "INTERNAL_SERVER_ERROR",
            "message": str(exc),
            "path": request.url.path
        }
    )

# Root health check endpoint for cloud load balancer and monitoring
@app.get("/health")
async def health_root():
    return await get_system_health()

# Include routers
app.include_router(api_router, prefix="/api/v1", tags=["System 2 Engine APIs"])
app.include_router(ws_router, tags=["Realtime WebSocket"])

@app.get("/")
async def root():
    return {
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "status": "RUNNING",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.API_HOST, port=settings.API_PORT, reload=settings.DEBUG)
