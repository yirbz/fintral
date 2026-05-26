import logging
from typing import Any, Dict, Optional
import httpx
from app.config import ALANUBE_API_URL, ALANUBE_JWT

logger = logging.getLogger(__name__)


class AlanubeService:
    def __init__(self, api_url: str = ALANUBE_API_URL, jwt_token: str = ALANUBE_JWT):
        self.api_url = api_url.rstrip("/")
        self.jwt_token = jwt_token

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.jwt_token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    async def create_company(self, company_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dar de alta a una empresa en la API de Alanube
        POST /companies
        """
        url = f"{self.api_url}/companies"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=company_data, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Alanube error creating company: {e.response.text}")
                raise Exception(f"Alanube API Error: {e.response.text}")
            except Exception as e:
                logger.error(f"Unexpected error creating company: {e}")
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
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, headers=self._get_headers(), timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Alanube error emitting e-CF {ecf_type}: {e.response.text}")
                raise Exception(f"Alanube API Error: {e.response.text}")
            except Exception as e:
                logger.error(f"Unexpected error emitting e-CF {ecf_type}: {e}")
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
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=self._get_headers(), params=params, timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                logger.error(f"Alanube error checking e-CF {ecf_type} status: {e.response.text}")
                raise Exception(f"Alanube API Error: {e.response.text}")
            except Exception as e:
                logger.error(f"Unexpected error checking status: {e}")
                raise e
