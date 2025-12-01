"use client";

import useRecorder, { RecorderStatus } from '@/hooks/useRecorder';

const statusLabels: Record<RecorderStatus, string> = {
  idle: 'Prêt à enregistrer',
  recording: 'Enregistrement en cours…',
  ready: 'Enregistrement prêt à envoyer',
  processing: 'Envoi et traitement…',
  success: 'Dépense enregistrée ✅',
  error: 'Erreur',
};

export default function VoiceRecorder(): JSX.Element {
  const {
    isRecording,
    audioBlob,
    startRecording,
    stopRecording,
    uploadAudio,
    status,
    transcription,
    error,
    reset,
  } = useRecorder();

  const canSend = Boolean(audioBlob) && status === 'ready';
  const isBusy = status === 'processing';

  return (
    <div className="p-4 bg-white rounded shadow-sm">
      <h2 className="text-lg font-semibold mb-2">Enregistrer une dépense</h2>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`px-4 py-2 rounded text-white focus:outline-none focus:ring ${
            isRecording ? 'bg-red-600 focus:ring-red-300' : 'bg-green-600 focus:ring-green-300'
          } disabled:opacity-50`}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          aria-pressed={isRecording}
          disabled={isBusy}
        >
          {isRecording ? 'Arrêter' : 'Enregistrer'}
        </button>

        <button
          type="button"
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50 focus:outline-none focus:ring focus:ring-blue-300"
          onClick={() => uploadAudio()}
          disabled={!canSend || isBusy}
        >
          Envoyer
        </button>

        <button
          type="button"
          className="px-4 py-2 rounded border border-gray-300 text-gray-600 disabled:opacity-50 focus:outline-none focus:ring focus:ring-gray-200"
          onClick={reset}
          disabled={isRecording || isBusy}
        >
          Réinitialiser
        </button>
      </div>

      <div className="mt-3 text-sm" aria-live="polite">
        <div>
          Statut: <strong>{statusLabels[status]}</strong>
        </div>
        {transcription && (
          <div className="mt-2 p-2 bg-gray-50 rounded">
            <div className="text-xs text-gray-500">Transcription</div>
            <div className="text-sm">{transcription}</div>
          </div>
        )}
        {error && (
          <div className="mt-2 text-red-600" role="alert">
            Erreur: {error}
          </div>
        )}
        {status === 'success' && !error && (
          <div className="mt-2 text-green-700">Dépense envoyée avec succès.</div>
        )}
      </div>
    </div>
  );
}
