import 'whatwg-fetch';
import { TextDecoder, TextEncoder } from 'util';
import { afterAll, beforeAll, vi } from 'vitest';

// Default Supabase envs for tests to avoid runtime instantiation errors.
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-role-key';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key';

if (!globalThis.TextEncoder) {
	globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}

if (!globalThis.TextDecoder) {
	globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

const originalConsoleError = console.error;
const originalConsoleDebug = console.debug;

beforeAll(() => {
	console.error = vi.fn();
	console.debug = vi.fn();
});

afterAll(() => {
	console.error = originalConsoleError;
	console.debug = originalConsoleDebug;
});
