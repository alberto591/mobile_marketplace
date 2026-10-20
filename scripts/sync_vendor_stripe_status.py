#!/usr/bin/env python3
"""
sync_vendor_stripe_status.py

Safely synchronizes a seller's Stripe Connect account status from the Stripe API
into the Supabase Staging database (vendors table).

Rule compliance:
- Never sets readiness flags manually via arbitrary SQL.
- Fetches real account status from Stripe API using STRIPE_SECRET_KEY.
- Never invents an acct_... ID.
- Zero secrets or tokens are ever printed.
"""

import os
import sys
import json
import ssl
import re
import argparse
import urllib.request
import urllib.error
from datetime import datetime, timezone

DEFAULT_VENDOR_ID = "00000000-0000-4000-a000-000000000101" # Eurodesguace Malaga

def load_environment() -> dict:
    env = {}
    paths = [".env.local", "supabase/functions/.env", ".env"]
    for p in paths:
        if os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        if k.strip() not in env:
                            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def fetch_stripe_account(account_id: str, secret_key: str) -> dict:
    url = f"https://api.stripe.com/v1/accounts/{account_id}"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {secret_key}",
            "Accept": "application/json",
        },
        method="GET"
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(error_body)
            err_msg = err_json.get("error", {}).get("message", error_body)
        except Exception:
            err_msg = error_body
        raise RuntimeError(f"Stripe API error (HTTP {e.code}): {err_msg}")
    except Exception as e:
        raise RuntimeError(f"Stripe network error: {str(e)}")

def get_vendor_from_supabase(vendor_id: str, supabase_url: str, service_key: str) -> dict:
    url = f"{supabase_url}/rest/v1/vendors?id=eq.{vendor_id}&select=id,trade_name,legal_name,cat_authorization_code,status,stripe_account_id,stripe_charges_enabled,stripe_payouts_enabled,stripe_details_submitted,stripe_onboarding_status"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
        method="GET"
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
        rows = json.loads(response.read().decode("utf-8"))
        if not rows:
            raise RuntimeError(f"Vendor {vendor_id} not found in database.")
        return rows[0]

def update_vendor_in_supabase(vendor_id: str, update_payload: dict, supabase_url: str, service_key: str) -> None:
    url = f"{supabase_url}/rest/v1/vendors?id=eq.{vendor_id}"
    data_bytes = json.dumps(update_payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH"
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
        if response.status not in (200, 204):
            raise RuntimeError(f"Failed to update vendor in Supabase: HTTP {response.status}")

def main():
    parser = argparse.ArgumentParser(description="Synchronize Stripe Connect account status for a vendor.")
    parser.add_argument("--vendor-id", default=DEFAULT_VENDOR_ID, help="Vendor UUID (default: Eurodesguace Malaga)")
    parser.add_argument("--account-id", default=None, help="Stripe Connect account ID (e.g. acct_1...)")
    parser.add_argument("--dry-run", action="store_true", help="Inspect Stripe status without writing to DB")
    args = parser.parse_args()

    env = load_environment()
    supabase_url = env.get("SUPABASE_URL")
    supabase_service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    stripe_secret_key = env.get("STRIPE_SECRET_KEY")

    if not supabase_url or not supabase_service_key:
        print("[ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env.local")
        sys.exit(1)

    vendor = get_vendor_from_supabase(args.vendor_id, supabase_url, supabase_service_key)
    print(f"[INFO] Current vendor in DB: {vendor['trade_name']} ({vendor['id']})")
    print(f"       Current stripe_account_id: {vendor.get('stripe_account_id')}")
    print(f"       Current charges_enabled:   {vendor.get('stripe_charges_enabled')}")
    print(f"       Current payouts_enabled:   {vendor.get('stripe_payouts_enabled')}")
    print(f"       Current details_submitted: {vendor.get('stripe_details_submitted')}")
    print(f"       Current onboarding_status: {vendor.get('stripe_onboarding_status')}")

    target_account_id = args.account_id or vendor.get("stripe_account_id")

    if not target_account_id:
        print("\n[STOP] No Stripe connected account configured for this vendor.")
        print("To configure a real test connected account:")
        print("1. Log in to the Stripe Dashboard in Test Mode (https://dashboard.stripe.com/test/connect/accounts/overview).")
        print("2. Navigate to 'Connect' -> 'Accounts' -> '+ Create'.")
        print("3. Create an account with:")
        print("   - Type: Express or Custom")
        print("   - Country: Spain (ES)")
        print("   - Business type: Company (Empresa) or Individual")
        print("4. Complete test onboarding using Stripe test data so charges_enabled becomes true.")
        print("5. Note the generated account ID starting with 'acct_' (e.g. acct_1P...).")
        print("6. Run this synchronization script with your account ID:")
        print(f"   python scripts/sync_vendor_stripe_status.py --vendor-id {vendor['id']} --account-id acct_...\n")
        sys.exit(0)

    if not stripe_secret_key:
        print("\n[STOP] STRIPE_SECRET_KEY is not set in environment or .env.local.")
        print("Please configure STRIPE_SECRET_KEY (sk_test_...) to verify the account status with Stripe API.")
        sys.exit(1)

    if stripe_secret_key.startswith("sk_live_") or stripe_secret_key.startswith("rk_live_"):
        print("\n[ERROR] Live-mode key detected! Live payments are strictly prohibited.")
        sys.exit(1)

    print(f"\n[INFO] Contacting Stripe API to retrieve status for {target_account_id}...")
    account_data = fetch_stripe_account(target_account_id, stripe_secret_key)

    charges_enabled = bool(account_data.get("charges_enabled", False))
    payouts_enabled = bool(account_data.get("payouts_enabled", False))
    details_submitted = bool(account_data.get("details_submitted", False))

    if charges_enabled and details_submitted:
        onboarding_status = "COMPLETED"
    elif details_submitted:
        onboarding_status = "PENDING"
    else:
        onboarding_status = "RESTRICTED"

    print("[SUCCESS] Stripe account retrieved successfully:")
    print(f"          charges_enabled:   {charges_enabled}")
    print(f"          payouts_enabled:   {payouts_enabled}")
    print(f"          details_submitted: {details_submitted}")
    print(f"          onboarding_status: {onboarding_status}")

    requirements = account_data.get("requirements", {})
    currently_due = requirements.get("currently_due", [])
    if currently_due:
        print(f"          requirements currently_due: {currently_due}")

    if args.dry_run:
        print("\n[INFO] Dry run enabled. Database was not updated.")
        return

    update_payload = {
        "stripe_account_id": target_account_id,
        "stripe_charges_enabled": charges_enabled,
        "stripe_payouts_enabled": payouts_enabled,
        "stripe_details_submitted": details_submitted,
        "stripe_onboarding_status": onboarding_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    print(f"\n[INFO] Updating vendor {vendor['id']} in Supabase Staging...")
    update_vendor_in_supabase(vendor["id"], update_payload, supabase_url, supabase_service_key)
    print("[SUCCESS] Vendor Stripe readiness synchronized successfully with zero manual SQL tampering.")

if __name__ == "__main__":
    main()
