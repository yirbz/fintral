import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Organization, PendingUpload, Tenant, User, UserOrganization
from app.services.auth_service import get_supabase_admin
from app.config import SUPABASE_URL

logger = logging.getLogger(__name__)

_CLEANUP_INTERVAL_SECONDS = 120
_USER_TTL_MINUTES = 10
_PENDING_UPLOAD_TTL_HOURS = 48


async def start_cleanup_task():
    asyncio.create_task(_cleanup_loop())


async def _cleanup_loop():
    while True:
        try:
            await asyncio.sleep(_CLEANUP_INTERVAL_SECONDS)
            _delete_expired_users()
            _cleanup_stale_pending_uploads()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.exception("Cleanup task error: %s", e)


def _delete_expired_users():
    db: Session = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=_USER_TTL_MINUTES)
        expired = (
            db.query(User)
            .filter(
                User.is_active.is_(False),
                User.verification_code.isnot(None),
                User.created_at < cutoff,
            )
            .all()
        )

        for user in expired:
            org_ids = [
                uo.organization_id
                for uo in db.query(UserOrganization).filter(UserOrganization.user_id == user.id).all()
            ]
            tenant_id = user.tenant_id

            db.query(UserOrganization).filter(UserOrganization.user_id == user.id).delete()
            db.delete(user)
            db.flush()

            for org_id in org_ids:
                remaining = (
                    db.query(UserOrganization)
                    .filter(UserOrganization.organization_id == org_id)
                    .count()
                )
                if remaining == 0:
                    db.query(Organization).filter(Organization.id == org_id).delete()
                    db.flush()

            remaining_tenant_users = (
                db.query(User).filter(User.tenant_id == tenant_id).count()
            )
            if remaining_tenant_users == 0:
                db.query(Organization).filter(Organization.tenant_id == tenant_id).delete()
                db.query(Tenant).filter(Tenant.id == tenant_id).delete()

            _delete_supabase_user(user.supabase_uid)

            logger.info("Cleaned up expired unverified user: %s", user.email)

        db.commit()
        if expired:
            logger.info("Cleanup complete: removed %d expired unverified user(s)", len(expired))
    except Exception as e:
        db.rollback()
        logger.exception("Cleanup error: %s", e)
    finally:
        db.close()


def _delete_supabase_user(supabase_uid: str | None) -> None:
    if not supabase_uid:
        return
    supabase = get_supabase_admin()
    if not supabase:
        return
    try:
        supabase.auth.admin.delete_user(supabase_uid)
        logger.info("Deleted Supabase Auth user: %s", supabase_uid)
    except Exception as e:
        logger.warning("Failed to delete Supabase Auth user %s: %s", supabase_uid, e)


def _cleanup_stale_pending_uploads():
    db: Session = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(hours=_PENDING_UPLOAD_TTL_HOURS)
        stale = (
            db.query(PendingUpload)
            .filter(
                PendingUpload.processed.is_(False),
                PendingUpload.created_at < cutoff,
            )
            .all()
        )
        for p in stale:
            logger.info("Cleaning up stale pending upload: %s (%s)", p.id, p.filename)
            if SUPABASE_URL:
                try:
                    from app.services.supabase_storage import delete_invoice_folder
                    delete_invoice_folder(str(p.tenant_id), str(p.organization_id), str(p.id))
                except Exception as exc:
                    logger.warning("Failed to delete storage for pending upload %s: %s", p.id, exc)
            db.delete(p)

        db.commit()
        if stale:
            logger.info("Cleaned up %d stale pending upload(s)", len(stale))
    except Exception as e:
        db.rollback()
        logger.exception("Pending upload cleanup error: %s", e)
    finally:
        db.close()
