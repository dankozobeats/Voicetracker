const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 5;

type RateLimitEntry = {
  count: number;
  reset: number;
};

const store = new Map<string, RateLimitEntry>();

export interface RateLimitResult {
  limit: number;
  remaining: number;
  reset: number;
  isLimited: boolean;
}

const sanitizeKey = (ip: string | null | undefined) => (ip?.trim() || '0.0.0.0').toLowerCase();

export const getClientIp = (request: Request | { headers: Headers; ip?: string | null }): string => {
  const header = request.headers?.get('x-forwarded-for') ?? request.headers?.get('x-real-ip');
  if (header) {
    return header.split(',')[0]!.trim();
  }
  return (request as any).ip ?? '0.0.0.0';
};

export const rateLimit = (ip: string, now = Date.now()): RateLimitResult => {
  const key = sanitizeKey(ip);
  const existing = store.get(key);

  if (!existing || now >= existing.reset) {
    const reset = now + RATE_LIMIT_WINDOW_MS;
    store.set(key, { count: 1, reset });
    return {
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      reset,
      isLimited: false,
    };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: 0,
      reset: existing.reset,
      isLimited: true,
    };
  }

  existing.count += 1;
  store.set(key, existing);

  return {
    limit: RATE_LIMIT_MAX_REQUESTS,
    remaining: RATE_LIMIT_MAX_REQUESTS - existing.count,
    reset: existing.reset,
    isLimited: false,
  };
};

export const resetRateLimitStore = () => {
  store.clear();
};
