# Architecture Technique - VoiceTrack

## 📐 Vue d'ensemble

VoiceTrack est une application web progressive (PWA) basée sur une architecture serverless moderne, optimisée pour la capture vocale et l'analyse intelligente des dépenses.

## 🏗️ Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Browser/PWA)                     │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │  VoiceRecorder  │  │  Dashboard   │  │   Analytics    │ │
│  └────────┬────────┘  └──────┬───────┘  └────────┬───────┘ │
└───────────┼───────────────────┼──────────────────┼─────────┘
            │                   │                  │
            ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js API Routes (Vercel Edge)               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ /api/voice   │  │ /api/expense │  │ /api/analytics   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼──────────────────┼──────────────────┼────────────┘
          │                  │                  │
          ▼                  │                  │
┌─────────────────────┐      │                  │
│   OpenAI API        │      │                  │
│  ┌───────────────┐  │      │                  │
│  │ Whisper API   │◄─┘      │                  │
│  │ (Speech2Text) │          │                  │
│  └───────┬───────┘          │                  │
│          ▼                  │                  │
│  ┌───────────────┐          │                  │
│  │   GPT-4 API   │◄─────────┘                  │
│  │  (Parsing +   │◄────────────────────────────┘
│  │   Analysis)   │
│  └───────┬───────┘
└──────────┼──────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase (Backend)                          │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │   PostgreSQL     │  │   Auth Service   │                 │
│  │   (Database)     │  │   (Future)       │                 │
│  └──────────────────┘  └──────────────────┘                 │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Flux de données principal

### 1. Capture vocale → Enregistrement

```typescript
User speaks
    ↓
VoiceRecorder component (React)
    ↓ (MediaRecorder API)
Audio blob (WebM/MP4)
    ↓ (FormData)
POST /api/voice
```

### 2. Transcription → Parsing

```typescript
POST /api/voice
    ↓
OpenAI Whisper API
    ↓ (French audio → text)
"J'ai dépensé 25 euros au restaurant ce midi"
    ↓
OpenAI GPT-4 (structured output)
    ↓
{
  amount: 25,
  category: "restaurant",
  date: "2025-11-30T12:00:00Z",
  description: "Restaurant midi",
  confidence: 0.95
}
    ↓
Supabase INSERT
    ↓
Response 201 Created
```

### 3. Analyse → Prédictions

```typescript
GET /api/analytics/predict
    ↓
Supabase: SELECT last 3 months
    ↓
GPT-4 Analysis
    ↓ (Pattern recognition)
{
  predictedTotal: 1250,
  categoryBreakdown: {...},
  insights: ["You spend 30% more on weekends"],
  alerts: ["Restaurant spending up 15%"]
}
```

## 💾 Schéma de données

### Table: `expenses`

```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- Données principales
  amount DECIMAL(10,2) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  
  -- Métadonnées
  expense_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- AI context
  raw_transcription TEXT,
  confidence_score DECIMAL(3,2),
  
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT positive_amount CHECK (amount > 0)
);

-- Index pour performance
CREATE INDEX idx_expenses_user_date ON expenses(user_id, expense_date DESC);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_created ON expenses(created_at DESC);
```

### Table: `categories`

```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  icon VARCHAR(50),
  color VARCHAR(7),
  budget_limit DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catégories par défaut
INSERT INTO categories (name, icon, color) VALUES
  ('restaurant', '🍽️', '#FF6B6B'),
  ('courses', '🛒', '#4ECDC4'),
  ('transport', '🚗', '#45B7D1'),
  ('loisirs', '🎮', '#96CEB4'),
  ('santé', '💊', '#FFEAA7'),
  ('shopping', '🛍️', '#DFE6E9'),
  ('autre', '📦', '#B2BEC3');
```

### Table: `monthly_insights` (Cache)

```sql
CREATE TABLE monthly_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  month DATE NOT NULL,
  
  total_spent DECIMAL(10,2),
  category_breakdown JSONB,
  predictions JSONB,
  insights JSONB,
  
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, month)
);
```

## 🔌 API Endpoints

### Voice Recording

```typescript
POST /api/voice
Content-Type: multipart/form-data

Request:
{
  audio: File (WebM/MP4/WAV)
}

Response: 201 Created
{
  expense: {
    id: "uuid",
    amount: 25.00,
    category: "restaurant",
    description: "Restaurant midi",
    expense_date: "2025-11-30T12:00:00Z",
    confidence_score: 0.95
  },
  transcription: "J'ai dépensé 25 euros au restaurant ce midi"
}
```

### Expense CRUD

```typescript
// Create
POST /api/expense
{
  amount: 25.00,
  category: "restaurant",
  description: "Optional",
  expense_date: "2025-11-30"
}

// Read all
GET /api/expense?from=2025-11-01&to=2025-11-30&category=restaurant

// Read one
GET /api/expense/[id]

// Update
PUT /api/expense/[id]
{
  amount: 30.00,
  category: "restaurant"
}

// Delete (soft)
DELETE /api/expense/[id]
```

