from app.utils.filenames import normalize_filename

def test_normalize_filename_basic():
    assert normalize_filename("My Invoice.pdf") == "my-invoice.pdf"

def test_normalize_filename_accents():
    assert normalize_filename("Facturación de Compañía.JPEG") == "facturacion-de-compania.jpeg"

def test_normalize_filename_special_chars():
    assert normalize_filename("test@#$%^&*()_+{}[]|\\:;\"'<>,.?/~`!123.png") == "test-123.png"

def test_normalize_filename_length_truncation():
    long_name = "a" * 100 + ".xlsx"
    normalized = normalize_filename(long_name, max_length=30)
    assert len(normalized) == 35 # 30 chars + 5 chars extension (.xlsx)
    assert normalized == "a" * 30 + ".xlsx"

def test_normalize_filename_empty_fallback():
    assert normalize_filename(".png") == "file.png"
