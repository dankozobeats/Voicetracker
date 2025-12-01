import AudioModal from '@/components/AudioModal';

export const metadata = {
  title: 'VoiceTrack — Capture vocale des dépenses',
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-800 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16 lg:flex-row lg:items-center">
        <section className="space-y-6">
          <p className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-sm text-slate-200">
            <span className="mr-2 text-lg">✨</span> Suivez vos dépenses à la voix
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Des captures vocales fiables et instantanées pour toutes vos dépenses.
          </h1>
          <p className="text-lg text-slate-200">
            VoiceTrack s’occupe de la transcription, du parsing intelligent et de la validation avant insertion
            dans Supabase. Ouvrez le micro et laissez-nous faire le reste.
          </p>
          <ul className="space-y-2 text-slate-300">
            <li>• Whisper pour une transcription précise.</li>
            <li>• Groq + Zod pour une catégorisation fiable.</li>
            <li>• Supabase pour stocker vos dépenses sécurisées.</li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <a
              href="/record"
              className="inline-flex items-center rounded-full bg-indigo-500 px-6 py-2 text-base font-semibold text-white shadow-lg transition hover:bg-indigo-400"
            >
              Commencer un enregistrement
            </a>
            <p className="text-sm text-slate-300">Ou utilisez le bouton flotant 🎤 pour ouvrir la modale multi-plateforme.</p>
          </div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Pipeline temps réel</h2>
          <p className="mt-2 text-sm text-slate-200">
            Audio → Whisper → Groq → Zod → Supabase. Toutes les étapes sont typées et testées avec Vitest.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 text-sm text-slate-100 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">Sécurité</p>
              <p className="mt-1 font-semibold">Rate limiting, validation stricte et logs.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-300">Productivité</p>
              <p className="mt-1 font-semibold">Modale audio premium accessible partout.</p>
            </div>
          </div>
        </section>
      </div>
      <AudioModal />
    </main>
  );
}