### Analytics

```typescript
// Predictions
GET /api/analytics/predict?month=2025-12

Response:
{
  currentMonth: {
    total: 450,
    daysElapsed: 15,
    daysRemaining: 15
  },
  prediction: {
    estimatedTotal: 900,
    confidence: 0.87,
    trend: "stable"
  },
  breakdown: {
    restaurant: { spent: 150, predicted: 300 },
    courses: { spent: 200, predicted: 400 }
  }
}

// Insights
GET /api/analytics/insights?period=3months

Response:
{
  patterns: [
    "Vous dépensez 30% de plus les week-ends",
    "Vos courses sont moins chères le mardi"
  ],
  anomalies: [
    "Dépenses restaurant +45% ce mois"
  ],
  recommendations: [
    "Budget restaurant suggéré: 250€/mois"
  ]
}
```

## 🧠 Intelligence Artificielle

### Whisper (Transcription)

```typescript
// lib/openai/whisper.ts
async function transcribeAudio(audioFile: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', 'whisper-1');
  formData.append('language', 'fr');
  
  const response = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'fr'
  });
  
  return response.text;
}
```

### GPT-4 (Parsing)

```typescript
// lib/openai/parser.ts
async function parseExpense(transcription: string): Promise<ExpenseData> {
  const prompt = `
Tu es un assistant qui parse des dépenses vocales en français.
Extrait les informations suivantes du texte:

Texte: "${transcription}"

Renvoie UNIQUEMENT un JSON valide avec:
{
  "amount": number (montant en euros),
  "category": string (restaurant|courses|transport|loisirs|santé|shopping|autre),
  "description": string (description courte),
  "expense_date": ISO date string,
  "confidence": number (0-1, confiance dans le parsing)
}

Si une info manque, utilise des valeurs par défaut intelligentes.
Date par défaut: aujourd'hui.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

### GPT-4 (Analytics)

```typescript
// lib/openai/analytics.ts
async function generateInsights(expenses: Expense[]): Promise<Insights> {
  const prompt = `
Analyse ces dépenses et génère des insights:
${JSON.stringify(expenses)}

Renvoie un JSON avec:
- patterns: liste de patterns détectés
- anomalies: dépenses inhabituelles
- recommendations: suggestions d'optimisation
- predictions: prédictions pour le mois suivant
`;

  // Similar GPT-4 call with structured output
}
```

## 🔐 Sécurité

### Row Level Security (Supabase)

```sql
-- Les users ne voient que leurs propres dépenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own expenses"
  ON expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own expenses"
  ON expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own expenses"
  ON expenses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own expenses"
  ON expenses FOR DELETE
  USING (auth.uid() = user_id);
```

### API Protection

```typescript
// Middleware pour rate limiting
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 req/min
});

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for');
  const { success } = await ratelimit.limit(ip);
  
  if (!success) {
    return new Response('Too many requests', { status: 429 });
  }
  
  // Process request...
}
```

## 📱 Progressive Web App (PWA)

### Service Worker Strategy

- **Audio recording**: Cache-first (offline capability)
- **API calls**: Network-first with fallback
- **Static assets**: Cache-first with network fallback

```typescript
// public/sw.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    // Network first for API
    event.respondWith(networkFirst(event.request));
  } else {
    // Cache first for assets
    event.respondWith(cacheFirst(event.request));
  }
});
```

## 🚀 Performance

### Optimisations

1. **Edge Functions** - API routes déployées sur Vercel Edge
2. **Caching** - Monthly insights cachés dans Supabase
3. **Lazy Loading** - Components chargés à la demande
4. **Image Optimization** - Next.js Image component
5. **Audio Compression** - Compression avant upload

### Monitoring

- Vercel Analytics pour les métriques web
- Supabase logs pour les erreurs DB
- OpenAI usage tracking pour les coûts

## 📊 Coûts estimés

| Service | Usage mensuel | Coût |
|---------|---------------|------|
| Vercel | Hobby tier | $0 |
| Supabase | Free tier | $0 |
| OpenAI Whisper | ~100 recordings/mois | ~$1 |
| OpenAI GPT-4 | ~300 calls/mois | ~$5 |
| **Total** | | **~$6/mois** |

## 🔄 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
Push to main
  ↓
GitHub Actions
  ↓
├─ Run tests
├─ Type check
├─ Lint
└─ Build
  ↓
Vercel Auto-deploy
  ↓
Production live
```

## 📈 Scalabilité

### Vertical (Court terme)
- Supabase peut gérer 100k+ dépenses facilement
- Vercel Edge scale automatiquement

### Horizontal (Long terme)
- Sharding par user_id si nécessaire
- CDN pour assets statiques
- Queue system (BullMQ) pour analytics lourds

---

**Version**: 1.0  
**Dernière mise à jour**: 30 novembre 2025  
**Auteur**: Patrick - AutomationPro
