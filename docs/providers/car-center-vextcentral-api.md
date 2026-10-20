# Documentación de Integración: Car Center (VextCentral API)

- **Proveedor / Vendedor:** Car Center
- **Software de Gestión de Inventario:** VextCentral (Conmuta Soluciones Tecnológicas SL)
- **Fecha de Auditoría Inicial:** 2026-10-20
- **Estado de Integración:** Bloqueado a la espera de documentación técnica oficial de endpoints y datos legales del CAT

---

## 1. Estado de las Credenciales y Entorno

- **Variable de Entorno Identificada:** `API_KEY_CAR_CENTER_VEXTCENTRAL`
- **Ubicación Actual:** Archivo local `.env.local`
- **Presencia en Staging:** No configurada en los secretos de Supabase Staging (`lmsjgxhzfksyrlxyqndd`)
- **Nivel de Verificación:** Cadena alfanumérica presente en local. No ha sido validada contra ningún endpoint debido a la ausencia de especificación de URLs, cabeceras y métodos HTTP documentados.
- **Seguridad:** El valor de la credencial se mantiene confidencial, nunca se expone en logs, no se commitea a Git y jamás debe incluirse en variables públicas (`EXPO_PUBLIC_*`).

---

## 2. Capacidades Verificadas del Software VextCentral

De acuerdo con la investigación técnica de la plataforma VextCentral (Conmuta):

1. **Arquitectura de Canales API:** VextCentral opera mediante un "Generador de canales API ilimitados". Permite al centro CAT exportar stock y conectar plataformas de venta externas.
2. **Naturaleza de los Endpoints:**
   - Dispone de APIs de *inserción de stock* (del ERP hacia la plataforma).
   - Dispone de APIs de *recuperación e inserción de pedidos* (bidireccional entre canales y almacén).
   - Permite la configuración de reglas de precios por canal de venta.
3. **Privacidad de la Especificación Técnica:** Al tratarse de una solución SaaS profesional B2B, VextCentral no publica una especificación abierta ni un portal Swagger de libre acceso. Los endpoints exactos (URL base, método de autenticación, esquema de piezas y paginación) son generados por canal o facilitados bajo solicitud de soporte técnico.

---

## 3. Información Faltante Requerida para la Integración

Para implementar el adaptador `packages/core/src/adapters/vextcentral/`, garantizar la idempotencia y ejecutar la importación limitada de hasta 50 piezas reales, se requiere que el usuario o el desguace Car Center proporcione:

### 3.1. Contrato Técnico de la API
- **URL Base:** (ejemplo: `https://api.vextcentral.com/v1/...` o endpoint dedicado del canal generado).
- **Mecanismo de Autenticación y Cabecera:** Formato exacto de envío de `API_KEY_CAR_CENTER_VEXTCENTRAL` (ej. `x-api-key: <token>`, `Authorization: Bearer <token>`, o query param).
- **Endpoint de Consulta de Catálogo / Stock:** Ruta HTTP (ej. `GET /parts`, `GET /stock`, o webhook/feed de exportación).
- **Esquema de Datos de la Pieza:** Nombres de campo para:
  - Identificador único de pieza en el CAT (`externalPartId`).
  - Título / descripción comercial.
  - Precios (si vienen en céntimos o decimales, moneda y tratamiento de IVA).
  - Estado de disponibilidad (`AVAILABLE`, etc.).
  - Referencias (OEM vs referencia interna del desguace).
  - Datos del vehículo donante (marca, modelo, año, bastidor/código motor si aplica).
  - URLs de imágenes asociadas.
- **Paginación y Rate Limiting:** Parámetros de paginación (cursor, offset, limit) y límites de peticiones por minuto.

### 3.2. Datos Legales y Comerciales del Vendedor (Car Center)
- **Razón Social y CIF/NIF:** Para emitir facturas y trazabilidad legal.
- **Nombre Comercial Oficial:** Para mostrar en la ficha de recambios.
- **Código de Autorización CAT:** Número oficial de Centro Autorizado de Tratamiento asignado por la comunidad autónoma correspondiente. *(No se puede marcar `cat_verified = true` sin esta información).*
- **Ubicación:** Dirección física, municipio, provincia y código postal de 5 dígitos.
- **Dirección de Correo Comercial:** Buzón de ventas confirmado para recibir consultas comerciales.

---

## 4. Política de Protección del Catálogo Existente

- **Catálogo Eurodesguace Málaga:** Preservado íntegramente en **114 piezas reales** en Supabase Staging (`lmsjgxhzfksyrlxyqndd`).
- **Inmutabilidad:** No se realizarán escrituras automáticas, adivinación de endpoints ni inserción de catálogos sintéticos o ficticios mientras no se disponga del contrato oficial de la API de VextCentral.
