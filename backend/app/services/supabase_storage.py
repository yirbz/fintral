import base64
import io
import logging
import os
import tempfile
from typing import Optional
from uuid import UUID

from PIL import Image
from sqlalchemy import text
from storage3 import SyncStorageClient

from app.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET

logger = logging.getLogger(__name__)

INVOICES_PREFIX = "invoices"

_storage_bucket = None
_storage_client = None


def _get_storage_client() -> SyncStorageClient | None:
    global _storage_client
    if _storage_client is not None:
        return _storage_client
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("Supabase not configured — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")
        return None
    headers = {
        "apiKey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    }
    _storage_client = SyncStorageClient(f"{SUPABASE_URL}/storage/v1", headers)
    logger.debug("Storage client initialized: bucket=%s, endpoint=%s/storage/v1", SUPABASE_STORAGE_BUCKET, SUPABASE_URL)
    return _storage_client


def _get_bucket():
    global _storage_bucket
    if _storage_bucket is not None:
        return _storage_bucket
    client = _get_storage_client()
    if not client:
        return None
    _storage_bucket = client.from_(SUPABASE_STORAGE_BUCKET)
    return _storage_bucket


def _ensure_rls_policies(bucket_name: str) -> bool:
    try:
        from app.database import get_engine
        engine = get_engine()
        if engine is None:
            logger.warning("Cannot create RLS policy — database engine not available")
            return False
        with engine.begin() as conn:
            conn.execute(text("DROP POLICY IF EXISTS service_role_all_invoices ON storage.objects"))
            conn.execute(text(f"""
                CREATE POLICY service_role_all_invoices
                ON storage.objects
                FOR ALL
                USING (
                    bucket_id = '{bucket_name}'
                    AND auth.role() = 'service_role'
                )
            """))
        logger.debug("RLS policy created for bucket '%s'", bucket_name)
        return True
    except Exception:
        logger.debug("Could not ensure RLS policies for bucket '%s' — run scripts/supabase_storage_rls.sql manually if needed", bucket_name)
        return False


def ensure_bucket() -> bool:
    client = _get_storage_client()
    if not client:
        return False
    try:
        existing = client.list_buckets()
        bucket_names = [b.name for b in existing]
        if SUPABASE_STORAGE_BUCKET not in bucket_names:
            logger.info("Bucket '%s' not found, creating it...", SUPABASE_STORAGE_BUCKET)
            client.create_bucket(
                SUPABASE_STORAGE_BUCKET,
                options={"public": False},
            )
            logger.info("Storage bucket created: %s (public=false)", SUPABASE_STORAGE_BUCKET)
        else:
            logger.debug("Storage bucket found: %s", SUPABASE_STORAGE_BUCKET)

        _ensure_rls_policies(SUPABASE_STORAGE_BUCKET)
        return True
    except Exception as e:
        logger.debug("Storage bucket init skipped for '%s': %s", SUPABASE_STORAGE_BUCKET, e)
        return False


def build_storage_path(
    tenant_id: UUID,
    org_id: UUID,
    invoice_id: UUID,
    variant: str,
    extension: str,
) -> str:
    extension = extension.lstrip(".").lower()
    return f"{INVOICES_PREFIX}/{tenant_id}/{org_id}/{invoice_id}/{variant}.{extension}"


def parse_storage_path(storage_path: str) -> Optional[dict]:
    parts = storage_path.lstrip("/").split("/")
    if len(parts) >= 5 and parts[0] == INVOICES_PREFIX:
        return {
            "prefix": parts[0],
            "tenant_id": parts[1],
            "org_id": parts[2],
            "invoice_id": parts[3],
            "variant": parts[4].rsplit(".", 1)[0] if "." in parts[4] else parts[4],
            "extension": parts[4].rsplit(".", 1)[1] if "." in parts[4] else "",
        }
    return None


def is_structured_path(path: str) -> bool:
    return path.startswith(f"{INVOICES_PREFIX}/") and path.count("/") >= 4


def resolve_invoice_path(invoice, variant: str = "original") -> Optional[str]:
    source = invoice.processed_path if variant == "processed" and invoice.processed_path else invoice.file_path
    if source and is_structured_path(source):
        return source

    ext = "jpg" if variant == "processed" else None
    if source and "." in source:
        ext = source.rsplit(".", 1)[-1].lower()

    return build_storage_path(
        invoice.tenant_id,
        invoice.organization_id,
        invoice.id,
        variant,
        ext or "jpg",
    )


def upload_file(
    file_data: bytes,
    storage_path: str,
    content_type: Optional[str] = None,
) -> Optional[str]:
    bucket = _get_bucket()
    if not bucket:
        logger.error("Upload failed for %s — storage bucket not available", storage_path)
        return None
    file_size = len(file_data)
    try:
        options = {}
        if content_type:
            options["content-type"] = content_type
        logger.info("Uploading file: %s (size=%d bytes, type=%s)", storage_path, file_size, content_type or "unknown")
        bucket.upload(storage_path, file_data, file_options=options)
        logger.info("Upload complete: %s", storage_path)
        return storage_path
    except Exception as e:
        if "already exists" in str(e).lower():
            logger.info("File already exists at %s — overwriting", storage_path)
            bucket.update(
                storage_path, file_data,
                file_options={"content-type": content_type or "application/octet-stream"},
            )
            logger.info("Overwrite complete: %s", storage_path)
            return storage_path
        logger.error("Upload failed for %s: %s", storage_path, e)
        return None


def upload_invoice_file(
    file_data: bytes,
    tenant_id: UUID,
    org_id: UUID,
    invoice_id: UUID,
    variant: str,
    extension: str,
    content_type: Optional[str] = None,
) -> Optional[str]:
    path = build_storage_path(tenant_id, org_id, invoice_id, variant, extension)
    logger.info("Invoice upload: tenant=%s, org=%s, invoice=%s, variant=%s, ext=%s", tenant_id, org_id, invoice_id, variant, extension)
    result = upload_file(file_data, path, content_type=content_type)
    return result


def download_file(storage_path: str) -> Optional[bytes]:
    bucket = _get_bucket()
    if not bucket:
        logger.error("Download failed for %s — storage bucket not available", storage_path)
        return None
    try:
        logger.info("Downloading file: %s", storage_path)
        data = bucket.download(storage_path)
        logger.info("Download complete: %s (size=%d bytes)", storage_path, len(data))
        return data
    except Exception as e:
        logger.error("Download failed for %s: %s", storage_path, e)
        return None


def download_to_temp(storage_path: str) -> Optional[str]:
    data = download_file(storage_path)
    if not data:
        return None
    try:
        suffix = os.path.splitext(storage_path)[1] or ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(data)
        logger.info("Downloaded to temp file: %s -> %s", storage_path, f.name)
        return f.name
    except Exception as e:
        logger.error("Temp file creation failed for %s: %s", storage_path, e)
        return None


def get_public_url(storage_path: str) -> Optional[str]:
    if not SUPABASE_URL or not storage_path:
        return None
    url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_STORAGE_BUCKET}/{storage_path}"
    return url


