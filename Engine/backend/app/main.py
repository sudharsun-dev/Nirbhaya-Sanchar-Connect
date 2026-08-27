import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database.session import init_db
from app.api.routes import router as api_router
from app.api.websocket import ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[STARTUP] NIRBHAYA SANCHAR ENGINE STARTING")
    print(f"[STARTUP] ENVIRONMENT={settings.ENVIRONMENT}")
    print(f"[STARTUP] PORT={settings.API_PORT}")
    print(f"[STARTUP] DATABASE CONFIGURED={'true' if settings.DATABASE_URL else 'false'}")
    print(f"[STARTUP] MODEL PATH={settings.VOICE_MODEL_PATH}")
    model_exists = os.path.exists(settings.VOICE_MODEL_PATH) if settings.VOICE_MODEL_PATH else False
    print(f"[STARTUP] MODEL EXISTS={str(model_exists).lower()}")

    print("[STARTUP] DATABASE INIT START")
    try:
        await init_db()
        print("[STARTUP] DATABASE INIT SUCCESS")
    except Exception as db_err:
        print(f"[STARTUP ERROR] Database initialization failed: {db_err}")

    print("[STARTUP] ENGINE READY")
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
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
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
