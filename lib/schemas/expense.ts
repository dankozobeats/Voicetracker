import { z } from 'zod';

export const expenseSchema = z.object({
  amount: z.number().positive(),
  category: z.enum(['restaurant', 'courses', 'transport', 'loisirs', 'santé', 'shopping', 'autre']),
  description: z.string().max(100).optional().nullable(),
  expense_date: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date' }),
  raw_transcription: z.string().optional().nullable(),
  confidence_score: z.number().min(0).max(1).optional().nullable(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
