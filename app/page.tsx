import {
  Mic,
  Zap,
  Shield,
  BarChart3,
  ArrowRight,
  CheckCircle,
  Github,
  Twitter,
  Sparkles,
  Play,
} from 'lucide-react'
import AudioModal from '@/components/AudioModal'

/**
 * Homepage SaaS Premium - Redesign complet niveau produit professionnel
 * Style Linear / Raycast / Vercel avec dark mode natif et micro-animations
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 overflow-hidden">
      {/* Navigation Premium */}
      <nav className="relative z-50 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 p-2">
                  <Mic className="h-6 w-6 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  VoiceTracker
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a
                href="#features"
                className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
              >
                Fonctionnalités
              </a>
              <a
                href="#pipeline"
                className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
              >
                Pipeline
              </a>
              <a
                href="#demo"
                className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
              >
                Démo
              </a>
              <a
                href="/record"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-2 text-sm font-semibold text-white shadow-xl transition-all hover:scale-105 hover:shadow-indigo-500/25 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
              >
                <Mic className="mr-2 h-4 w-4" />
                Commencer
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section Ultra Premium */}
      <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-40">
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950/30 to-violet-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(139,92,246,0.1),transparent_50%)]" />

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge Premium */}
            <div className="mb-8 inline-flex items-center rounded-full border border-indigo-500/20 bg-indigo-500/10 px-6 py-3 text-sm font-medium text-indigo-300 backdrop-blur-sm">
              <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
              IA + Vocal + Analytics
              <ArrowRight className="ml-2 h-4 w-4" />
            </div>

            {/* Titre Hero */}
            <h1 className="mb-8 text-6xl font-bold tracking-tight text-white sm:text-8xl lg:text-9xl">
              <span className="block bg-gradient-to-r from-white via-slate-200 to-indigo-400 bg-clip-text text-transparent animate-gradient">
                Dépenses Vocales
              </span>
              <span className="block text-5xl sm:text-7xl lg:text-8xl mt-4 text-slate-300">
                Intelligentes
              </span>
            </h1>

            {/* Sous-titre */}
            <p className="mx-auto mb-12 max-w-3xl text-xl leading-relaxed text-slate-400 sm:text-2xl">
              Transforme ta voix en données financières structurées.
              <span className="text-indigo-400 font-semibold"> Transcription IA</span> •
              <span className="text-violet-400 font-semibold"> Parsing intelligent</span> •
              <span className="text-emerald-400 font-semibold"> Analytics temps réel</span>
            </p>

            {/* CTA Hero */}
            <div className="flex flex-col gap-6 sm:flex-row sm:justify-center mb-16">
              <a
                href="#demo"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-10 py-4 text-lg font-semibold text-white shadow-2xl transition-all hover:scale-105 hover:shadow-indigo-500/25 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 group"
              >
                <Play className="mr-3 h-6 w-6 transition-transform group-hover:scale-110" />
                Voir la démo
              </a>
              <a
                href="/record"
                className="inline-flex items-center justify-center rounded-full border border-slate-600 bg-slate-800/50 backdrop-blur-sm px-10 py-4 text-lg font-medium text-slate-200 transition-all hover:bg-slate-700/50 hover:border-slate-500 group"
              >
                <Mic className="mr-3 h-6 w-6 transition-transform group-hover:rotate-12" />
                Commencer maintenant
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </a>
            </div>

            {/* Stats */}
            <div className="mx-auto max-w-2xl">
              <div className="rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 p-8 grid grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white mb-2">99%</div>
                  <div className="text-sm text-slate-400">Précision IA</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-white mb-2">&lt;2s</div>
                  <div className="text-sm text-slate-400">Traitement</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-white mb-2">7</div>
                  <div className="text-sm text-slate-400">Catégories</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-6">
              Technologie de{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                pointe
              </span>
            </h2>
            <p className="text-xl text-slate-400">
              Une pipeline complète pour transformer ta voix en insights financiers
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Feature 1 */}
            <div className="rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 group hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 hover:bg-white/10 hover:border-white/20">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-600/30 group-hover:from-indigo-400/30 group-hover:to-indigo-500/40 transition-all duration-300">
                <Mic className="h-8 w-8 text-indigo-400 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-indigo-300 transition-colors">
                Transcription IA
              </h3>
              <p className="text-slate-400 leading-relaxed mb-6">
                OpenAI Whisper pour une reconnaissance vocale ultra-précise en français.
                Support de tous les accents et environnements bruyants.
              </p>
              <div className="flex items-center text-indigo-400 text-sm font-medium">
                <CheckCircle className="mr-2 h-4 w-4" />
                Précision 99%+
              </div>
            </div>

            {/* Feature 2 */}
            <div className="rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 group hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-violet-500/10 hover:bg-white/10 hover:border-white/20">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/30 group-hover:from-violet-400/30 group-hover:to-violet-500/40 transition-all duration-300">
                <BarChart3 className="h-8 w-8 text-violet-400 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-violet-300 transition-colors">
                Parsing Intelligent
              </h3>
              <p className="text-slate-400 leading-relaxed mb-6">
                Groq LLM pour extraire montants, catégories et contexte.
                Catégorisation automatique selon tes habitudes.
              </p>
              <div className="flex items-center text-violet-400 text-sm font-medium">
                <CheckCircle className="mr-2 h-4 w-4" />
                7 catégories intelligentes
              </div>
            </div>

            {/* Feature 3 */}
            <div className="rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 group hover:scale-105 transition-all duration-300 hover:shadow-2xl hover:shadow-emerald-500/10 hover:bg-white/10 hover:border-white/20">
              <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/30 group-hover:from-emerald-400/30 group-hover:to-emerald-500/40 transition-all duration-300">
                <Shield className="h-8 w-8 text-emerald-400 group-hover:scale-110 transition-transform duration-300" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-emerald-300 transition-colors">
                Stockage Sécurisé
              </h3>
              <p className="text-slate-400 leading-relaxed mb-6">
                Supabase PostgreSQL avec validation Zod stricte et rate limiting
                pour protéger tes données financières.
              </p>
              <div className="flex items-center text-emerald-400 text-sm font-medium">
                <CheckCircle className="mr-2 h-4 w-4" />
                Chiffrement de bout en bout
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section id="pipeline" className="relative py-24 lg:py-32 bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl mb-6">
              Pipeline{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                temps réel
              </span>
            </h2>
            <p className="text-xl text-slate-400">
              De ta voix à tes analytics en moins de 2 secondes
            </p>
          </div>

          <div className="rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 p-8 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Step 1 */}
              <div className="text-center group">
                <div className="mb-6 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 group-hover:scale-110 transition-transform duration-300">
                  <Mic className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">1. Audio</h3>
                <p className="text-sm text-slate-400">Capture vocale haute qualité</p>
              </div>

              <div className="hidden lg:flex items-center justify-center">
                <ArrowRight className="h-6 w-6 text-slate-600" />
              </div>

              {/* Step 2 */}
              <div className="text-center group">
                <div className="mb-6 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-purple-600 group-hover:scale-110 transition-transform duration-300">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">2. IA</h3>
                <p className="text-sm text-slate-400">Transcription + Parsing</p>
              </div>

              <div className="hidden lg:flex items-center justify-center">
                <ArrowRight className="h-6 w-6 text-slate-600" />
              </div>

              {/* Step 3 */}
              <div className="text-center group">
                <div className="mb-6 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">3. Analytics</h3>
                <p className="text-sm text-slate-400">Insights automatiques</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="relative py-24 lg:py-32">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="mb-4 inline-flex items-center rounded-full bg-indigo-500/10 border border-indigo-500/20 px-6 py-2 text-sm font-medium text-indigo-300">
              <Zap className="mr-2 h-4 w-4" />
              Test en temps réel
            </div>
            <h2 className="text-4xl font-bold text-white mb-6 sm:text-5xl">
              Essaie{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                maintenant
              </span>
            </h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Teste la capture vocale directement dans ton navigateur.
              Aucune installation requise, résultats instantanés.
            </p>
          </div>

          <div className="rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 p-8 lg:p-12 hover:bg-white/10 transition-all duration-300">
            <AudioModal />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-slate-800/50 bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
            {/* Logo */}
            <div className="flex items-center space-x-2">
              <div className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 p-2">
                <Mic className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                VoiceTracker
              </span>
            </div>

            {/* Links */}
            <div className="flex justify-center space-x-8">
              <a
                href="#features"
                className="text-slate-400 hover:text-white transition-colors text-sm"
              >
                Fonctionnalités
              </a>
              <a
                href="#pipeline"
                className="text-slate-400 hover:text-white transition-colors text-sm"
              >
                Pipeline
              </a>
              <a
                href="#demo"
                className="text-slate-400 hover:text-white transition-colors text-sm"
              >
                Démo
              </a>
            </div>

            {/* Social */}
            <div className="flex justify-end space-x-4">
              <a href="#" className="text-slate-400 hover:text-white transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-slate-400 hover:text-white transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-slate-800/50 text-center">
            <p className="text-slate-500 text-sm">
              © 2025 VoiceTracker. Suivi intelligent de dépenses par reconnaissance vocale.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
