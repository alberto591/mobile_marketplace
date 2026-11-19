/**
 * Legal texts of the marketplace: one set for the whole platform, the same for every
 * scrapyard that sells on it. Shown in the app and at public addresses on the web
 * (/legal, /legal/<slug>), which is what the app stores ask for.
 *
 * OPERATOR is the company that runs the marketplace. Fields left as null are shown as
 * "pendiente de completar": fill them in before going live.
 */

export interface LegalOperator {
  readonly brand: string;
  readonly legalName: string | null;
  readonly taxId: string | null;
  readonly address: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly registry: string | null;
}

export const OPERATOR: LegalOperator = {
  brand: 'BuscaPiezas 24H',
  legalName: 'Alberto Calvo Rivas',
  taxId: null,
  address: null,
  email: 'admin@loopinnova.es',
  phone: '+34 625 852 546',
  registry: null,
};

export const PENDING = '[pendiente de completar]';

/** The terms every seller on the platform accepts. Used across the texts below. */
export const PLATFORM_TERMS = {
  withdrawalDays: 14,
  refundDays: 14,
  warrantyMonths: 12,
  maxWeightKg: 250,
  vatPercent: 21,
} as const;

export interface LegalSection {
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
  readonly after?: readonly string[];
}

export interface LegalDocument {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly updatedAt: string;
  readonly sections: readonly LegalSection[];
}

const UPDATED_AT = '19 de noviembre de 2026';

