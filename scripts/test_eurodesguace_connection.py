#!/usr/bin/env python3
"""
Diagnostic test script for Eurodesguace Málaga API connection.
Validates live HTTP connectivity to /health and /parts?limit=5.
CRITICAL: Never logs or prints authorization tokens, API keys, or secrets.
"""

import os
import json
import ssl
import urllib.request
import urllib.error

def load_env():
    env = {}
    paths = ['supabase/functions/.env', '.env.local', '.env']
    for p in paths:
        if os.path.isfile(p):
            with open(p, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        if k.strip() not in env:
                            env[k.strip()] = v.strip().strip('\"').strip('\'')
    return env

def main():
    print("=================================================================")
    print(" Eurodesguace Málaga - Verificación de Conexión en Vivo")
    print("=================================================================")

    env = load_env()
    base_url = env.get('EURODESGUACE_BASE_URL', 'https://eurodesguacemalaga.com/api/v1')
    api_key = env.get('EURODESGUACE_API_KEY')

    if not api_key:
        print("[ERROR] No se encontró EURODESGUACE_API_KEY en supabase/functions/.env ni en .env.local")
        return 1

    print(f"Base URL configurada: {base_url}")
    print("Autenticación: Bearer [TOKEN PRESENTE Y CUSTODIADO]")

    ctx = ssl.create_default_context()

    # 1. Test /health
    print("\n--- 1. Comprobación de Diagnóstico (/health) ---")
    health_url = f"{base_url}/health"
    req_health = urllib.request.Request(health_url, headers={
        'Authorization': f"Bearer {api_key}",
        'Accept': 'application/json',
        'User-Agent': 'MobileMarketplace-BackendValidator/1.0',
    })

    try:
        with urllib.request.urlopen(req_health, context=ctx, timeout=10) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            print(f"Resultado HTTP: {resp.status} OK")
            print(f"Estado devuelto por el servicio: {body.get('data', {}).get('status')}")
            print(f"Sitio: {body.get('data', {}).get('site')}")
            print(f"Entorno: {body.get('data', {}).get('environment')}")
            key_info = body.get('data', {}).get('key', {})
            print(f"Nombre de la clave: {key_info.get('name')}")
            print(f"Ámbitos autorizados: {key_info.get('scopes')}")
            print(f"Hora del servidor: {body.get('data', {}).get('time')}")
    except urllib.error.HTTPError as e:
        print(f"[ERROR HTTP] {e.code} {e.reason}")
        return 1
    except Exception as e:
        print(f"[ERROR CONEXION] {str(e)}")
        return 1

    # 2. Test /parts?limit=5
    print("\n--- 2. Consulta de Muestra de Catálogo (/parts?limit=5) ---")
    parts_url = f"{base_url}/parts?limit=5"
    req_parts = urllib.request.Request(parts_url, headers={
        'Authorization': f"Bearer {api_key}",
        'Accept': 'application/json',
        'User-Agent': 'MobileMarketplace-BackendValidator/1.0',
    })

    try:
        with urllib.request.urlopen(req_parts, context=ctx, timeout=10) as resp:
            body = json.loads(resp.read().decode('utf-8'))
            meta = body.get('meta', {})
            data = body.get('data', [])

            print(f"Resultado HTTP: {resp.status} OK")
            print(f"Total de piezas en catálogo del CAT: {meta.get('total')}")
            print(f"Piezas recibidas en la muestra: {len(data)}")
            print(f"Cursor para página siguiente: {meta.get('next_cursor')}\n")

            print("Muestra Sanitizada de Recambios:")
            for i, p in enumerate(data, 1):
                imgs = p.get('imgs') or []
                print(f"  {i}. [ID: {p.get('refid')}] {p.get('articulo')}")
                print(f"     Vehículo: {p.get('marca')} {p.get('modelo')} (Año: {p.get('anopieza')})")
                print(f"     Precio original: {p.get('precio')} EUR | Fotos: {len(imgs)} | Ref. Visual: {p.get('refvisual')}")
                print(f"     Vehículo donante (código): {p.get('codvehiculo') or 'No asignado'}")
    except urllib.error.HTTPError as e:
        print(f"[ERROR HTTP] {e.code} {e.reason}")
        return 1
    except Exception as e:
        print(f"[ERROR CONEXION] {str(e)}")
        return 1

    print("\n=================================================================")
    print(" VERIFICACIÓN COMPLETADA SATISFACTORIAMENTE")
    print("=================================================================")
    return 0

if __name__ == '__main__':
    exit(main())
