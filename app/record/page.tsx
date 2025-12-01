import React from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import AudioModal from '@/components/AudioModal';

export const metadata = {
  title: 'Enregistrer - VoiceTrack',
};

export default function RecordPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Enregistrer une dépense vocale</h1>
        <VoiceRecorder />
      </div>
      <AudioModal />
    </main>
  );
}
