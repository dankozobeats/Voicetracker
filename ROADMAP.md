# Roadmap - VoiceTrack

**Planning de développement sur 8 semaines**

## 📅 Vue d'ensemble

| Phase | Durée | Objectif | Status |
|-------|-------|----------|--------|
| Phase 0 | 1-2 jours | Setup & Configuration | 🔄 En cours |
| Phase 1 | Semaine 1-2 | MVP Foundation | ⏳ À venir |
| Phase 2 | Semaine 3-4 | Core Features | ⏳ À venir |
| Phase 3 | Semaine 5-6 | Analytics & AI | ⏳ À venir |
| Phase 4 | Semaine 7-8 | Polish & Deploy | ⏳ À venir |

---

## 🚀 Phase 0: Setup & Configuration (1-2 jours)

**Objectif**: Mettre en place l'infrastructure de base

### Tasks

- [x] Créer documentation projet (README, ARCHITECTURE, ROADMAP)
- [ ] Initialiser projet Next.js 15 avec TypeScript
  ```bash
  npx create-next-app@latest voicetrack --typescript --tailwind --app
  ```
- [ ] Configurer Supabase project
  - [ ] Créer projet sur supabase.com
  - [ ] Noter les clés API
  - [ ] Configurer Supabase CLI localement
- [ ] Configurer OpenAI API
  - [ ] Créer compte OpenAI
  - [ ] Générer API key
  - [ ] Tester Whisper API en isolation
- [ ] Setup environnement
  - [ ] Créer `.env.local` avec toutes les clés
  - [ ] Configurer `.gitignore`
  - [ ] Setup ESLint + Prettier
- [ ] Premier commit
  ```bash
  git init
  git add .
  git commit -m "Initial setup: Next.js + config"
  ```

### Livrables
- ✅ Projet Next.js fonctionnel localement
- ✅ Connexion Supabase établie
- ✅ OpenAI API testée et validée
- ✅ Documentation complète

---

## 🏗️ Phase 1: MVP Foundation (Semaines 1-2)

**Objectif**: Enregistrement vocal → Sauvegarde DB (sans parsing intelligent)

### Semaine 1: Database & API basique

**Jour 1-2: Schema Database**
- [ ] Créer migration Supabase initiale
  ```sql
  -- supabase/migrations/001_initial_schema.sql
  CREATE TABLE expenses (...)
  CREATE TABLE categories (...)
  ```
- [ ] Tester migrations localement
- [ ] Seed data pour catégories
- [ ] Valider connexion Next.js ↔ Supabase

**Jour 3-4: API Routes basiques**
- [ ] `POST /api/expense` - Créer dépense manuelle
  ```typescript
  // Test sans vocal d'abord
  { amount: 25, category: "restaurant", date: "2025-11-30" }
  ```
- [ ] `GET /api/expense` - Lister dépenses
- [ ] `GET /api/expense/[id]` - Détail dépense
- [ ] `PUT /api/expense/[id]` - Modifier dépense
- [ ] `DELETE /api/expense/[id]` - Supprimer (soft delete)

**Jour 5: Tests & Validation**
- [ ] Tester tous les endpoints avec Postman/Thunder Client
- [ ] Validation TypeScript complète
- [ ] Gestion d'erreurs robuste

### Semaine 2: Interface utilisateur basique

**Jour 1-2: Layout & Navigation**
- [ ] Créer `app/layout.tsx` avec navigation
- [ ] Page d'accueil simple (`app/page.tsx`)
- [ ] Page historique (`app/history/page.tsx`)
- [ ] Configuration Tailwind CSS

**Jour 3-4: Formulaire manuel**
- [ ] Composant `ExpenseForm`
  - Input montant
  - Select catégorie
  - Textarea description
  - Date picker
- [ ] Validation Zod
- [ ] Submit → API → Refresh list

**Jour 5: Liste des dépenses**
- [ ] Composant `ExpenseList`
- [ ] Composant `ExpenseCard`
- [ ] Filtres basiques (date, catégorie)
- [ ] Pagination simple

### Livrables Phase 1
- ✅ CRUD complet fonctionnel
- ✅ Interface pour saisie manuelle
- ✅ Liste/affichage des dépenses
- ✅ Base solide pour Phase 2

**Démo**: Pouvoir créer, lire, modifier, supprimer des dépenses manuellement.

---

## 🎤 Phase 2: Core Features (Semaines 3-4)

**Objectif**: Ajouter l'enregistrement vocal + parsing intelligent

### Semaine 3: Enregistrement vocal

**Jour 1-2: VoiceRecorder Component**
- [ ] Composant `VoiceRecorder.tsx`
  - [ ] Bouton record/stop
  - [ ] Visualisation audio (waveform basique)
  - [ ] Timer d'enregistrement
  - [ ] MediaRecorder API setup
- [ ] Hook `useVoiceRecorder`
  ```typescript
  const { startRecording, stopRecording, audioBlob, isRecording } = useVoiceRecorder();
  ```
