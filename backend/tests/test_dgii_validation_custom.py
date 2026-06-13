import pytest
import json
from unittest.mock import patch, AsyncMock, MagicMock
from app.database import SessionLocal
from app.models import Invoice
from app.services.dgii_validation import dgii_validation_service
from app.routers.dgii_validation import validate_invoice
from app.dependencies.tenant import TenantContext

def test_rnc_normalization_in_dgii_validation_service():
    # Test parse_qr_url cleans rnc
    url = "https://fc.dgii.gov.do/ecf/ConsultaTimbreFC?RncEmisor=130-66432-3&ENCF=E320000422664&MontoTotal=2145&CodigoSeguridad=jl8L1Q"
    qr_data = dgii_validation_service.parse_qr_url(url)
    assert qr_data is not None
    assert qr_data.rnc_emisor == "130664323"

@pytest.mark.anyio
async def test_validate_ecf_normalization():
    # Test validate_ecf cleans RNC
    with patch.object(dgii_validation_service, "_query_dgii", new_callable=AsyncMock) as mock_query:
        await dgii_validation_service.validate_ecf(
            rnc_emisor="130-66432-3",
            encf="E320000422664",
            monto_total=2145.00,
            codigo_seguridad="jl8L1Q"
        )
        mock_query.assert_called_once()
        qr_arg = mock_query.call_args[0][0]
        assert qr_arg.rnc_emisor == "130664323"

@pytest.mark.anyio
async def test_validate_invoice_prioritization(test_tenant, test_org):
    db = SessionLocal()
    try:
        # Create an invoice in SQLite test DB
        inv = Invoice(
            tenant_id=test_tenant.id,
            organization_id=test_org.id,
            invoice_number="E320000422664",
            vendor_tax_id="130-66432-3",  # Corrected DB value
            total_amount=2145.00,
            dgii_security_code="jl8L1Q",
            raw_extracted_data=json.dumps({
                "vendor_tax_id": "13664323",  # OCR typo
                "invoice_number": "E320000422664",
                "total_amount": 2145.00
            })
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)

        # Mock TenantContext
        ctx = MagicMock(spec=TenantContext)
        ctx.db = db
        ctx.tenant_id = test_tenant.id
        ctx.org_id = test_org.id

        # Mock dgii_validation_service.validate_ecf
        mock_res = MagicMock()
        mock_res.to_dict.return_value = {
            "status": "accepted",
            "estado_dgii": "Aceptado",
            "razon_social": "Test Vendor",
            "rnc_emisor": "130664323",
            "encf": "E320000422664",
            "validated_at": "2026-06-13T00:00:00"
        }

        with patch("app.routers.dgii_validation.dgii_validation_service.validate_ecf", new_callable=AsyncMock) as mock_val:
            mock_val.return_value = mock_res
            res = await validate_invoice(str(inv.id), ctx)
            
            # Check mock_val called with DB corrected RNC (130-66432-3) instead of OCR (13664323)
            mock_val.assert_called_once()
            called_rnc = mock_val.call_args[1].get("rnc_emisor") or mock_val.call_args[0][0]
            assert called_rnc == "130-66432-3"
            
            assert res["validation"]["status"] == "accepted"

        db.delete(inv)
        db.commit()
    finally:
        db.close()
