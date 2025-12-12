# VoiceTrack 🎤💰

**Suivi intelligent de dépenses par reconnaissance vocale**

VoiceTrack est une application web progressive qui permet de suivre ses dépenses simplement en parlant. Plus besoin de saisir manuellement vos achats - enregistrez-les vocalement et laissez l'IA faire le reste.

## ✨ Concept

Transformez vos dépenses vocales en données structurées et analyses prédictives :

1. **Parlez** - "J'ai dépensé 25 euros au restaurant ce midi"
2. **Automatisation** - L'IA transcrit, parse et catégorise
3. **Analyse** - Visualisez vos patterns, prédictions et insights

## 🎯 Fonctionnalités

### Phase 1 - MVP
- ✅ Enregistrement vocal mobile/desktop
- ✅ Transcription automatique (Whisper)
- ✅ Parsing intelligent des dépenses (GPT)
- ✅ Stockage sécurisé (Supabase)
- ✅ Historique des dépenses

### Phase 2 - Analytics
- 📊 Dashboard visuel avec graphiques
- 🔮 Prédictions mensuelles basées sur l'historique
- 💡 Insights automatiques (patterns, anomalies)
- 🏷️ Catégorisation intelligente

### Phase 3 - Advanced
- 📱 PWA (utilisation offline)
- 🔔 Notifications & alertes budget
- 📈 Rapports mensuels automatiques
- 🤖 Suggestions d'optimisation

## 🛠️ Stack Technique

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes (serverless)
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI (Whisper + GPT-4)
- **Deployment**: Vercel
- **Auth**: Supabase Auth (à venir)

## 📦 Installation

### Prérequis
- Node.js 18+
- Compte Supabase
- Clé API OpenAI

### Setup local

```bash
# Cloner le projet
git clone https://github.com/yourusername/voicetrack.git
cd voicetrack

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
# Éditer .env.local avec vos clés

# Lancer les migrations Supabase
npm run db:migrate

# Démarrer le serveur de développement
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000)

## 🔑 Variables d'environnement

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 📱 Utilisation

1. **Enregistrer une dépense**
   - Cliquez sur le bouton microphone
   - Dites votre dépense naturellement
   - L'app parse et enregistre automatiquement

2. **Voir l'historique**
   - Dashboard avec toutes vos dépenses
   - Filtres par catégorie, date, montant

3. **Analyser vos patterns**
   - Graphiques de dépenses
   - Prédictions de fin de mois
   - Insights personnalisés

## 🎤 Enregistrement vocal (page)

La page d'enregistrement vocal est disponible à `/record`. Elle utilise la composante `components/VoiceRecorder.tsx` et le hook `hooks/useRecorder.ts` pour capturer l'audio, l'envoyer vers `/api/voice` et afficher la transcription.

## 🔌 API: /api/voice

Voir `docs/03-api-documentation.md` pour la documentation de l'endpoint qui accepte un `multipart/form-data` contenant `audio` et retourne `{ expense, transcription }`.

## 🤖 Assistant IA (VPS)

- **Proxy sécurisée** : l'endpoint `POST /api/ai-assistant` relaie vos requêtes vers `https://ai.automationpro.cloud/chat`, ce qui permet de garder la clé `x-api-key` côté serveur.
- **Payload attendu** :

```json
{
  "message": "string",
  "userId": "string" // facultatif, par défaut `AI_DEFAULT_USER_ID`
}
```

- **Réponse** : renvoie l'objet brut retourné par votre IA (champ `reply`, éventuelles `memories`, etc.).
- **Variables à configurer côté serveur** :

```env
AI_API_KEY=<# fourni par votre VPS Groq >
AI_API_URL=https://ai.automationpro.cloud
AI_DEFAULT_USER_ID=voicetrack-user
```

- **Usage client** :

```ts
const res = await fetch('/api/ai-assistant', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message, userId: supabaseUserId }),
});
const payload = await res.json();
```

> `AI_API_KEY` reste uniquement côté serveur ; toutes les requêtes du navigateur passent par l'API Next.js.

## ⚙️ Notes d'intégration & sécurité

- **Server-side inserts:** All inserts to `expenses` performed by `/api/voice` use the `SUPABASE_SERVICE_ROLE_KEY` via `getServerSupabaseClient()` (`lib/supabase.ts`). Ensure this key is kept secret and set only in Vercel/Production envs.
- **Client usage:** Client-side code should only use public keys (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## 🧪 Tests

This repository uses Vitest for unit tests. Tests mock external services (Whisper, Groq, Supabase) so they can run offline.

Run tests:

```bash
npm run test
```

If Vitest or testing utilities are not installed, add them:

```bash
npm install -D vitest @testing-library/react jsdom whatwg-fetch
```

## 🗂️ Structure du projet

```
voicetrack/
├── app/                    # Pages et API routes Next.js
├── components/             # Composants React
├── lib/                    # Utilitaires (Supabase, OpenAI, etc.)
├── hooks/                  # Custom React hooks
├── supabase/              # Migrations et seeds
└── docs/                  # Documentation technique
```

## 📚 Documentation

- [Architecture](./ARCHITECTURE.md) - Design technique détaillé
- [Roadmap](./ROADMAP.md) - Planning de développement
- [API Documentation](./docs/03-api-documentation.md)
- [Database Schema](./docs/02-schema-database.md)

## 🚀 Déploiement

### Vercel (Recommandé)

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Configurer les variables d'environnement dans Vercel Dashboard
```

### Variables à configurer dans Vercel
- Toutes les variables du `.env.example`
- Configurer le domaine custom (optionnel)

## 🧪 Tests

```bash
# Tests unitaires
npm run test

# Tests E2E
npm run test:e2e

# Coverage
npm run test:coverage
```

## 🤝 Contribution

Ce projet est personnel mais ouvert aux suggestions !

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 License

MIT License - voir [LICENSE](LICENSE)

## 👨‍💻 Auteur

**Patrick - AutomationPro**
- Business Automation Consultant
- [automationpro.cloud](https://automationpro.cloud)

## 🙏 Remerciements

- OpenAI pour Whisper et GPT
- Supabase pour l'infrastructure
- Vercel pour le hosting

---

**Version**: 0.1.0 (MVP en développement)  
**Status**: 🚧 En construction
