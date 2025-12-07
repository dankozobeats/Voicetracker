import Recorder from '@/components/Recorder';
import AudioModal from '@/components/AudioModal';

/**
 * Dedicated voice recording page reusing the existing recorder component.
 */
export default function VoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Enregistrement vocal</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Capture vocale sécurisée avec Whisper + Groq.</p>
      </div>
      <Recorder />
      <AudioModal />
    </div>
  );
}
