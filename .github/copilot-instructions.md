<!-- Copilot / AI agent instructions for VoiceTrack -->
# VoiceTrack — Copilot Instructions

These instructions help AI coding agents be productive immediately in this repository.

1) Big picture
- **Stack:** Next.js (app-router, v14+), TypeScript (strict), Tailwind CSS, Supabase (Postgres), OpenAI (Whisper + GPT), Groq optional.
- **Where to look:** `ARCHITECTURE.md`, `README.md`, `.codex/config.json` (agents/workflow), `.codex/agents/*.md` for local agent rules.

2) Project layout & conventions
- **Source folders:** `app/` (pages + `app/api/*` routes), `lib/` (clients & helpers like `lib/openai/*`, `lib/supabase`), `components/`, `hooks/`, `supabase/` (migrations/seeds), `docs/`.
- **Type rules:** TypeScript strict; always export/use explicit types. Prefer small, well-typed interfaces in `lib/types` or next to the module.
- **Validation:** Use Zod for input validation on API routes and client forms (core agent enforces this).
- **Error handling:** Always check and handle Supabase `error` objects — never ignore returned errors.
- **UI:** Tailwind utility classes; components must be small and reusable (no dumping everything in a page).

3) API & data flow patterns (examples)
- **Voice pipeline:** `app/api/voice` → `lib/openai/whisper.ts` (transcribe) → `lib/openai/parser.ts` (GPT parse) → Supabase insert. Follow the pipeline in `ARCHITECTURE.md`.
- **API rules:** API routes live under `app/api/*`. Always:
  - validate `req` (Zod),
  - type inputs/outputs, and
  - return structured errors (JSON with `error` + status codes).
- **DB:** See `ARCHITECTURE.md` for `expenses`, `categories`, `monthly_insights` schemas and indices — follow column names and constraints (e.g., `amount > 0`).

4) Build / test / dev commands (from README)
- Install: `npm install`.
- Dev server: `npm run dev` (app on http://localhost:3000).
- DB migrations: `npm run db:migrate` (project uses Supabase migrations under `supabase/`).
- Tests: `npm run test`, `npm run test:e2e`, `npm run test:coverage`.

5) Agent-specific constraints (pulled from `.codex/agents`)
- **No placeholders:** Generated code must be complete; avoid TODOs or stub returns.
- **Outputs:** Prefer full file content (not partial fragments) when creating new modules.
- **Documentation:** Update `README.md`, `docs/` and API docs when adding endpoints or changing public behavior (agent `scribe` role).

6) Security & infra notes
- Protect secrets in `.env.local` — required vars in `README.md` (Supabase keys, `OPENAI_API_KEY`, `GROQ_API_KEY`).
- Supabase uses Row Level Security (RLS) — follow the policies in `ARCHITECTURE.md` when writing DB access logic.
- Rate limiting middleware is present (see example in ARCHITECTURE) — reuse pattern when adding heavy endpoints.

7) Patterns to follow when coding
- Keep server logic in `app/api/*` or `lib/*` (pure functions) so it can be unit-tested.
- Write Vitest unit tests for parsing functions (`lib/openai/parser.ts`) and database helpers; the `analyst` agent expects tests for generated code.
- For voice UX, use a `VoiceRecorder` component + `useVoiceRecorder` hook pattern and keep upload/processing decoupled.

8) Helpful file references (start here)
- `.codex/config.json` — repo AI workflow and agent roles.
- `.codex/agents/core.md` — strict code rules (Zod, types, no placeholders).
- `ARCHITECTURE.md` — canonical architecture, endpoints, and schema.
- `README.md` — install/test/deploy commands.
- `supabase/` — migrations & seeds.

9) When in doubt
- Prefer explicit types and small functions.
- Add or update tests for any non-trivial logic you add.
- If a change touches API shapes or DB, update `docs/03-api-documentation.md`, `README.md`, and `ARCHITECTURE.md` accordingly.

— End —

If any section is unclear or you want me to include direct code snippets/examples (Zod schemas, example API route, or test template), tell me which part to expand.
