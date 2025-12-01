import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import useRecorder from '@/hooks/useRecorder';

class MockMediaRecorder {
  private listeners: Record<string, Array<(event: any) => void>> = {};
  public state: 'inactive' | 'recording' | 'paused' = 'inactive';

  constructor(public readonly stream: MediaStream) {}

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]!.push(listener);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    const chunk = new Blob(['mock audio'], { type: 'audio/webm' });
    this.listeners['dataavailable']?.forEach((listener) => listener({ data: chunk }));
    this.listeners['stop']?.forEach((listener) => listener(new Event('stop')));
  }
}

const originalFetch = global.fetch;
const originalMediaRecorder = (global as any).MediaRecorder;
const originalMediaDevices = navigator.mediaDevices;
let getUserMediaMock: ReturnType<typeof vi.fn>;

const createMockStream = (): MediaStream => ({
  getTracks: () => [
    {
      stop: vi.fn(),
    },
  ],
}) as unknown as MediaStream;

describe('useRecorder hook', () => {
  beforeEach(() => {
    getUserMediaMock = vi.fn().mockResolvedValue(createMockStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: getUserMediaMock,
      },
      configurable: true,
    });

    (global as any).MediaRecorder = MockMediaRecorder;
    global.fetch = originalFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        configurable: true,
      });
    } else {
      delete (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
    }
    (global as any).MediaRecorder = originalMediaRecorder;
    global.fetch = originalFetch;
  });

  it('records audio and uploads successfully with auto-reset', async () => {
    vi.useFakeTimers();
    try {
      const mockResponse = {
        ok: true,
        json: async () => ({ transcription: 'Transcription ok' }),
      } as Response;
      global.fetch = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;

      const { result } = renderHook(() => useRecorder());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.status).toBe('recording');
      expect(result.current.isRecording).toBe(true);
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.stopRecording();
      });

      expect(result.current.status).toBe('ready');
      expect(result.current.audioBlob).toBeInstanceOf(Blob);

      await act(async () => {
        const uploadResult = await result.current.uploadAudio();
        expect(uploadResult?.transcription).toBe('Transcription ok');
      });

      expect(result.current.status).toBe('success');
      expect(result.current.transcription).toBe('Transcription ok');

      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.audioBlob).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surface upload errors to the caller', async () => {
    const mockErrorResponse = {
      ok: false,
      json: async () => ({ error: { message: 'failed' } }),
    } as Response;
    global.fetch = vi.fn().mockResolvedValue(mockErrorResponse) as unknown as typeof fetch;

    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.status).toBe('ready');

    await act(async () => {
      const uploadResult = await result.current.uploadAudio();
      expect(uploadResult?.error).toBe('failed');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('failed');
  });

  it('handles microphone permission errors gracefully', async () => {
    getUserMediaMock.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const { result } = renderHook(() => useRecorder());

    await expect(async () => {
      await result.current.startRecording();
    }).rejects.toThrow('denied');

    await act(async () => {});
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Permission microphone refusée');
  });

  it('prevents duplicate recordings when already active', async () => {
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      await result.current.startRecording();
    });

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
  });

  it('propagates network errors during upload', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.status).toBe('ready');

    await act(async () => {
      const uploadResult = await result.current.uploadAudio();
      expect(uploadResult?.error).toBe('network down');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('network down');
  });
});
