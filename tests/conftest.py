import os
from types import SimpleNamespace

import pytest

# Force local SQLite during tests before importing app/models.
os.environ.pop("DYNO", None)
os.environ["DATABASE_URL"] = "sqlite:///./test_refactor.db"
os.environ["DISABLE_HEARTBEAT_TASK"] = "true"

from app.core.auth import get_password_hash
from app.core.bootstrap import init_database
from app.database import SessionLocal
from app.models import Organization, User


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    init_database()


@pytest.fixture(scope="session")
def test_user():
    db = SessionLocal()
    try:
        org = db.query(Organization).first()
        if not org:
            org = Organization(name="Test Org", tax_id="", plan="Free Plan")
            db.add(org)
            db.commit()
            db.refresh(org)

        email = "test-user@invoiceflow.local"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                hashed_password=get_password_hash("TestPass123!"),
                full_name="Test User",
                is_active=True,
                is_superuser=False,
                organization_id=org.id,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

        return SimpleNamespace(
            id=user.id,
            email=user.email,
            organization_id=user.organization_id,
            is_active=True,
            is_superuser=False,
        )
    finally:
        db.close()
