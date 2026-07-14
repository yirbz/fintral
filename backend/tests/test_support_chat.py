import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.factory import create_app
from app.dependencies.tenant import require_tenant, TenantContext
from app.database import SessionLocal
from app.models import Tenant, User, Organization

@pytest.fixture
def client_with_tenant(test_tenant, test_user, test_org):
    app = create_app()
    client = TestClient(app)
    db = SessionLocal()
    
    tenant = db.query(Tenant).filter(Tenant.id == test_tenant.id).first()
    user = db.query(User).filter(User.id == test_user.id).first()
    org = db.query(Organization).filter(Organization.id == test_org.id).first()

    def mock_require_tenant():
        return TenantContext(
            db=db,
            tenant=tenant,
            organization=org,
            user=user,
            org_id=test_org.id,
            tenant_id=test_tenant.id,
            role="owner",
            permissions=[]
        )

    app.dependency_overrides[require_tenant] = mock_require_tenant
    yield client
    db.close()

@patch("app.routers.support_chat._call_llm")
def test_support_chat_bot(mock_call_llm, client_with_tenant):
    # Mock LLM response
    mock_call_llm.return_value = "Hola, puedo ayudarte. Si necesitas un humano avísame."
    
    response = client_with_tenant.post(
        "/api/support/chat",
        json={"message": "Hola, tengo una pregunta sobre NCF."}
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert data["response"] == "Hola, puedo ayudarte. Si necesitas un humano avísame."
    assert data["needs_escalation"] is False

@patch("app.routers.support_chat._call_llm")
def test_support_chat_escalation_detection(mock_call_llm, client_with_tenant):
    # Mock LLM response returning escalation phrase
    mock_call_llm.return_value = "Lo siento, no puedo resolver eso. Te contactaré con soporte humano."
    
    response = client_with_tenant.post(
        "/api/support/chat",
        json={"message": "Por favor escalar."}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["needs_escalation"] is True

@patch("app.services.telegram_notifier.TelegramSupportNotifier.notify_support_escalation")
def test_support_escalate_to_human(mock_notify, client_with_tenant):
    mock_notify.return_value = True
    
    response = client_with_tenant.post(
        "/api/support/chat/escalate",
        json={
            "subject": "Error en OCR",
            "message": "Mi factura no se procesó correctamente.",
            "email": "test@fintral.com"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "Tu solicitud ha sido enviada" in data["message"]
    
    # Verify Telegram notification was triggered
    mock_notify.assert_called_once()
    args, kwargs = mock_notify.call_args
    assert kwargs["user_name"] is not None
    assert kwargs["user_email"] == "test@fintral.com"
    assert kwargs["subject"] == "Error en OCR"
    assert kwargs["message"] == "Mi factura no se procesó correctamente."