- [ ] Gestion permissions microphone
- [ ] Tests sur mobile (responsive)

**Jour 3: Upload audio**
- [ ] Compression audio avant upload
- [ ] `POST /api/voice` endpoint
  - [ ] Recevoir FormData avec audio
  - [ ] Valider format (WebM, MP4, WAV)
  - [ ] Limite de taille (5MB max)
- [ ] Loading states + error handling

**Jour 4-5: Intégration Whisper**
- [ ] Fonction `transcribeAudio()` dans `lib/openai/whisper.ts`
- [ ] Test avec phrases simples
  - "Vingt-cinq euros restaurant"
  - "J'ai dépensé 15,50 au supermarché"
- [ ] Afficher transcription à l'utilisateur
- [ ] Correction manuelle possible

### Semaine 4: Parsing intelligent GPT

**Jour 1-2: Parser GPT**
- [ ] Fonction `parseExpense()` dans `lib/openai/parser.ts`
- [ ] Prompt engineering pour extraction
  ```
  Input: "J'ai dépensé 25 euros au resto hier soir"
  Output: {
    amount: 25,
    category: "restaurant",
    expense_date: "2025-11-29T19:00:00Z",
    description: "Restaurant soir"
  }
  ```
- [ ] Gestion des cas edge:
  - Montants multiples
  - Dates relatives ("hier", "ce matin", "mardi dernier")
  - Catégories ambiguës
- [ ] Score de confiance

**Jour 3: Intégration complète**
- [ ] Pipeline vocal complet:
  ```
  Audio → Whisper → Texte → GPT → Structured Data → Supabase
  ```
- [ ] Feedback utilisateur à chaque étape
- [ ] Possibilité de corriger avant save

**Jour 4-5: UX Polish**
- [ ] Page dédiée `/record`
- [ ] Animations micro (pulse pendant recording)
- [ ] Feedback visuel clair
- [ ] Confirmation avant sauvegarde
- [ ] Toast notifications

### Livrables Phase 2
- ✅ Enregistrement vocal fonctionnel
- ✅ Transcription Whisper intégrée
- ✅ Parsing GPT intelligent
- ✅ Pipeline end-to-end opérationnel

**Démo**: Parler dans le micro → Dépense enregistrée automatiquement.

---

## 📊 Phase 3: Analytics & AI (Semaines 5-6)

**Objectif**: Dashboard, graphiques, prédictions, insights

### Semaine 5: Dashboard & Visualisations

**Jour 1-2: Dashboard Layout**
- [ ] Page `/analytics`
- [ ] Cards métriques:
  - Total du mois
  - Dépense moyenne/jour
  - Catégorie #1
  - Comparaison vs mois dernier
- [ ] Grid layout responsive

**Jour 3-4: Graphiques**
- [ ] Setup Chart.js ou Recharts
- [ ] Graphique 1: Dépenses par jour (line chart)
- [ ] Graphique 2: Répartition catégories (pie chart)
- [ ] Graphique 3: Évolution mensuelle (bar chart)
- [ ] Filtres temporels (semaine, mois, 3 mois)

**Jour 5: Statistiques**
- [ ] Calculs côté serveur:
  - Moyenne par catégorie
  - Jour de la semaine le plus cher
  - Tendances (+/- vs période précédente)
- [ ] Cache dans `monthly_insights` table

### Semaine 6: Prédictions & Insights

**Jour 1-2: Prédictions mensuelles**
- [ ] `GET /api/analytics/predict`
- [ ] Logique de prédiction:
  ```typescript
  // Basé sur historique 3 derniers mois
  predictedTotal = (currentSpending / daysElapsed) * totalDaysInMonth
  ```
- [ ] Prédiction par catégorie
- [ ] Widget "Projection fin de mois"

**Jour 3-4: AI Insights avec GPT**
- [ ] `GET /api/analytics/insights`
- [ ] Prompt GPT pour générer insights:
  ```
  Analyse historique → Patterns détectés
  Exemple: "Vous dépensez 30% de plus le week-end"
  ```
- [ ] Détection anomalies
  - Dépense inhabituelle (> 2σ)
  - Catégorie en hausse significative
- [ ] Recommandations budget

**Jour 5: Alerts & Notifications**
- [ ] Système d'alertes basique
  - Budget mensuel dépassé
  - Dépense inhabituelle détectée
  - Prédiction > objectif
- [ ] Affichage dans dashboard
- [ ] (Bonus: Email notifications)

### Livrables Phase 3
- ✅ Dashboard visuel complet
- ✅ Graphiques interactifs
- ✅ Prédictions mensuelles
- ✅ Insights AI personnalisés
- ✅ Système d'alertes

**Démo**: Dashboard qui montre patterns, prédit le futur, et donne des conseils.

---

## 🎨 Phase 4: Polish & Deploy (Semaines 7-8)

**Objectif**: PWA, optimisations, déploiement production

### Semaine 7: PWA & Optimisations

