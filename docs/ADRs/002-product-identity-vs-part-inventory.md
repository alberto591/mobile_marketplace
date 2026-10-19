# ADR 002: Separación entre Entidad de Inventario (Part) y Proyección Agregada de Catálogo (ProductIdentity)

- **Estado:** Aceptado
- **Fecha:** 2026-10-19
- **Decisores:** Principal Software Architect / Senior TypeScript Engineer / Product Lead

---

## 1. Contexto y Problema

En el comercio electrónico de recambios nuevos (ej. AUTODOC con piezas de fabricante nuevas a estrenar), múltiples distribuidores comercializan el mismo SKU empaquetado. En dicho modelo, es estándar unificar todas las ofertas bajo una única ficha de producto genérica ("Buy Box"), ya que las unidades físicas son idénticas e intercambiables.

Por el contrario, en un **marketplace de recambios usados procedentes de desguaces profesionales (CATs)**:
1. Cada pieza física es **única**: procede de un vehículo donante específico (con kilometraje, año y vida útil particulares), presenta un desgaste estético o mecánico propio y ha sido desmontada y almacenada en las instalaciones de un CAT concreto.
2. Las fotografías publicadas corresponden a la **unidad física real**, no a un render de catálogo ni a una foto genérica de stock.
3. El régimen de garantías (mínimo 1 año conforme a la Ley de Consumidores) y los plazos de envío dependen del CAT que custodia la pieza.
4. El Real Decreto 265/2021 y el artículo 30 del Reglamento de Servicios Digitales (DSA) exigen una estricta trazabilidad de los recambios preparados para reutilización y de los comerciantes que los comercializan.

Surge la decisión arquitectónica: ¿Debe existir una entidad `ProductIdentity` que consolide el catálogo, o debe modelarse cada recambio como una entidad `Part` independiente?

---

## 2. Opciones Evaluadas

### Opción A: Fusión de Inventario bajo una Entidad de Producto Única (Monolito de Catálogo)
Colapsar piezas con la misma referencia OEM en un único registro `Product`, con una lista interna de vendedores y stocks.
- *Rechazada:* Oculta las fotos reales de cada pieza, destruye la trazabilidad por proveedor, dificulta la gestión de inventario de unidades únicas y genera falsas expectativas en el comprador sobre el estado físico de la pieza.

### Opción B: Entidad de Inventario Física `Part` como Raíz de Agregado con `ProductIdentity` como Proyección de Lectura (Seleccionada)
1. **`Part` es la entidad canónica de inventario:** Cada registro representa una unidad física concreta en posesión de un CAT, con su propio precio, fotos reales, estado comprobado, vehículo donante y trazabilidad de origen.
2. **`ProductIdentity` es una proyección agregada de lectura:** No es una tabla de persistencia destructiva, sino un modelo derivado (en memoria o vista indexada) que agrupa piezas por `normalized_reference` para enriquecer la experiencia de búsqueda ("3 ofertas disponibles desde 55,00 EUR en 2 desguaces").
- *Aceptada:* Concilia una navegación cómoda y comparativa con el rigor técnico, legal y operativo de las piezas usadas.

### Opción C: Ausencia Total de Agrupación (Solo Piezas Aisladas)
Mostrar únicamente piezas individuales sin ninguna relación conceptual entre ofertas equivalentes.
- *Rechazada:* Dificulta al comprador comparar precios de una misma referencia OEM entre varios desguaces, obligándole a revisar ofertas dispersas en el listado.

---

## 3. Decisión

Se adopta la **Opción B**.

1. **Invariante de Dominio:** Una pieza (`Part`) nunca es absorbida o mutada por la entrada de otra pieza, aunque compartan exactamente la misma referencia OEM o procedan del mismo modelo de vehículo.
2. **Identidad del Vendedor:** Cada oferta mantiene su `vendor_id`, su identificador externo original (`external_part_id`) y su precio en centavos enteros.
3. **Agrupación en Capa de Aplicación/Búsqueda:** La función `aggregatePartsByOEMReference` y las consultas agrupadas de PostgreSQL generan dinámicamente proyecciones `ProductIdentity` para mostrar al usuario la horquilla de precios (`minPrice`, `maxPrice`) y la cantidad de CATs con stock disponible.
4. Al seleccionar una oferta, el usuario interactúa siempre con la ficha de la pieza concreta (`Part`), visualizando las fotos reales del desguace vendedor.

---

## 4. Consecuencias

### Positivas
- **Cero Ambigüedad:** El comprador ve exactamente la foto y el estado de la pieza que recibirá.
- **Trazabilidad Legal:** Cumplimiento íntegro de los requerimientos de trazabilidad de CATs (RD 265/2021) y de comerciantes (DSA).
- **Flexibilidad de Precios:** Cada desguace fija su precio y condiciones sin interferencias ni algoritmos de sobreescritura.

### Compensaciones y Mitigaciones
- **Volumen de Índices:** Se requieren índices funcionales en `part_oem_references(normalized_reference)` para garantizar que las consultas de agregación por OEM se resuelvan en sub-milisegundos.
