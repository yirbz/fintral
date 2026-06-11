import io
import pytest
from datetime import datetime, timedelta
from uuid_utils import uuid7
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models import Tenant, Organization, User, UploadLink, PendingUpload, Invoice
from app.database import SessionLocal
from app.dependencies.tenant import require_tenant, TenantContext
from app.utils.dates import utc_now

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_public_upload_link_flow(test_tenant, test_org, test_user, db_session: Session):
    from app.factory import create_app
    app = create_app()

    tenant_id = test_tenant.id
    org_id = test_org.id
    user_id = test_user.id

    async def mock_require_tenant():
        tenant = db_session.query(Tenant).get(tenant_id)
        org = db_session.query(Organization).get(org_id)
        user = db_session.query(User).get(user_id)
        return TenantContext(
            db=db_session,
            user=user,
            tenant=tenant,
            tenant_id=tenant_id,
            org_id=org_id,
            organization=org,
            role="owner",
            permissions=None
        )

    app.dependency_overrides[require_tenant] = mock_require_tenant
    client = TestClient(app)

    # 1. Create upload link as authenticated user
    link_payload = {
        "client_email": "test-client@fintral.do",
        "max_files": 5,
        "expires_in_hours": 24
    }
    resp = client.post("/pending-uploads/links", json=link_payload)
    assert resp.status_code == 200
    link_data = resp.json()["upload_link"]
    token = link_data["token"]
    link_id = link_data["id"]

    try:
        # 2. Access link info as public guest (GET /public/{token})
        resp_info = client.get(f"/pending-uploads/public/{token}")
        assert resp_info.status_code == 200
        info = resp_info.json()
        assert info["organization_name"] == test_org.name
        assert info["max_files"] == 5
        assert info["uploaded_count"] == 0
        assert "pending_uploads" in info
        assert len(info["pending_uploads"]) == 0

        # 3. Upload a file via public link (POST /public/{token}/upload)
        file_content = b"fake xml invoice data"
        file_name = "factura_test.xml"
        file_obj = io.BytesIO(file_content)

        resp_upload = client.post(
            f"/pending-uploads/public/{token}/upload",
            files={"file": (file_name, file_obj, "text/xml")}
        )
        assert resp_upload.status_code == 200
        upload_data = resp_upload.json()["pending_upload"]
        assert upload_data["filename"] == file_name
        assert upload_data["file_size"] == len(file_content)
        assert upload_data["upload_link_id"] == link_id

        # Verify DB state of UploadLink uploaded_count
        db_session.expire_all()
        link_db = db_session.query(UploadLink).get(link_id)
        assert link_db.uploaded_count == 1

        # 4. Access link info again to verify it loads the uploaded file
        resp_info_2 = client.get(f"/pending-uploads/public/{token}")
        assert resp_info_2.status_code == 200
        info_2 = resp_info_2.json()
        assert info_2["uploaded_count"] == 1
        assert len(info_2["pending_uploads"]) == 1
        assert info_2["pending_uploads"][0]["filename"] == file_name
        assert info_2["pending_uploads"][0]["id"] == upload_data["id"]

        # 5. Delete the uploaded file via public link (DELETE /public/{token}/{pending_id})
        pending_id = upload_data["id"]
        resp_delete = client.delete(f"/pending-uploads/public/{token}/{pending_id}")
        assert resp_delete.status_code == 200
        assert resp_delete.json()["message"] == "Archivo eliminado"

        # Verify DB state of UploadLink uploaded_count and PendingUpload deletion
        db_session.expire_all()
        assert db_session.query(UploadLink).get(link_id).uploaded_count == 0
        assert db_session.query(PendingUpload).get(pending_id) is None

        # Verify list is empty again
        resp_info_3 = client.get(f"/pending-uploads/public/{token}")
        assert resp_info_3.status_code == 200
        assert len(resp_info_3.json()["pending_uploads"]) == 0

        # 6. Upload another file and process it
        file_obj_2 = io.BytesIO(b"fake xml data 2")
        resp_upload_2 = client.post(
            f"/pending-uploads/public/{token}/upload",
            files={"file": ("factura_2.xml", file_obj_2, "text/xml")}
        )
        assert resp_upload_2.status_code == 200
        upload_data_2 = resp_upload_2.json()["pending_upload"]

        # Finalize and process uploads
        resp_process = client.post(f"/pending-uploads/public/{token}/process")
        assert resp_process.status_code == 200
        process_res = resp_process.json()
        assert process_res["success_count"] == 1

        # 7. Get invoices received for this link as owner
        resp_invoices = client.get(f"/pending-uploads/links/{link_id}/invoices")
        assert resp_invoices.status_code == 200
        invoices_res = resp_invoices.json()["invoices"]
        assert len(invoices_res) == 1
        assert invoices_res[0]["filename"] == "factura_2.xml"
        assert invoices_res[0]["upload_link_id"] == link_id

        # Clean up invoice
        db_session.expire_all()
        inv_db = db_session.query(Invoice).get(invoices_res[0]["id"])
        if inv_db:
            db_session.delete(inv_db)
            db_session.commit()

    finally:
        # Cleanup link from DB
        db_session.expire_all()
        link_to_del = db_session.query(UploadLink).get(link_id)
        if link_to_del:
            db_session.delete(link_to_del)
            db_session.commit()
        app.dependency_overrides.clear()
