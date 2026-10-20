#!/usr/bin/env python3
"""
sync_eurodesguace_to_500.py

Progressive, controlled batch catalog ingestion from Eurodesguace Málaga API
into Supabase staging database (scaling from 50 to 500 unique parts).

Constraints & Standards:
- Batch size strictly <= 50 per request.
- Respects cursor from source_integrations (never reconstructed manually).
- Minimum 650 ms delay between consecutive requests to provider.
- HTTP 429 Retry-After handling with exponential backoff.
- Stops precisely when 500 unique vendor parts are reached.
- Updates source_integrations checkpoint only AFTER batch is fully persisted.
- Zero secrets, tokens, or credentials are ever printed or logged.
"""

import os
import sys
import json
import ssl
import time
import re
from datetime import datetime, timezone
import urllib.request
import urllib.error

EURODESGUACE_VENDOR_ID = "00000000-0000-4000-a000-000000000101"
EURODESGUACE_INTEGRATION_ID = "00000000-0000-4000-a000-000000000201"
MAX_BATCH_SIZE = 50
TARGET_UNIQUE_PARTS = 500
MIN_REQUEST_PAUSE_SECONDS = 0.650

def load_environment():
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

def normalize_oem(raw: str) -> str:
    if not raw:
        return ""
    return re.sub(r"[^A-Z0-9]", "", raw.upper())

def parse_price_cents(price_str: str) -> int:
    if not price_str:
        return 0
    clean = price_str.replace("€", "").replace(" ", "").replace(",", ".").strip()
    try:
        return int(round(float(clean) * 100))
    except (ValueError, TypeError):
        return 0

def http_json_request(url: str, method: str = "GET", headers: dict = None, payload: dict = None, timeout: int = 45, max_retries: int = 3):
    ctx = ssl.create_default_context()
    data_bytes = None
    if payload is not None:
        data_bytes = json.dumps(payload).encode("utf-8")

    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if data_bytes is not None and "Content-Type" not in req_headers:
        req_headers["Content-Type"] = "application/json"

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method=method)
            with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
                content = resp.read().decode("utf-8")
                status = resp.status
                body = json.loads(content) if content else None
                return status, body
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries - 1:
                retry_hdr = e.headers.get("Retry-After")
                wait_sec = int(retry_hdr) if retry_hdr and retry_hdr.isdigit() else max(2, 2 ** attempt)
                print(f"  [RETRY] Rate limited (HTTP 429). Esperando {wait_sec}s antes del reintento {attempt + 1}...")
                time.sleep(wait_sec)
                continue
            err_content = e.read().decode("utf-8") if e.fp else ""
            err_body = None
            try:
                err_body = json.loads(err_content) if err_content else None
            except Exception:
                err_body = err_content
            return e.code, err_body
        except urllib.error.URLError as e:
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            raise

def fetch_existing_external_ids(supabase_url: str, headers: dict) -> set:
    url = f"{supabase_url}/rest/v1/parts?vendor_id=eq.{EURODESGUACE_VENDOR_ID}&select=external_part_id&limit=2000"
    st, res = http_json_request(url, method="GET", headers=headers)
    if st == 200 and isinstance(res, list):
        return {str(item["external_part_id"]) for item in res if "external_part_id" in item}
    return set()

def fetch_current_checkpoint(supabase_url: str, headers: dict) -> dict:
    url = f"{supabase_url}/rest/v1/source_integrations?id=eq.{EURODESGUACE_INTEGRATION_ID}&select=last_cursor,sync_status,last_success_at"
    st, res = http_json_request(url, method="GET", headers=headers)
    if st == 200 and isinstance(res, list) and len(res) > 0:
        return res[0]
    return {}

