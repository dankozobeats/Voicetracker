import { z } from 'zod';

import { categories } from '@/lib/schemas';
import type { TransactionCategory } from '@/models/transaction';

const toIsoDate = z
  .string({ required_error: 'expenseDate is required' })
  .min(1, 'expenseDate cannot be empty')
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'expenseDate must be a valid date string',
  })
  .transform((value) => new Date(value).toISOString());

const positiveAmount = z.preprocess(
  (value) => {
    if (typeof value === 'string') return Number(value);
    return value;
  },
  z.number({ required_error: 'amount is required' }).positive({ message: 'amount must be greater than 0' }),
);

const uuidOptional = z.string().uuid().optional();

export const transactionInputSchema = z.object({
  userId: uuidOptional,
  type: z.enum(['income', 'expense', 'transfer']).default('expense'),
  amount: positiveAmount,
  account: z.string().trim().max(120).nullable().optional(),
  settlementDate: z
    .string()
    .nullable()
    .optional()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), {
      message: 'settlementDate must be a valid date string',
    }),
  category: z.enum(categories as [TransactionCategory, ...TransactionCategory[]]),
  description: z.string().trim().max(240).nullable().optional(),
  expenseDate: toIsoDate,
  rawTranscription: z.string().trim().nullable().optional(),
});

export const transactionUpdateSchema = transactionInputSchema.partial().extend({
  expenseDate: toIsoDate.optional(),
});

export const budgetRuleSchema = z.object({
  userId: uuidOptional,
  category: z.enum(categories as [TransactionCategory, ...TransactionCategory[]]),
  monthlyLimit: positiveAmount,
  alertThreshold: z
    .number({ required_error: 'alertThreshold is required' })
    .min(0, 'alertThreshold must be between 0 and 1')
    .max(1, 'alertThreshold must be between 0 and 1'),
  startDate: toIsoDate,
  endDate: z
    .string()
    .optional()
    .nullable()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), { message: 'endDate must be a valid date' })
    .transform((value) => (value ? new Date(value).toISOString() : value)),
});

export const recurringRuleSchema = z.object({
  userId: uuidOptional,
  amount: positiveAmount,
  category: z.enum(categories as [TransactionCategory, ...TransactionCategory[]]),
  description: z.string().trim().max(240).nullable().optional(),
  direction: z.enum(['income', 'expense']).default('expense'),
  cadence: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  dayOfMonth: z
    .number()
    .min(1)
    .max(28)
    .nullable()
    .optional(),
  weekday: z
    .number()
    .min(0)
    .max(6)
    .nullable()
    .optional(),
  startDate: toIsoDate,
  endDate: z
    .string()
    .optional()
    .nullable()
    .refine((value) => !value || !Number.isNaN(Date.parse(value)), { message: 'endDate must be a valid date' })
    .transform((value) => (value ? new Date(value).toISOString() : value)),
});

/**
 * Format a Zod error list into a compact string for API logging.
 * @param error - zod error to flatten
 * @returns - human readable string for debugging
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');
}

/**
 * Validate a transaction creation payload.
 * @param payload - incoming untrusted data
 * @returns - parsed and normalized transaction input
 */
export function parseTransactionInput(payload: unknown) {
  const result = transactionInputSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

/**
 * Validate a transaction update payload.
 * @param payload - incoming partial data
 * @returns - parsed transaction update payload
 */
export function parseTransactionUpdate(payload: unknown) {
  const result = transactionUpdateSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

/**
 * Validate a budget rule payload.
 * @param payload - raw request body
 * @returns - parsed budget rule data
 */
export function parseBudgetRule(payload: unknown) {
  const result = budgetRuleSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

/**
 * Validate a recurring rule payload.
 * @param payload - raw request body
 * @returns - parsed recurring rule data
 */
export function parseRecurringRule(payload: unknown) {
  const result = recurringRuleSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}
