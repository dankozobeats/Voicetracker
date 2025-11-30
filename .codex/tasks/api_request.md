# Feature Request — VoiceRecorder

## 🎯 Objectif
Créer la fonctionnalité VoiceRecorder permettant d’enregistrer une dépense vocale et de l’envoyer à l’API /api/voice pour transcription Whisper et parsing Groq.

## 🧩 Contexte projet
- Projet : VoiceTrack
- Stack : Next.js 14+, TypeScript strict, Tailwind, Supabase, Whisper API, Groq API
- Architecture : modulaire
- Validation Zod obligatoire
- Pas de code placeholder

## 🛠️ Exigences techniques

### Frontend
Créer :
- `components/VoiceRecorder.tsx`
- `hooks/useRecorder.ts`
- `app/record/page.tsx`

Fonctionnalités :
- Bouton Start / Stop Recording
- MediaRecorder API
- Timer
- Indicateur visuel (pulse)
- Envoi du blob audio via FormData

### Backend
Créer :
- `app/api/voice/route.ts`
- `lib/whisper.ts`
- `lib/groq.ts`

Pipeline :
1. Extraire audio de FormData
2. Transcrire avec Whisper
3. Parser avec Groq (JSON strict)
4. Valider avec Zod
5. Insérer dans Supabase table `expenses`
6. Retourner : `{ expense, transcription }`

### Tests
- Test du hook `useRecorder`
- Test API /api/voice (mock Whisper & Groq)
- Test insert Supabase (mock)

### Documentation
- Mise à jour README
- Mise à jour API docs
- Mise à jour CHANGELOG

## 📦 Livrables attendus
- Code complet
- Tests Vitest
- Documentation mise à jour
