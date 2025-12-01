import React from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import AudioModal from '@/components/AudioModal';
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RecordPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-white">Enregistrer une dépense vocale</h1>
        <VoiceRecorder />
      </div>
      <AudioModal />
    </main>
  );
}
