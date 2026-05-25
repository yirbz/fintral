import io
from PIL import Image
from uuid import uuid4

from app.services.supabase_storage import (
    optimize_avatar_image,
    upload_user_profile_pic,
)

def test_optimize_avatar_image_square_crop():
    # Create a 800x600 test image (rectangular, transparent RGBA)
    img = Image.new("RGBA", (800, 600), (255, 0, 0, 255))
    # Draw some transparent content to test transparency paste
    img.putpixel((100, 100), (0, 0, 0, 0)) # transparent pixel
    
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    png_bytes = buffer.getvalue()

    optimized = optimize_avatar_image(png_bytes)
    assert optimized is not None

    # Load optimized image and verify dimensions & format
    opt_img = Image.open(io.BytesIO(optimized))
    assert opt_img.size == (400, 400)
    assert opt_img.format == "JPEG"
    assert opt_img.mode == "RGB"


def test_upload_user_profile_pic_size_limit():
    tenant_id = uuid4()
    org_id = uuid4()
    user_id = uuid4()
    
    # Exceeding 5MB limit
    large_data = b"x" * (5 * 1024 * 1024 + 1)
    
    res = upload_user_profile_pic(
        large_data,
        tenant_id,
        org_id,
        user_id,
        "avatar.png"
    )
    assert res is None


def test_upload_user_profile_pic_invalid_extension():
    tenant_id = uuid4()
    org_id = uuid4()
    user_id = uuid4()
    
    res = upload_user_profile_pic(
        b"some fake data",
        tenant_id,
        org_id,
        user_id,
        "document.pdf"
    )
    assert res is None


def test_upload_user_profile_pic_fallback_b64():
    tenant_id = uuid4()
    org_id = uuid4()
    user_id = uuid4()
    
    # Valid PNG image bytes
    img = Image.new("RGB", (200, 200), (0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    valid_bytes = buf.getvalue()
    
    # SUPABASE_URL is empty in test environment so it should use fallback
    res = upload_user_profile_pic(
        valid_bytes,
        tenant_id,
        org_id,
        user_id,
        "my_pic.webp"
    )
    
    assert res is not None
    assert res.startswith("data:image/jpeg;base64,")
