import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Organization, Tenant, User
from app.factory import create_app
from app.dependencies.tenant import TenantContext, require_tenant
from app.dependencies.permissions import require_permission

def test_model_rnc_immutability():
    """Verify that model-level validator prevents RNC modification once set."""
    db = SessionLocal()
    try:
        # Create a new tenant and organization
        tenant = Tenant(name="Immutability Tenant", slug="immutability-slug", plan="free")
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

        # 1. Setting initial tax_id works
        org = Organization(
            tenant_id=tenant.id,
            name="Immutability Org",
            tax_id="132109122",
            country="DOM"
        )
        db.add(org)
        db.commit()
        db.refresh(org)
        assert org.tax_id == "132109122"

        # 2. Updating with the same tax_id works
        org.tax_id = "132109122"
        db.commit()

        # 3. Changing to a different tax_id raises ValueError
        with pytest.raises(ValueError, match="El RNC/Cédula no puede ser modificado una vez registrado."):
            org.tax_id = "101581601"
            db.commit()
            
        # 4. Attempting to clear/nullify it raises ValueError
        with pytest.raises(ValueError, match="El RNC/Cédula no puede ser modificado una vez registrado."):
            org.tax_id = None
            db.commit()

        # Cleanup
        db.delete(org)
        db.delete(tenant)
        db.commit()
    finally:
        db.close()

def test_organization_router_rnc_update_block(test_tenant, test_org, test_user):
    """Verify that PUT /api/organizations/{org_id} blocks RNC changes."""
    app = create_app()
    client = TestClient(app)

    db = SessionLocal()
    try:
        # Fetch the organization to give it a starting RNC
        org = db.query(Organization).filter(Organization.id == test_org.id).first()
        org.tax_id = "132109122"
        db.commit()

        # Override require_tenant dependency to return our test context
        def override_require_tenant():
            tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
            user = db.query(User).filter(User.id == test_user.id).first()
            return TenantContext(
                db=db,
                tenant=tenant,
                organization=org,
                user=user,
                org_id=org.id,
                tenant_id=test_tenant.id,
                role="owner",
                permissions=["org.settings.update"]
            )

        app.dependency_overrides[require_tenant] = override_require_tenant
        
        # Override require_permission to bypass permission dependency check
        def override_require_permission(perm):
            return lambda: override_require_tenant()
        app.dependency_overrides[require_permission] = override_require_permission

        # Attempt to change RNC via endpoint
        payload = {
            "name": "Updated Org Name",
            "tax_id": "101581601"
        }
        res = client.put(f"/api/organizations/{org.id}", json=payload)
        assert res.status_code == 400
        assert "El RNC/Cédula no puede ser modificado una vez registrado." in res.json()["detail"]

        # Attempt to pass same RNC should succeed
        payload_same = {
            "name": "Updated Org Name 2",
            "tax_id": "132109122"
        }
        res_same = client.put(f"/api/organizations/{org.id}", json=payload_same)
        assert res_same.status_code == 200

    finally:
        app.dependency_overrides.clear()
        db.close()
