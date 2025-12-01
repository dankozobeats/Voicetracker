'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'ready' | 'processing' | 'success' | 'error';

interface UploadResult {
  transcription: string | null;
  error?: string;
}

interface UseRecorderReturn {
  isRecording: boolean;
  status: RecorderStatus;
  audioBlob: Blob | null;
  transcription: string | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  uploadAudio: () => Promise<UploadResult | null>;
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
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
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
      setStatus('idle');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener('dataavailable', (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setStatus('ready');
        cleanupStream();
      });

      recorder.start();
      setIsRecording(true);
      setStatus('recording');
      debug('Recording started');
    } catch (err) {
      cleanupStream();
      const message = err instanceof Error ? err.message : 'Impossible de démarrer l\'enregistrement';
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Permission microphone refusée');
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
      const file = new File([audioBlob], 'recording.webm', { type: audioBlob.type || 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/voice', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        const message = payload?.error?.message ?? 'Une erreur est survenue pendant l\'upload';
        setError(message);
        setStatus('error');
        return { transcription: null, error: message };
      }

      setTranscription(payload.transcription ?? null);
      setAudioBlob(null);
      setStatus('success');
      resetTimerRef.current = setTimeout(() => {
        reset();
      }, 4000);
      return { transcription: payload.transcription ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible d\'envoyer l\'audio';
      setError(message);
      setStatus('error');
      return { transcription: null, error: message };
    }
  }, [audioBlob, reset, status]);

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
    error,
    startRecording,
    stopRecording,
    reset,
    uploadAudio,
  };
}
