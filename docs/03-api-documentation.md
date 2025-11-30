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

Notes:
- The server uses OpenAI Whisper to transcribe audio, then a Groq/LLM parser to extract structured fields.
- The parsed object is validated with Zod (`lib/schemas/expense.ts`) before insertion into Supabase `expenses`.