**Jour 1-2: Progressive Web App**
- [ ] Configuration `next.config.js` pour PWA
  ```typescript
  const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true
  });
  ```
- [ ] Service Worker
- [ ] `manifest.json` avec icons
- [ ] Offline fallback page
- [ ] Test installation mobile

**Jour 3: Performance**
- [ ] Lazy loading components
- [ ] Image optimization
- [ ] Code splitting
- [ ] Bundle analysis
- [ ] Lighthouse audit → Score 90+

**Jour 4-5: UX Polish**
- [ ] Animations Framer Motion
- [ ] Loading skeletons
- [ ] Error boundaries
- [ ] 404 page custom
- [ ] Onboarding flow (first time user)

### Semaine 8: Tests & Déploiement

**Jour 1-2: Tests**
- [ ] Tests unitaires (Vitest)
  - Parsing functions
  - Utility functions
  - API helpers
- [ ] Tests d'intégration
  - API endpoints
  - Database operations
- [ ] Tests E2E (Playwright)
  - Flow complet: record → save → view
- [ ] Coverage > 70%

**Jour 3: Déploiement Vercel**
- [ ] Connecter repo GitHub
- [ ] Configurer variables d'env Vercel
- [ ] Premier deploy
- [ ] Tester en production
- [ ] Setup domaine custom (optionnel)

**Jour 4: Monitoring & Analytics**
- [ ] Vercel Analytics activé
- [ ] Error tracking (Sentry optionnel)
- [ ] Usage tracking OpenAI
- [ ] Database monitoring Supabase

**Jour 5: Documentation finale**
- [ ] README à jour avec screenshots
- [ ] Guide utilisateur
- [ ] API documentation complète
- [ ] Vidéo démo (optionnel)

### Livrables Phase 4
- ✅ PWA installable
- ✅ Performance optimisée
- ✅ Tests coverage > 70%
- ✅ Déployé en production
- ✅ Monitoring actif
- ✅ Documentation complète

**Démo**: App production-ready utilisable sur mobile et desktop.

---

## 🎯 Post-Launch (Phase 5+)

### Features futures (backlog)

**Auth & Multi-user**
- [ ] Supabase Auth integration
- [ ] User profiles
- [ ] Settings page

**Advanced Analytics**
- [ ] Export CSV/PDF
- [ ] Rapports mensuels automatiques par email
- [ ] Comparaisons avec moyennes nationales
- [ ] Objectifs et budgets personnalisés

**Intégrations**
- [ ] Import transactions bancaires (CSV)
- [ ] API Bridge/Plaid pour sync auto
- [ ] Export vers Google Sheets
- [ ] Webhooks pour autres apps

**AI Améliorations**
- [ ] Multi-langue (Whisper supporte 50+ langues)
- [ ] Voice commands ("Montre-moi mes dépenses du mois")
- [ ] Chatbot pour questions sur budget
- [ ] OCR pour scan de tickets

**Mobile Native**
- [ ] React Native app
- [ ] Widget iOS/Android
- [ ] Notifications push natives

---

## 📊 Métriques de succès

### MVP Success (Fin Phase 2)
- ✅ 10 dépenses enregistrées vocalement sans erreur
- ✅ Précision parsing > 90%
- ✅ Temps moyen enregistrement < 5 secondes

### Production Ready (Fin Phase 4)
- ✅ Lighthouse score > 90
- ✅ Tests coverage > 70%
- ✅ Zéro erreurs critiques en prod
- ✅ Temps de réponse API < 2s

### Long terme (3 mois post-launch)
- 🎯 100+ dépenses trackées
- 🎯 Utilisation quotidienne
- 🎯 Insights AI pertinents
- 🎯 Économies réelles identifiées

---

## 🔄 Processus de développement

### Daily workflow
1. **Morning**: Review roadmap, pick tasks
2. **Dev**: Focus time (Pomodoro 2h)
3. **Test**: Valider features
4. **Commit**: Push code + update roadmap
5. **Evening**: Quick demo/review

### Weekly review
- ✅ Check completed tasks
- 📊 Update progress
- 🐛 Log issues/blockers
- 🎯 Plan next week

### Best practices
- Commit souvent (atomic commits)
- Tester avant push
- Documentation à jour
- User-first mindset

---

## 🚨 Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Coûts OpenAI trop élevés | Moyen | Caching, rate limiting, quotas |
| Parsing imprécis | Élevé | Validation manuelle, feedback loop |
| Performance mobile | Moyen | Compression audio, lazy loading |
| Complexité scope | Élevé | MVP first, features incrémentales |

---

**Version**: 1.0  
**Dernière mise à jour**: 30 novembre 2025  
**Auteur**: Patrick - AutomationPro

**Notes**: Ce roadmap est un guide, pas un contrat. Ajuste selon tes découvertes et contraintes réelles. L'important est d'itérer vite et d'avoir un MVP fonctionnel rapidement.

🚀 **Let's build this!**
