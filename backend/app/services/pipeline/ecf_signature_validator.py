import logging
import re
from datetime import datetime, timezone
from typing import Optional

from cryptography import x509
from cryptography.x509.oid import NameOID
from lxml import etree
from signxml import XMLVerifier, InvalidSignature

logger = logging.getLogger(__name__)

DSIG_NS = "http://www.w3.org/2000/09/xmldsig#"


def validate_ecf_signature(xml_bytes: bytes, emitter_rnc: Optional[str] = None) -> dict:
    """Validate the XML digital signature (Sellado Electrónico) of an e-CF document.

    Returns:
        dict with:
        - valid (bool): whether the signature is cryptographically valid
        - error (str | None): error message if invalid
        - cert_rnc (str | None): RNC extracted from the certificate subject
        - cert_subject (str | None): full certificate subject DN
        - cert_issuer (str | None): full certificate issuer DN
        - cert_not_valid_after (str | None): certificate expiry date
    """
    result: dict = {"valid": False, "error": None, "cert_rnc": None, "cert_subject": None, "cert_issuer": None, "cert_not_valid_after": None}

    try:
        root = etree.fromstring(xml_bytes)
    except Exception as e:
        result["error"] = f"Error al parsear el XML: {e}"
        return result

    sig_nodes = root.xpath("//ds:Signature", namespaces={"ds": DSIG_NS})
    if not sig_nodes:
        result["error"] = "El XML e-CF no contiene firma digital (Sellado Electrónico). Este comprobante no está certificado por la DGII."
        return result

    # 1. Cryptographic verification using signxml
    try:
        XMLVerifier().verify(xml_bytes)
    except InvalidSignature:
        result["error"] = "La firma digital no es válida. Este comprobante no está certificado por la DGII o ha sido alterado."
        return result
    except Exception as e:
        logger.error("signxml verification error: %s", e, exc_info=True)
        result["error"] = f"Error al verificar la firma digital: {e}"
        return result

    # 2. Certificate extraction and validation
    x509_nodes = root.xpath("//ds:Signature//ds:X509Certificate", namespaces={"ds": DSIG_NS})
    if not x509_nodes or not x509_nodes[0].text:
        # Signature valid but no embedded certificate to inspect
        result["valid"] = True
        return result

    try:
        cert_b64 = x509_nodes[0].text.strip()
        cert_pem = f"-----BEGIN CERTIFICATE-----\n{cert_b64}\n-----END CERTIFICATE-----\n"
        cert = x509.load_pem_x509_certificate(cert_pem.encode())

        now = datetime.now(timezone.utc)

        if now < cert.not_valid_before_utc:
            result["error"] = f"El certificado digital aún no es válido (válido desde {cert.not_valid_before_utc.date()})."
            return result

        if now > cert.not_valid_after_utc:
            result["error"] = f"El certificado digital expiró el {cert.not_valid_after_utc.date()}. Solicite un comprobante actualizado al emisor."
            return result

        result["cert_subject"] = ", ".join(_format_name_attr(attr) for attr in cert.subject)
        result["cert_issuer"] = ", ".join(_format_name_attr(attr) for attr in cert.issuer)
        result["cert_not_valid_after"] = cert.not_valid_after_utc.isoformat()

        rnc = _extract_rnc_from_name(cert.subject)
        if rnc:
            result["cert_rnc"] = rnc

            # 3. RNC match check
            if emitter_rnc:
                clean_emitter = re.sub(r"\D", "", emitter_rnc)
                if rnc != clean_emitter:
                    result["error"] = (
                        f"El RNC del certificado ({rnc}) no coincide con el RNC del emisor ({emitter_rnc}). "
                        "Este comprobante no fue emitido por el proveedor declarado."
                    )
                    return result
        else:
            logger.warning("Could not extract RNC from certificate subject: %s", result["cert_subject"])

        result["valid"] = True
        return result

    except Exception as e:
        logger.error("Error processing certificate: %s", e, exc_info=True)
        result["error"] = f"Error al procesar el certificado digital: {e}"
        return result


def _extract_rnc_from_name(name: x509.Name) -> Optional[str]:
    """Extract Dominican RNC from an X.509 Name (subject or issuer).

    DGII certificates embed the RNC in the Common Name (CN) field.
    Patterns found in real DGII certificates:
      - CN=O-123456789-0
      - CN=123456789
      - CN=123456789 | OU=...
    """
    for attr in name:
        if attr.oid == NameOID.COMMON_NAME and attr.value:
            m = re.search(r"(?:O-)?(\d{9})(?:-\d)?", attr.value)
            if m:
                return m.group(1)
    return None


def _format_name_attr(attr: x509.NameAttribute) -> str:
    """Format a NameAttribute for display."""
    try:
        oid_name = attr.oid._name
    except Exception:
        oid_name = str(attr.oid)
    return f"{oid_name}={attr.value}"
