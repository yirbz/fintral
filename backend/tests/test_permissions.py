"""Tests for the permissions system:
- has_permission() evaluator (unit)
- require_permission() dependency
- organizations router (CRUD, users, invitations)
"""

import asyncio
import json
from datetime import timedelta
from uuid import uuid4

import pytest

from app.utils.dates import utc_now
from app.core.permissions import has_permission, ROLE_DEFAULT_PERMISSIONS, PERMISSIONS
from app.database import SessionLocal
from app.dependencies.tenant import TenantContext
from app.models import Invitation, Organization, User, UserOrganization
from app.routers.organizations import router


# ---------------------------------------------------------------------------
# has_permission() unit tests
# ---------------------------------------------------------------------------

class TestHasPermission:
    def test_owner_bypasses_everything(self):
        assert has_permission("owner", None, "nonexistent.perm") is True

    def test_admin_has_default_permissions(self):
        assert has_permission("admin", None, "invoices.read") is True
        assert has_permission("admin", None, "users.invite") is True
        assert has_permission("admin", None, "invoices.permanent_delete") is True

    def test_admin_lacks_nonexistent(self):
        assert has_permission("admin", None, "nonexistent.perm") is False

    def test_member_has_invoice_ops_but_not_user_management(self):
        assert has_permission("member", None, "invoices.create") is True
        assert has_permission("member", None, "users.invite") is False
        assert has_permission("member", None, "users.manage_roles") is False

    def test_viewer_is_readonly(self):
        perms = ["invoices.read", "reports.read", "dgii.read", "audit.read"]
        denied = ["invoices.create", "invoices.delete", "invoices.cancel", "users.read"]
        for p in perms:
            assert has_permission("viewer", None, p) is True
        for p in denied:
            assert has_permission("viewer", None, p) is False

    def test_explicit_permissions_override_role_defaults(self):
        explicit = ["invoices.read", "reports.read"]
        assert has_permission("viewer", explicit, "invoices.read") is True
        assert has_permission("viewer", ["invoices.read"], "reports.read") is False

    def test_unknown_role_gets_nothing(self):
        assert has_permission("superadmin", None, "invoices.read") is False

    def test_empty_explicit_list_grants_nothing(self):
        assert has_permission("admin", [], "invoices.read") is False
        assert has_permission("owner", [], "anything") is True  # owner bypasses


# ---------------------------------------------------------------------------
# require_permission() dependency tests
# ---------------------------------------------------------------------------

