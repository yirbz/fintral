import httpx
import logging
from app import config

logger = logging.getLogger(__name__)

async def get_bpd_usd_rate() -> float:
    """Fetch the daily USD/DOP exchange rate from Banco Popular's API.
    
    If the API is down or returns invalid data, falls back to the configured
    fallback rate (default: 59.0).
    """
    url = config.BANCO_POPULAR_API_URL
    client_id = config.BANCO_POPULAR_API_KEY
    client_secret = config.BANCO_POPULAR_SECRET_KEY
    fallback = config.BANCO_POPULAR_FALLBACK_RATE

    if not url or not client_id:
        logger.warning(
            "Banco Popular exchange rate API URL or Client ID is not set. "
            "Using fallback rate: %s", fallback
        )
        return fallback

    headers = {
        "X-IBM-Client-Id": client_id,
        "X-IBM-Client-Secret": client_secret,
        "Accept": "application/json",
    }

    try:
        logger.info("Fetching exchange rate from Banco Popular: %s", url)
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            logger.info("Banco Popular API response successfully retrieved: %s", data)

            # BPD response can be a list or dictionary
            if isinstance(data, list):
                for item in data:
                    currency = str(item.get("currency") or item.get("divisa") or item.get("moneda") or "").upper()
                    if currency == "USD":
                        rate = item.get("venta") or item.get("sellRate") or item.get("tasaVenta") or item.get("valor")
                        if rate:
                            return float(rate)
            elif isinstance(data, dict):
                tasas = data.get("tasas") or data.get("data")
                if isinstance(tasas, list):
                    for item in tasas:
                        currency = str(item.get("currency") or item.get("divisa") or item.get("moneda") or "").upper()
                        if currency == "USD":
                            rate = item.get("venta") or item.get("sellRate") or item.get("tasaVenta") or item.get("valor")
                            if rate:
                                return float(rate)
                
                # Check root-level keys
                rate = data.get("venta") or data.get("sellRate") or data.get("tasaVenta") or data.get("rate")
                if rate:
                    return float(rate)

            logger.warning(
                "USD exchange rate not found in BPD response payload. "
                "Using fallback rate: %s", fallback
            )
            return fallback

    except Exception as e:
        logger.error(
            "Failed to fetch exchange rate from Banco Popular API: %s. "
            "Using fallback rate: %s", e, fallback
        )
        return fallback
