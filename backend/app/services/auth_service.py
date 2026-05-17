import logging
import secrets
from datetime import timedelta

from sqlalchemy.orm import Session
from supabase import create_client, Client

from app.config import IS_DEVELOPMENT, ORG_COUNTRY, ORG_NAME, ORG_TAX_ID, REMEMBER_ME_EXPIRE_DAYS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from app.core.auth import create_access_token, decode_access_token, get_password_hash, verify_password
from app.dependencies.tenancy import slugify
from app.models import Organization, Tenant, User, UserOrganization

logger = logging.getLogger(__name__)

_supabase_admin: Client | None = None

VERIFY_TOKEN_EXPIRE_HOURS = 48


def get_supabase_admin() -> Client | None:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase admin client not available — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
        return None

    global _supabase_admin
    if _supabase_admin is None:
        logger.info("Creating Supabase admin client: %s", SUPABASE_URL)
        _supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_admin


def sign_in(email: str, password: str) -> dict | None:
    supabase = get_supabase_admin()
    if not supabase:
        logger.warning("Sign-in rejected for %s — Supabase not configured", email)
        return None

    try:
        logger.info("Sign-in attempt: email=%s", email)
        response = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password,
        })
        if response and response.user:
            logger.info("Sign-in successful: email=%s, user_id=%s", email, response.user.id)
            return {
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token,
                "user": {
                    "id": response.user.id,
                    "email": response.user.email,
                },
            }
        logger.warning("Sign-in returned no user for %s", email)
        return None
    except Exception as e:
        logger.warning("Sign-in failed for %s: %s", email, e)
        return None


def sign_up_user(email: str, password: str, full_name: str, phone: str, company_name: str, tax_id: str, db: Session) -> tuple[dict | None, str | None]:
    supabase = get_supabase_admin()
    supabase_uid = None

    if supabase:
        try:
            logger.info("Sign-up attempt in Supabase Auth: email=%s", email)
            response = supabase.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            })
            if response and response.user:
                supabase_uid = response.user.id
                logger.info("Supabase Auth user created: email=%s, id=%s", email, supabase_uid)
            else:
                logger.warning("Supabase Auth returned no user for %s", email)
        except Exception as e:
            logger.warning("Supabase Auth user creation failed for %s: %s", email, e)

    if not supabase_uid and not IS_DEVELOPMENT:
        logger.warning("Sign-up rejected for %s — Supabase not configured or failed", email)
        return None, None

    code = _generate_verification_code()
    code_hash = get_password_hash(code)
    _provision_local_user(db, email, full_name, phone, company_name, tax_id, supabase_uid, is_active=False, verification_code=code_hash)

    if not supabase_uid:
        user = db.query(User).filter(User.email == email).first()
        if user:
            hashed = get_password_hash(password)
            user.hashed_password = hashed
            user.is_active = False
            user.verification_code = code_hash
            db.commit()
            return {"id": str(user.id), "email": email}, code

    return {"id": supabase_uid, "email": email}, code


def _generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def verify_email_code(email: str, code: str, db: Session) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        logger.warning("User not found for code verification: %s", email)
        return None
    if not user.verification_code:
        logger.warning("No verification code set for user: %s", email)
        return None
    if not verify_password(code, user.verification_code):
        logger.warning("Invalid verification code for user: %s", email)
        return None

    user.is_active = True
    user.verification_code = None
    db.commit()
    db.refresh(user)
    logger.info("User verified via code: %s", email)
    return user


def verify_and_login(email: str, code: str, db: Session) -> str | None:
    from datetime import timedelta

    user = verify_email_code(email, code, db)
    if not user:
        return None

    expire = timedelta(days=REMEMBER_ME_EXPIRE_DAYS)
    token = create_access_token(data={"sub": email}, expires_delta=expire)
    return token


def _generate_verify_token(email: str) -> str:
    return create_access_token(
        data={"sub": email, "purpose": "verify_email"},
        expires_delta=timedelta(hours=VERIFY_TOKEN_EXPIRE_HOURS),
    )


