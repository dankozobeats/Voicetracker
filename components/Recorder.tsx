import VoiceRecorder from '@/components/VoiceRecorder';

/**
 * Thin wrapper to expose the existing VoiceRecorder component under the Recorder alias.
 * Keeps vocal pipeline untouched while enabling reuse across pages.
 */
export default function Recorder() {
  return <VoiceRecorder />;
}
