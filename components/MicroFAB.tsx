'use client';

import Link from 'next/link';
import { Mic } from 'lucide-react';

/**
 * Floating action button for quick access to voice recording.
 * Always routes users to the dedicated /voice page.
 */
export default function MicroFAB() {
  return (
    <Link
      href="/voice"
      className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-500/50"
      aria-label="Enregistrer une dépense"
    >
      <Mic className="h-6 w-6" />
    </Link>
  );
}
