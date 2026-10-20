import { z } from 'zod';

export const CustomerContactSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(2, { message: 'El nombre debe tener al menos 2 caracteres' })
      .max(100, { message: 'El nombre no puede exceder 100 caracteres' }),
    customerEmail: z
      .string()
      .trim()
      .email({ message: 'El formato de correo electrónico no es válido' })
      .max(255)
      .optional()
      .or(z.literal('')),
    customerPhone: z
      .string()
      .trim()
      .regex(/^(\+?[0-9\s\-()]{7,25})$/, {
        message: 'El teléfono debe contener entre 7 y 25 dígitos numéricos válidos',
      })
      .optional()
      .or(z.literal('')),
    customerMessage: z
      .string()
      .trim()
      .max(1000, { message: 'El mensaje no puede exceder 1000 caracteres' })
      .optional(),
    vehicleVin: z
      .string()
      .trim()
      .regex(/^[A-HJ-NPR-Z0-9]{5,30}$/i, {
        message: 'El bastidor (VIN) contiene caracteres o longitud no válidos',
      })
      .optional()
      .or(z.literal('')),
    vehiclePlate: z
      .string()
      .trim()
      .regex(/^[A-Z0-9\s\-]{3,15}$/i, {
        message: 'La matrícula contiene un formato no válido',
      })
      .optional()
      .or(z.literal('')),
    privacyConsent: z.object({
      accepted: z.literal(true, {
        errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad para tramitar la consulta' }),
      }),
      version: z.string().min(1).default('v1.0'),
    }),
  })
  .refine(
    (data) => Boolean(data.customerEmail?.trim()) || Boolean(data.customerPhone?.trim()),
    {
      message: 'Debes proporcionar al menos un medio de contacto: correo electrónico o teléfono',
      path: ['customerEmail'],
    }
  );

export const SubmitInquiryItemInputSchema = z.object({
  partId: z.string().uuid({ message: 'Identificador de pieza debe ser un UUID válido' }),
});

export const SubmitInquiryPayloadSchema = CustomerContactSchema.and(
  z.object({
    items: z
      .array(SubmitInquiryItemInputSchema)
      .min(1, { message: 'Debes incluir al menos una pieza en la solicitud' })
      .max(10, { message: 'No se permite solicitar más de 10 piezas simultáneamente' }),
    idempotencyKey: z
      .string()
      .trim()
      .min(8, { message: 'Clave de idempotencia requerida (mínimo 8 caracteres)' })
      .max(120),
    source: z.string().trim().default('mobile_app'),
  })
);

export type SubmitInquiryPayload = z.infer<typeof SubmitInquiryPayloadSchema>;

export const InquirySummaryResponseSchema = z.object({
  inquiryId: z.string().uuid(),
  inquiryReference: z.string(),
  vendorId: z.string().uuid(),
  vendorTradeName: z.string(),
  itemCount: z.number().int().positive(),
  notificationStatus: z.enum(['PENDING', 'SENT', 'FAILED', 'SKIPPED_NOT_CONFIGURED']),
  status: z.enum(['REGISTERED', 'NOTIFICATION_SENT', 'NOTIFICATION_FAILED', 'RESPONDED', 'CANCELLED']),
});

export const SubmitInquiryResponseSchema = z.object({
  success: z.boolean(),
  groupId: z.string().uuid(),
  inquiries: z.array(InquirySummaryResponseSchema),
  registeredAt: z.string(),
});

export type SubmitInquiryResponse = z.infer<typeof SubmitInquiryResponseSchema>;
export type InquirySummaryResponse = z.infer<typeof InquirySummaryResponseSchema>;
