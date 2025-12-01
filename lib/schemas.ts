import { z } from 'zod';

export const categories = ['restaurant', 'courses', 'transport', 'loisirs', 'santé', 'shopping', 'autre'] as const;

const trimString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? '' : trimmed;
};

const numberFromString = (value: unknown): unknown => {
  const trimmed = trimString(value);
  if (typeof trimmed !== 'string' || trimmed.length === 0) return value;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
};

const optionalString = (value: unknown): unknown => {
  const trimmed = trimString(value);
  if (typeof trimmed !== 'string') return value;
  return trimmed.length === 0 ? undefined : trimmed;
};

const isoDateString = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), { message: 'expense_date must be a valid ISO date string' })
  .transform((val) => new Date(val).toISOString());

export const groqExpenseSchema = z.object({
  amount: z.preprocess(
    numberFromString,
    z
      .number({ required_error: 'amount is required' })
      .positive({ message: 'amount must be greater than 0' }),
  ),
  category: z.enum(categories, {
    errorMap: () => ({ message: `category must be one of: ${categories.join(', ')}` }),
  }),
  description: z.preprocess(optionalString, z.string().max(200).optional()),
  expense_date: z.preprocess((val) => {
    if (val instanceof Date) return val.toISOString();
    if (typeof val === 'string') return val.trim();
    return val;
  }, isoDateString),
  confidence_score: z.preprocess(numberFromString, z.number().min(0).max(1).optional()),
});

export const expenseInsertSchema = groqExpenseSchema.extend({
  raw_transcription: z
    .string({ required_error: 'raw_transcription is required' })
    .min(1, 'raw_transcription cannot be empty'),
});

export const expenseRecordSchema = expenseInsertSchema
  .extend({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export const apiResponseSchema = z.object({
  expense: expenseRecordSchema,
  transcription: z.string(),
});

export type GroqExpense = z.infer<typeof groqExpenseSchema>;
export type ExpenseParsed = GroqExpense;
export type ExpenseInsert = z.infer<typeof expenseInsertSchema>;
export type ExpenseRecord = z.infer<typeof expenseRecordSchema>;
export type ApiResponse = z.infer<typeof apiResponseSchema>;
