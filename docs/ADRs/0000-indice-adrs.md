# Catalogo Maestro de Registros de Decisiones de Arquitectura (ADRs)

Este documento centraliza, indexa y versiona la totalidad de los Registros de Decisiones de Arquitectura (Architecture Decision Records) adoptados en la plataforma del Marketplace de Recambios Usados (BuscaPiezas 24H).

---

## 1. Normas de Mantenimiento e Inmutabilidad

1. **Inmutabilidad:** Los ADRs en estado `Aceptado` constituyen la referencia arquitectónica vinculante y no se modifican retroactivamente salvo para actualizar vínculos a documentos sucesores.
2. **Sustitucion:** Si una decisión técnica previa es reemplazada, se redacta un nuevo ADR y el estado del anterior se actualiza a `Superado por ADR-XXXX`.
3. **Restriccion Estricta de Emojis:** Queda terminantemente prohibido el uso de emoticonos o emojis en el texto, títulos, tablas o diagramas de cualquier ADR.
4. **Enlaces Clicables:** Todas las referencias a archivos y componentes deben expresarse en formato de enlace Markdown absoluto o relativo normalizado.

---

## 2. Registro Cronológico de Decisiones

| Identificador | Titulo de la Decision | Estado | Fecha de Aprobacion | Componente Afectado |
|---|---|---|---|---|
| [ADR-0001](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/001-provider-adapter-architecture.md) | Desacoplamiento de APIs de Desguaces mediante Arquitectura de Adaptadores Independientes | Aceptado | 2026-10-19 | [packages/core](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core) / Adaptadores de Proveedor |
| [ADR-0002](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md) | Separación entre Entidad de Inventario (Part) y Proyección Agregada de Catálogo (ProductIdentity) | Aceptado | 2026-10-19 | [packages/core](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core) / Dominio y Búsqueda |
| [ADR-0003](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/003-real-scrapyard-api-ingestion-and-catalog-lifecycle.md) | Arquitectura de Ingesta Segura de APIs de Desguaces, Ciclo de Vida del Catálogo y Gestión de Disponibilidad | Aceptado | 2026-10-19 | Ingesta Backend / [supabase](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase) / Ciclo de Vida |
| [ADR-0004](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md) | Lectura Segura de Catálogo Persistido, Separación de Entornos y Desacoplamiento de Mocks | Aceptado | 2026-10-19 | [apps/mobile](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile) / [supabase](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase) / PostgREST RLS |
| [ADR-0005](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/005-serverless-sync-engine-and-quota-clamping.md) | Motor de Sincronización Serverless, Restricción de Cuota por Lote (Clamp 50) e Idempotencia UPSERT | Aceptado | 2026-10-20 | [sync-engine.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/packages/core/src/sync/sync-engine.ts) / [sync-batch](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/sync-batch) |
| [ADR-0006](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/006-secure-image-proxy-ssrf-hardening-and-ssl-bypass.md) | Proxy de Imágenes Seguro (Image Proxy Edge Function) con Blindaje Anti-SSRF y Bypass de Errores SSL de Desguaces | Aceptado | 2026-10-20 | [image-proxy](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/image-proxy) / [PartCard.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/PartCard.tsx) |
| [ADR-0007](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/007-commercial-inquiry-workflow-and-transactional-notifications.md) | Flujo Comercial de Consultas Asíncronas (Inquiries) con Notificaciones Transaccionales y Fallback Silencioso | Aceptado | 2026-10-21 | [submit-inquiry](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/submit-inquiry) / [InquiryModal.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/InquiryModal.tsx) |
| [ADR-0008](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/008-transactional-checkout-v2-stripe-connect-direct-charges.md) | Checkout Transaccional Marketplace con Stripe Connect Direct Charges, Retención de Comisión y Bloqueo de Modo Live | Aceptado | 2026-10-21 | [create-payment-intent](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/create-payment-intent) / [stripe-webhook](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/supabase/functions/stripe-webhook) / [checkout.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/checkout.tsx) |
| [ADR-0009](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/009-buscapiezas-mvp-mobile-experience-and-circular-economy.md) | Arquitectura de Experiencia Móvil BuscaPiezas 24H, Economía Circular y Verificación Legal CAT (RD 265/2021) | Aceptado | 2026-10-21 | [apps/mobile/services](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services) / [VisualCategoryGrid.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/VisualCategoryGrid.tsx) |
| [ADR-0010](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/010-cross-platform-expo-go-stripe-shims-and-headless-testing.md) | Compatibilidad Multiplataforma Expo Go, Shims Condicionales de Stripe y Testing Headless en Node.js | Aceptado | 2026-10-21 | [apps/mobile](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile) / [vitest.config.mjs](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/vitest.config.mjs) / Metro Config |

---

## 3. Clasificación Temática de Decisiones

### A. Integraciones de Proveedores y Ciclo de Vida del Inventario
- [ADR-0001: Arquitectura de Adaptadores Independientes](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/001-provider-adapter-architecture.md)
- [ADR-0003: Ingesta Segura de APIs y Ciclo de Vida del Catálogo](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/003-real-scrapyard-api-ingestion-and-catalog-lifecycle.md)
- [ADR-0005: Motor Serverless, Restricción Clamp 50 e Idempotencia UPSERT](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/005-serverless-sync-engine-and-quota-clamping.md)

### B. Modelo de Dominio y Persistencia
- [ADR-0002: Separación entre Part (Inventario) y ProductIdentity (Proyección)](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md)
- [ADR-0004: Lectura Segura de Catálogo Persistido via PostgREST RLS](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md)

### C. Seguridad, Red y Protección de Infraestructura
- [ADR-0006: Proxy de Imágenes Seguro con Blindaje Anti-SSRF y Bypass SSL](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/006-secure-image-proxy-ssrf-hardening-and-ssl-bypass.md)
- [ADR-0007: Consultas Comerciales Asíncronas con Honeypot y Fallback Resiliente](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/007-commercial-inquiry-workflow-and-transactional-notifications.md)

### D. Monetización, Pagos y Cumplimiento Normativo
- [ADR-0008: Checkout Transaccional Marketplace con Stripe Connect Direct Charges y Bloqueo Live](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/008-transactional-checkout-v2-stripe-connect-direct-charges.md)
- [ADR-0009: Experiencia Móvil BuscaPiezas 24H, Economía Circular ADEME/MITECO y Verificación CAT RD 265/2021](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/009-buscapiezas-mvp-mobile-experience-and-circular-economy.md)

### E. Ingeniería de Plataforma Móvil y Automatización de Pruebas
- [ADR-0010: Compatibilidad Multiplataforma Expo Go, Shims de Stripe y Testing Headless](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/010-cross-platform-expo-go-stripe-shims-and-headless-testing.md)
