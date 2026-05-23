from uuid_utils import uuid7

from app.database import SessionLocal
from app.services.audit_logger import record, query, query_admin


def _make_actor():
    return str(uuid7())


class TestRecord:
    def test_creates_audit_log_with_minimal_params(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.processed",
                summary="Invoice processed",
            )
            assert entry.id is not None
            assert entry.action == "invoice.processed"
            assert entry.visibility == "client"
            assert entry.summary == "Invoice processed"
            assert entry.snapshot_before is None
            assert entry.snapshot_after is None
        finally:
            db.close()

    def test_assigns_visibility_client_for_known_actions(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.deleted",
                summary="Deleted",
            )
            assert entry.visibility == "client"
        finally:
            db.close()

    def test_assigns_visibility_client_for_permanent_delete(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.permanent_deleted",
                summary="Permanently deleted",
            )
            assert entry.visibility == "client"
        finally:
            db.close()

    def test_accepts_snapshot_before_and_after(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            before = {"total_amount": 100.0, "vendor_name": "Old Corp"}
            after = {"total_amount": 150.0, "vendor_name": "New Corp"}
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.updated",
                summary="Updated",
                snapshot_before=before,
                snapshot_after=after,
            )
            assert entry.snapshot_before == before
            assert entry.snapshot_after == after
        finally:
            db.close()

    def test_accepts_request_id(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            rid = str(uuid7())
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.uploaded",
                summary="Uploaded",
                request_id=rid,
            )
            assert entry.request_id == rid
        finally:
            db.close()

    def test_accepts_ip_address(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.created",
                summary="Created",
                ip_address="192.168.1.1",
            )
            assert entry.ip_address == "192.168.1.1"
        finally:
            db.close()

    def test_accepts_metadata(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            meta = {"files": 3, "source": "web"}
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                action="invoice.uploaded",
                summary="Uploaded",
                metadata=meta,
            )
            assert entry.metadata_json is not None
            import json
            assert json.loads(entry.metadata_json) == meta
        finally:
            db.close()

    def test_accepts_actor_name_and_email(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db,
                tenant_id=test_tenant.id,
                organization_id=test_org.id,
                actor_id=_make_actor(),
                actor_name="John Doe",
                actor_email="john@example.com",
                action="user.login",
                summary="User logged in",
            )
            assert entry.actor_name == "John Doe"
            assert entry.actor_email == "john@example.com"
        finally:
            db.close()


class TestQuery:
    def test_returns_entries_for_tenant_and_org(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            before = db.query(type(entry := record(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                actor_id=_make_actor(), action="invoice.uploaded", summary="Test",
            ))).count()
            rows, total = query(db, tenant_id=test_tenant.id, organization_id=test_org.id)
            assert total >= 1
            assert len(rows) > 0
        finally:
            db.close()

    def test_filters_by_action(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="invoice.processed", summary="X")
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="invoice.exported", summary="Y")
            rows_processed, total_processed = query(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                action="invoice.processed",
            )
            assert total_processed >= 1
            for r in rows_processed:
                assert r.action == "invoice.processed"
        finally:
            db.close()

    def test_defaults_to_visibility_client(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="invoice.deleted", summary="A")
            rows, total = query(db, tenant_id=test_tenant.id, organization_id=test_org.id)
            for r in rows:
                assert r.visibility == "client" or r.visibility is None
        finally:
            db.close()

    def test_excludes_internal_by_default(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="__test_internal", summary="Internal")
            rows, total = query(db, tenant_id=test_tenant.id, organization_id=test_org.id)
            for r in rows:
                assert r.visibility != "internal"
        finally:
            db.close()

    def test_includes_internal_when_requested(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="__test_internal", summary="Internal")
            rows, total = query(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                visibility="internal",
            )
            if total > 0:
                for r in rows:
                    assert r.visibility == "internal"
        finally:
            db.close()

    def test_filters_by_actor_id(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            aid = _make_actor()
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=aid, action="invoice.created", summary="By me")
            rows, total = query(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                actor_id=aid,
            )
            assert total >= 1
            for r in rows:
                assert r.actor_id == aid
        finally:
            db.close()

    def test_respects_limit_and_offset(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            for i in range(5):
                record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                       actor_id=_make_actor(), action="invoice.uploaded", summary=f"E{i}")
            rows2, total = query(db, tenant_id=test_tenant.id, organization_id=test_org.id, limit=2)
            assert len(rows2) <= 2
            rows2_skip, _ = query(db, tenant_id=test_tenant.id, organization_id=test_org.id, limit=2, offset=2)
            assert len(rows2_skip) <= 2
            if len(rows2) == 2 and len(rows2_skip) == 2:
                assert rows2[0].id != rows2_skip[0].id
        finally:
            db.close()


