'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { TransactionRecord } from '@/lib/schemas';

export type RecorderStatus = 'idle' | 'recording' | 'ready' | 'processing' | 'success' | 'error';
export type SubmissionMode = 'audio' | 'text';

interface UploadResult {
  transcript: string | null;
  extracted: TransactionRecord | null;
  mode: SubmissionMode;
  error?: string;
}

interface UseRecorderReturn {
  isRecording: boolean;
  status: RecorderStatus;
  audioBlob: Blob | null;
  transcription: string | null;
  extracted: TransactionRecord | null;
  lastMode: SubmissionMode | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  uploadAudio: () => Promise<UploadResult | null>;
  submitManualText: (text: string) => Promise<UploadResult | null>;
}

/**
 * useRecorder encapsulates MediaRecorder usage and the `/api/voice` upload flow.
 * It returns helpers to start/stop recording and to upload the recorded blob.
 */
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[useRecorder]', ...args);
  }
};

export default function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<TransactionRecord | null>(null);
  const [lastMode, setLastMode] = useState<SubmissionMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const detectMimeType = () => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return 'audio/webm';
    }

    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      return 'audio/webm;codecs=opus';
    }

    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      return 'audio/mp4';
    }

    return 'audio/webm';
  };

  const startRecording = useCallback(async () => {
    if (typeof navigator === 'undefined') {
      throw new Error('Recording is only available in the browser');
    }

    if (isRecording || status === 'processing') {
      debug('startRecording ignored because recorder is busy', { status });
      return;
    }

    try {
      setError(null);
      setTranscription(null);
      setAudioBlob(null);
      setStatus('idle');

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Votre navigateur ne supporte pas l\'enregistrement audio.');
        setStatus('error');
        return;
      }

      // Enhanced mobile permissions request
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      const mimeType = detectMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const preferredType = recorder.mimeType?.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: preferredType });
        if (blob.size === 0) {
          setAudioBlob(null);
          setStatus('idle');
          debug('Recording stopped before audio chunk was captured');
        } else {
          setAudioBlob(blob);
          setStatus('ready');
        }
        cleanupStream();
      });

      recorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setStatus('recording');
      debug('Recording started');
    } catch (err) {
      cleanupStream();
      const message = err instanceof Error ? err.message : 'Impossible de démarrer l\'enregistrement';
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Permission microphone refusée. Vérifiez les paramètres de votre navigateur.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('Aucun microphone détecté. Vérifiez votre matériel audio.');
      } else if (err instanceof DOMException && err.name === 'NotSupportedError') {
        setError('Votre navigateur ne supporte pas l\'enregistrement audio.');
      } else {
        setError(message);
      }
      setStatus('error');
      throw err;
    }
  }, [isRecording, status]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) {
      debug('stopRecording ignored because recorder is not active');
      return;
    }

    try {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      debug('Recording stopped');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'arrêt');
      setStatus('error');
    }
  }, [isRecording]);

  const reset = useCallback(() => {
    cleanupStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setAudioBlob(null);
    setTranscription(null);
    setExtracted(null);
    setLastMode(null);
    setError(null);
    setStatus('idle');
    setIsRecording(false);
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    debug('Recorder reset');
  }, []);

  const uploadAudio = useCallback(async (): Promise<UploadResult | null> => {
    if (!audioBlob) {
      setError('Aucun enregistrement disponible');
      return null;
    }

    if (status === 'processing') {
      debug('uploadAudio ignored because already processing');
      return null;
    }

    setStatus('processing');
    setError(null);

    try {
      const normalizedBlob = audioBlob.type ? audioBlob : new Blob([audioBlob], { type: 'audio/webm' });
      const file = new File([normalizedBlob], 'voice.webm', { type: normalizedBlob.type || 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      const ok = payload?.ok === true;
      const data = ok ? (payload.data as TransactionRecord | null) : null;
      const transcript = typeof data?.ai_raw === 'string' ? data.ai_raw : null;
      const payloadMode: SubmissionMode = 'audio';

      if (!ok) {
        const message = payload?.error?.message ?? 'Une erreur est survenue pendant l\'upload';
        setError(message);
        setStatus('error');
        setExtracted(null);
        setTranscription(transcript);
        setLastMode(payloadMode);
        return { transcript, extracted: data, mode: payloadMode, error: message };
      }

      setTranscription(transcript);
      setExtracted(data);
      setLastMode(payloadMode);
      setAudioBlob(null);
      setStatus('success');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('expenses:updated'));
      }
      resetTimerRef.current = setTimeout(() => {
        reset();
      }, 4000);
      return { transcript, extracted: data, mode: payloadMode };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible d\'envoyer l\'audio';
      setError(message);
      setStatus('error');
      setExtracted(null);
      return { transcript: null, extracted: null, mode: 'audio', error: message };
    }
  }, [audioBlob, reset, status]);

  const submitManualText = useCallback(
    async (text: string): Promise<UploadResult | null> => {
      const sanitized = text.trim();
      if (!sanitized) {
        setError('Le texte ne peut pas être vide');
        setStatus('error');
        return null;
      }

      if (status === 'processing') {
        debug('submitManualText ignored because already processing');
        return null;
      }

      setStatus('processing');
      setError(null);

      try {
        const response = await fetch('/api/voice?type=text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: sanitized }),
        });

        const payload = await response.json().catch(() => null);
        const ok = payload?.ok === true;
        const data = ok ? (payload.data as TransactionRecord | null) : null;
        const transcript = typeof data?.ai_raw === 'string' ? data.ai_raw : null;
        const payloadMode: SubmissionMode = 'text';

        if (!ok) {
          const message = payload?.error?.message ?? 'Une erreur est survenue pendant l\'analyse du texte';
          setError(message);
          setStatus('error');
          setExtracted(null);
          setTranscription(transcript);
          setLastMode(payloadMode);
          return { transcript, extracted: data, mode: payloadMode, error: message };
        }

        setTranscription(transcript);
        setExtracted(data);
        setLastMode(payloadMode);
        setAudioBlob(null);
        setStatus('success');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('expenses:updated'));
        }
        resetTimerRef.current = setTimeout(() => {
          reset();
        }, 4000);

        return { transcript, extracted: data, mode: payloadMode };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Impossible d\'envoyer le texte';
        setError(message);
        setStatus('error');
        setExtracted(null);
        return { transcript: null, extracted: null, mode: 'text', error: message };
      }
    },
    [reset, status],
  );

  useEffect(() => () => {
    cleanupStream();
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }
  }, []);

  return {
    isRecording,
    status,
    audioBlob,
    transcription,
    extracted,
    lastMode,
    error,
    startRecording,
    stopRecording,
    reset,
    uploadAudio,
    submitManualText,
  };
}
