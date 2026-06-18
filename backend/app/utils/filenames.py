import re
import unicodedata

def normalize_filename(filename: str, max_length: int = 50) -> str:
    """
    Normalizes a filename:
    1. Splits name and extension.
    2. Converts name to lowercase.
    3. Normalizes unicode characters to ASCII (e.g. 'á' -> 'a').
    4. Replaces non-alphanumeric characters (except hyphens and underscores) with hyphens.
    5. Replaces multiple consecutive hyphens/underscores with a single one.
    6. Truncates the name part to max_length characters without breaking the extension.
    7. Strips leading/trailing hyphens/underscores.
    8. Re-assembles with lowercase extension.
    """
    # Split name and extension
    if "." in filename:
        parts = filename.rsplit(".", 1)
        name, ext = parts[0], "." + parts[1]
    else:
        name, ext = filename, ""
    ext = ext.lower().strip()
    
    # 1. Normalize unicode (accented characters like á -> a)
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode('ascii')
    
    # 2. Lowercase and replace non-alphanumeric with hyphens
    name = name.lower()
    name = re.sub(r'[^a-z0-9_-]', '-', name)
    
    # 3. Clean up multiple hyphens/underscores
    name = re.sub(r'[-_]+', '-', name)
    
    # 4. Strip leading/trailing symbols
    name = name.strip('-_')
    
    # 5. Fallback if empty name
    if not name:
        name = "file"
        
    # 6. Truncate name part to max_length
    if len(name) > max_length:
        name = name[:max_length].rstrip('-_')
        
    return f"{name}{ext}"
