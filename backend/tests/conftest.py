import os
from types import SimpleNamespace

import pytest

# Tests usan SQLite efímero por velocidad — NO refleja el stack de producción (PostgreSQL).
# No agregues dependencias de PostgreSQL aquí; los tests deben correr sin DB externa.
os.environ.pop("DYNO", None)
os.environ["DATABASE_URL"] = "sqlite:///./test_refactor.db"
os.environ["SUPABASE_URL"] = ""
os.environ["RESEND_API_KEY"] = ""

# Remove stale test DB BEFORE the engine is created (which happens at first import)
if os.path.exists("./test_refactor.db"):
    os.remove("./test_refactor.db")

from app.core.auth import get_password_hash
from app.core.bootstrap import init_database
from app.database import SessionLocal
from app.models import Organization, Tenant, User, UserOrganization
from app.services.email_sender import NoopEmailSender
from app.services.email_service import configure_email_service

# Hard safety: use NoopEmailSender during ALL tests
configure_email_service(NoopEmailSender())

# Nuclear safety net: resend.Emails.send explota si se llama accidentalmente
try:
    import resend

    def _forbidden_send(*args, **kwargs):
        raise RuntimeError(
            "resend.Emails.send() llamado desde test. "
            "Usa configure_email_service() o mock."
        )
    resend.Emails.send = _forbidden_send
except ImportError:
    pass


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    init_database()


@pytest.fixture()
def test_tenant():
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.slug == "test").first()
        if not tenant:
            tenant = Tenant(name="Test Tenant", slug="test", plan="free")
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
        return SimpleNamespace(id=tenant.id, name=tenant.name, slug=tenant.slug)
    finally:
        db.close()


@pytest.fixture()
def test_org(test_tenant):
    db = SessionLocal()
    try:
        org = (
            db.query(Organization)
            .filter(Organization.tenant_id == test_tenant.id)
            .first()
        )
        if not org:
            org = Organization(
                tenant_id=test_tenant.id,
                name="Test Org",
                tax_id="",
            )
            db.add(org)
            db.commit()
            db.refresh(org)
        return SimpleNamespace(id=org.id, tenant_id=org.tenant_id, name=org.name)
    finally:
        db.close()


@pytest.fixture()
def test_user(test_tenant, test_org):
    db = SessionLocal()
    try:
        email = "test-user@invoiceflow.local"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                tenant_id=test_tenant.id,
                email=email,
                hashed_password=get_password_hash("TestPass123!"),
                full_name="Test User",
                is_active=True,
                is_superuser=False,
            )
            db.add(user)
            db.flush()

            user_org = UserOrganization(
                user_id=user.id,
                organization_id=test_org.id,
                role="owner",
            )
            db.add(user_org)
            db.commit()
            db.refresh(user)

        return SimpleNamespace(
            id=user.id,
            email=user.email,
            tenant_id=user.tenant_id,
            is_active=True,
            is_superuser=False,
        )
    finally:
        db.close()
