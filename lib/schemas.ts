import { z, type ZodSchema } from 'zod';

// Ajout de la catégorie floa_bank pour tracer les remboursements différés.
export const categories = ['salaire', 'restaurant', 'courses', 'transport', 'loisirs', 'santé', 'shopping', 'autre', 'floa_bank'] as const;

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

const nullableString = (value: unknown): unknown => {
  const trimmed = trimString(value);
  if (typeof trimmed !== 'string') return value;
  return trimmed.length === 0 ? null : trimmed;
};

const isoDateString = z
  .string()
  .refine((val) => !Number.isNaN(Date.parse(val)), { message: 'expense_date must be a valid ISO date string' })
  .transform((val) => new Date(val).toISOString());
const isoDateStringOptional = isoDateString.optional();

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
  confidence_score: z.preprocess(
    (val) => (val === null || val === undefined ? undefined : numberFromString(val)),
    z.number().min(0).max(1).optional(),
  ),
});

export const expenseInsertSchema = groqExpenseSchema.extend({
  user_id: z
    .string({ required_error: 'user_id is required' })
    .uuid({ message: 'user_id must be a valid uuid' }),
  raw_transcription: z
    .string({ required_error: 'raw_transcription is required' })
    .min(1, 'raw_transcription cannot be empty'),
});

export const transactionInsertSchema = z.object({
  user_id: z.string().uuid(),
  type: z.enum(['income', 'expense', 'transfer']).default('expense'),
  amount: z.number().positive(),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  merchant: z.string().nullable().optional(),
  raw_transcription: z.string(),
  ai_confidence: z.number().min(0).max(1).nullable().optional(),
  // Source de paiement (sg par défaut)
  payment_source: z.enum(['sg', 'floa']).default('sg'),
  // Marqueur de remboursement Floa
  floa_repayment: z.boolean().default(false),
  // Métadonnées libres
  metadata: z.record(z.unknown()).default({}),
  // Traces IA facultatives
  ai_raw: z.string().optional(),
  ai_source: z.string().optional(),
});

export const transactionParsedLLMSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']).default('expense'),
  amount: z.preprocess(numberFromString, z.number().positive()),
  date: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return undefined;
      if (val instanceof Date) return val.toISOString();
      if (typeof val === 'string') return val.trim();
      return val;
    },
    isoDateStringOptional,
  ),
  description: z.preprocess(optionalString, z.string().max(240).nullable().optional()),
  category_id: z.preprocess(nullableString, z.string().uuid().nullable().optional()),
  merchant: z.preprocess(nullableString, z.string().max(240).nullable().optional()),
  ai_confidence: z.preprocess(
    (val) => (val === null || val === undefined ? null : numberFromString(val)),
    z.number().min(0).max(1).nullable().optional(),
  ),
  // Source de paiement détectée ou par défaut
  payment_source: z.enum(['sg', 'floa']).default('sg'),
  // Flag pour marquer un remboursement Floa
  floa_repayment: z.boolean().default(false),
  // Métadonnées libres
  metadata: z.record(z.unknown()).default({}),
  // Traces IA facultatives
  ai_raw: z.string().optional(),
  ai_source: z.string().optional(),
  raw_transcription: z.string().optional(),
});

export const transactionRecordSchema = transactionInsertSchema
  .extend({
    raw_transcription: z.string().optional(),
    id: z.string().uuid().optional(),
    date: z.string(),
    ai_raw: z.string().optional(),
    ai_source: z.string().optional(),
    recurring_id: z.string().uuid().nullable().optional(),
    metadata: z.record(z.unknown()),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    payment_source: z.enum(['sg', 'floa']).default('sg'),
    floa_repayment: z.boolean().default(false),
  })
  .passthrough();

export const expenseRecordSchema = expenseInsertSchema
  .extend({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

export const apiResponseSchema = z.object({
  mode: z.enum(['audio', 'text']),
  transcript: z.string({ required_error: 'transcript is required' }),
  extracted: transactionRecordSchema,
});

export const safeParse = <T>(schema: ZodSchema<T>, data: unknown) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true as const, data: result.data };
  }
  return { success: false as const, error: result.error };
};

export type GroqExpense = z.infer<typeof groqExpenseSchema>;
export type ExpenseParsed = GroqExpense;
export type ExpenseInsert = z.infer<typeof expenseInsertSchema>;
export type ExpenseRecord = z.infer<typeof expenseRecordSchema>;
export type ApiResponse = z.infer<typeof apiResponseSchema>;
export type TransactionInsert = z.infer<typeof transactionInsertSchema>;
export type TransactionRecord = z.infer<typeof transactionRecordSchema>;
export type TransactionParsedLLM = z.infer<typeof transactionParsedLLMSchema>;
