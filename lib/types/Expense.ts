import { z } from 'zod';

export const ExpenseSchema = z
  .object({
    amount: z.number({ required_error: 'amount is required' }),
    category: z.string({ required_error: 'category is required' }).min(1, 'category cannot be empty'),
    description: z.string().optional(),
    date: z.string({ required_error: 'date is required' }).min(1, 'date cannot be empty'),
  })
  .strict()
  .passthrough();

export type Expense = z.infer<typeof ExpenseSchema>;
