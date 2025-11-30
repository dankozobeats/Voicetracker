import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'recording' | 'ready' | 'uploading' | 'done' | 'error';

interface UseRecorderReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  uploadAudio: () => Promise<void>;
  status: Status;
  transcription: string | null;
  error: unknown | null;
}

/**
 * useRecorder
 * - Wraps MediaRecorder API
 * - Exposes functions to record and upload audio blob to `/api/voice`
 */
export default function useRecorder(): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [transcription, setTranscription] = useState<string | null>(null);
  const [error, setError] = useState<unknown | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.addEventListener('dataavailable', (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      });

      mr.addEventListener('stop', () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setStatus('ready');
      });

      mr.start();
      setIsRecording(true);
      setStatus('recording');
    } catch (err) {
      setError(err);
      setStatus('error');
      throw err;
    }
  }, []);

  const stopRecording = useCallback(() => {
    try {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, []);

  const uploadAudio = useCallback(async () => {
    if (!audioBlob) return;
    setStatus('uploading');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('audio', new File([audioBlob], 'recording.webm', { type: audioBlob.type }));

      const res = await fetch('/api/voice', { method: 'POST', body: fd });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Upload failed');
      }

      const json = await res.json();
      setTranscription(json.transcription ?? null);
      setStatus('done');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [audioBlob]);

  useEffect(() => {
    return () => {
      // stop tracks on unmount
      try {
        const tracks = (mediaRecorderRef.current as any)?.stream?.getTracks?.() ?? [];
        tracks.forEach((t: MediaStreamTrack) => t.stop());
      } catch (e) {
        // ignore
      }
    };
  }, []);

  return {
    isRecording,
    audioBlob,
    startRecording,
    stopRecording,
    uploadAudio,
    status,
    transcription,
    error,
  };
}
