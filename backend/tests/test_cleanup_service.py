from datetime import datetime, timedelta

import pytest

from app.database import SessionLocal
from app.models import Organization, Tenant, User, UserOrganization
from app.services.cleanup_service import _delete_expired_users
from app.core.auth import get_password_hash


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


def _create_tenant(db, slug: str) -> Tenant:
    t = Tenant(name=slug, slug=slug, plan="free")
    db.add(t)
    db.flush()
    return t


def _create_org(db, tenant_id, name: str) -> Organization:
    o = Organization(tenant_id=tenant_id, name=name, country="DO")
    db.add(o)
    db.flush()
    return o


def _create_user(db, tenant_id, email: str, *, is_active=False, verification_code=None, created_at=None) -> User:
    u = User(
        tenant_id=tenant_id,
        email=email,
        full_name="Test User",
        is_active=is_active,
        verification_code=verification_code,
        created_at=created_at or datetime.utcnow(),
    )
    db.add(u)
    db.flush()
    return u


def _link(db, user_id, org_id):
    uo = UserOrganization(user_id=user_id, organization_id=org_id, role="owner")
    db.add(uo)
    db.flush()


def _fresh():
    return SessionLocal()


class TestDeleteExpiredUsers:

    def test_deletes_expired_unverified_user(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "expired-tenant")
        org = _create_org(db, tenant.id, "Expired Org")
        user = _create_user(
            db, tenant.id, "expired@test.com",
            is_active=False,
            verification_code=get_password_hash("123456"),
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, user.id, org.id)
        db.commit()

        user_id = user.id
        org_id = org.id
        tenant_id = tenant.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == user_id).first() is None
            assert s.query(Organization).filter(Organization.id == org_id).first() is None
            assert s.query(Tenant).filter(Tenant.id == tenant_id).first() is None
        finally:
            s.close()

    def test_keeps_recent_unverified_user(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "recent-tenant")
        org = _create_org(db, tenant.id, "Recent Org")
        user = _create_user(
            db, tenant.id, "recent@test.com",
            is_active=False,
            verification_code=get_password_hash("123456"),
            created_at=datetime.utcnow() - timedelta(minutes=2),
        )
        _link(db, user.id, org.id)
        db.commit()

        user_id = user.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == user_id).first() is not None
        finally:
            s.close()

    def test_keeps_active_user(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "active-tenant")
        org = _create_org(db, tenant.id, "Active Org")
        user = _create_user(
            db, tenant.id, "active@test.com",
            is_active=True,
            verification_code=None,
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, user.id, org.id)
        db.commit()

        user_id = user.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == user_id).first() is not None
        finally:
            s.close()

    def test_keeps_user_without_verification_code(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "nocode-tenant")
        org = _create_org(db, tenant.id, "No Code Org")
        user = _create_user(
            db, tenant.id, "nocode@test.com",
            is_active=False,
            verification_code=None,
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, user.id, org.id)
        db.commit()

        user_id = user.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == user_id).first() is not None
        finally:
            s.close()

    def test_does_not_delete_tenant_with_other_users(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "shared-tenant")
        org = _create_org(db, tenant.id, "Shared Org")

        expired = _create_user(
            db, tenant.id, "expired@test.com",
            is_active=False,
            verification_code=get_password_hash("123456"),
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, expired.id, org.id)

        active = _create_user(
            db, tenant.id, "active@test.com",
            is_active=True,
        )
        _link(db, active.id, org.id)
        db.commit()

        expired_id = expired.id
        active_id = active.id
        org_id = org.id
        tenant_id = tenant.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == expired_id).first() is None
            assert s.query(User).filter(User.id == active_id).first() is not None
            assert s.query(Organization).filter(Organization.id == org_id).first() is not None
            assert s.query(Tenant).filter(Tenant.id == tenant_id).first() is not None
        finally:
            s.close()

    def test_does_not_delete_org_with_other_members(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "shared-org-tenant")
        org = _create_org(db, tenant.id, "Shared Org")

        expired = _create_user(
            db, tenant.id, "expired@test.com",
            is_active=False,
            verification_code=get_password_hash("123456"),
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, expired.id, org.id)

        other = _create_user(
            db, tenant.id, "other@test.com",
            is_active=True,
        )
        _link(db, other.id, org.id)
        db.commit()

        expired_id = expired.id
        other_id = other.id
        org_id = org.id
        tenant_id = tenant.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == expired_id).first() is None
            assert s.query(User).filter(User.id == other_id).first() is not None
            assert s.query(Organization).filter(Organization.id == org_id).first() is not None
            assert s.query(Tenant).filter(Tenant.id == tenant_id).first() is not None
        finally:
            s.close()

    def test_multiple_expired_users(self, clean_db):
        db = clean_db
        tenant = _create_tenant(db, "multi-expired")
        org1 = _create_org(db, tenant.id, "Org1")
        org2 = _create_org(db, tenant.id, "Org2")

        u1 = _create_user(
            db, tenant.id, "expired1@test.com",
            is_active=False,
            verification_code=get_password_hash("123456"),
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, u1.id, org1.id)

        u2 = _create_user(
            db, tenant.id, "expired2@test.com",
            is_active=False,
            verification_code=get_password_hash("123456"),
            created_at=datetime.utcnow() - timedelta(minutes=15),
        )
        _link(db, u2.id, org2.id)

        active = _create_user(db, tenant.id, "active@test.com", is_active=True)
        _link(db, active.id, org1.id)
        db.commit()

        u1_id = u1.id
        u2_id = u2.id
        active_id = active.id
        org1_id = org1.id
        org2_id = org2.id
        tenant_id = tenant.id

        _delete_expired_users()

        s = _fresh()
        try:
            assert s.query(User).filter(User.id == u1_id).first() is None
            assert s.query(User).filter(User.id == u2_id).first() is None
            assert s.query(User).filter(User.id == active_id).first() is not None
            assert s.query(Organization).filter(Organization.id == org2_id).first() is None
            assert s.query(Organization).filter(Organization.id == org1_id).first() is not None
            assert s.query(Tenant).filter(Tenant.id == tenant_id).first() is not None
        finally:
            s.close()
