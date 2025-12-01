# API Documentation — VoiceTrack

## POST /api/voice

- Description: Upload an audio file (multipart/form-data) to create an expense via the voice pipeline.
- Request: `multipart/form-data` with field `audio` (WebM/MP4/WAV)
- Response 201:

```json
{
  "expense": { /* row inserted into `expenses` */ },
  "transcription": "J'ai dépensé 25 euros au restaurant"
}
```

- Errors: 400 for missing audio, 500 for transcription/parse/insert errors.

Errors:
- 400: missing audio
- 422: validation failed (Zod) — response includes `details` array with field errors
- 500: internal error (transcription, parsing, or DB insertion)

Notes:
- Server-side insertion uses a SUPABASE_SERVICE_ROLE_KEY via `getServerSupabaseClient()` (see `lib/supabase.ts`).
- Whisper: `lib/whisper.ts` calls OpenAI's transcriptions endpoint and returns plain text.
- Groq: `lib/groq.ts` calls configured `GROQ_API_URL` and expects STRICT JSON; response is validated with Zod.
- Validation: `lib/schemas.ts` contains the canonical Zod schema used server-side.
