import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

import cv2
import httpx
import numpy as np

logger = logging.getLogger(__name__)

DGII_CONSULTA_URL = "https://fc.dgii.gov.do/ecf/ConsultaTimbreFC"
DGII_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 15.0

ESTADOS_VALIDOS = {
    "Aceptado": "accepted",
    "Rechazado": "rejected",
    "Anulado": "voided",
    "Registrado": "registered",
    "Pendiente": "pending",
}

ESTADOS_DESCRIPCION = {
    "accepted": "El comprobante fue recibido y aceptado por la DGII",
    "rejected": "El comprobante fue rechazado por la DGII",
    "voided": "El comprobante ha sido anulado",
    "registered": "El comprobante está registrado en la DGII",
    "pending": "El comprobante está pendiente de procesamiento en la DGII",
    "not_found": "No se encontró el comprobante en la DGII",
    "error": "Error al consultar la DGII",
}


@dataclass
class QrData:
    rnc_emisor: str
    encf: str
    monto_total: float
    codigo_seguridad: str
    raw_url: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "rnc_emisor": self.rnc_emisor,
            "encf": self.encf,
            "monto_total": self.monto_total,
            "codigo_seguridad": self.codigo_seguridad,
            "raw_url": self.raw_url,
        }


@dataclass
class DgiiValidationResult:
    status: str  # accepted, rejected, voided, registered, pending, not_found, error
    estado_dgii: Optional[str]
    razon_social: Optional[str]
    rnc_emisor: Optional[str]
    encf: Optional[str]
    qr_data: Optional[Dict[str, Any]]
    raw_response: Optional[str]
    error: Optional[str]
    validated_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "estado_dgii": self.estado_dgii,
            "razon_social": self.razon_social,
            "rnc_emisor": self.rnc_emisor,
            "encf": self.encf,
            "qr_data": self.qr_data,
            "error": self.error,
            "validated_at": self.validated_at,
            "description": ESTADOS_DESCRIPCION.get(self.status, ""),
        }