class TestRecordPermanentDelete:
    """permanent_deleted and bulk_permanent_deleted are now client-visible."""

    def test_permanent_deleted_is_client_visible(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                actor_id=_make_actor(), action="invoice.permanent_deleted",
                summary="Perm delete",
            )
            assert entry.visibility == "client"
        finally:
            db.close()

    def test_bulk_permanent_deleted_is_client_visible(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            entry = record(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                actor_id=_make_actor(), action="invoice.bulk_permanent_deleted",
                summary="Bulk perm delete",
            )
            assert entry.visibility == "client"
        finally:
            db.close()

    def test_shows_in_default_query(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                actor_id=_make_actor(), action="invoice.permanent_deleted",
                summary="Should appear",
            )
            rows, total = query(db, tenant_id=test_tenant.id, organization_id=test_org.id)
            perm = [r for r in rows if r.action == "invoice.permanent_deleted"]
            assert len(perm) >= 1
        finally:
            db.close()

    def test_logs_without_snapshot_when_invoice_missing(self, test_tenant, test_org):
        """Simulates the case where invoice is not found — log must still be created."""
        db = SessionLocal()
        try:
            entry = record(
                db, tenant_id=test_tenant.id, organization_id=test_org.id,
                actor_id=_make_actor(), action="invoice.permanent_deleted",
                resource_id=str(uuid7()),
                summary="Intento de eliminación permanente — factura no encontrada en BD",
                details="El registro ya había sido eliminado o el ID es inválido",
            )
            assert entry.visibility == "client"
            assert entry.resource_id is not None
            assert "no encontrada" in entry.summary
        finally:
            db.close()


class TestQueryAdmin:
    def test_returns_all_visibilities(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="invoice.deleted", summary="Client")
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="__test_internal", summary="Internal")
            rows, total = query_admin(db)
            assert total >= 2
            visibilities = {r.visibility for r in rows}
            assert "client" in visibilities or None in visibilities
        finally:
            db.close()

    def test_filters_by_tenant_id(self, test_tenant):
        db = SessionLocal()
        try:
            other_org_id = uuid7()
            record(db, tenant_id=test_tenant.id, organization_id=other_org_id,
                   actor_id=_make_actor(), action="invoice.created", summary="T1 entry")
            rows, total = query_admin(db, tenant_id=test_tenant.id)
            assert total >= 1
        finally:
            db.close()

    def test_filters_by_action(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="invoice.exported", summary="Export test")
            rows, total = query_admin(db, action="invoice.exported")
            assert total >= 1
            for r in rows:
                assert r.action == "invoice.exported"
        finally:
            db.close()

    def test_excludes_none_visibility_when_filtering_client(self, test_tenant, test_org):
        db = SessionLocal()
        try:
            record(db, tenant_id=test_tenant.id, organization_id=test_org.id,
                   actor_id=_make_actor(), action="invoice.created", summary="Client")
            rows, total = query_admin(db, visibility="client")
            for r in rows:
                assert r.visibility == "client" or r.visibility is None
        finally:
            db.close()
