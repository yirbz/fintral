import logging
import time
from typing import Any, Dict, Optional
from uuid import UUID
import httpx
from sqlalchemy.orm import Session
from app.config import ALANUBE_API_URL, ALANUBE_JWT

logger = logging.getLogger(__name__)


class AlanubeService:
    def __init__(
        self,
        api_url: str = ALANUBE_API_URL,
        jwt_token: str = ALANUBE_JWT,
        db: Optional[Session] = None,
        tenant_id: Optional[UUID] = None,
        organization_id: Optional[UUID] = None,
    ):
        self.api_url = api_url.rstrip("/")
        self.jwt_token = jwt_token
        self.db = db
        self.tenant_id = tenant_id
        self.organization_id = organization_id

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.jwt_token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def _record_telemetry(
        self,
        action: str,
        success: bool,
        latency_ms: int,
        ecf_type: Optional[str] = None,
        error_message: Optional[str] = None,
    ):
        if not self.db or not self.tenant_id or not self.organization_id:
            return

        try:
            from app.models.alanube_telemetry import AlanubeTelemetry
            telemetry = AlanubeTelemetry(
                tenant_id=self.tenant_id,
                organization_id=self.organization_id,
                action=action,
                ecf_type=ecf_type,
                success=success,
                latency_ms=latency_ms,
                error_message=error_message
            )
            self.db.add(telemetry)
            self.db.commit()
        except Exception as e:
            logger.error(f"Error recording Alanube telemetry: {e}")

    async def create_company(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dar de alta a una empresa en la API de Alanube
        POST /company
        """
        url = f"{self.api_url}/company"
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=company_data, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("create_company", True, latency)
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("create_company", False, latency, error_message=err_text)
                logger.error(f"Alanube error creating company: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("create_company", False, latency, error_message=str(e))
                logger.error(f"Unexpected error creating company: {e}")
                raise e

    async def patch_company(self, company_id: str, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Actualizar datos de una empresa en Alanube
        PATCH /company/{id}
        Solo envía los campos que se necesitan actualizar (PATCH parcial).
        """
        url = f"{self.api_url}/company/{company_id}"
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.patch(url, json=company_data, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("patch_company", True, latency)
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("patch_company", False, latency, error_message=err_text)
                logger.error(f"Alanube error patching company: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("patch_company", False, latency, error_message=str(e))
                logger.error(f"Unexpected error patching company: {e}")
                raise e

    async def sign_document(self, xml_content: bytes, company_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Firmar un XML con el certificado de la empresa configurado en Alanube
        POST /sign-document o POST /sign-document/idCompany/{company_id}
        """
        if company_id:
            url = f"{self.api_url}/sign-document/idCompany/{company_id}"
        else:
            url = f"{self.api_url}/sign-document"
            
        files = {"xml": ("document.xml", xml_content, "application/xml")}
        headers = {
            "Authorization": f"Bearer {self.jwt_token}",
            "Accept": "application/json"
        }
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, files=files, headers=headers, timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("sign_document", True, latency)
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("sign_document", False, latency, error_message=err_text)
                logger.error(f"Alanube error signing document: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("sign_document", False, latency, error_message=str(e))
                logger.error(f"Unexpected error signing document: {e}")
                raise e

    async def create_set_test(self, set_test_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Crear/Iniciar set de pruebas ante la DGII en Alanube
        POST /set-tests
        """
        url = f"{self.api_url}/set-tests"
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=set_test_data, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("create_set_test", True, latency)
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("create_set_test", False, latency, error_message=err_text)
                logger.error(f"Alanube error creating set test: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("create_set_test", False, latency, error_message=str(e))
                logger.error(f"Unexpected error creating set test: {e}")
                raise e

    async def check_set_test_status(self, set_test_id: str) -> Dict[str, Any]:
        """
        Consultar el estado del set de pruebas ante la DGII
        GET /check-set-tests/{id}
        """
        url = f"{self.api_url}/check-set-tests/{set_test_id}"
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("check_set_test_status", True, latency)
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("check_set_test_status", False, latency, error_message=err_text)
                logger.error(f"Alanube error checking set test status: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("check_set_test_status", False, latency, error_message=str(e))
                logger.error(f"Unexpected error checking set test status: {e}")
                raise e

    async def emit_document(self, ecf_type: int, payload: Dict[str, Any], company_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Emitir un comprobante electrónico (e-CF) ante Alanube y la DGII
        """
        endpoint_map = {
            31: "/fiscal-invoices",
            32: "/invoices",
            33: "/debit-notes",
            34: "/credit-notes",
            41: "/purchases",
            43: "/minor-expenses",
            44: "/special-regimes",
            45: "/gubernamentals",
            46: "/export-supports",
            47: "/payment-abroad-supports",
        }

        endpoint = endpoint_map.get(ecf_type)
        if not endpoint:
            raise ValueError(f"Tipo de e-CF no soportado para emisión: {ecf_type}")

        if company_id:
            payload["company"] = {"id": company_id}

        url = f"{self.api_url}{endpoint}"
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("emit_document", True, latency, ecf_type=str(ecf_type))
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("emit_document", False, latency, ecf_type=str(ecf_type), error_message=err_text)
                logger.error(f"Alanube error emitting e-CF {ecf_type}: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("emit_document", False, latency, ecf_type=str(ecf_type), error_message=str(e))
                logger.error(f"Unexpected error emitting e-CF {ecf_type}: {e}")
                raise e

    async def verify_connection(self) -> Dict[str, Any]:
        """
        Test the Alanube connection by fetching the company associated with the token
        GET /companies/self
        """
        url = f"{self.api_url}/companies/self"
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self._get_headers(), timeout=15.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("verify_connection", True, latency)
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("verify_connection", False, latency, error_message=err_text)
                logger.error(f"Alanube connection test failed: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("verify_connection", False, latency, error_message=str(e))
                logger.error(f"Unexpected error testing connection: {e}")
                raise e

    async def check_document_status(self, ecf_type: int, doc_id: str, pdf_type: str = "generic") -> Dict[str, Any]:
        """
        Consultar el estado actual de aprobación de un comprobante ante Alanube / DGII
        GET /{endpoint}/{doc_id}?pdfType={pdf_type}
        """
        endpoint_map = {
            31: "/fiscal-invoices",
            32: "/invoices",
            33: "/debit-notes",
            34: "/credit-notes",
            41: "/purchases",
            43: "/minor-expenses",
            44: "/special-regimes",
            45: "/gubernamentals",
            46: "/export-supports",
            47: "/payment-abroad-supports",
        }

        endpoint = endpoint_map.get(ecf_type)
        if not endpoint:
            raise ValueError(f"Tipo de e-CF no soportado para consulta: {ecf_type}")

        url = f"{self.api_url}{endpoint}/{doc_id}"
        params = {"pdfType": pdf_type}
        start_time = time.perf_counter()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self._get_headers(), params=params, timeout=30.0)
                response.raise_for_status()
                res = response.json()
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("check_document_status", True, latency, ecf_type=str(ecf_type))
                return res
            except httpx.HTTPStatusError as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                err_text = e.response.text
                self._record_telemetry("check_document_status", False, latency, ecf_type=str(ecf_type), error_message=err_text)
                logger.error(f"Alanube error checking e-CF {ecf_type} status: {err_text}")
                raise Exception(f"Alanube API Error: {err_text}")
            except Exception as e:
                latency = int((time.perf_counter() - start_time) * 1000)
                self._record_telemetry("check_document_status", False, latency, ecf_type=str(ecf_type), error_message=str(e))
                logger.error(f"Unexpected error checking status: {e}")
                raise e
