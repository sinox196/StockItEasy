import { z } from 'zod';
import { PAYMENT_METHODS, PLANS, SECTORS, VALUATION_METHODS } from '../domain/enums';
import { ALL_PERMISSIONS } from '../domain/permissions';
import { localeSchema, nonNegativeDecimal, uuid } from './common';

export const passwordSchema = z
  .string()
  .min(10, { message: 'validation.passwordLength' })
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), { message: 'validation.passwordComplexity' });

export const emailSchema = z.string().trim().toLowerCase().email({ message: 'validation.email' }).max(254);

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, { message: 'validation.required' }).max(120),
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema.default('fr-TN'),
  acceptTerms: z.literal(true, { message: 'validation.acceptTerms' }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'validation.required' }).max(128),
  /** Mobile clients ask for the refresh token in the body; the web app receives an httpOnly cookie. */
  client: z.enum(['web', 'mobile']).default('web'),
  deviceName: z.string().max(120).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(20), password: passwordSchema });
export const verifyEmailSchema = z.object({ token: z.string().min(20) });

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  locale: localeSchema.optional(),
  timezone: z.string().max(64).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, { message: 'validation.required' }).max(120),
  sector: z.enum(SECTORS),
  currency: z.string().length(3).toUpperCase().default('TND'),
  city: z.string().trim().max(80).optional(),
  firstWarehouseName: z.string().trim().min(2).max(80),
  firstStoreName: z.string().trim().min(2).max(80).optional(),
  withDemoData: z.boolean().default(false),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sector: z.enum(SECTORS).optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  timezone: z.string().max(64).optional(),
  defaultLocale: localeSchema.optional(),
  valuationMethod: z.enum(VALUATION_METHODS).optional(),
  allowNegativeStock: z.boolean().optional(),
  purchaseBudget: nonNegativeDecimal.nullable().optional(),
  serviceLevel: z.union([z.literal(0.9), z.literal(0.95), z.literal(0.975), z.literal(0.99)]).optional(),
  reviewPeriodDays: z.number().int().min(1).max(90).optional(),
  enabledPaymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).optional(),
  taxId: z.string().max(40).nullable().optional(),
  address: z.string().max(240).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  roleId: uuid,
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20),
  fullName: z.string().trim().min(2).max(120).optional(),
  password: passwordSchema.optional(),
});

export const updateMemberSchema = z.object({
  roleId: uuid.optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export const upsertRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])),
});

export const setPlanSchema = z.object({ plan: z.enum(PLANS) });
