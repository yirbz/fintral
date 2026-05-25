import re
from typing import Optional
from stdnum.do import rnc, cedula

# RNC whitelisted (from python-stdnum — known valid RNCs with non-standard checksums)
_RNC_WHITELIST = {
    '101581601', '101582245', '101595422', '101595785', '10233317',
    '131188691', '401007374', '501341601', '501378067', '501620371',
    '501651319', '501651823', '501651845', '501651926', '501656006',
    '501658167', '501670785', '501676936', '501680158', '504654542',
    '504680029', '504681442', '505038691',
}

def validate_rnc_checksum(rnc_val: str) -> bool:
    """Valida si un RNC dominicano de 9 dígitos es válido usando stdnum o la lista blanca."""
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
