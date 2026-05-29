import asyncio
from datetime import datetime

import pytest

from app.database import SessionLocal
from app.models import Organization, Tenant, User, UserOrganization
from app.routers.auth_pages import forgot_password, reset_password
from app.schemas.requests import ForgotPasswordRequest, ResetPasswordRequest
from app.core.auth import get_password_hash, verify_password


@pytest.fixture(autouse=True)
def clean_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.query(UserOrganization).delete()
        db.query(User).delete()
        db.query(Organization).delete()
        db.query(Tenant).filter(Tenant.slug != "test").delete()
        db.commit()
        db.close()


def _create_user(db, email="user@test.com", password="secret123") -> User:
    tenant = Tenant(name="t", slug="reset-tenant", plan="free")
    db.add(tenant)
    db.flush()
    org = Organization(tenant_id=tenant.id, name="Test Org", country="DO")
    db.add(org)
    db.flush()
    user = User(
        tenant_id=tenant.id,
        email=email,
        full_name="Test User",
        hashed_password=get_password_hash(password),
        is_active=True,
        verification_code=None,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.flush()
    uo = UserOrganization(user_id=user.id, organization_id=org.id, role="owner")
    db.add(uo)
    db.commit()
    db.refresh(user)
    return user


def _run(coro):
    return asyncio.run(coro)


class TestForgotPassword:

    def test_returns_success_for_existing_user(self, clean_db, monkeypatch):
        db = clean_db
        user = _create_user(db)
        sent = []
        monkeypatch.setattr(
            "app.routers.auth_pages.send_reset_password_email",
            lambda e, n, c: sent.append((e, c)) or True,
        )
        body = ForgotPasswordRequest(email=user.email)

        resp = _run(forgot_password(body, db))

        assert resp["message"] == "Si el email existe, recibirás un código de restablecimiento."
        assert len(sent) == 1
        assert sent[0][0] == user.email
        db.refresh(user)
        assert user.verification_code is not None
        assert user.verification_code != ""

    def test_returns_success_for_nonexistent_user(self, clean_db, monkeypatch):
        db = clean_db
        sent = []
        monkeypatch.setattr(
            "app.routers.auth_pages.send_reset_password_email",
            lambda e, n, c: sent.append((e, c)) or True,
        )
        body = ForgotPasswordRequest(email="ghost@test.com")

        resp = _run(forgot_password(body, db))

        assert resp["message"] == "Si el email existe, recibirás un código de restablecimiento."
        assert len(sent) == 0

    def test_rejects_empty_email(self, clean_db):
        db = clean_db
        from fastapi import HTTPException
        body = ForgotPasswordRequest(email="")
        with pytest.raises(HTTPException) as exc:
            _run(forgot_password(body, db))
        assert exc.value.status_code == 400


class TestResetPassword:

    def test_resets_password_with_valid_code(self, clean_db, monkeypatch):
        db = clean_db
        user = _create_user(db)
        code = "482031"
        user.verification_code = get_password_hash(code)
        db.commit()

        monkeypatch.setattr("app.routers.auth_pages.send_password_changed_email", lambda e, n: None)
        body = ResetPasswordRequest(email=user.email, code=code, password="Newpass123")

        from starlette.responses import JSONResponse
        import json
        resp = _run(reset_password(body, db))

        assert isinstance(resp, JSONResponse)
        body_resp = json.loads(resp.body.decode())
        assert body_resp["message"] == "Contraseña actualizada correctamente."
        db.refresh(user)
        assert verify_password("Newpass123", user.hashed_password)
        assert user.verification_code is None

    def test_resets_password_sends_notification(self, clean_db, monkeypatch):
        db = clean_db
        user = _create_user(db)
        code = "482031"
        user.verification_code = get_password_hash(code)
        db.commit()

        sent = []
        monkeypatch.setattr("app.routers.auth_pages.send_password_changed_email", lambda e, n: sent.append((e, n)))
        body = ResetPasswordRequest(email=user.email, code=code, password="Newpass123")
        _run(reset_password(body, db))

        assert len(sent) == 1
        assert sent[0][0] == user.email

    def test_rejects_invalid_code(self, clean_db):
        db = clean_db
        user = _create_user(db)
        user.verification_code = get_password_hash("482031")
        db.commit()

        from fastapi import HTTPException
        body = ResetPasswordRequest(email=user.email, code="000000", password="Newpass123")
        with pytest.raises(HTTPException) as exc:
            _run(reset_password(body, db))
        assert exc.value.status_code == 400

    def test_rejects_when_no_code_requested(self, clean_db):
        db = clean_db
        user = _create_user(db)
        user.verification_code = None
        db.commit()

        from fastapi import HTTPException
        body = ResetPasswordRequest(email=user.email, code="482031", password="Newpass123")
        with pytest.raises(HTTPException) as exc:
            _run(reset_password(body, db))
        assert exc.value.status_code == 400

    def test_rejects_nonexistent_user(self, clean_db):
        db = clean_db
        from fastapi import HTTPException
        body = ResetPasswordRequest(email="ghost@test.com", code="482031", password="Newpass123")
        with pytest.raises(HTTPException) as exc:
            _run(reset_password(body, db))
        assert exc.value.status_code == 400

    def test_rejects_short_password(self, clean_db):
        db = clean_db
        user = _create_user(db)
        user.verification_code = get_password_hash("482031")
        db.commit()

        from fastapi import HTTPException
        body = ResetPasswordRequest(email=user.email, code="482031", password="12")
        with pytest.raises(HTTPException) as exc:
            _run(reset_password(body, db))
        assert exc.value.status_code == 400
