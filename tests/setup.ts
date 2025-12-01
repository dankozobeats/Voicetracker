import 'whatwg-fetch';
import { TextDecoder, TextEncoder } from 'util';
import { afterAll, beforeAll, vi } from 'vitest';

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