export function buildLegalDocuments(operator: LegalOperator = OPERATOR): readonly LegalDocument[] {
  const o = {
    brand: operator.brand,
    legalName: operator.legalName ?? PENDING,
    taxId: operator.taxId ?? PENDING,
    address: operator.address ?? PENDING,
    email: operator.email ?? PENDING,
    phone: operator.phone ?? PENDING,
  };
  const t = PLATFORM_TERMS;

  return [
    {
      slug: 'aviso-legal',
      title: 'Aviso legal',
      summary: 'Quién está detrás de la plataforma y cómo contactar.',
      updatedAt: UPDATED_AT,
      sections: [
        {
          heading: '1. Titular de la plataforma',
          paragraphs: [
            `En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico, se informa de los datos del titular de ${o.brand} (la aplicación y su versión web):`,
          ],
          bullets: [
            `Titular: ${o.legalName}`,
            `NIF: ${o.taxId}`,
            `Domicilio: ${o.address}`,
            `Correo electrónico: ${o.email}`,
            `Teléfono: ${o.phone}`,
            ...(operator.registry ? [`Datos registrales: ${operator.registry}`] : []),
          ],
        },
        {
          heading: '2. Qué es la plataforma',
          paragraphs: [
            `${o.brand} es un mercado en línea de recambios de automóvil usados. Reúne el catálogo de desguaces que son Centros Autorizados de Tratamiento de vehículos (CAT) y permite a los compradores buscar piezas, consultar su disponibilidad y comprarlas.`,
            'El vendedor de cada pieza es el desguace que la publica, identificado en la ficha de la pieza y en el pedido. El titular de la plataforma actúa como intermediario: presta el servicio técnico de búsqueda, pedido y pago, pero no es el vendedor ni el propietario de las piezas.',
          ],
        },
        {
          heading: '3. Uso de la plataforma',
          paragraphs: [
            'El acceso es libre y no requiere crear una cuenta. Quien usa la plataforma se compromete a hacerlo de forma lícita, a facilitar datos veraces cuando hace un pedido o una consulta y a no interferir en su funcionamiento.',
          ],
        },
        {
          heading: '4. Información de las piezas',
          paragraphs: [
            'Las fotos, descripciones, referencias, precios y disponibilidad los facilita cada desguace y se actualizan periódicamente. Las referencias de fabricante y los datos del vehículo de origen son orientativos: antes de comprar, comprueba que la pieza es compatible con tu vehículo. Si tienes dudas, envía una consulta al desguace desde la ficha de la pieza.',
          ],
        },
        {
          heading: '5. Propiedad intelectual e industrial',
          paragraphs: [
            'El diseño, el código y los contenidos propios de la plataforma pertenecen a su titular. Las marcas y modelos de vehículos y las referencias de fabricante se mencionan solo para identificar las piezas y pertenecen a sus respectivos titulares. Las fotos de las piezas pertenecen a los desguaces que las publican.',
          ],
        },
        {
          heading: '6. Responsabilidad',
          paragraphs: [
            'El titular pone los medios razonables para que la plataforma funcione de forma continua y con información actualizada, pero no puede garantizar la ausencia de interrupciones o de errores puntuales en los datos que facilitan los desguaces. Nada de lo anterior limita los derechos que la ley reconoce a los consumidores.',
          ],
        },
        {
          heading: '7. Ley aplicable',
          paragraphs: [
            'Estos textos se rigen por la ley española. Si eres consumidor, cualquier conflicto se resolverá ante los juzgados y tribunales de tu domicilio.',
          ],
        },
      ],
    },
    {
      slug: 'privacidad',
      title: 'Política de privacidad',
      summary: 'Qué datos tratamos, para qué y cuáles son tus derechos.',
      updatedAt: UPDATED_AT,
      sections: [
        {
          heading: '1. Responsable del tratamiento',
          bullets: [`Responsable: ${o.legalName}`, `NIF: ${o.taxId}`, `Domicilio: ${o.address}`, `Contacto para privacidad: ${o.email}`],
          after: [
            'El desguace que vende la pieza recibe los datos necesarios para preparar, enviar y facturar tu pedido, y los trata como responsable propio para cumplir sus obligaciones como vendedor.',
          ],
        },
        {
          heading: '2. Qué datos tratamos',
          bullets: [
            'Datos del pedido: nombre, correo electrónico, teléfono, dirección de entrega, piezas compradas e importes.',
            'Datos de las consultas: nombre, correo electrónico, teléfono y el mensaje que envías sobre una pieza.',
            'Datos técnicos mínimos: dirección IP, tratada de forma temporal para evitar abusos del servicio.',
          ],
          after: [
            'No tratamos los datos de tu tarjeta. El pago lo gestiona Stripe, que recibe esos datos directamente; la plataforma solo conoce el resultado del pago.',
            'No hace falta crear una cuenta. No pedimos categorías especiales de datos ni datos de menores; la plataforma no está dirigida a menores de 18 años.',
          ],
        },
        {
          heading: '3. Para qué los usamos y con qué base legal',
          bullets: [
            'Tramitar tu pedido, cobrarlo, enviarlo y atender devoluciones y garantías: ejecución del contrato.',
            'Responder a tus consultas sobre piezas: aplicación de medidas precontractuales a petición tuya.',
            'Enviarte los avisos del pedido (confirmación y envío): ejecución del contrato.',
            'Conservar facturas y justificantes: cumplimiento de obligaciones legales fiscales y mercantiles.',
            'Prevenir el fraude y el abuso del servicio: interés legítimo.',
          ],
          after: ['No enviamos publicidad ni elaboramos perfiles. No tomamos decisiones automatizadas con efectos sobre ti.'],
        },
        {
          heading: '4. Quién recibe tus datos',
          bullets: [
            'El desguace vendedor de las piezas de tu pedido o destinatario de tu consulta.',
            'La empresa de transporte que entrega el pedido, a la que el desguace comunica tu nombre, dirección y teléfono.',
            'Stripe Payments Europe, Ltd., para el cobro.',
            'Proveedores técnicos que actúan por cuenta del responsable: alojamiento y base de datos (Supabase), envío de correos (Resend) y alojamiento de la versión web (Vercel).',
            'Administraciones públicas y juzgados, cuando la ley lo exija.',
          ],
          after: [
            'Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo. En ese caso lo hacen con las garantías previstas en el Reglamento General de Protección de Datos, como las cláusulas contractuales tipo aprobadas por la Comisión Europea o el marco de privacidad de datos entre la Unión Europea y Estados Unidos.',
          ],
        },
        {
          heading: '5. Cuánto tiempo los conservamos',
          bullets: [
            'Pedidos y facturas: durante el plazo de garantía y los plazos que exige la normativa fiscal y mercantil (hasta seis años).',
            'Consultas que no terminan en pedido: hasta un año desde la última comunicación.',
            'Direcciones IP usadas para limitar abusos: de forma seudonimizada y durante unas horas.',
          ],
        },
        {
          heading: '6. Datos guardados en tu dispositivo',
          paragraphs: [
            'La aplicación y la web guardan en tu propio dispositivo el carrito, tus piezas guardadas, tus vehículos y el acceso a tus pedidos. Esa información no sale del dispositivo salvo cuando haces un pedido o una consulta, y puedes borrarla eliminando los datos de la aplicación o del navegador. No usamos cookies publicitarias ni herramientas de seguimiento.',
            'El enlace de «Mis pedidos» contiene una clave que da acceso a ese pedido: no lo compartas con quien no deba verlo.',
          ],
        },
        {
          heading: '7. Tus derechos',
          paragraphs: [
            `Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a ${o.email}, indicando qué derecho ejerces y el correo electrónico o la referencia del pedido. Responderemos en el plazo máximo de un mes.`,
            'Si consideras que no hemos atendido bien tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).',
          ],
        },
        {
          heading: '8. Cambios en esta política',
          paragraphs: ['Si cambiamos esta política, publicaremos la nueva versión en esta misma dirección con su fecha de actualización.'],
        },
      ],
    },
    {
      slug: 'condiciones',
      title: 'Condiciones de compra',
      summary: 'Cómo se compra, precios, envío, pago y quién es el vendedor.',
      updatedAt: UPDATED_AT,
      sections: [
        {
          heading: '1. A quién se aplican',
          paragraphs: [
            `Estas condiciones regulan las compras de recambios que se hacen a través de ${o.brand} y son las mismas para todos los desguaces que venden en la plataforma. Al pulsar «Pagar» declaras que las has leído y las aceptas.`,
          ],
        },
        {
          heading: '2. Quién vende',
          paragraphs: [
            'El contrato de compraventa se celebra entre tú y el desguace que publica la pieza, que es un Centro Autorizado de Tratamiento de vehículos. Su nombre y sus datos aparecen en la ficha de la pieza, en el pedido y en la factura. Ese desguace es quien te entrega la pieza, emite la factura y responde de la garantía y de las devoluciones.',
            `El titular de ${o.brand} gestiona la plataforma, el pedido y el cobro como intermediario, y te ayuda si surge algún problema con el desguace.`,
          ],
        },
        {
          heading: '3. Las piezas',
          paragraphs: [
            'Todas las piezas son recambios usados, procedentes de vehículos dados de baja, y se venden revisadas por el desguace. Las fotos corresponden a la pieza real. Al ser piezas usadas pueden presentar señales de uso que no afectan a su función.',
            'Cada pieza es una unidad única. Comprueba la referencia y la compatibilidad con tu vehículo antes de comprar; si no estás seguro, usa la opción de consulta de la ficha y el desguace te lo confirmará.',
          ],
        },
        {
          heading: '4. Precios e impuestos',
          paragraphs: [
            `Los precios del catálogo se muestran en euros y sin IVA. Antes de pagar, la pantalla de pedido muestra el desglose completo: recambios, gastos de envío, IVA (${t.vatPercent} %) y el total final que se cobrará. No hay más cargos que los que aparecen en ese desglose.`,
            'Si el precio de una pieza cambia entre que la añades al carrito y el momento de pagar, verás el importe actualizado y tendrás que confirmarlo antes de que se haga ningún cobro.',
          ],
        },
        {
          heading: '5. Cómo se hace un pedido',
          bullets: [
            'Añade las piezas al carrito. Cada pedido incluye piezas de un solo desguace; si tu carrito tiene piezas de varios, se tramitan como pedidos separados.',
            'Indica tus datos de contacto y la dirección de entrega.',
            'Revisa el desglose y pulsa «Pagar».',
            'Al iniciar el pago, las piezas quedan reservadas para ti durante un tiempo limitado. Si el pago no se completa, la reserva se libera.',
            'Cuando el pago se confirma, recibes un correo con el resumen del pedido, y otro con el número de seguimiento cuando el desguace lo envía.',
          ],
          after: [
            'El contrato se celebra en español y queda formalizado cuando se confirma el pago. Puedes consultar el pedido en «Mis pedidos» y en los correos que recibes.',
            'Las piezas que aparecen «a consultar» no se pueden comprar directamente: envía una consulta y el desguace te confirmará precio y disponibilidad.',
          ],
        },
        {
          heading: '6. Pago',
          paragraphs: [
            'El pago se hace con tarjeta a través de Stripe, una pasarela de pago segura. La plataforma no almacena los datos de tu tarjeta. El cargo se hace en el momento de la compra.',
          ],
        },
        {
          heading: '7. Envío y entrega',
          bullets: [
            'Se envía a España peninsular y Baleares. De momento no hay envíos a Canarias, Ceuta, Melilla ni a otros países; si lo necesitas, envía una consulta al desguace.',
            'Los gastos de envío se calculan según el peso total del pedido y la zona de entrega, y se muestran antes de pagar.',
            `Los pedidos de más de ${t.maxWeightKg} kg, o con piezas cuyo envío requiere un presupuesto especial, no se pueden comprar directamente: se gestionan mediante consulta.`,
            'El desguace prepara el pedido en uno o dos días laborables. El plazo de entrega habitual es de 24 a 72 horas desde el envío en la península y algo mayor en Baleares. En todo caso, la entrega se hará en un máximo de 30 días naturales desde la compra.',
          ],
          after: [
            'Al recibir el paquete, revisa su estado. Si llega dañado o le falta algo, anótalo en el albarán del transportista si es posible y avisa al desguace cuanto antes, con fotos.',
          ],
        },
        {
          heading: '8. Si la pieza no está disponible',
          paragraphs: [
            'Aunque el catálogo se sincroniza con el inventario de cada desguace, puede ocurrir que una pieza ya no esté disponible o no supere la revisión previa al envío. En ese caso se te avisará y se te devolverá el importe íntegro sin demora, y como máximo en 14 días naturales.',
          ],
        },
        {
          heading: '9. Devoluciones y garantía',
          paragraphs: [
            `Tienes ${t.withdrawalDays} días naturales para devolver tu compra sin dar explicaciones y una garantía legal mínima de ${t.warrantyMonths} meses. Las condiciones completas están en la Política de devoluciones y garantía, que forma parte de estas condiciones.`,
          ],
        },
        {
          heading: '10. Atención al cliente y reclamaciones',
          paragraphs: [
            `Para cualquier incidencia con un pedido, escribe al desguace vendedor (sus datos están en el pedido) o a ${o.email}, indicando la referencia del pedido. Responderemos lo antes posible y, en todo caso, en el plazo máximo de un mes.`,
            'Los desguaces disponen de hojas de reclamaciones. Si eres consumidor y no quedas satisfecho con la respuesta, puedes acudir a los servicios de consumo de tu comunidad autónoma o de tu ayuntamiento.',
          ],
        },
        {
          heading: '11. Compras de profesionales',
          paragraphs: [
            'Los talleres y otros profesionales pueden comprar en la plataforma. El derecho de desistimiento y la garantía legal descritos para consumidores se aplican a quienes compran como consumidores; a las compras profesionales se les aplican la garantía comercial indicada en la política de devoluciones y las normas generales de la compraventa mercantil.',
          ],
        },
        {
          heading: '12. Ley aplicable',
          paragraphs: [
            'Estas condiciones se rigen por la ley española. Si eres consumidor, los conflictos se resolverán ante los juzgados y tribunales de tu domicilio.',
          ],
        },
      ],
    },
    {
      slug: 'devoluciones',
      title: 'Política de devoluciones y garantía',
      summary: `${t.withdrawalDays} días para devolver y ${t.warrantyMonths} meses de garantía en todas las piezas.`,
      updatedAt: UPDATED_AT,
      sections: [
        {
          heading: '1. Una misma política para todos los desguaces',
          paragraphs: [
            `Todos los desguaces que venden en ${o.brand} aplican, como mínimo, las condiciones de esta política. Un desguace puede ofrecer condiciones mejores (por ejemplo, más meses de garantía), que verás en la ficha de la pieza.`,
          ],
        },
        {
          heading: `2. Devolución sin motivo (${t.withdrawalDays} días)`,
          paragraphs: [
            `Si compras como consumidor, puedes devolver tu compra sin dar explicaciones durante ${t.withdrawalDays} días naturales desde el día en que recibes la pieza. Es el derecho de desistimiento que reconoce la ley en las compras a distancia.`,
          ],
          bullets: [
            `Cómo ejercerlo: escribe dentro del plazo al desguace vendedor o a ${o.email}, indicando la referencia del pedido y que quieres devolverlo. Basta con un mensaje claro; no hace falta ningún formulario concreto.`,
            `Envío de vuelta: tienes ${t.withdrawalDays} días naturales desde el aviso para enviar la pieza al desguace. El coste del envío de devolución corre de tu cuenta.`,
            'Estado de la pieza: debe volver completa, sin montar y en el mismo estado en que la recibiste, con sus precintos y marcas de identificación. Puedes examinarla como lo harías en una tienda; si se ha montado o manipulado más allá de eso, el desguace puede descontar del reembolso la pérdida de valor.',
            `Reembolso: se te devuelve el precio de la pieza y el envío de ida estándar, por el mismo medio de pago, en un máximo de ${t.refundDays} días naturales desde tu aviso. El desguace puede esperar a recibir la pieza o a que acredites su envío.`,
          ],
          after: ['Embala la pieza con cuidado: los daños por un embalaje insuficiente en la devolución pueden reducir el reembolso.'],
        },
        {
          heading: `3. Garantía legal (${t.warrantyMonths} meses como mínimo)`,
          paragraphs: [
            `Todas las piezas tienen garantía. Al tratarse de bienes de segunda mano, la ley permite pactar un plazo inferior al general, que nunca puede ser menor de un año: en ${o.brand} el plazo mínimo es de ${t.warrantyMonths} meses desde la entrega.`,
            'La garantía cubre la falta de conformidad: que la pieza no funcione, que no corresponda con lo descrito en su ficha o que tenga un defecto que ya existía al entregarse. Si el defecto aparece dentro del plazo de garantía, se presume que ya existía en el momento de la entrega, salvo que se demuestre lo contrario o que esa presunción sea incompatible con la naturaleza de la pieza o del defecto.',
          ],
          bullets: [
            'Qué puedes pedir: la sustitución de la pieza por otra equivalente o su reparación, sin coste para ti. Al ser piezas únicas, si no es posible ninguna de las dos, tienes derecho a la devolución del precio o a una rebaja.',
            'Los gastos de envío necesarios para atender la garantía son por cuenta del vendedor.',
            'Cómo reclamar: avisa al desguace vendedor en cuanto detectes el problema, con la referencia del pedido, una descripción del fallo y fotos si es posible.',
          ],
        },
        {
          heading: '4. Qué no cubre la garantía',
          bullets: [
            'El desgaste normal por el uso.',
            'Los daños causados por un montaje incorrecto, por un uso inadecuado o por averías de otros elementos del vehículo.',
            'La pieza comprada por error o que no es compatible con tu vehículo cuando su descripción era correcta: en ese caso puedes usar la devolución de 14 días.',
            'Las piezas manipuladas, desmontadas en sus componentes o sin sus marcas de identificación.',
          ],
          after: [
            'Para piezas como motores, cajas de cambio, turbos, inyección o centralitas, se recomienda que el montaje lo haga un taller profesional y conservar su factura: facilita mucho la tramitación de la garantía. La garantía cubre la pieza; la mano de obra de montaje y desmontaje y otros gastos se valoran según lo que establece la ley para cada caso.',
          ],
        },
        {
          heading: '5. Pieza equivocada, dañada o que no llega',
          bullets: [
            'Si recibes una pieza distinta de la que compraste o que no corresponde con su ficha, el desguace organiza la recogida y te envía la correcta o te devuelve el importe íntegro, sin coste para ti.',
            'Si el paquete llega dañado, avisa en las primeras 24 horas si es posible, con fotos del embalaje y de la pieza.',
            'Si el pedido no llega en el plazo indicado, avisa y se localizará el envío; si no se entrega en un máximo de 30 días naturales desde la compra, puedes cancelar el pedido y recuperar todo lo pagado.',
          ],
        },
        {
          heading: '6. Compras de profesionales',
          paragraphs: [
            `Cuando el comprador es un taller u otro profesional, no se aplica la devolución sin motivo. Los desguaces de la plataforma ofrecen a los profesionales una garantía comercial de ${t.warrantyMonths} meses sobre el funcionamiento de la pieza, con sustitución o devolución del precio.`,
          ],
        },
        {
          heading: '7. Contacto',
          paragraphs: [
            `Los datos del desguace vendedor están en tu pedido y en los correos de confirmación. Si no consigues resolverlo con el desguace, escribe a ${o.email} con la referencia del pedido y mediaremos para solucionarlo.`,
          ],
        },
      ],
    },
  ];
}

export const LEGAL_DOCUMENTS = buildLegalDocuments();

export function findLegalDocument(slug: string | undefined): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
}

/** True while the operator details have not been filled in. */
export function hasPendingOperatorData(operator: LegalOperator = OPERATOR): boolean {
  return [operator.legalName, operator.taxId, operator.address, operator.email].some((value) => !value);
}
