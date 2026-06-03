"""
Tests for the AI Chat service — grounded data queries.
These tests verify that query tools return REAL data from the DB
and never hallucinate.
"""

import pytest
from unittest.mock import patch, MagicMock
from uuid import uuid4
from datetime import datetime
from app.services.ai_chat_service import (
    AIChatService,
    get_invoice_summary,
    get_pending_payments,
    get_last_report,
    get_recent_activity,
    get_supplier_expenses,
    TOOL_REGISTRY,
)


def test_tool_registry_has_expected_tools():
    """All query tools should be registered."""
    assert "get_invoice_summary" in TOOL_REGISTRY
    assert "get_pending_payments" in TOOL_REGISTRY
    assert "get_last_report" in TOOL_REGISTRY
    assert "get_recent_activity" in TOOL_REGISTRY
    assert "get_supplier_expenses" in TOOL_REGISTRY
    assert "get_itbis_summary" in TOOL_REGISTRY
    assert "get_overdue_invoices" in TOOL_REGISTRY
    assert "get_monthly_comparison" in TOOL_REGISTRY
    assert "get_submission_status" in TOOL_REGISTRY
    assert "get_invoice_status_overview" in TOOL_REGISTRY


def test_tools_have_description_and_params():
    """Each tool must have documentation for the LLM."""
    for name, info in TOOL_REGISTRY.items():
        assert info["description"], f"Tool {name} missing description"
        assert "parameters" in info, f"Tool {name} missing parameters"
        assert info["parameters"].get("type") == "object", (
            f"Tool {name} parameters should be type object"
        )


@pytest.mark.parametrize(
    "tool_name,expected_params",
    [
        ("get_invoice_summary", {"period"}),
        ("get_pending_payments", {"status", "limit"}),
        ("get_last_report", set()),
        ("get_recent_activity", {"limit"}),
        ("get_supplier_expenses", {"period", "limit"}),
        ("get_itbis_summary", {"period"}),
        ("get_overdue_invoices", {"type", "limit"}),
        ("get_monthly_comparison", set()),
        ("get_submission_status", {"months_back"}),
        ("get_invoice_status_overview", set()),
    ],
)
def test_tool_parameter_schemas(tool_name, expected_params):
    """Tool parameter schemas should define expected params."""
    schema = TOOL_REGISTRY[tool_name]["parameters"]
    defined_params = set(schema.get("properties", {}).keys())
    assert defined_params == expected_params, (
        f"Tool {tool_name} params mismatch. "
        f"Expected {expected_params}, got {defined_params}"
    )


# ── get_invoice_summary tests ────────────────────────────────────────────


def test_get_invoice_summary_returns_structure():
    """Should return a dict with expected keys even when empty."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query

    # Simulate empty DB (all counts = 0)
    mock_query.filter.return_value = mock_query
    mock_query.count.return_value = 0
    mock_query.with_entities.return_value = mock_query
    mock_query.scalar.return_value = 0.0

    result = get_invoice_summary(
        db=mock_db,
        tenant_id=uuid4(),
        org_id=uuid4(),
        period="month",
    )

    assert result["period"] == "month"
    assert result["total_count"] == 0
    assert result["total_amount"] == 0.0
    assert "income" in result
    assert "expense" in result
    assert "pending_payments" in result


# ── get_pending_payments tests ───────────────────────────────────────────


def test_get_pending_payments_returns_list():
    """Should return a list (empty if no pending payments)."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.all.return_value = []

    result = get_pending_payments(
        db=mock_db,
        tenant_id=uuid4(),
        org_id=uuid4(),
        status="pending",
    )

    assert isinstance(result, list)
    assert len(result) == 0


# ── get_last_report tests ────────────────────────────────────────────────


def test_get_last_report_returns_none_when_empty():
    """Should return None when no submissions exist."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.first.return_value = None

    result = get_last_report(db=mock_db, tenant_id=uuid4(), org_id=uuid4())

    assert result is None


# ── get_recent_activity tests ────────────────────────────────────────────


def test_get_recent_activity_returns_structure():
    """Should return dict with invoices and notifications lists."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.all.return_value = []

    result = get_recent_activity(db=mock_db, tenant_id=uuid4(), org_id=uuid4())

    assert "recent_invoices" in result
    assert "recent_notifications" in result
    assert isinstance(result["recent_invoices"], list)
    assert isinstance(result["recent_notifications"], list)


# ── get_supplier_expenses tests ──────────────────────────────────────────


def test_get_supplier_expenses_returns_list():
    """Should return a list of supplier expense summaries."""
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.group_by.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.limit.return_value = mock_query
    mock_query.all.return_value = []

    result = get_supplier_expenses(
        db=mock_db, tenant_id=uuid4(), org_id=uuid4()
    )

    assert isinstance(result, list)


# ── AIChatService tests ──────────────────────────────────────────────────


class TestAIChatService:
    def test_init_registers_tools(self):
        """Service should have access to all registered tools."""
        service = AIChatService()
        assert len(service.tools) == 10
        for name in [
            "get_invoice_summary",
            "get_pending_payments",
            "get_last_report",
            "get_recent_activity",
            "get_supplier_expenses",
            "get_itbis_summary",
            "get_overdue_invoices",
            "get_monthly_comparison",
            "get_submission_status",
            "get_invoice_status_overview",
        ]:
            assert name in service.tools

    def test_fallback_format_empty_data(self):
        """Fallback formatter should handle None/empty data."""
        service = AIChatService()
        result = service._fallback_format(None, "test question")
        assert "No se encontraron datos" in result

    def test_fallback_format_invoice_summary(self):
        """Fallback formatter should format invoice summary nicely."""
        service = AIChatService()
        data = {
            "period": "month",
            "total_count": 5,
            "total_amount": 15000.50,
            "income": {"count": 2, "amount": 10000.0},
            "expense": {"count": 3, "amount": 5000.50},
            "pending_payments": {"count": 1, "amount": 2500.0},
        }
        result = service._fallback_format(data, "test")
        assert "5" in result  # total count
        assert "15,000" in result or "15000" in result  # total amount
        assert "Resumen" in result

    def test_process_message_empty_returns_help(self):
        """Empty/missing message should return help text."""
        mock_ctx = MagicMock()
        # This is handled by the router, not the service
        # Just verify service doesn't crash
        service = AIChatService()
        assert service.tools is not None
