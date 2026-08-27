import uuid
from datetime import datetime
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import VerificationRequest

class VerificationService:
    """
    Verification Service.
    Manages independent step-up verification requests (Trusted Callback, MFA, Staff Approval).
    Ensures verification does NOT rely only on the suspicious call.
    """
    async def create_verification_request(
        self,
        db: AsyncSession,
        analysis_id: str,
        call_id: str,
        method: str = "TRUSTED_CALLBACK",
        notes: str = None
    ) -> VerificationRequest:
        verification = VerificationRequest(
            id=str(uuid.uuid4()),
            analysis_id=analysis_id,
            call_id=call_id,
            verification_method=method,
            status="PENDING",
            notes=notes,
            created_at=datetime.utcnow()
        )
        db.add(verification)
        await db.commit()
        await db.refresh(verification)
        return verification

    async def update_verification_status(
        self,
        db: AsyncSession,
        verification_id: str,
        status: str # VERIFIED, FAILED
    ) -> VerificationRequest:
        result = await db.execute(select(VerificationRequest).where(VerificationRequest.id == verification_id))
        verification = result.scalars().first()
        if verification:
            verification.status = status
            verification.resolved_at = datetime.utcnow()
            await db.commit()
            await db.refresh(verification)
        return verification

verification_service = VerificationService()
