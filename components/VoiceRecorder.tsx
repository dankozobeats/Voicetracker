"use client";

import { useState } from 'react';
import dynamic from 'next/dynamic';

import type { RichTextEditorProps } from '@/components/RichTextEditor';
import useRecorder, { RecorderStatus } from '@/hooks/useRecorder';

const RichTextEditor = dynamic<RichTextEditorProps>(() => import('@/components/RichTextEditor'), {
  ssr: false,
  loading: () => <div className="min-h-[220px] rounded-xl bg-slate-200/60 animate-pulse" />,
});

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
    extracted,
    lastMode,
    error,
    reset,
    submitManualText,
  } = useRecorder();
  const [manualEditorValue, setManualEditorValue] = useState('');
  const [manualPlainText, setManualPlainText] = useState('');

  const canSend = Boolean(audioBlob) && status === 'ready';
  const isBusy = status === 'processing';

  const handleManualSubmit = async () => {
    const result = await submitManualText(manualPlainText);
    if (result && !result.error) {
      setManualEditorValue('');
      setManualPlainText('');
    }
  };

  const handleReset = () => {
    reset();
    setManualEditorValue('');
    setManualPlainText('');
  };

  return (
    <div className="bg-white/90 backdrop-blur rounded-3xl shadow-xl p-6 border border-slate-100">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Enregistrer une dépense</h2>
          <p className="text-sm text-slate-500">Choisissez l'audio ou saisissez les détails à la main.</p>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Mode dual</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`px-4 py-2 rounded-full text-white font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
            isRecording
              ? 'bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-200'
              : 'bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          onClick={() => (isRecording ? stopRecording() : startRecording())}
          aria-pressed={isRecording}
          disabled={isBusy}
        >
          {isRecording ? 'Arrêter' : 'Enregistrer'}
        </button>

        <button
          type="button"
          className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-indigo-200"
          onClick={() => uploadAudio()}
          disabled={!canSend || isBusy}
        >
          Envoyer
        </button>

        <button
          type="button"
          className="px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:border-slate-300 transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-slate-200"
          onClick={handleReset}
          disabled={isRecording || isBusy}
        >
          Réinitialiser
        </button>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-md font-semibold text-slate-900">Fallback manuel</h3>
            <p className="text-xs text-slate-500">Collez un reçu ou décrivez la dépense librement.</p>
          </div>
          <span className="text-[11px] uppercase tracking-wide font-semibold text-purple-500">Texte enrichi</span>
        </div>
        <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
          <RichTextEditor
            value={manualEditorValue}
            readOnly={isBusy}
            placeholder="Ex : 12 euros courses hier soir, description détaillée…"
            onChange={({ html, text }) => {
              setManualEditorValue(html);
              setManualPlainText(text.trim());
            }}
          />
        </div>
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span>{manualPlainText ? `${manualPlainText.length} caractères` : 'Prêt à saisir'}</span>
          <button
            type="button"
            className="px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-500 text-white font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-purple-200"
            onClick={handleManualSubmit}
            disabled={isBusy || manualPlainText.length === 0}
          >
            Envoyer le texte
          </button>
        </div>
      </div>

      <div className="mt-6 text-sm" aria-live="polite">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Statut&nbsp;: <strong className="text-slate-900">{statusLabels[status]}</strong>
        </div>
        {lastMode && (
          <div className="mt-1 text-xs text-slate-500">
            Mode de traitement&nbsp;: {lastMode === 'text' ? 'Texte manuel' : 'Audio'}
          </div>
        )}
        {transcription && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Transcription</div>
            <div className="text-sm text-slate-800 mt-1 leading-relaxed">{transcription}</div>
          </div>
        )}
        {extracted && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dépense extraite</div>
            <pre className="text-xs whitespace-pre-wrap text-slate-800 mt-1">
              {JSON.stringify(extracted, null, 2)}
            </pre>
          </div>
        )}
        {error && (
          <div className="mt-3 text-rose-600 font-medium" role="alert">
            Erreur&nbsp;: {error}
          </div>
        )}
        {status === 'success' && !error && (
          <div className="mt-3 text-emerald-600 font-medium">Dépense envoyée avec succès.</div>
        )}
      </div>
    </div>
  );
}
