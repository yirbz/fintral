"""Tests for the billing correction flow (E33/E34 credit/debit note emissions)."""

from datetime import date
from unittest.mock import MagicMock

import pytest

from app.routers.billing import EmitLineItem, _build_emit_alanube_payload


@pytest.fixture
def sample_items():
    return [
        EmitLineItem(
            description="Producto A",
            quantity=2,
            unit_price=100.0,
            discount_rate=0,
            tax_rate=18,
            good_service_indicator=1,
        ),
    ]


@pytest.fixture
def mock_sequence():
    seq = MagicMock()
    seq.expiry_date = date(2028, 12, 31)
    return seq


COMMON_KWARGS = dict(
    sender_rnc="131234567",
    sender_name="Empresa de Prueba",
    buyer_name="Cliente de Prueba",
    buyer_rnc="132109122",
)


class TestEmitCorrectionPayload:
    def test_credit_note_has_information_reference(self, mock_sequence, sample_items):
        """Nota de Crédito (E34) with reference_ecf must include informationReference."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E342025000001234",
            sequence=mock_sequence,
            ecf_type=34,
            items=sample_items,
            reference_ecf="E312025000001234",
            reference_date=date(2025, 6, 1),
            modification_code=3,
            **COMMON_KWARGS,
        )
        ref = payload["informationReference"]["informationDetails"][0]
        assert ref["encfModified"] == "E312025000001234"
        assert ref["modificationCode"] == 3
        assert payload["idDoc"]["encf"].startswith("E34")

    def test_debit_note_has_information_reference(self, mock_sequence, sample_items):
        """Nota de Débito (E33) with reference_ecf must include informationReference."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E332025000001234",
            sequence=mock_sequence,
            ecf_type=33,
            items=sample_items,
            reference_ecf="E312025000001234",
            reference_date=date(2025, 6, 1),
            modification_code=2,
            **COMMON_KWARGS,
        )
        ref = payload["informationReference"]["informationDetails"][0]
        assert ref["encfModified"] == "E312025000001234"
        assert ref["modificationCode"] == 2
        assert payload["idDoc"]["encf"].startswith("E33")

    def test_modification_code_defaults_to_3(self, mock_sequence, sample_items):
        """When modification_code is omitted, defaults to 3 (amount correction)."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E342025000001234",
            sequence=mock_sequence,
            ecf_type=34,
            items=sample_items,
            reference_ecf="E312025000001234",
            reference_date=date(2025, 6, 1),
            **COMMON_KWARGS,
        )
        assert payload["informationReference"]["informationDetails"][0]["modificationCode"] == 3

    def test_no_reference_when_both_omitted(self, mock_sequence, sample_items):
        """Regular emission without correction params must not include informationReference."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E312025000001234",
            sequence=mock_sequence,
            ecf_type=31,
            items=sample_items,
            **COMMON_KWARGS,
        )
        assert "informationReference" not in payload

    def test_partial_reference_ignored(self, mock_sequence, sample_items):
        """reference_ecf without reference_date must not add informationReference."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E342025000001234",
            sequence=mock_sequence,
            ecf_type=34,
            items=sample_items,
            reference_ecf="E312025000001234",
            **COMMON_KWARGS,
        )
        assert "informationReference" not in payload

    def test_modification_code_1_cancellation(self, mock_sequence, sample_items):
        """modificationCode=1 (total cancellation) is passed through correctly."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E342025000001234",
            sequence=mock_sequence,
            ecf_type=34,
            items=sample_items,
            reference_ecf="E312025000001234",
            reference_date=date(2025, 6, 1),
            modification_code=1,
            **COMMON_KWARGS,
        )
        assert payload["informationReference"]["informationDetails"][0]["modificationCode"] == 1

    def test_modification_code_4_replacement(self, mock_sequence, sample_items):
        """modificationCode=4 (NCF contingency replacement) is passed through correctly."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E342025000001234",
            sequence=mock_sequence,
            ecf_type=34,
            items=sample_items,
            reference_ecf="E312025000001234",
            reference_date=date(2025, 6, 1),
            modification_code=4,
            **COMMON_KWARGS,
        )
        assert payload["informationReference"]["informationDetails"][0]["modificationCode"] == 4

    def test_same_buyer_data_preserved(self, mock_sequence, sample_items):
        """Buyer info in correction emission matches the original invoice's buyer."""
        payload, _, _, _ = _build_emit_alanube_payload(
            encf="E342025000001234",
            sequence=mock_sequence,
            ecf_type=34,
            items=sample_items,
            reference_ecf="E312025000001234",
            reference_date=date(2025, 6, 1),
            **COMMON_KWARGS,
        )
        assert payload["buyer"]["rnc"] == "132109122"
        assert payload["buyer"]["companyName"] == "Cliente de Prueba"
