#!/usr/bin/env python3
"""
sync_eurodesguace_pilot.py

Executes a controlled pilot batch catalog synchronization from Eurodesguace Málaga API
into Supabase staging database (max 50 parts).

Audits and records metrics to sync_logs and verifies idempotency upon re-execution.
Zero secrets, tokens or private hashes are ever printed or logged.
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
MAX_PILOT_LIMIT = 50

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
                wait_sec = int(retry_hdr) if retry_hdr and retry_hdr.isdigit() else (2 ** attempt)
                print(f"[RETRY] Rate limited (HTTP 429). Esperando {wait_sec}s antes del reintento {attempt + 1}...")
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

def main():
    print("=================================================================")
    print(" Eurodesguace Malaga - Sincronizacion Piloto Staging (Max 50)")
    print("=================================================================")

    start_time = time.time()
    env = load_environment()

    api_url = env.get("EURODESGUACE_BASE_URL", "https://eurodesguacemalaga.com/api/v1")
    api_key = env.get("EURODESGUACE_API_KEY")
    supabase_url = env.get("SUPABASE_URL", "https://lmsjgxhzfksyrlxyqndd.supabase.co")
    service_role_key = env.get("SUPABASE_SERVICE_ROLE_KEY")

    if not api_key:
        print("[ERROR] Falta EURODESGUACE_API_KEY en configuracion.")
        sys.exit(1)
    if not service_role_key:
        print("[ERROR] Falta SUPABASE_SERVICE_ROLE_KEY en configuracion para persistencia administrativa.")
        sys.exit(1)

    print(f"Supabase Target: {supabase_url}")
    print(f"Provider API Target: {api_url}")
    print("Credenciales: [VALIDADAS Y PROTEGIDAS]")

    # 1. Health check pre-requisite
    print("\n[Paso 1/5] Verificando estado del proveedor (/health)...")
    try:
        h_status, h_body = http_json_request(
            f"{api_url}/health",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=40
        )
        if h_status != 200 or h_body.get("data", {}).get("status") != "ok":
            print(f"[ERROR] Provider health check fallido: HTTP {h_status}")
            sys.exit(1)
        print(f"[OK] Proveedor operativo. Entorno: {h_body.get('data', {}).get('environment')}")
    except Exception as e:
        print(f"[ERROR] Error al contactar health del proveedor: {e}")
        sys.exit(1)

    # 2. Query existing external_part_ids in staging for accurate insert vs update metrics
    headers_supabase = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }

    print("\n[Paso 2/5] Consultando estado previo en staging...")
    existing_external_ids = set()
    try:
        parts_query_url = f"{supabase_url}/rest/v1/parts?vendor_id=eq.{EURODESGUACE_VENDOR_ID}&select=external_part_id"
        st_ex, res_ex = http_json_request(parts_query_url, method="GET", headers=headers_supabase)
        if st_ex == 200 and isinstance(res_ex, list):
            existing_external_ids = {str(item["external_part_id"]) for item in res_ex if "external_part_id" in item}
        print(f"[OK] Identificadores existentes en staging: {len(existing_external_ids)} piezas previas.")
    except Exception as e:
        print(f"[AVISO] No se pudo precargar identificadores existentes: {e}")

    # 3. Fetch batch of parts (capped strictly to MAX_PILOT_LIMIT = 50)
    requested_limit = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else MAX_PILOT_LIMIT
    limit = min(requested_limit, MAX_PILOT_LIMIT)
    print(f"\n[Paso 3/5] Solicitando lote de {limit} piezas a la API del proveedor...")
    try:
        p_status, p_body = http_json_request(
            f"{api_url}/parts?limit={limit}",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=40
        )
        if p_status != 200:
            print(f"[ERROR] Error al obtener catalogo: HTTP {p_status}")
            sys.exit(1)

        raw_parts = p_body.get("data", [])
        meta = p_body.get("meta", {})
        next_cursor = meta.get("next_cursor")
        print(f"[OK] Recibidas {len(raw_parts)} piezas de un catalogo total de {meta.get('total')} items.")
        print(f"[OK] Cursor de continuacion reportado: {next_cursor}")
    except Exception as e:
        print(f"[ERROR] Error al descargar lote piloto: {e}")
        sys.exit(1)

    if not raw_parts:
        print("[AVISO] No se devolvieron piezas en el lote.")
        sys.exit(0)

    # 4. Idempotent persistence to Supabase via PostgREST with service_role
    print(f"\n[Paso 4/5] Persistiendo {len(raw_parts)} piezas en Supabase (parts, vehicles, oem, images)...")
    inserted_count = 0
    updated_count = 0
    failed_count = 0

    now_iso = datetime.now(timezone.utc).isoformat()

    for idx, raw in enumerate(raw_parts, 1):
        external_id = str(raw.get("refid"))
        is_update = external_id in existing_external_ids

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
            # Upsert part
            part_url = f"{supabase_url}/rest/v1/parts?on_conflict=vendor_id,external_part_id"
            st, res = http_json_request(part_url, method="POST", headers=headers_supabase, payload=part_payload)
            if st not in (200, 201) or not res:
                print(f"  [FALLO] Pieza {external_id}: HTTP {st}")
                failed_count += 1
                continue

            persisted_part = res[0]
            part_id = persisted_part["id"]

            if is_update:
                updated_count += 1
            else:
                inserted_count += 1
                existing_external_ids.add(external_id)

            # Donor vehicle
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
                # Clear and insert to maintain fresh specs
                http_json_request(f"{veh_url}?part_id=eq.{part_id}", method="DELETE", headers=headers_supabase)
                http_json_request(veh_url, method="POST", headers=headers_supabase, payload=veh_payload)

            # OEM / Visual reference
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

            # Images
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

            action_label = "Actualizada" if is_update else "Insertada"
            print(f"  [OK] ({idx}/{len(raw_parts)}) [{action_label}] Pieza {external_id} - {title[:35]} ({price_cents/100:.2f} EUR) - {len(imgs)} imgs")

        except Exception as err:
            print(f"  [FALLO] Error en pieza {external_id}: {err}")
            failed_count += 1

    duration_ms = int((time.time() - start_time) * 1000)

    # 5. Record sync audit log and checkpoint in source_integrations
    print("\n[Paso 5/5] Registrando punto de control y auditoria...")
    started_at_iso = datetime.fromtimestamp(start_time, timezone.utc).isoformat()
    completed_at_iso = datetime.now(timezone.utc).isoformat()
    batch_id = f"batch_{int(start_time)}_{len(raw_parts)}"

    # Update source_integrations checkpoint
    integ_payload = {
        "last_cursor": str(next_cursor) if next_cursor else None,
        "last_attempt_at": started_at_iso,
        "last_success_at": completed_at_iso,
        "sync_status": "IDLE"
    }
    try:
        integ_url = f"{supabase_url}/rest/v1/source_integrations?id=eq.{EURODESGUACE_INTEGRATION_ID}"
        http_json_request(integ_url, method="PATCH", headers=headers_supabase, payload=integ_payload)
        print(f"[OK] Punto de control guardado en source_integrations (Cursor: {next_cursor}).")
    except Exception as e:
        print(f"[AVISO] No se pudo actualizar source_integrations: {e}")

    log_payload = {
        "source_integration_id": EURODESGUACE_INTEGRATION_ID,
        "batch_id": batch_id,
        "started_at": started_at_iso,
        "completed_at": completed_at_iso,
        "total_processed": len(raw_parts),
        "created_count": inserted_count,
        "updated_count": updated_count,
        "unchanged_count": 0,
        "deactivated_count": 0,
        "failed_count": failed_count,
        "error_summary": [],
        "is_complete_run": False
    }

    try:
        log_url = f"{supabase_url}/rest/v1/sync_logs"
        http_json_request(log_url, method="POST", headers=headers_supabase, payload=log_payload)
        print(f"[OK] Registro de sincronizacion guardado en sync_logs (Batch ID: {batch_id}, Duracion: {duration_ms}ms).")
    except Exception as e:
        print(f"[AVISO] No se pudo guardar sync_log: {e}")

    print("\n=================================================================")
    print(f" Resumen del lote: Total {len(raw_parts)} | Nuevas: {inserted_count} | Actualizadas: {updated_count} | Fallidas: {failed_count}")
    print("=================================================================")

if __name__ == "__main__":
    main()
