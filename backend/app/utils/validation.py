import re
from typing import Optional

from stdnum.do import rnc, cedula

_PASSWORD_MIN = 8

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# RNC whitelisted (from python-stdnum — known valid RNCs with non-standard checksums)
_RNC_WHITELIST = {
    '101581601', '101582245', '101595422', '101595785', '10233317',
    '131188691', '401007374', '501341601', '501378067', '501620371',
    '501651319', '501651823', '501651845', '501651926', '501656006',
    '501658167', '501670785', '501676936', '501680158', '504654542',
    '504680029', '504681442', '505038691',
}

def validate_rnc_checksum(rnc_val: str) -> bool:
    digits = re.sub(r"\D", "", rnc_val)
    if len(digits) != 9:
        return False
    if digits in _RNC_WHITELIST:
        return True
    return rnc.is_valid(digits)

def validate_cedula_checksum(cedula_val: str) -> bool:
    """Valida si una Cédula dominicana de 11 dígitos es válida usando stdnum."""
    digits = re.sub(r"\D", "", cedula_val)
    if len(digits) != 11:
        return False
    return cedula.is_valid(digits)

def is_valid_rnc_or_cedula(tax_id: Optional[str]) -> bool:
    """Valida RNC (9 dígitos) o Cédula (11 dígitos) dominicanos."""
    if not tax_id:
        return False
    digits = re.sub(r"\D", "", str(tax_id))
    if len(digits) == 9:
        return validate_rnc_checksum(digits)
    elif len(digits) == 11:
        return validate_cedula_checksum(digits)
    return False


def validate_email(email: str, field: str = "Correo electrónico") -> Optional[str]:
    if not email or not email.strip():
        return f"{field} es requerido"
    if not _EMAIL_RE.match(email.strip()):
        return f"{field} debe tener un formato válido (ej: usuario@dominio.com)"
    return None


def validate_full_name(name: str, field: str = "Nombre completo") -> Optional[str]:
    if not name or not name.strip():
        return f"{field} es requerido"
    parts = name.strip().split()
    if len(parts) < 2:
        return f"{field} debe incluir al menos nombre y apellido"
    for part in parts:
        if not re.search(r"[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]", part):
            return f"{field} no puede contener solo números o símbolos"
    return None


_password_errors: list[tuple[str, str]] = [
    (r"[A-Z]", "debe contener al menos una mayúscula"),
    (r"[a-z]", "debe contener al menos una minúscula"),
    (r"\d", "debe contener al menos un número"),
]


def validate_password(password: str, field: str = "Contraseña") -> Optional[str]:
    if not password:
        return f"{field} es requerida"
    if len(password) < _PASSWORD_MIN:
        return f"{field} debe tener al menos {_PASSWORD_MIN} caracteres"
    for pattern, msg in _password_errors:
        if not re.search(pattern, password):
            return f"{field} {msg}"
    return None
