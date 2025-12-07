import type { PostgrestFilterBuilder } from '@supabase/postgrest-js';

/**
 * Resolve user id from explicit payload or environment defaults.
 * @param explicit - user id provided by caller
 * @param options - control requirement of the user id
 * @returns - resolved user id or undefined when not required
 */
export function resolveUserId(explicit?: string, options: { required?: boolean } = {}): string | undefined {
  const userId = explicit || process.env.SUPABASE_DEFAULT_USER_ID || process.env.NEXT_PUBLIC_SUPABASE_DEFAULT_USER_ID;
  if (!userId && options.required) {
    throw new Error('User id is required to scope data operations');
  }
  return userId;
}

/**
 * Normalize a date input into ISO string accepted by Supabase.
 * @param value - raw date input
 * @returns - iso date string
 */
export function toIsoDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date value');
  }
  return parsed.toISOString();
}

/**
 * Add a user_id filter when available, preserving the builder chain.
 * @param query - supabase query builder
 * @param userId - optional user identifier
 * @returns - same query builder for chaining
 */
export function applyUserFilter<
  Row extends Record<string, unknown>,
  Result,
  Relationships extends Record<string, unknown>,
>(
  query: PostgrestFilterBuilder<Row, Relationships, Result>,
  userId?: string,
): PostgrestFilterBuilder<Row, Relationships, Result> {
  if (userId) {
    query.eq('user_id', userId);
  }
  return query;
}

/**
 * Simple helper to log and rethrow service errors in a consistent way.
 * @param message - contextual log
 * @param error - caught error
 * @returns - never; throws a new error with context
 */
export function handleServiceError(message: string, error: unknown): never {
  const details = error instanceof Error ? error.message : JSON.stringify(error);
  console.error(message, details);
  throw new Error(message);
}
