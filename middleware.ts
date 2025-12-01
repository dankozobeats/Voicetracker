import { NextRequest, NextResponse } from 'next/server';

import { getClientIp, rateLimit } from '@/lib/rateLimit';

// Ignore static assets and Next.js internals – only /api/voice is rate limited.
const IGNORED_PATHS = [/^\/_next\//, /^\/static\//, /^\/favicon\./, /^\/assets\//];

const buildRateLimitHeaders = (limit: number, remaining: number, reset: number) => ({
  'x-ratelimit-limit': String(limit),
  'x-ratelimit-remaining': String(Math.max(remaining, 0)),
  'x-ratelimit-reset': String(reset),
});

const shouldBypass = (pathname: string) => IGNORED_PATHS.some((regex) => regex.test(pathname));

export const config = {
  matcher: ['/api/voice/:path*'],
};

/**
 * Edge middleware enforcing 5 requests/minute/IP on /api/voice.
 * Adds standard rate-limit headers and returns a structured JSON error when exceeded.
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'test') {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  const clientIp = getClientIp(request);
  const result = rateLimit(clientIp);
  const headers = buildRateLimitHeaders(result.limit, result.remaining, result.reset);

  if (result.isLimited) {
    return new NextResponse(JSON.stringify({ error: 'Rate limit exceeded', remaining: 0 }), {
      status: 429,
      headers: new Headers({
        'content-type': 'application/json',
        ...headers,
      }),
    });
  }

  const response = NextResponse.next();
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
