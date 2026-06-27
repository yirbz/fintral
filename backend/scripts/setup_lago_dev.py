"""Script to automatically seed Fintral plans and add-ons in the local Lago instance.

Runs during dev-up.sh orchestration once Lago API becomes healthy.
"""
import os
import sys
import time
import requests

LAGO_API_URL = os.getenv("LAGO_API_URL", "http://localhost:3100/api/v1")
LAGO_API_KEY = os.getenv("LAGO_API_KEY", "fintral-lago-key-dev")


def wait_for_lago(timeout_seconds: int = 45):
    """Wait for local Lago API to respond with 200 OK to health query."""
    health_url = LAGO_API_URL.replace("/api/v1", "/health")
    print(f"⏳ Waiting for Lago API to be healthy at: {health_url}...")
    start_time = time.time()
    
    while time.time() - start_time < timeout_seconds:
        try:
            resp = requests.get(health_url, timeout=2)
            if resp.status_code == 200:
                print("✅ Lago API is healthy and running!")
                return True
        except requests.RequestException:
            pass
        time.sleep(2)
        
    print("❌ Timeout: Lago API did not become healthy in time.")
    return False


def bootstrap_lago_db():
    """Run rails runner inside the Lago API container to create the organization, admin, and API Key."""
    print("⏳ Bootstrapping Lago database with default admin, organization, and API key...")
    ruby_cmd = (
        "org = Organization.find_or_create_by!(name: 'Fintral'); "
        "user = User.find_or_initialize_by(email: 'admin@fintral.com'); "
        "if user.new_record?; user.password = 'admin123'; user.save!; end; "
        "Membership.find_or_create_by!(user: user, organization: org); "
        "api_key = ApiKey.find_or_initialize_by(organization: org, value: 'fintral-lago-key-dev'); "
        "if api_key.new_record?; "
        "  api_key.name = 'Fintral Dev Key'; "
        "  api_key.permissions = ApiKey.new.permissions; "
        "  api_key.save!; "
        "end; "
        "ActiveRecord::Base.connection.execute(\"UPDATE api_keys SET value='fintral-lago-key-dev' WHERE name='Fintral Dev Key'\"); "
        "if BillingEntity.count == 0; "
        "  BillingEntity.create!(organization: org, name: 'Fintral Entity', code: 'fintral_default', default_currency: 'DOP', country: 'DO'); "
        "end; "
        "puts 'Bootstrap success!'"
    )
    
    try:
        import subprocess
        res = subprocess.run(
            ["docker", "exec", "-i", "fintral-lago-api-dev", "bundle", "exec", "rails", "runner", ruby_cmd],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"  • {res.stdout.strip()}")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to bootstrap Lago database: {e.stderr or e.stdout}")
        sys.exit(1)


def seed_lago():
    headers = {
        "Authorization": f"Bearer {LAGO_API_KEY}",
        "Content-Type": "application/json"
    }

    # 1. Define Fintral Subscription Plans
    plans = [
        {
            "code": "inicial",
            "name": "Plan Inicial",
            "interval": "monthly",
            "amount_cents": 100000,
            "amount_currency": "DOP",
            "pay_in_advance": True
        },
        {
            "code": "profesional",
            "name": "Plan Profesional",
            "interval": "monthly",
            "amount_cents": 280000,
            "amount_currency": "DOP",
            "pay_in_advance": True
        },
        {
            "code": "despacho",
            "name": "Plan Despacho",
            "interval": "monthly",
            "amount_cents": 600000,
            "amount_currency": "DOP",
            "pay_in_advance": True
        }
    ]

    # 2. Define Fintral Add-ons (Prepaid e-CF blocks)
    addons = [
        {
            "code": "ecf_block_100",
            "name": "Bloque 100 ECF",
            "amount_cents": 50000,
            "amount_currency": "DOP"
        },
        {
            "code": "ecf_block_500",
            "name": "Bloque 500 ECF",
            "amount_cents": 200000,
            "amount_currency": "DOP"
        },
        {
            "code": "ecf_block_1000",
            "name": "Bloque 1000 ECF",
            "amount_cents": 350000,
            "amount_currency": "DOP"
        }
    ]

    # Fetch existing plans
    try:
        print("🔍 Checking existing plans in Lago...")
        plans_resp = requests.get(f"{LAGO_API_URL}/plans?per_page=100", headers=headers)
        plans_resp.raise_for_status()
        existing_plan_codes = {p["code"] for p in plans_resp.json().get("plans", [])}
    except Exception as e:
        print(f"❌ Failed to fetch plans from Lago: {e}")
        sys.exit(1)

    # Seed missing plans
    for p in plans:
        if p["code"] in existing_plan_codes:
            print(f"  • Plan '{p['name']}' already exists in Lago.")
        else:
            print(f"  • Creating plan: {p['name']}...")
            try:
                resp = requests.post(f"{LAGO_API_URL}/plans", json={"plan": p}, headers=headers)
                resp.raise_for_status()
                print(f"    ✓ Plan '{p['name']}' created successfully.")
            except requests.RequestException as e:
                body_err = e.response.text if e.response else "No body"
                print(f"    ✗ Failed to create plan '{p['name']}': {e} -> {body_err}")
            except Exception as e:
                print(f"    ✗ Failed to create plan '{p['name']}': {e}")

    # Fetch existing add-ons
    try:
        print("🔍 Checking existing add-ons in Lago...")
        addons_resp = requests.get(f"{LAGO_API_URL}/add_ons?per_page=100", headers=headers)
        addons_resp.raise_for_status()
        existing_addon_codes = {a["code"] for a in addons_resp.json().get("add_ons", [])}
    except Exception as e:
        print(f"❌ Failed to fetch add-ons from Lago: {e}")
        sys.exit(1)

    # Seed missing add-ons
    for a in addons:
        if a["code"] in existing_addon_codes:
            print(f"  • Add-on '{a['name']}' already exists in Lago.")
        else:
            print(f"  • Creating add-on: {a['name']}...")
            try:
                resp = requests.post(f"{LAGO_API_URL}/add_ons", json={"add_on": a}, headers=headers)
                resp.raise_for_status()
                print(f"    ✓ Add-on '{a['name']}' created successfully.")
            except Exception as e:
                print(f"    ✗ Failed to create add-on '{a['name']}': {e}")

    print("🎉 Lago setup completed!")


if __name__ == "__main__":
    if wait_for_lago():
        bootstrap_lago_db()
        seed_lago()
    else:
        sys.exit(1)
