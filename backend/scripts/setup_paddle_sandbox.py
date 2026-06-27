"""Script to automatically create Fintral products and prices in Paddle Sandbox.

Runs during development container startup if PADDLE_SEED_PLANS_KEY is defined in Doppler.
Updates the Doppler config automatically using the host's Doppler CLI.
"""
import os
import sys
import subprocess
import requests

# Ensure backend/ is in the import path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from paddle_billing import Client, Environment, Options
    from paddle_billing.Resources.Products.Operations import CreateProduct
    from paddle_billing.Resources.Prices.Operations import CreatePrice
    from paddle_billing.Resources.Prices.Operations.ListPrices import ListPrices
    from paddle_billing.Exceptions.ApiError import ApiError
except ImportError:
    print("❌ Error: 'paddle-python-sdk' is not installed in the current environment.")
    print("Please run this script inside the virtual environment: venv/bin/python scripts/setup_paddle_sandbox.py")
    sys.exit(1)


def get_doppler_value(key: str) -> str | None:
    """Get a secret value from Doppler directly using the CLI."""
    try:
        res = subprocess.run(
            ["doppler", "secrets", "get", key, "--plain"],
            capture_output=True,
            text=True,
            check=True
        )
        return res.stdout.strip()
    except Exception:
        return None


def run_seeding():
    # 1. Read seed key from environment or Doppler
    api_key = os.getenv("PADDLE_SEED_PLANS_KEY")
    if not api_key:
        api_key = get_doppler_value("PADDLE_SEED_PLANS_KEY")

    if not api_key:
        print("⏭️  PADDLE_SEED_PLANS_KEY is not defined. Skipping automatic Paddle plan seeding.")
        return

    print("⏳ PADDLE_SEED_PLANS_KEY found! Connecting to Paddle Sandbox...")
    client = Client(api_key, options=Options(Environment.SANDBOX))

    # Define the 3 plans
    plans = [
        {
            "key_name": "INICIAL",
            "name": "Fintral Inicial",
            "description": "Plan Inicial para profesionales independientes y freelancers.",
            "price_usd": "1649",  # $16.49 USD in minor units
        },
        {
            "key_name": "PROFESIONAL",
            "name": "Fintral Profesional",
            "description": "Plan Profesional para PyMEs con facturación electrónica y cumplimiento fiscal.",
            "price_usd": "4799",  # $47.99 USD in minor units
        },
        {
            "key_name": "DESPACHO",
            "name": "Fintral Despacho Contable",
            "description": "Plan Despacho para firmas de contabilidad y profesionales con gestión multi-empresa.",
            "price_usd": "12799",  # $127.99 USD in minor units
        }
    ]

    results = {}

    try:
        # Fetch existing products from Paddle Sandbox
        print("🔍 Fetching existing products in Paddle...")
        existing_products = list(client.products.list())
    except ApiError as e:
        print(f"❌ Failed to connect or list products in Paddle: {e}")
        sys.exit(1)

    for plan in plans:
        product_id = None
        price_id = None

        # Check if product already exists
        for prod in existing_products:
            if prod.name == plan["name"]:
                product_id = prod.id
                print(f"  • Product '{plan['name']}' already exists in Paddle: {product_id}")
                break

        # If product doesn't exist, create it
        if not product_id:
            try:
                print(f"  • Creating product: {plan['name']}...")
                product = client.products.create(
                    CreateProduct(
                        name=plan["name"],
                        tax_category="standard",
                        description=plan["description"]
                    )
                )
                product_id = product.id
                print(f"    ✅ Created product: {product_id}")
            except ApiError as e:
                print(f"❌ Failed to create product '{plan['name']}': {e}")
                sys.exit(1)

        # Check if price already exists for this product
        try:
            prices = list(client.prices.list(ListPrices(product_ids=[product_id])))
            for price in prices:
                # Check for active monthly USD price
                if (
                    price.billing_cycle
                    and price.billing_cycle.interval.value == "month"
                    and price.unit_price.currency_code.value == "USD"
                    and price.unit_price.amount == plan["price_usd"]
                ):
                    price_id = price.id
                    print(f"  • Monthly USD price already exists for '{plan['name']}': {price_id}")
                    break
        except ApiError:
            pass

        # If price doesn't exist, create it
        if not price_id:
            try:
                print(f"  • Creating monthly USD price for '{plan['name']}' ($ {float(plan['price_usd'])/100:.2f} USD/mo)...")
                price = client.prices.create(
                    CreatePrice(
                        description="Mensual USD",
                        product_id=product_id,
                        unit_price={
                            "amount": plan["price_usd"],
                            "currency_code": "USD"
                        },
                        billing_cycle={
                            "interval": "month",
                            "frequency": 1
                        }
                    )
                )
                price_id = price.id
                print(f"    ✅ Created price: {price_id}")
            except ApiError as e:
                print(f"❌ Failed to create price for product '{plan['name']}': {e}")
                sys.exit(1)

        results[f"PADDLE_PRODUCT_{plan['key_name']}"] = product_id
        results[f"PADDLE_PRICE_{plan['key_name']}_MONTHLY"] = price_id

    # Create/Find client token
    client_token = None
    try:
        print("🔍 Checking for active client-side tokens in Paddle Sandbox...")
        resp = requests.get(
            "https://sandbox-api.paddle.com/client-tokens",
            headers={"Authorization": f"Bearer {api_key}"}
        )
        tokens = resp.json().get("data", [])
        active_tokens = [t for t in tokens if t.get("status") == "active"]
        if active_tokens:
            client_token = active_tokens[0]["token"]
            print(f"  • Found active client token: {client_token[:15]}...")
        else:
            print("  • No active client token found. Creating one...")
            create_resp = requests.post(
                "https://sandbox-api.paddle.com/client-tokens",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"name": "Fintral Dev Token", "description": "Auto-seeded dev token"}
            )
            client_token = create_resp.json()["data"]["token"]
            print(f"    ✅ Created client token: {client_token[:15]}...")
    except Exception as e:
        print(f"⚠️ Warning: Failed to retrieve/create client token: {e}")

    # 6. Update Doppler secrets using Doppler CLI
    project = os.getenv("DOPPLER_PROJECT", "fintral")
    config = os.getenv("DOPPLER_CONFIG", "dev")

    print(f"\n📝 Injecting variables into Doppler (project: {project}, config: {config})...")
    cmd = [
        "doppler", "secrets", "set",
        f"PADDLE_API_KEY={api_key}",
        "PADDLE_ENVIRONMENT=sandbox",
        "NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox",
        f"PADDLE_PRODUCT_INICIAL={results['PADDLE_PRODUCT_INICIAL']}",
        f"PADDLE_PRICE_INICIAL_MONTHLY={results['PADDLE_PRICE_INICIAL_MONTHLY']}",
        f"PADDLE_PRODUCT_PROFESIONAL={results['PADDLE_PRODUCT_PROFESIONAL']}",
        f"PADDLE_PRICE_PROFESIONAL_MONTHLY={results['PADDLE_PRICE_PROFESIONAL_MONTHLY']}",
        f"PADDLE_PRODUCT_DESPACHO={results['PADDLE_PRODUCT_DESPACHO']}",
        f"PADDLE_PRICE_DESPACHO_MONTHLY={results['PADDLE_PRICE_DESPACHO_MONTHLY']}",
        "--project", project,
        "--config", config
    ]

    if client_token:
        cmd.extend([
            f"PADDLE_CLIENT_TOKEN={client_token}",
            f"NEXT_PUBLIC_PADDLE_CLIENT_TOKEN={client_token}"
        ])

    try:
        subprocess.run(cmd, check=True)
        print("✅ Secrets successfully injected into Doppler!")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to write secrets to Doppler: {e}")
        sys.exit(1)


if __name__ == "__main__":
    run_seeding()