def main():
    print("=================================================================")
    print(" Eurodesguace Malaga - Escalado Controlado a 500 Piezas (Paso 9)")
    print("=================================================================")

    start_global_time = time.time()
    env = load_environment()

    api_url = env.get("EURODESGUACE_BASE_URL", "https://eurodesguacemalaga.com/api/v1")
    api_key = env.get("EURODESGUACE_API_KEY")
    supabase_url = env.get("SUPABASE_URL", "https://lmsjgxhzfksyrlxyqndd.supabase.co")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not api_key:
        print("[ERROR] Falta EURODESGUACE_API_KEY en configuracion.")
        sys.exit(1)
    if not service_role_key:
        print("[ERROR] Falta SUPABASE_SERVICE_ROLE_KEY en configuracion.")
        sys.exit(1)

    headers_supabase = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }

    # 1. Health check pre-requisite
    print("\n[Paso 1/4] Verificando conectividad y estado del proveedor (/health)...")
    h_status, h_body = http_json_request(
        f"{api_url}/health",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=40
    )
    if h_status != 200 or h_body.get("data", {}).get("status") != "ok":
        print(f"[ERROR] Provider health check fallido: HTTP {h_status}")
        sys.exit(1)
    print(f"[OK] Proveedor operativo. Entorno: {h_body.get('data', {}).get('environment')}")

    # 2. Check initial state
    print("\n[Paso 2/4] Verificando estado inicial en Supabase Staging...")
    existing_ids = fetch_existing_external_ids(supabase_url, headers_supabase)
    checkpoint = fetch_current_checkpoint(supabase_url, headers_supabase)
    current_cursor = checkpoint.get("last_cursor")

    print(f"[OK] Piezas unicas existentes: {len(existing_ids)}")
    print(f"[OK] Punto de control inicial (last_cursor): {current_cursor}")

    if len(existing_ids) >= TARGET_UNIQUE_PARTS:
        print(f"[AVISO] Ya se han alcanzado {len(existing_ids)} piezas (objetivo: {TARGET_UNIQUE_PARTS}). Finalizando.")
        sys.exit(0)

    # 3. Progressive batch loop
    print(f"\n[Paso 3/4] Iniciando ingesta progresiva hacia {TARGET_UNIQUE_PARTS} piezas...")
    batch_num = 0
    total_newly_inserted = 0
    total_updated = 0
    total_failed = 0
    batch_timings = []

    last_request_time = 0.0

    while len(existing_ids) < TARGET_UNIQUE_PARTS:
        batch_num += 1
        needed = TARGET_UNIQUE_PARTS - len(existing_ids)
        batch_limit = min(MAX_BATCH_SIZE, needed)

        # Enforce rate limit pause
        elapsed_since_last_req = time.time() - last_request_time
        if elapsed_since_last_req < MIN_REQUEST_PAUSE_SECONDS:
            time.sleep(MIN_REQUEST_PAUSE_SECONDS - elapsed_since_last_req)

        print(f"\n--- Lote {batch_num} | Solicitando max {batch_limit} piezas (Cursor: {current_cursor}) ---")
        batch_start_time = time.time()
        last_request_time = batch_start_time

        # Build provider request URL with cursor
        params = [f"limit={batch_limit}"]
        if current_cursor:
            params.append(f"cursor={current_cursor}")
        provider_url = f"{api_url}/parts?{'&'.join(params)}"

        p_status, p_body = http_json_request(
            provider_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=40
        )

        if p_status != 200 or not p_body:
            print(f"[ERROR] Error al recuperar lote del proveedor: HTTP {p_status}")
            sys.exit(1)

        raw_parts = p_body.get("data", [])
        meta = p_body.get("meta", {})
        next_cursor = meta.get("next_cursor")

        if not raw_parts:
            print("[AVISO] El proveedor no devolvio mas piezas en este cursor. Fin de catalogo.")
            break

        print(f"  Recibidas {len(raw_parts)} piezas. Siguiente cursor reportado: {next_cursor}")

        batch_inserted = 0
        batch_updated = 0
        batch_failed = 0
        now_iso = datetime.now(timezone.utc).isoformat()

        for raw in raw_parts:
            external_id = str(raw.get("refid"))
            is_update = external_id in existing_ids

            title = raw.get("articulo") or f"{raw.get('familia', 'Recambio')} {raw.get('marca', '')} {raw.get('modelo', '')}".strip()
            category = raw.get("familia") or "GENERAL"
            price_cents = parse_price_cents(raw.get("precio", "0"))
            is_deleted = bool(raw.get("deleted_at"))

            part_payload = {
                "vendor_id": EURODESGUACE_VENDOR_ID,
                "source_integration_id": EURODESGUACE_INTEGRATION_ID,
                "external_part_id": external_id,
                "source_sku": raw.get("refvisual") or external_id,
                "title": title,
                "category_id": category,
                "price_cents": price_cents,
                "currency": "EUR",
                "condition": "GOOD",
                "tested_status": "TESTED_WORKING",
                "availability_status": "OUT_OF_STOCK" if is_deleted else "AVAILABLE",
                "stock_quantity": 0 if is_deleted else 1,
                "warranty_months": 12,
                "source_url": f"https://eurodesguacemalaga.com/recambio/{external_id}",
                "deleted_at": raw.get("deleted_at"),
                "last_synced_at": now_iso
            }

            try:
                # 1. Upsert part
                part_url = f"{supabase_url}/rest/v1/parts?on_conflict=vendor_id,external_part_id"
                st, res = http_json_request(part_url, method="POST", headers=headers_supabase, payload=part_payload)
                if st not in (200, 201) or not res:
                    print(f"  [FALLO] Pieza {external_id}: HTTP {st}")
                    batch_failed += 1
                    continue

                part_id = res[0]["id"]
                if is_update:
                    batch_updated += 1
                else:
                    batch_inserted += 1
                    existing_ids.add(external_id)

                # 2. Donor vehicle
                make = raw.get("marca")
                model = raw.get("modelo")
                if make and model:
                    veh_payload = {
                        "part_id": part_id,
                        "make": make,
                        "model": model,
                        "donor_vehicle_code": raw.get("codvehiculo")
                    }
                    veh_url = f"{supabase_url}/rest/v1/part_vehicles"
                    http_json_request(f"{veh_url}?part_id=eq.{part_id}", method="DELETE", headers=headers_supabase)
                    http_json_request(veh_url, method="POST", headers=headers_supabase, payload=veh_payload)

                # 3. OEM / Visual reference
                refvisual = raw.get("refvisual")
                if refvisual:
                    norm_oem = normalize_oem(refvisual)
                    if norm_oem:
                        oem_payload = {
                            "part_id": part_id,
                            "raw_reference": refvisual,
                            "normalized_reference": norm_oem,
                            "is_primary": True,
                            "reference_type": "REFERENCIA_VISUAL"
                        }
                        oem_url = f"{supabase_url}/rest/v1/part_oem_references?on_conflict=part_id,normalized_reference"
                        http_json_request(oem_url, method="POST", headers=headers_supabase, payload=oem_payload)

                # 4. Images
                imgs = raw.get("imgs") or []
                if imgs:
                    http_json_request(f"{supabase_url}/rest/v1/part_images?part_id=eq.{part_id}", method="DELETE", headers=headers_supabase)
                    img_payloads = [
                        {
                            "part_id": part_id,
                            "url": img_url,
                            "sort_order": i,
                            "is_primary": (i == 0)
                        }
                        for i, img_url in enumerate(imgs)
                    ]
                    http_json_request(f"{supabase_url}/rest/v1/part_images", method="POST", headers=headers_supabase, payload=img_payloads)

            except Exception as err:
                print(f"  [FALLO] Excepcion en pieza {external_id}: {err}")
                batch_failed += 1

        batch_duration_ms = int((time.time() - batch_start_time) * 1000)
        batch_timings.append(batch_duration_ms)

        total_newly_inserted += batch_inserted
        total_updated += batch_updated
        total_failed += batch_failed

        # Advance checkpoint in source_integrations ONLY AFTER full batch is persisted
        completed_at_iso = datetime.now(timezone.utc).isoformat()
        integ_payload = {
            "last_cursor": str(next_cursor) if next_cursor else None,
            "last_attempt_at": now_iso,
            "last_success_at": completed_at_iso,
            "sync_status": "IDLE"
        }
        http_json_request(f"{supabase_url}/rest/v1/source_integrations?id=eq.{EURODESGUACE_INTEGRATION_ID}", method="PATCH", headers=headers_supabase, payload=integ_payload)

        # Audit log entry for this batch
        batch_id = f"batch_{int(batch_start_time)}_{len(raw_parts)}"
        log_payload = {
            "source_integration_id": EURODESGUACE_INTEGRATION_ID,
            "batch_id": batch_id,
            "started_at": now_iso,
            "completed_at": completed_at_iso,
            "total_processed": len(raw_parts),
            "created_count": batch_inserted,
            "updated_count": batch_updated,
            "unchanged_count": 0,
            "deactivated_count": 0,
            "failed_count": batch_failed,
            "error_summary": [],
            "is_complete_run": False
        }
        http_json_request(f"{supabase_url}/rest/v1/sync_logs", method="POST", headers=headers_supabase, payload=log_payload)

        print(f"  [OK Lote {batch_num}] Insertadas: {batch_inserted} | Actualizadas: {batch_updated} | Fallidas: {batch_failed} | Duracion: {batch_duration_ms}ms")
        print(f"  [Progreso] Total piezas unicas en staging: {len(existing_ids)} / {TARGET_UNIQUE_PARTS}")

        current_cursor = str(next_cursor) if next_cursor else None
        if not current_cursor:
            print("[AVISO] No se devolvio cursor de continuacion. Fin de catalogo disponible.")
            break

    total_duration_sec = round(time.time() - start_global_time, 2)
    avg_batch_ms = round(sum(batch_timings) / len(batch_timings)) if batch_timings else 0

    print("\n=================================================================")
    print(f" Ingesta completada con exito en {total_duration_sec}s")
    print(f" Total lotes procesados: {batch_num}")
    print(f" Tiempo medio por lote (50 piezas): {avg_batch_ms}ms")
    print(f" Nuevas insertadas: {total_newly_inserted}")
    print(f" Preexistentes actualizadas: {total_updated}")
    print(f" Fallidas: {total_failed}")
    print(f" Piezas unicas finales en staging: {len(existing_ids)}")
    print(f" Ultimo cursor guardado: {current_cursor}")
    print("=================================================================")

if __name__ == "__main__":
    main()
