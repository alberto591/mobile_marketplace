# ADR 009: Arquitectura de Experiencia Movil BuscaPiezas 24H, Economia Circular y Verificacion Legal CAT (RD 265/2021)

- **Estado:** Aceptado
- **Fecha:** 2026-10-21
- **Decisores:** Chief Product Officer (CPO) / Mobile UX Architect / Sustainability & Compliance Lead
- **Componentes Afectados:**
  - [VisualCategoryGrid.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/VisualCategoryGrid.tsx) & [category-groups.config.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/category-groups.config.ts)
  - [whatsapp-contact.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/whatsapp-contact.service.ts)
  - [share-part.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/share-part.service.ts)
  - [favourites.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/favourites.service.ts) & [favourites-context.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/favourites-context.tsx) & [saved.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/saved.tsx)
  - [garage.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/garage.service.ts) & [garage-context.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/garage-context.tsx) & [GarageSelectorCard.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/GarageSelectorCard.tsx)
  - [savings-comparison.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/savings-comparison.service.ts) & [SavingsAndCircularCard.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/SavingsAndCircularCard.tsx)
  - [seller-trust.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/seller-trust.service.ts) & [CatTrustModal.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/CatTrustModal.tsx)
  - [PartCard.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/PartCard.tsx)
- **Documentos Relacionados:**
  - [ADR 002: Separación entre Entidad de Inventario (Part) y Proyección Agregada de Catálogo (ProductIdentity)](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/002-product-identity-vs-part-inventory.md)
  - [ADR 004: Lectura Segura de Catálogo Persistido, Separación de Entornos y Desacoplamiento de Mocks](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/004-backend-catalog-persistence-and-secure-client-access.md)
  - [ADR 008: Checkout Transaccional Marketplace con Stripe Connect Direct Charges, Retención de Comisión (Application Fee) y Bloqueo de Modo Live](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/docs/ADRs/008-transactional-checkout-v2-stripe-connect-direct-charges.md)

---

## 1. Contexto y Definicion del Problema

El comercio electrónico de recambios automotrices usados sufre históricamente de dos grandes barreras de adopción en España y Europa:
1. **Desconfianza del Comprador:** Percepción de informalidad en los desguaces, dudas sobre el origen y legalidad de la pieza, desconocimiento de la cobertura de garantía y temor a incompatibilidades mecánicas.
2. **Experiencia de Navegación Árida:** Formularios de búsqueda técnicos y complejos que asumen que el conductor conoce de antemano el código OEM de su recambio o la denominación exacta de la pieza.

Para transformar la plataforma en una experiencia móvil moderna y diferencial (**BuscaPiezas 24H**) era indispensable implementar siete capacidades funcionales avanzadas, garantizando al mismo tiempo el máximo rigor técnico, honestidad de datos (prohibición de afirmaciones de compatibilidad engañosas o falso *greenwashing*) y cumplimiento estricto del marco legal del automóvil (Real Decreto 265/2021 sobre vehículos al final de su vida útil y Real Decreto Legislativo 1/2007 sobre garantías en bienes de consumo).

---

## 2. Factores Decisivos (Decision Drivers)

1. **Rigor y Honestidad en Compatibilidad:** Diferenciación explícita e inequívoca entre una referencia OEM oficial verificada y una referencia visual local asignada por el operario del CAT.
2. **Metodología Abierta y Verificable de Economía Circular:** Cálculo del ahorro económico y reducción de huella de carbono sustentado en bases de datos abiertas y estudios oficiales (ADEME PIEC en Francia y MITECO en España), suprimiendo cualquier cálculo estimado si falta el PVP de referencia para evitar *greenwashing*.
3. **Desacoplamiento entre Navegación Taxonómica y Filtros de Vehículo:** Permitir explorar libremente familias de piezas (ej. Climatización) sin que la presencia de un vehículo en "Mi Garaje" bloquee o vacíe indebidamente los resultados de catálogo disponibles.
4. **Persistencia Local Segura y Reactiva:** Almacenamiento tolerante a fallos para Favoritos y Vehículo Activo sin imponer inicio de sesión obligatorio en el terminal móvil.
5. **Transparencia Regulatoria del CAT:** Visibilidad obligatoria del número de autorización ambiental del centro emisor (ej. `CAT/AND/MA/0412`), condiciones de garantía legal (mínimo 1 año) y derecho legal de desistimiento (14 días).

---

## 3. Opciones Consideradas

### Opción A: Mantener un Buscador Básico Orientado Únicamente a Texto y Filtros Rígidos
Limitar la aplicación a una caja de búsqueda por texto libre y una lista plana de resultados.
- **Ventajas:** Mínimo esfuerzo de desarrollo.
- **Desventajas:** Alta tasa de rebote; nula diferenciación competitiva frente a portales obsoletos; incapacidad para comunicar el ahorro económico y ambiental de la economía circular; pérdida de confianza del usuario.

### Opción B: Experiencia Automotriz Integral BuscaPiezas 24H (Seleccionada)
Implementar una suite arquitectónica cohesiva compuesta por:
1. Parrilla visual de familias taxonómicas con supresión dinámica de categorías sin stock.
2. Integración directa de canal WhatsApp normalizado E.164 con ficha veraz prellenada.
3. Compartir técnico con el mecánico o cliente vía API nativa.
4. Favoritos y "Mi Garaje" con reactividad en memoria y persistencia local AsyncStorage.
5. Algoritmo transparente de cálculo de ahorro y métricas de ciclo de vida automotriz (CO₂ y metales evitados).
6. Módulo formal de confianza y verificación legal del desguace (RD 265/2021).
- **Ventajas:** Experiencia fluida, moderna y diferenciada; máxima transparencia que disipa el recelo del comprador; rigor legal que protege a la plataforma y a los CATs colaboradores.
- **Compromisos de Diseño (Trade-offs):** Requiere coordinar múltiples contextos reactivos en React Native y mantener una tabla de benchmarking de tarifas oficiales PVP.

