import { z } from 'zod';

export const SpanishPostalCodeRegex = /^(?:0[1-9]|[1-4]\d|5[0-2])\d{3}$/;

export const DeliveryAddressSchema = z.object({
  line1: z
    .string()
    .trim()
    .min(5, { message: 'La dirección debe tener al menos 5 caracteres' })
    .max(150, { message: 'La dirección no puede exceder 150 caracteres' }),
  line2: z
    .string()
    .trim()
    .max(150, { message: 'El complemento de dirección no puede exceder 150 caracteres' })
    .optional(),
  city: z
    .string()
    .trim()
    .min(2, { message: 'La localidad debe tener al menos 2 caracteres' })
    .max(80, { message: 'La localidad no puede exceder 80 caracteres' }),
  province: z
    .string()
    .trim()
    .min(2, { message: 'La provincia debe tener al menos 2 caracteres' })
    .max(80, { message: 'La provincia no puede exceder 80 caracteres' }),
  postalCode: z
    .string()
    .trim()
    .regex(SpanishPostalCodeRegex, { message: 'El código postal debe ser un código español válido de 5 dígitos (01000 - 52999)' }),
  country: z.literal('ES'),
});

export const CustomerOrderContactSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, { message: 'El nombre debe tener al menos 2 caracteres' })
    .max(100, { message: 'El nombre no puede exceder 100 caracteres' }),
  customerEmail: z
    .string()
    .trim()
    .email({ message: 'El email de contacto debe ser una dirección válida' })
    .max(255),
  customerPhone: z
    .string()
    .trim()
    .min(6, { message: 'El teléfono debe tener al menos 6 caracteres' })
    .max(30, { message: 'El teléfono no puede exceder 30 caracteres' }),
});

export const CheckoutInitSchema = z.object({
  contact: CustomerOrderContactSchema,
  address: DeliveryAddressSchema,
  partIds: z
    .array(z.string().uuid({ message: 'El ID de pieza debe ser un UUID válido' }))
    .min(1, { message: 'El pedido debe incluir al menos una pieza' })
    .max(10, { message: 'No se permite tramitar más de 10 piezas en un único pedido' }),
  idempotencyKey: z
    .string()
    .trim()
    .min(10, { message: 'La clave de idempotencia debe tener al menos 10 caracteres' })
    .max(120, { message: 'La clave de idempotencia no puede superar 120 caracteres' }),
});

export type DeliveryAddressInput = z.infer<typeof DeliveryAddressSchema>;
export type CustomerOrderContactInput = z.infer<typeof CustomerOrderContactSchema>;
export type CheckoutInitInput = z.infer<typeof CheckoutInitSchema>;
