import React, { useEffect } from 'react';
import useRecorder from '@/hooks/useRecorder';

/**
 * VoiceRecorder
 * - Button to start/stop recording
 * - Shows transcription and upload status
 */
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
  } = useRecorder();

  useEffect(() => {
    return () => {
      // cleanup if needed
    };
  }, []);

  return (
    <div className="p-4 bg-white rounded shadow-sm">
      <h2 className="text-lg font-semibold mb-2">Enregistrer une dépense</h2>

      <div className="flex items-center gap-3">
        <button
          className={`px-4 py-2 rounded text-white ${isRecording ? 'bg-red-600' : 'bg-green-600'}`}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          aria-pressed={isRecording}
        >
          {isRecording ? 'Arrêter' : 'Enregistrer'}
        </button>

        <button
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          onClick={() => audioBlob && uploadAudio()}
          disabled={!audioBlob || status === 'uploading'}
        >
          Envoyer
        </button>
      </div>

      <div className="mt-3 text-sm">
        <div>Statut: <strong>{status}</strong></div>
        {transcription && (
          <div className="mt-2 p-2 bg-gray-50 rounded">
            <div className="text-xs text-gray-500">Transcription</div>
            <div className="text-sm">{transcription}</div>
          </div>
        )}
        {error && <div className="mt-2 text-red-600">Erreur: {String(error)}</div>}
      </div>
    </div>
  );
}