def delete_file(storage_path: str) -> bool:
    bucket = _get_bucket()
    if not bucket:
        logger.error("Delete failed for %s — storage bucket not available", storage_path)
        return False
    try:
        logger.info("Deleting file: %s", storage_path)
        bucket.remove([storage_path])
        logger.info("File deleted: %s", storage_path)
        return True
    except Exception as e:
        logger.error("Delete failed for %s: %s", storage_path, e)
        return False


def delete_invoice_folder(
    tenant_id: UUID,
    org_id: UUID,
    invoice_id: UUID,
) -> bool:
    bucket = _get_bucket()
    if not bucket:
        logger.error("Folder delete failed for invoice %s — storage bucket not available", invoice_id)
        return False
    try:
        prefix = f"{INVOICES_PREFIX}/{tenant_id}/{org_id}/{invoice_id}/"
        logger.info("Listing files for deletion: %s", prefix)
        files = bucket.list(prefix)
        if not files:
            logger.info("No files found at %s — nothing to delete", prefix)
            return True
        paths = [f"{prefix}{f['name']}" for f in files]
        logger.info("Deleting %d file(s) from %s: %s", len(paths), prefix, [p.rsplit("/", 1)[-1] for p in paths])
        bucket.remove(paths)
        logger.info("Folder deleted: %s (%d file(s) removed)", prefix, len(paths))
        return True
    except Exception as e:
        logger.error("Folder delete failed for %s: %s", prefix, e)
        return False


def get_optimized_image_base64(image_data: bytes,
                                 max_width: int = 800,
                                 quality: int = 85) -> Optional[str]:
    try:
        with Image.open(io.BytesIO(image_data)) as img:
            original_size = img.size
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            if img.width > max_width:
                ratio = max_width / img.width
                img = img.resize((max_width, int(img.height * ratio)),
                                 Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=quality, optimize=True)
            img_data = base64.b64encode(buffer.getvalue()).decode()
            logger.info("Image optimized: %dx%d -> %s (quality=%d)", original_size[0], original_size[1], img.size, quality)
            return f"data:image/jpeg;base64,{img_data}"
    except Exception as e:
        logger.error("Image optimization failed: %s", e)
        return None


def optimize_image_from_storage(
    storage_path: str,
    max_width: int = 800,
    quality: int = 85,
) -> Optional[str]:
    logger.info("Optimizing image from storage: %s (max_width=%d, quality=%d)", storage_path, max_width, quality)
    data = download_file(storage_path)
    if not data:
        return None
    return get_optimized_image_base64(data, max_width, quality)
