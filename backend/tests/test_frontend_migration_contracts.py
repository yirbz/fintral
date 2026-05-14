import io
import json
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import UploadFile
from starlette.requests import Request

from app.database import SessionLocal
from app.dependencies.tenant import TenantContext
from app.models import Invoice
from app.routers.auth_pages import get_current_session, login_for_access_token
from app.routers.invoices import invoice_detail_view, upload_files
from app.routers.settings import reports_page, settings_page
from app.routers.statistics import get_statistics

pytestmark = pytest.mark.anyio


def _request(path: str = "/") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "client": ("test", 1234),
        "server": ("testserver", 80),
        "scheme": "http",
        "root_path": "",
    }
    return Request(scope)


@pytest.fixture()
def tenant_context(test_tenant, test_user, test_org):
    db = SessionLocal()
    try:
        from app.models import Tenant, User, Organization

        user = db.query(User).filter(User.id == test_user.id).first()
        org = db.query(Organization).filter(Organization.id == test_org.id).first()
        tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
        yield TenantContext(
            db=db,
            user=user,
            tenant=tenant,
            tenant_id=test_user.tenant_id,
            org_id=test_org.id,
            organization=org,
            role="owner",
        )
    finally:
        db.close()


async def test_token_sets_cookie_and_returns_payload(test_user):
    db = SessionLocal()
    try:
        form = SimpleNamespace(username=test_user.email, password="TestPass123!")
        response = await login_for_access_token(form_data=form, db=db)
        body = json.loads(response.body.decode("utf-8"))

        assert response.status_code == 200
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert "access_token=" in response.headers.get("set-cookie", "")
    finally:
        db.close()


async def test_api_me_returns_session_context(tenant_context):
    payload = await get_current_session(ctx=tenant_context)
    assert payload["user"]["email"] == "test-user@invoiceflow.local"
    assert payload["organization"]["id"] == str(tenant_context.org_id)
    assert payload["tenant"]["id"] == str(tenant_context.tenant_id)
    assert payload["role"] == "owner"


async def test_statistics_period_parameter_supported(tenant_context):
    payload = await get_statistics(period="90d", ctx=tenant_context)
    assert payload["charts"]["period"] == "90d"
    assert "volume_history" in payload["charts"]


async def test_upload_accepts_category_and_transaction_type(tenant_context):
    file_content = io.BytesIO(b"dummy jpeg data")
    upload = UploadFile(filename="test-invoice.jpg", file=file_content)

    response = await upload_files(
        files=[upload],
        category="Software",
        transaction_type="expense",
        ctx=tenant_context,
    )

    assert response["results"][0]["success"] is True
    invoice_id = response["results"][0]["invoice_id"]

    created = tenant_context.db.query(Invoice).filter(Invoice.id == UUID(invoice_id)).first()
    assert created is not None
    assert created.category == "Software"
    assert created.transaction_type == "expense"

    tenant_context.db.delete(created)
    tenant_context.db.commit()


async def test_legacy_routes_redirect_to_new_frontend_paths(tenant_context):
    settings_redirect = await settings_page(_request("/settings"), ctx=tenant_context)
    reports_redirect = await reports_page(_request("/reports"), ctx=tenant_context)

    assert settings_redirect.status_code == 307
    assert reports_redirect.status_code == 307
    assert settings_redirect.headers["location"] == "/app/settings"
    assert reports_redirect.headers["location"] == "/app/reports"

    invoice = Invoice(
        tenant_id=tenant_context.tenant_id,
        organization_id=tenant_context.org_id,
        filename="legacy-view.jpg",
        file_path="uploads/legacy-view.jpg",
        file_type="image",
        processed=False,
    )
    tenant_context.db.add(invoice)
    tenant_context.db.commit()
    tenant_context.db.refresh(invoice)

    detail_redirect = await invoice_detail_view(invoice_id=str(invoice.id), ctx=tenant_context)
    assert detail_redirect.status_code == 307
    assert detail_redirect.headers["location"] == f"/app/invoices/{invoice.id}"

    tenant_context.db.delete(invoice)
    tenant_context.db.commit()