---

## 4. Decisión Adoptada

Se adopta la **Opción B: Suite de Experiencia Móvil BuscaPiezas 24H**.

### 4.1 Principios Arquitectónicos de las 7 Capacidades Implementadas

1. **Parrilla Visual de Categorías y Navegación Desacoplada ([VisualCategoryGrid.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/VisualCategoryGrid.tsx)):**
   - Agrupación en 6 macro-familias automotrices: Motor y Alimentación, Iluminación, Carrocería, Climatización y Calefacción, Electricidad e Interior, Dirección y Frenado.
   - Supresión reactiva de grupos con recuento 0 en el inventario real.
   - Navegación con parámetro `fromCategoryGrid: 'true'`, garantizando que al pulsar una categoría (ej. Climatización con 8 piezas) se muestren todos los recambios existentes, ofreciendo una píldora opcional para filtrar por el vehículo de "Mi Garaje" sin esconder el catálogo general.

2. **Canal Directo de WhatsApp con Desguaces ([whatsapp-contact.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/whatsapp-contact.service.ts)):**
   - Normalización de números telefónicos al formato internacional E.164 (+34).
   - Generación de mensajes honestos que indican expresamente:
     - Si la pieza cuenta con OEM verificado: *"Referencia OEM oficial: [REF]"*.
     - Si solo dispone de referencia interna: *"Referencia visual de desguace: [REF] (Confirmar compatibilidad con vehículo donante)"*.
   - Prohibición de afirmaciones de compatibilidad absoluta en el mensaje generado.

3. **Compartir Pieza con Mecánico o Cliente ([share-part.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/share-part.service.ts)):**
   - Emisión de ficha técnica estructurada en texto plano con precio, referencia, vehículo donante, kilometraje, datos del CAT emisor y enlace directo permanente.
   - Invocación de la API nativa `Share.share` con captura de excepciones y fallback seguro.

4. **Favoritos y Recambios Guardados ([favourites.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/favourites.service.ts)):**
   - Persistencia local en clave `@buscapiezas/saved_parts_v1` mediante `@react-native-async-storage/async-storage`.
   - Contexto reactivo `FavouritesContext` para sincronización instantánea del icono de guardado en tarjetas y vista detallada.
   - Pantalla dedicada [saved.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/app/saved.tsx) accesible desde la barra superior de navegación.

5. **"Mi Garaje" - Selección Persistente de Vehículo ([garage.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/garage.service.ts)):**
   - Almacenamiento local del vehículo habitual del usuario (marca, modelo, año, motorización).
   - Filtrado no destructivo: el usuario activa o desactiva la vista restringida a su garaje mediante un interruptor visible sin perder la parametrización de su automóvil.

6. **Ahorro Transparente y Métricas de Economía Circular ([savings-comparison.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/savings-comparison.service.ts)):**
   - Comparación contra una tabla de referencia curada de precios oficiales de venta al público (PVP) de concesionario y medias del sector (AERVI/OCU).
   - Si no existe PVP contrastado para una pieza específica, el sistema **no inventa cifras** y suprime honestamente el bloque comparativo.
   - Cálculo de huella circular basado en los factores de emisión del estudio *ADEME PIEC* (Agencia de Transición Ecológica de Francia) y factores de reutilización industrial de metales del *MITECO*:
     - Piezas pesadas (motores, cajas de cambio, capós): 45-85 kg CO₂e evitados y 35-70 kg de materias primas férricas/aluminio preservadas.
     - Piezas medianas (radiadores, alternadores, mandos): 8-22 kg CO₂e evitados.
     - Piezas ligeras (sensores, pilotos, relés): 2-5 kg CO₂e evitados.

7. **Verificación de Confianza CAT y Garantías Legales ([seller-trust.service.ts](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/services/seller-trust.service.ts)):**
   - Certificación de Centro Autorizado de Tratamiento conforme al Real Decreto 265/2021.
   - Presentación del número oficial de registro autonómico en la tarjeta de pieza y cabecera de la ficha detallada.
   - Despliegue de [CatTrustModal.tsx](file:///Users/lycanbeats/Desktop/Mobile%20marketplace/apps/mobile/components/CatTrustModal.tsx) detallando los derechos del comprador: garantía legal obligatoria de 1 año (RDLeg 1/2007) y derecho de desistimiento de 14 días naturales.

---

## 5. Consecuencias

### Positivas
- **Aumento de la Confianza y Conversión:** La acreditación formal del CAT y las garantías explícitas reducen drásticamente la incertidumbre del comprador de recambios usados.
- **Navegación Intuitiva:** El 100% de los usuarios pueden explorar categorías visuales sin atascos de filtrado causados por el garaje.
- **Rigor Científico y Legal:** Cero riesgos de sanciones por publicidad engañosa (*greenwashing*) gracias a la fundamentación en directivas y estudios públicos de ADEME y MITECO.

### Riesgos Residuales y Mitigaciones
- **Riesgo:** Tarifas oficiales PVP de recambio nuevo pueden variar con el tiempo.
  - *Mitigacion:* Mantenimiento periódico de la tabla de benchmarking y adición de la coletilla informativa *"PVP nuevo estimado según catálogo oficial del fabricante / tarifas medias del sector automotriz"*.
