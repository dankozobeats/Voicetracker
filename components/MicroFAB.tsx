'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

export default function MicroFAB() {
  const [visible, setVisible] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(false);
      if (idleTimer.current) {
        window.clearTimeout(idleTimer.current);
      }
      idleTimer.current = window.setTimeout(() => {
        setVisible(true);
      }, 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (idleTimer.current) {
        window.clearTimeout(idleTimer.current);
      }
    };
  }, []);

  return (
    <Link
      href="/voice"
      className={`fixed bottom-20 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xl transition duration-200 ease-out transition-transform ${
        visible ? 'opacity-100 -translate-y-6 md:translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}
      aria-label="Enregistrer une dépense"
    >
      <Mic className="h-6 w-6" />
    </Link>
  );
}
