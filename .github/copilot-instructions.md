<!-- Copilot / AI agent instructions for VoiceTracker -->
# VoiceTracker — Copilot Instructions

These instructions help AI coding agents be productive immediately in this repository.

## 1) Big picture
- **Stack:** Next.js 15 (app-router), TypeScript (strict), Tailwind CSS, Supabase (Postgres), OpenAI Whisper, Groq for parsing
- **Core function:** Voice expense tracking - record audio → transcribe → parse → store structured expenses
- **Key references:** `ARCHITECTURE.md`, `README.md`, `.codex/config.json` (agent workflow), `.codex/agents/*.md` (coding rules)

## 2) Project layout & actual structure
- **`app/`** - Next.js pages (`page.tsx`, `record/page.tsx`) + API routes (`app/api/voice/route.ts`)
- **`lib/`** - Core services: `whisper.ts`, `groq.ts`, `supabase.ts`, `schemas.ts`, `rateLimit.ts`
- **`components/`** - React components (`VoiceRecorder.tsx`, `AudioModal.tsx`)
- **`hooks/`** - Custom hooks (`useRecorder.ts`)
- **`tests/`** - Vitest unit tests with mocked external services

## 3) Critical patterns & conventions
- **TypeScript:** Strict mode enforced, explicit types required, no `any`
- **Validation:** Zod schemas in `lib/schemas.ts` - `groqExpenseSchema`, `expenseInsertSchema`, `apiResponseSchema`
- **Error handling:** Always handle Supabase `{ data, error }` pattern - never ignore `error` objects
- **API structure:** All routes return `{ error: { message, details } }` on failure with proper HTTP status codes
- **Rate limiting:** In-memory rate limiter pattern in `lib/rateLimit.ts`, applied to `/api/voice`

## 4) Voice pipeline implementation
- **Flow:** Audio → `lib/whisper.ts` (OpenAI transcription) → `lib/groq.ts` (expense parsing) → Supabase insert
- **API endpoint:** `app/api/voice/route.ts` accepts `multipart/form-data` with audio file
- **Schema validation:** All parsed expenses validated against `groqExpenseSchema` before DB insert
- **Client pattern:** `VoiceRecorder` component + `useRecorder` hook handles recording/upload flow

## 5) Essential dev workflows
- **Install:** `npm install`
- **Dev server:** `npm run dev` (Next.js on http://localhost:3000)
- **Testing:** `npm run test` (Vitest), `npm run test:coverage` - tests mock external APIs
- **Test setup:** Uses jsdom environment, globals enabled, `tests/setup.ts` mocks console methods

## 6) Database & authentication patterns
- **Supabase clients:** Use `getServerSupabaseClient()` for API routes (service role), `getPublicSupabaseClient()` for client-side
- **Environment variables:** Critical - `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_*`, `OPENAI_API_KEY`, `GROQ_API_KEY`
- **Schema enforcement:** Categories are constrained to `['restaurant', 'courses', 'transport', 'loisirs', 'santé', 'shopping', 'autre']`

## 7) Testing & quality patterns
- **External service mocking:** All tests mock OpenAI/Groq/Supabase calls - no real API calls in tests
- **Vitest config:** Uses `@` alias for root imports, jsdom environment, test files in `tests/` only
- **Agent rules:** `.codex/agents/core.md` enforces no placeholders, complete code, strict typing

## 8) Key file patterns to follow
- **API routes:** Follow `app/api/voice/route.ts` pattern - rate limiting, Zod validation, structured errors
- **Schemas:** Define in `lib/schemas.ts` with preprocessing transforms (trim, number parsing)
- **Hooks:** Follow `useRecorder.ts` pattern - typed state management, async operations, debug logging
- **Components:** Client-side only (`"use client"`), use hooks for logic, minimal prop interfaces

## 9) Common gotchas & specific rules
- **No `lib/openai/` folder** - OpenAI integration is in `lib/whisper.ts` directly
- **Groq not OpenAI** for parsing - use `lib/groq.ts` for expense parsing, not GPT
- **Rate limiting** - In-memory implementation in `lib/rateLimit.ts`, not external service
- **File uploads** - Audio files validated for type/size in API route before processing

When adding features, always update tests and follow the existing Zod schema patterns. Check `.codex/agents/core.md` for strict coding standards.
