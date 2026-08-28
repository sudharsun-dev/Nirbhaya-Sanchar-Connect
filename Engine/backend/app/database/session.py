from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

# Create async database engine
db_url = settings.async_database_url
engine = create_async_engine(
    db_url,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 30.0} if "sqlite" in db_url else {}
)

# Async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    """Dependency for providing database sessions in API endpoints."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

from sqlalchemy import text

async def init_db():
    """Create all tables asynchronously and enable WAL mode for SQLite."""
    async with engine.begin() as conn:
        if "sqlite" in db_url:
            await conn.execute(text("PRAGMA journal_mode=WAL;"))
            await conn.execute(text("PRAGMA busy_timeout=10000;"))
        await conn.run_sync(Base.metadata.create_all)