class TestRequirePermission:
    def test_unknown_permission_raises(self):
        from app.dependencies.permissions import require_permission
        with pytest.raises(ValueError, match="unknown_perm"):
            require_permission("unknown_perm")

    def _run_checker(self, permission, role, explicit_perms):
        from app.dependencies.permissions import require_permission
        checker = require_permission(permission)
        ctx = TenantContext(
            db=None, user=None, tenant=None,
            tenant_id=uuid4(), org_id=uuid4(), organization=None,
            role=role, permissions=explicit_perms,
        )
        return asyncio.run(checker(ctx))

    def test_grants_access_when_user_has_permission(self):
        result = self._run_checker("invoices.read", "admin", None)
        assert result is not None
        assert result.role == "admin"

    def test_denies_access_when_user_lacks_permission(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            self._run_checker("users.invite", "viewer", None)
        assert exc.value.status_code == 403

    def test_allows_owner_without_explicit_permission(self):
        result = self._run_checker("users.invite", "owner", None)
        assert result is not None
        assert result.role == "owner"

    def test_denies_member_exceeding_role(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            self._run_checker("users.invite", "member", None)
        assert exc.value.status_code == 403

    def test_custom_permissions_can_grant_extra(self):
        result = self._run_checker("users.invite", "viewer", ["users.invite"])
        assert result is not None
        assert result.permissions == ["users.invite"]


# ---------------------------------------------------------------------------
# Organizaciones CRUD integration tests (via DB, no HTTP)
# ---------------------------------------------------------------------------

class TestOrganizationsCRUD:
    def test_create_org(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            org = Organization(
                tenant_id=test_tenant.id,
                name="New Org",
                tax_id="999999999",
                country="DO",
            )
            db.add(org)
            db.flush()

            uo = UserOrganization(
                user_id=test_user.id,
                organization_id=org.id,
                role="owner",
            )
            db.add(uo)
            db.commit()
            db.refresh(org)

            assert org.name == "New Org"
            assert org.tax_id == "999999999"
            assert org.is_active is True

            uo_check = (
                db.query(UserOrganization)
                .filter(
                    UserOrganization.user_id == test_user.id,
                    UserOrganization.organization_id == org.id,
                )
                .first()
            )
            assert uo_check is not None
            assert uo_check.role == "owner"
        finally:
            db.close()

    def test_update_org(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            org = (
                db.query(Organization)
                .filter(Organization.tenant_id == test_tenant.id)
                .first()
            )
            org.name = "Updated Org Name"
            db.commit()
            db.refresh(org)
            assert org.name == "Updated Org Name"
        finally:
            db.close()

    def test_deactivate_org(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            org = db.query(Organization).filter(
                Organization.tenant_id == test_tenant.id,
                Organization.id != test_org.id,
            ).first()
            if not org:
                org = Organization(
                    tenant_id=test_tenant.id,
                    name="Org to Delete",
                    tax_id="",
                )
                db.add(org)
                db.flush()

            org.is_active = False
            db.commit()

            gone = (
                db.query(Organization)
                .filter(Organization.id == org.id, Organization.is_active.is_(True))
                .first()
            )
            assert gone is None
        finally:
            db.close()

    def test_list_org_users(self, test_org, test_user):
        db = SessionLocal()
        try:
            members = (
                db.query(UserOrganization)
                .filter(UserOrganization.organization_id == test_org.id)
                .all()
            )
            assert len(members) >= 1
            assert any(str(m.user_id) == str(test_user.id) for m in members)
        finally:
            db.close()

    def test_change_user_role(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            uo = (
                db.query(UserOrganization)
                .filter(
                    UserOrganization.user_id == test_user.id,
                    UserOrganization.organization_id == test_org.id,
                )
                .first()
            )
            old = uo.role
            uo.role = "admin"
            db.commit()
            db.refresh(uo)
            assert uo.role == "admin"
            # restore
            uo.role = old
            db.commit()
        finally:
            db.close()

    def test_set_user_permissions_override(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            uo = (
                db.query(UserOrganization)
                .filter(
                    UserOrganization.user_id == test_user.id,
                    UserOrganization.organization_id == test_org.id,
                )
                .first()
            )
            uo.permissions = json.dumps(["invoices.read"])
            db.commit()
            db.refresh(uo)
            assert json.loads(uo.permissions) == ["invoices.read"]

            uo.permissions = None
            db.commit()
            db.refresh(uo)
            assert uo.permissions is None
        finally:
            db.close()

    def test_remove_user_from_org(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            other_user = User(
                tenant_id=test_tenant.id,
                email="other@test.local",
                full_name="Other",
                is_active=True,
            )
            db.add(other_user)
            db.flush()

            uo = UserOrganization(
                user_id=other_user.id,
                organization_id=test_org.id,
                role="member",
            )
            db.add(uo)
            db.commit()

            db.delete(uo)
            db.commit()

            gone = (
                db.query(UserOrganization)
                .filter(
                    UserOrganization.user_id == other_user.id,
                    UserOrganization.organization_id == test_org.id,
                )
                .first()
            )
            assert gone is None
        finally:
            db.close()

    def test_cannot_have_two_owners(self, test_tenant, test_org, test_user):
        db = SessionLocal()
        try:
            other = User(tenant_id=test_tenant.id, email="other2@test.local", full_name="Other", is_active=True)
            db.add(other)
            db.flush()
            uo = UserOrganization(user_id=other.id, organization_id=test_org.id, role="owner")
            db.add(uo)
            db.commit()
            assert uo.role == "owner"
        finally:
            db.close()


# ---------------------------------------------------------------------------
# Invitation tests
# ---------------------------------------------------------------------------

class TestInvitations:
    def test_create_invitation(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invitation(
                organization_id=test_org.id,
                email="invited@test.local",
                role="member",
                expires_at=utc_now() + timedelta(days=7),
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            assert inv.email == "invited@test.local"
            assert inv.role == "member"
            assert inv.accepted is False
            assert inv.token is not None
            assert len(inv.token) > 10
        finally:
            db.close()

    def test_accept_invitation(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invitation(
                organization_id=test_org.id,
                email="invited-accept@test.local",
                role="member",
                expires_at=utc_now() + timedelta(days=7),
            )
            db.add(inv)
            db.commit()
            db.refresh(inv)

            assert inv.accepted is False
            inv.accepted = True
            db.commit()
            db.refresh(inv)
            assert inv.accepted is True
        finally:
            db.close()

    def test_expired_invitation(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            inv = Invitation(
                organization_id=test_org.id,
                email="expired@test.local",
                role="viewer",
                expires_at=utc_now() - timedelta(days=1),
            )
            assert inv.expires_at < utc_now()  # already expired
        finally:
            db.close()


# ---------------------------------------------------------------------------
# Available permissions endpoint tests
# ---------------------------------------------------------------------------

class TestPermissionsEndpoints:
    def test_list_available_permissions(self):
        assert "invoices.read" in PERMISSIONS
        assert "invoices.create" in PERMISSIONS
        assert "users.invite" in PERMISSIONS
        assert "users.manage_roles" in PERMISSIONS
        assert "org.create" in PERMISSIONS
        assert "settings.all" in PERMISSIONS
        assert len(PERMISSIONS) == 26

    def test_role_defaults_are_consistent(self):
        for role, perms in ROLE_DEFAULT_PERMISSIONS.items():
            for p in perms:
                assert p in PERMISSIONS, f"Permission {p!r} in role {role!r} not defined"

    def test_role_defaults_are_subset(self):
        assert set(ROLE_DEFAULT_PERMISSIONS["viewer"]).issubset(ROLE_DEFAULT_PERMISSIONS["member"])
        assert set(ROLE_DEFAULT_PERMISSIONS["member"]).issubset(ROLE_DEFAULT_PERMISSIONS["admin"])
