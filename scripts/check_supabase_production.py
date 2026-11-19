#!/usr/bin/env python3
"""
check_supabase_production.py

Verifies production/staging Supabase backend readiness without exposing secrets:
1. Checks required environment variables.
2. Verifies eurodesguace-sync health endpoint.
3. Verifies public_catalog_parts PostgREST availability and part count.
"""

import json
import os
import sys
import urllib.error
import urllib.request


REQUIRED_VARS = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
]


def load_env_file(path: str) -> None:
    if not os.path.isfile(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def http_get(url: str, headers: dict[str, str], timeout: int = 10) -> tuple[int, dict[str, str], str]:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, dict(resp.headers), body
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        return err.code, dict(err.headers), body


def main() -> int:
    load_env_file(".env.local")

    missing = [var for var in REQUIRED_VARS if not os.environ.get(var)]
    if missing:
        print(f"[FAIL] Missing required environment variables: {', '.join(missing)}")
        return 1

    supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
    anon_key = os.environ["SUPABASE_ANON_KEY"]

    print(f"[INFO] Checking Supabase backend at {supabase_url}")

    # 1. Check the eurodesguace-sync function is deployed and answering.
    #    'ping' is the public heartbeat; 'health' calls the provider API and now
    #    requires SYNC_ADMIN_SECRET.
    health_url = f"{supabase_url}/functions/v1/eurodesguace-sync?action=ping"
    status, _, body = http_get(
        health_url,
        headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
    )
    if status != 200:
        print(f"[FAIL] eurodesguace-sync ping returned HTTP {status}: {body[:300]}")
        return 1
    print(f"[PASS] eurodesguace-sync ping returned HTTP 200: {body[:200]}")

    # 2. Check public_catalog_parts PostgREST endpoint
    catalog_url = f"{supabase_url}/rest/v1/public_catalog_parts?select=id&limit=1"
    status, headers, body = http_get(
        catalog_url,
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Prefer": "count=exact",
        },
    )
    if status not in (200, 206):
        print(f"[FAIL] public_catalog_parts query returned HTTP {status}: {body[:300]}")
        return 1

    content_range = headers.get("Content-Range") or headers.get("content-range") or "unknown"
    try:
        rows = json.loads(body)
        row_count = len(rows) if isinstance(rows, list) else 0
    except json.JSONDecodeError:
        row_count = -1

    print(f"[PASS] public_catalog_parts accessible (HTTP {status}, sample={row_count}, Content-Range={content_range})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
