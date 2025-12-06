import VoiceRecorder from '@/components/VoiceRecorder';
import AudioModal from '@/components/AudioModal';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'VoiceTracker · Capture et texte enrichi',
  description: 'Enregistrez vos dépenses en audio ou via un éditeur texte riche et laissez VoiceTracker structurer vos données.',
};

export default function RecordPage() {
  return (
    <main className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-10%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-purple-600/40 blur-[180px]" />
        <div className="absolute right-[-20%] bottom-[-10%] h-[360px] w-[360px] rounded-full bg-indigo-500/30 blur-[160px]" />
      </div>

      <div className="relative z-10 px-6 pb-16 pt-20 sm:px-10 lg:px-16">
        <div className="mx-auto flex max-w-5xl flex-col gap-10 lg:flex-row lg:items-start">
          <header className="lg:max-w-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              VoiceTracker Pro
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Capturez vos dépenses en un seul geste.
            </h1>
            <p className="mt-4 text-base text-slate-200 sm:text-lg">
              Enregistrez une note vocale, ou utilisez l’éditeur enrichi pour détailler vos achats. VoiceTracker convertit tout en données prêtes à analyser.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-200/90">
              <li className="flex items-start gap-2">
                <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Whisper Groq pour la transcription rapide.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Éditeur riche pour les corrections manuelles.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Validation stricte et insertion Supabase automatique.
              </li>
            </ul>
          </header>

          <section className="lg:flex-1">
            <VoiceRecorder />
          </section>
        </div>
      </div>

      <AudioModal />
    </main>
  );
}
