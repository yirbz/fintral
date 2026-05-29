import asyncio
import httpx
from app.config import ALANUBE_API_URL, ALANUBE_JWT

async def main():
    print(f"API URL: {ALANUBE_API_URL}")
    base = ALANUBE_API_URL.rstrip("/")

    headers = {
        "Authorization": f"Bearer {ALANUBE_JWT}",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient() as client:
        # 1. Get main developer company
        resp = await client.get(f"{base}/company", headers=headers, timeout=30.0)
        resp.raise_for_status()
        main = resp.json()
        main_id = main.get("id")
        print(f"\nMain company: {main.get('name')} (ID={main_id}, type={main.get('type')})")

        # 2. Try the report endpoint with a single legalStatus value
        for status in ("REJECTED", "ACCEPTED", "ACCEPTED_WITH_OBSERVATIONS"):
            r = await client.get(
                f"{base}/reports/users/documents/total",
                headers=headers,
                params={"legalStatus": status},
                timeout=30.0,
            )
            if r.status_code == 200:
                data = r.json().get("data", {})
                companies = data.get("companies", {})
                if companies:
                    print(f"\nCompanies with legalStatus={status}:")
                    for cid, info in companies.items():
                        print(f"  - {cid}: {info}")

        # 3. Direct check: GET /company/{id} for the known associated company
        known_id = "01KSPF555417NY5WVFV967EZF0"
        r = await client.get(f"{base}/company/{known_id}", headers=headers, timeout=30.0)
        if r.status_code == 200:
            c = r.json()
            print(f"\nAssociated company found via direct GET:")
            print(f"  Name: {c.get('name')}")
            print(f"  Type: {c.get('type')}")
            print(f"  RNC: {c.get('identification')}")

        print(f"\n---")
        print(f"NOTE: Alanube API does NOT support DELETE for companies.")
        print(f"To remove associated companies, visit:")
        print(f"  https://sandbox.alanube.co/login")
        print(f"and manage them from the web panel.")

if __name__ == "__main__":
    asyncio.run(main())
