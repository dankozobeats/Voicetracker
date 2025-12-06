"use client";

import { useCallback, useEffect, useRef } from 'react';
import type QuillType from 'quill';

import 'quill/dist/quill.snow.css';

const TOOLBAR_OPTIONS = [
  [{ header: [2, 3, false] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['bold', 'italic', 'underline'],
  [{ color: [] }, { background: [] }],
  ['clean'],
] as const;

export interface RichTextEditorProps {
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange: (payload: { html: string; text: string }) => void;
}

export default function RichTextEditor({ value, readOnly = false, placeholder, onChange }: RichTextEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<QuillType | null>(null);
  const isSettingContentRef = useRef(false);

  const importQuill = useCallback(async () => {
    const Quill = (await import('quill')).default;
    return Quill;
  }, []);

  useEffect(() => {
    if (!containerRef.current || quillRef.current) {
      return;
    }

    let mounted = true;

    void importQuill().then((Quill) => {
      if (!mounted || !containerRef.current) {
        return;
      }

      const quill = new Quill(containerRef.current, {
        theme: 'snow',
        readOnly,
        placeholder,
        modules: {
          toolbar: TOOLBAR_OPTIONS,
        },
      });

      quillRef.current = quill;

      if (value) {
        isSettingContentRef.current = true;
        quill.clipboard.dangerouslyPasteHTML(value);
        isSettingContentRef.current = false;
      }

      quill.on('text-change', () => {
        if (isSettingContentRef.current) {
          return;
        }
        const html = quill.root.innerHTML;
        const text = quill.getText();
        onChange({ html, text });
      });
    });

    return () => {
      mounted = false;
      quillRef.current = null;
    };
  }, [importQuill, onChange, placeholder, readOnly, value]);

  useEffect(() => {
    if (!quillRef.current) {
      return;
    }

    const quill = quillRef.current;
    if (quill.root.innerHTML === value) {
      return;
    }

    isSettingContentRef.current = true;
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    } else {
      quill.setText('');
    }
    isSettingContentRef.current = false;
  }, [value]);

  useEffect(() => {
    if (!quillRef.current) {
      return;
    }
    quillRef.current.enable(!readOnly);
  }, [readOnly]);

  return <div className="min-h-[220px]" ref={containerRef} />;
}
