# Marketplace de Recambios de Desguace

Plataforma movil y agregador de catalogo de recambios usados procedentes de Centros Autorizados de Tratamiento de Vehiculos (CAT / desguaces profesionales) en Espana.

El objetivo del producto es proporcionar una experiencia de busqueda, verificacion de compatibilidad y compra de piezas usadas rapida, transparente y fiable, comparable a la facilidad de uso de plataformas como AUTODOC pero adaptada a las singularidades de piezas unicas y despieces.

---

## Estado del Proyecto

- **Fase actual:** Fase 1 — Inicializacion y Diseno de Arquitectura Base.
- **Estado tecnico:** Repositorio estructurado, politicas de seguridad en gitignore, arquitectura desacoplada de adaptadores documentada (ADR-001) y modelo canonico en preparacion.
- **Integraciones:** En espera de documentacion OpenAPI/Swagger y credenciales de las dos APIs de desguace iniciales.

---

## Vision del Producto y Fases

1. **Fase 1 — Catalogo y Busqueda Canónica (MVP):**
   - Agregacion e ingesta idempotente del inventario de dos desguaces independientes.
   - Normalizacion de categorias, referencias OEM y datos de vehiculo donante.
   - App movil navegable (Expo / React Native) con busqueda por texto, categoria, modelo y OEM.
   - Ficha tecnica detallada con fotos reales, ubicacion del CAT, estado y fecha de actualizacion.
   - Manejo de compatibilidad con niveles de confianza honestos (sin falsas promesas).

2. **Fase 2 — Validacion Comercial y Leads:**
   - Solicitudes estructuradas de disponibilidad para piezas sin stock en tiempo real.
   - Canal de contacto con el desguace y favoritos de usuario.
   - Herramientas minimas de administracion para monitoreo de sincronizaciones y tasa de error.

3. **Fase 3 — Transacciones y Checkout:**
   - Checkout con vendedor unico por pedido (sujeto a validacion de APIs de reserva).
   - Pasarela de pago tipo marketplace (Stripe Connect o equivalente) y conciliacion.
   - Seguimiento de expedicion, garantias legales y devoluciones.

---

## Stack Tecnologico Previsto

### Frontend Movil
- **Framework:** React Native con Expo (SDK moderno).
- **Lenguaje:** TypeScript estricto.
- **Enrutamiento:** Expo Router (basado en sistema de archivos).
- **Plataforma objetivo inicial:** iOS (manteniendo compatibilidad completa con Android).

### Backend y Persistencia
- **Base de datos:** PostgreSQL gestionado via Supabase.
- **Seguridad de datos:** Row Level Security (RLS) en todas las tablas.
- **Autenticacion:** Supabase Auth (opcional en exploracion, requerida en guardado/pedidos).
- **Ingesta e Integraciones:** Supabase Edge Functions / Backend Node.js modular con arquitectura hexagonal.

### Calidad y DevOps
- **Control de versiones:** Git con ramas protegidas y convenciones de commits semanticos.
- **Testing:** Jest / React Native Testing Library para componentes y pruebas unitarias de logica de dominio.
- **Gestion de secretos:** Variables de entorno desacopladas; politicas estrictas para impedir exposicion de tokens de proveedores en el cliente movil.

---

## Estructura del Repositorio

```text
mobile-marketplace/
├── .gitignore                      # Reglas de exclusion para Node, Expo, iOS, Android, Supabase
├── README.md                       # Vision general y guia rapida
├── ARCHITECTURE.md                 # Arquitectura de software, flujos y limites
├── docs/
│   ├── 2026-10-19_product-brief.md # Brief de producto exhaustivo e investigacion de mercado
│   └── ADRs/                       # Architecture Decision Records
│       └── 001-provider-adapter-architecture.md
├── packages/                       # Dominio y logica compartida (implementado)
│   └── core/                       # @mobile-marketplace/core (entidades, puertos, Zod, fixtures)
├── apps/                           # Clientes de presentacion (previsto)
│   └── mobile/
└── supabase/                       # Esquemas SQL, politicas RLS y funciones
    ├── migrations/                 # Migraciones SQL canonicas versionadas
    └── functions/
```

---

## Primeros Pasos

### Prerrequisitos
- Node.js (version 20 o superior; version verificada en entorno: v24.7.0).
- npm (version 10 o superior; version verificada en entorno: 11.5.1).
- Git (version 2.40 o superior).

### Ejecucion de Pruebas y Tipado del Monorepo
```bash
# Ejecutar todas las pruebas unitarias y de integracion (44 tests)
npm test

# Comprobar tipado estricto con TypeScript en todos los paquetes
npm run typecheck
```

### Iniciar la Aplicacion Movil con Expo
```bash
# Iniciar servidor de desarrollo Metro
cd apps/mobile && npx expo start
```

---

## Documentacion de Referencia

- [STATUS.md](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/STATUS.md): Estado actual del desarrollo, cobertura de tests y metricas.
- [ARCHITECTURE.md](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/ARCHITECTURE.md): Principios arquitectonicos, modelo canonico y flujo de integracion.
- [Product Brief](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/2026-10-19_product-brief.md): Investigacion de competidores, marco legal (RD 265/2021) y economia unitaria.
- [ADR 001](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/001-provider-adapter-architecture.md): Arquitectura de adaptadores independientes para desguaces.
- [ADR 002](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md): Separacion entre Entidad de Inventario (Part) y Proyeccion Agregada de Catalogo (ProductIdentity).
