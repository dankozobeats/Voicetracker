'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

import VoiceRecorder from '@/components/VoiceRecorder';

const focusableSelectors = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * AudioModal renders a floating action button that opens an accessible modal window.
 * The modal wraps the VoiceRecorder component, traps focus, and supports ESC/outside clicks.
 */
export default function AudioModal(): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const openModal = () => {
    lastFocusedElementRef.current = document.activeElement as HTMLElement;
    setIsOpen(true);
  };

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusableNodes = modalRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
      if (focusableNodes.length === 0) return;

      const first = focusableNodes[0];
      const last = focusableNodes[focusableNodes.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeModal, isOpen],
  );

  useEffect(() => {
    if (!isOpen) {
      lastFocusedElementRef.current?.focus();
      return undefined;
    }

    const node = document.body;
    node.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    const timeout = window.setTimeout(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(focusableSelectors);
      firstFocusable?.focus();
    }, 10);

    return () => {
      node.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(timeout);
    };
  }, [handleKeyDown, isOpen]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) {
      closeModal();
    }
  };

  const modalMarkup = !isOpen
    ? null
    : (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-md transition-opacity"
          onMouseDown={handleOverlayClick}
          role="presentation"
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Enregistrement vocal"
            className="relative mx-4 w-full max-w-xl scale-95 rounded-2xl border border-white/40 bg-white/80 p-6 shadow-2xl backdrop-blur-lg transition-transform duration-200 ease-out data-[open='true']:scale-100"
            data-open={isOpen}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-indigo-500">Assistant vocal</p>
                <h2 className="text-2xl font-semibold text-gray-900">Enregistrer une dépense</h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-white"
              >
                Fermer
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Parlez naturellement, nous transcrivons puis catégorisons automatiquement vos dépenses.
            </p>
            <div className="mt-4 rounded-xl bg-white/90 p-4 shadow-inner">
              <VoiceRecorder />
            </div>
          </div>
        </div>
      );

  return (
    <>
      <button
        type="button"
        aria-label="Ouvrir la modale d'enregistrement audio"
        aria-pressed={isOpen}
        onClick={openModal}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl shadow-lg transition hover:bg-indigo-500 focus:outline-none focus:ring focus:ring-indigo-200"
      >
        🎤
      </button>
      {isOpen && typeof document !== 'undefined' ? createPortal(modalMarkup, document.body) : null}
    </>
  );
}
