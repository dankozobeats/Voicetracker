import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';

import { getClientIp, rateLimit } from '@/lib/rateLimit';

const IGNORED_PATHS = [/^\/_next\//, /^\/static\//, /^\/favicon\./, /^\/assets\//];
const PUBLIC_PATHS = ['/auth/login', '/auth/signup', '/public'];

const buildRateLimitHeaders = (limit: number, remaining: number, reset: number) => ({
  'x-ratelimit-limit': String(limit),
  'x-ratelimit-remaining': String(Math.max(remaining, 0)),
  'x-ratelimit-reset': String(reset),
});

const shouldBypass = (pathname: string) => IGNORED_PATHS.some((regex) => regex.test(pathname));
const isPublicRoute = (pathname: string) => PUBLIC_PATHS.some((path) => pathname.startsWith(path));

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

/**
 * Middleware that protects routes with Supabase Auth and keeps the /api/voice rate limit.
 */
export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'test') {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (shouldBypass(pathname) || isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const isVoiceApi = pathname.startsWith('/api/voice');

  if (isVoiceApi) {
    const clientIp = getClientIp(request);
    const result = rateLimit(clientIp);
    const headers = buildRateLimitHeaders(result.limit, result.remaining, result.reset);
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));

    if (result.isLimited) {
      return NextResponse.json(
        { ok: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', details: { remaining: 0, reset: result.reset } } },
        { status: 429, headers: response.headers },
      );
    }
  }

  const supabase = createMiddlewareClient({ req: request, res: response });
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[middleware] Failed to fetch session', error);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: { code: 'SESSION_ERROR', message: 'Unable to fetch session' } },
        { status: 500, headers: response.headers },
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401, headers: response.headers },
      );
    }
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