class DgiiValidationService:

    @staticmethod
    def parse_qr_url(url: str) -> Optional[QrData]:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        rnc_emisor = params.get("RncEmisor", [None])[0]
        encf = params.get("ENCF", [None])[0]
        monto_total_str = params.get("MontoTotal", [None])[0]
        codigo_seguridad = params.get("CodigoSeguridad", [None])[0]

        if not all([rnc_emisor, encf, monto_total_str, codigo_seguridad]):
            logger.warning("QR URL incomplete: missing one or more required params")
            return None

        try:
            monto_total = float(monto_total_str)
        except (ValueError, TypeError):
            logger.warning("Invalid MontoTotal in QR URL: %s", monto_total_str)
            return None

        return QrData(
            rnc_emisor=re.sub(r"\D", "", rnc_emisor.strip()),
            encf=encf.strip().upper(),
            monto_total=monto_total,
            codigo_seguridad=codigo_seguridad.strip(),
            raw_url=url,
        )

    @staticmethod
    def detect_qr_codes(image_path: str) -> List[Dict[str, Any]]:
        img = cv2.imread(image_path)
        if img is None:
            logger.warning("Could not load image for QR detection: %s", image_path)
            return []

        return DgiiValidationService._detect_qr_codes_multi(img, image_path)

    @staticmethod
    def detect_qr_codes_bytes(image_data: bytes) -> List[Dict[str, Any]]:
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            logger.warning("Could not decode image bytes for QR detection")
            return []

        return DgiiValidationService._detect_qr_codes_multi(img, "image_bytes")

    @staticmethod
    def _detect_qr_codes_multi(img: np.ndarray, source_label: str) -> List[Dict[str, Any]]:
        """Multi-strategy QR detection for real-world images (poor lighting, blurry, angled)."""
        detector = cv2.QRCodeDetector()

        def _try_decode(image: np.ndarray) -> List[Dict[str, Any]]:
            """Try to detect and decode QR codes in the given image."""
            decoded_text, points, _ = detector.detectAndDecode(image)
            results = []
            if decoded_text:
                qr_data = DgiiValidationService.parse_qr_url(decoded_text)
                results.append({
                    "text": decoded_text,
                    "points": points.tolist() if points is not None else None,
                    "parsed": qr_data.to_dict() if qr_data else None,
                })
            return results

        results = []

        # Strategy 1: Try original image
        results = _try_decode(img)
        if results:
            logger.info("[QR] Strategy 1 (original) succeeded for %s", source_label)
            return results

        # Strategy 2: Grayscale + CLAHE (contrast enhancement)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        results = _try_decode(cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 2 (CLAHE) succeeded for %s", source_label)
            return results

        # Strategy 3: Denoise + CLAHE
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10)
        results = _try_decode(cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 3 (denoise+CLAHE) succeeded for %s", source_label)
            return results

        # Strategy 4: Upscale 2x + CLAHE
        h, w = enhanced.shape
        upscaled = cv2.resize(enhanced, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        results = _try_decode(cv2.cvtColor(upscaled, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 4 (2x upscale + CLAHE) succeeded for %s", source_label)
            return results

        # Strategy 5: Upscale 3x + CLAHE
        upscaled_3x = cv2.resize(enhanced, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)
        results = _try_decode(cv2.cvtColor(upscaled_3x, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 5 (3x upscale + CLAHE) succeeded for %s", source_label)
            return results

        # Strategy 6: Adaptive threshold
        thresh = cv2.adaptiveThreshold(enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                        cv2.THRESH_BINARY, 21, 4)
        results = _try_decode(cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 6 (adaptive threshold) succeeded for %s", source_label)
            return results

        # Strategy 7: Bilateral filter + adaptive threshold
        bilateral = cv2.bilateralFilter(gray, 9, 50, 50)
        thresh2 = cv2.adaptiveThreshold(bilateral, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                         cv2.THRESH_BINARY, 31, 6)
        results = _try_decode(cv2.cvtColor(thresh2, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 7 (bilateral+threshold) succeeded for %s", source_label)
            return results

        # Strategy 8: Morphological close to fix broken QR patterns
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        results = _try_decode(cv2.cvtColor(morph, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 8 (morphological close) succeeded for %s", source_label)
            return results

        # Strategy 9: OTSU binarization on upscaled
        _, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        otsu_upscaled = cv2.resize(otsu, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        results = _try_decode(cv2.cvtColor(otsu_upscaled, cv2.COLOR_GRAY2BGR))
        if results:
            logger.info("[QR] Strategy 9 (OTSU + upscale) succeeded for %s", source_label)
            return results

        # Strategy 10: pyzbar (most robust for real-world images — try multiple preprocessings)
        try:
            from pyzbar.pyzbar import decode as pyzbar_decode
            from PIL import Image as PILImage

            def _pyzbar_try(img_gray: np.ndarray, label: str) -> Optional[List[Dict[str, Any]]]:
                pil_img = PILImage.fromarray(img_gray)
                barcodes = pyzbar_decode(pil_img)
                if barcodes:
                    for barcode in barcodes:
                        text = barcode.data.decode("utf-8")
                        parsed = DgiiValidationService.parse_qr_url(text)
                        logger.info("[QR] Strategy 10 (pyzbar %s) succeeded for %s", label, source_label)
                        return [{
                            "text": text,
                            "points": None,
                            "parsed": parsed.to_dict() if parsed else None,
                        }]
                return None

            # 10a: Grayscale original
            result = _pyzbar_try(gray, "gray")
            if result:
                return result

            # 10b: Grayscale 2x
            h, w = gray.shape
            result = _pyzbar_try(
                cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC), "gray_2x")
            if result:
                return result

            # 10c: Grayscale 3x
            result = _pyzbar_try(
                cv2.resize(gray, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC), "gray_3x")
            if result:
                return result

            # 10d: CLAHE enhanced
            clahe_img = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
            result = _pyzbar_try(clahe_img, "clahe")
            if result:
                return result

            # 10e: CLAHE 2x
            result = _pyzbar_try(
                cv2.resize(clahe_img, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC), "clahe_2x")
            if result:
                return result

            # 10f: Adaptive threshold binary
            thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                            cv2.THRESH_BINARY, 21, 4)
            result = _pyzbar_try(thresh, "threshold")
            if result:
                return result

            # 10g: OTSU binary
            _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            result = _pyzbar_try(otsu, "otsu")
            if result:
                return result

        except ImportError:
            logger.debug("pyzbar not available — skipping strategy 10")
        except Exception as e:
            logger.warning("pyzbar error: %s", e)

        logger.info("[QR] All strategies failed for %s", source_label)
        return []

    async def validate_ecf(
        self,
        rnc_emisor: str,
        encf: str,
        monto_total: float,
        codigo_seguridad: str,
    ) -> DgiiValidationResult:
        qr_data = QrData(
            rnc_emisor=re.sub(r"\D", "", str(rnc_emisor).strip()),
            encf=str(encf).strip().upper(),
            monto_total=monto_total,
            codigo_seguridad=str(codigo_seguridad).strip(),
            raw_url="",
        )
        return await self._query_dgii(qr_data)

    async def validate_qr(self, qr_url: str) -> DgiiValidationResult:
        qr_data = self.parse_qr_url(qr_url)
        if qr_data is None:
            return DgiiValidationResult(
                status="error",
                estado_dgii=None,
                razon_social=None,
                rnc_emisor=None,
                encf=None,
                qr_data=None,
                raw_response=None,
                error="No se pudo analizar la URL del código QR. Verifica que el QR sea de un comprobante fiscal electrónico (e-CF) de la DGII.",
                validated_at=datetime.utcnow().isoformat(),
            )
        return await self._query_dgii(qr_data)

    async def validate_ecf_from_data(
        self,
        rnc_emisor: Optional[str] = None,
        encf: Optional[str] = None,
        monto_total: Optional[float] = None,
        codigo_seguridad: Optional[str] = None,
        qr_data_dict: Optional[Dict[str, Any]] = None,
    ) -> DgiiValidationResult:
        if qr_data_dict:
            rnc_emisor = qr_data_dict.get("rnc_emisor") or rnc_emisor
            encf = qr_data_dict.get("encf") or encf
            monto_total = qr_data_dict.get("monto_total") or monto_total
            codigo_seguridad = qr_data_dict.get("codigo_seguridad") or codigo_seguridad

        if not all([rnc_emisor, encf, monto_total, codigo_seguridad]):
            missing = []
            if not rnc_emisor:
                missing.append("RNC Emisor")
            if not encf:
                missing.append("e-NCF")
            if not monto_total:
                missing.append("Monto Total")
            if not codigo_seguridad:
                missing.append("Código de Seguridad")
            return DgiiValidationResult(
                status="error",
                estado_dgii=None,
                razon_social=None,
                rnc_emisor=rnc_emisor,
                encf=encf,
                qr_data=qr_data_dict,
                raw_response=None,
                error=f"Datos incompletos para validación DGII: faltan {', '.join(missing)}",
                validated_at=datetime.utcnow().isoformat(),
            )

        qr_data = QrData(
            rnc_emisor=re.sub(r"\D", "", str(rnc_emisor).strip()),
            encf=str(encf).strip().upper(),
            monto_total=float(monto_total),
            codigo_seguridad=str(codigo_seguridad).strip(),
            raw_url="",
        )
        return await self._query_dgii(qr_data)

    async def _query_dgii(self, qr_data: QrData) -> DgiiValidationResult:
        params = {
            "RncEmisor": qr_data.rnc_emisor,
            "ENCF": qr_data.encf,
            "MontoTotal": str(qr_data.monto_total),
            "CodigoSeguridad": qr_data.codigo_seguridad,
        }

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(REQUEST_TIMEOUT),
                follow_redirects=True,
            ) as client:
                resp = await client.get(
                    DGII_CONSULTA_URL,
                    params=params,
                    headers={"User-Agent": DGII_USER_AGENT},
                )
                resp.raise_for_status()
                html = resp.text

            estado_raw, razon_social, rnc, encf = self._parse_dgii_response(html)

            if not estado_raw:
                return DgiiValidationResult(
                    status="not_found",
                    estado_dgii=None,
                    razon_social=razon_social,
                    rnc_emisor=qr_data.rnc_emisor,
                    encf=qr_data.encf,
                    qr_data=qr_data.to_dict(),
                    raw_response=None,
                    error="No se encontró información del comprobante en la DGII",
                    validated_at=datetime.utcnow().isoformat(),
                )

            mapped_status = ESTADOS_VALIDOS.get(estado_raw, "registered")

            return DgiiValidationResult(
                status=mapped_status,
                estado_dgii=estado_raw,
                razon_social=razon_social,
                rnc_emisor=rnc or qr_data.rnc_emisor,
                encf=encf or qr_data.encf,
                qr_data=qr_data.to_dict(),
                raw_response=html[:5000],
                error=None,
                validated_at=datetime.utcnow().isoformat(),
            )

        except httpx.TimeoutException:
            logger.error("DGII consultation timed out for ENCF=%s", qr_data.encf)
            return DgiiValidationResult(
                status="error",
                estado_dgii=None,
                razon_social=None,
                rnc_emisor=qr_data.rnc_emisor,
                encf=qr_data.encf,
                qr_data=qr_data.to_dict(),
                raw_response=None,
                error="La consulta a la DGII tardó demasiado. Intenta de nuevo en unos minutos.",
                validated_at=datetime.utcnow().isoformat(),
            )
        except httpx.HTTPError as exc:
            logger.error("DGII HTTP error for ENCF=%s: %s", qr_data.encf, exc)
            return DgiiValidationResult(
                status="error",
                estado_dgii=None,
                razon_social=None,
                rnc_emisor=qr_data.rnc_emisor,
                encf=qr_data.encf,
                qr_data=qr_data.to_dict(),
                raw_response=None,
                error=f"Error al conectar con la DGII: {exc}",
                validated_at=datetime.utcnow().isoformat(),
            )
        except Exception as exc:
            logger.exception("Unexpected DGII validation error for ENCF=%s", qr_data.encf)
            return DgiiValidationResult(
                status="error",
                estado_dgii=None,
                razon_social=None,
                rnc_emisor=qr_data.rnc_emisor,
                encf=qr_data.encf,
                qr_data=qr_data.to_dict(),
                raw_response=None,
                error=f"Error inesperado al validar con la DGII: {exc}",
                validated_at=datetime.utcnow().isoformat(),
            )

    @staticmethod
    def _parse_dgii_response(html: str) -> tuple:
        table_match = re.search(
            r'<table[^>]*class="[^"]*table[^"]*table-striped[^"]*"[^>]*>([\s\S]*?)</table>',
            html,
        )
        if not table_match:
            return None, None, None, None

        table_html = table_match.group(1)
        rows = re.findall(
            r'<tr>\s*<th[^>]*>(.*?)</th>\s*<td>(.*?)</td>\s*</tr>',
            table_html,
            re.DOTALL,
        )

        estado = None
        razon_social = None
        rnc_emisor = None
        encf = None

        for th, td in rows:
            label = re.sub(r'<[^>]+>', '', th).strip().lower()
            value = re.sub(r'<[^>]+>', '', td).strip()

            if 'estado' in label:
                estado = value
            elif 'razón' in label or 'razon' in label:
                razon_social = value
            elif 'rnc' in label and 'emisor' in label:
                rnc_emisor = value
            elif 'e-ncf' in label or 'encf' in label:
                encf = value

        return estado, razon_social, rnc_emisor, encf

    @staticmethod
    def extract_invoice_data_from_qr(qr_url: str) -> Optional[Dict[str, Any]]:
        qr_data = DgiiValidationService.parse_qr_url(qr_url)
        if qr_data is None:
            return None
        return {
            "vendor_tax_id": qr_data.rnc_emisor,
            "invoice_number": qr_data.encf,
            "total_amount": qr_data.monto_total,
            "is_electronic": True,
            "ecf_type": qr_data.encf[1:3] if len(qr_data.encf) >= 3 and qr_data.encf[1:3].isdigit() else None,
            "dgii_security_code": qr_data.codigo_seguridad,
            "ingestion_source": "qr_scan",
        }


dgii_validation_service = DgiiValidationService()