def verify_user(token: str, db: Session) -> User | None:
    payload = decode_access_token(token)
    if not payload:
        logger.warning("Invalid verification token")
        return None

    purpose = payload.get("purpose")
    email = payload.get("sub")
    if purpose != "verify_email" or not email:
        logger.warning("Verification token missing purpose or email")
        return None

    user = db.query(User).filter(User.email == email).first()
    if not user:
        logger.warning("User not found for verification: %s", email)
        return None

    if user.is_active:
        logger.info("User already active: %s", email)
        return user

    user.is_active = True
    db.commit()
    db.refresh(user)
    logger.info("User verified and activated: %s", email)
    return user


def _provision_local_user(db: Session, email: str, full_name: str, phone: str, company_name: str, tax_id: str, supabase_uid: str | None, is_active: bool = False, verification_code: str | None = None) -> None:
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return

    org_name = company_name or f"{full_name or email}'s Company"
    base_slug = slugify(org_name)
    slug = base_slug
    suffix = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    tenant = Tenant(
        name=org_name,
        slug=slug,
        plan="free",
    )
    db.add(tenant)
    db.flush()

    org = Organization(
        tenant_id=tenant.id,
        name=org_name,
        tax_id=tax_id or None,
        country="DO",
    )
    db.add(org)
    db.flush()

    user = User(
        email=email,
        full_name=full_name,
        phone=phone or None,
        is_active=is_active,
        is_superuser=False,
        supabase_uid=supabase_uid,
        tenant_id=tenant.id,
        verification_code=verification_code,
    )
    db.add(user)
    db.flush()

    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="owner",
    )
    db.add(user_org)
    db.commit()
    db.refresh(user)
    logger.info("Local user provisioned: email=%s, user_id=%s, tenant=%s, org=%s", email, user.id, tenant.id, org.id)


def create_admin_user(email: str, password: str) -> dict | None:
    supabase = get_supabase_admin()
    if not supabase:
        logger.warning("Admin user creation skipped for %s — Supabase not configured", email)
        return None

    try:
        logger.info("Creating admin user in Supabase Auth: email=%s", email)
        response = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": "Admin User", "is_superuser": True},
        })
        if response and response.user:
            logger.info("Supabase Auth admin created: email=%s, id=%s", email, response.user.id)
            return {
                "id": response.user.id,
                "email": response.user.email,
            }
        logger.warning("Supabase Auth admin creation returned no user for %s", email)
        return None
    except Exception as e:
        logger.warning("Supabase Auth admin creation failed for %s: %s", email, e)
        return None


def provision_local_user(db: Session, supabase_user: dict) -> User | None:
    email = supabase_user.get("email")
    supabase_id = supabase_user.get("id")
    if not email:
        logger.warning("Cannot provision user — no email in Supabase user data")
        return None

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        if not existing.supabase_uid and supabase_id:
            existing.supabase_uid = supabase_id
            db.commit()
            logger.info("Linked Supabase UID to existing user: email=%s, supabase_id=%s", email, supabase_id)
        return existing

    logger.info("Provisioning new local user: email=%s, supabase_id=%s", email, supabase_id)
    base_slug = slugify(email.split("@")[0])
    slug = base_slug
    suffix = 1
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    tenant = Tenant(name=email, slug=slug, plan="free")
    db.add(tenant)
    db.flush()

    org = Organization(
        tenant_id=tenant.id,
        name=ORG_NAME,
        tax_id=ORG_TAX_ID,
        country=ORG_COUNTRY,
    )
    db.add(org)
    db.flush()

    user = User(
        email=email,
        full_name="",
        is_active=True,
        is_superuser=False,
        supabase_uid=supabase_id,
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()

    user_org = UserOrganization(
        user_id=user.id,
        organization_id=org.id,
        role="member",
    )
    db.add(user_org)
    db.commit()
    db.refresh(user)

    logger.info("Local user provisioned: email=%s, user_id=%s, tenant=%s, org=%s", email, user.id, tenant.id, org.id)
    return user
