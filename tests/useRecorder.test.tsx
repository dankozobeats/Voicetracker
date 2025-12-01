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

  // WHY: happy-path regression test proving a blob is produced, uploaded, and clears state afterward.
  it('records audio and uploads successfully', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({ transcription: 'Transcription ok' }),
    } as Response;
    const fetchSpy = vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch;
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.status).toBe('recording');

    act(() => {
      result.current.stopRecording();
    });
    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    expect(result.current.status).toBe('ready');

    await act(async () => {
      const uploadResult = await result.current.uploadAudio();
      expect(uploadResult?.transcription).toBe('Transcription ok');
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchMock = fetchSpy as unknown as ReturnType<typeof vi.fn>;
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall?.[0]).toBe('/api/transcribe');
    expect(fetchCall?.[1]?.method).toBe('POST');
    expect(fetchCall?.[1]?.body).toBeInstanceOf(Blob);
    expect(result.current.status).toBe('success');
    expect(result.current.transcription).toBe('Transcription ok');
  });

  // WHY: calling start twice should not request a second MediaRecorder, preventing race conditions.
  it('ignores duplicate startRecording requests', async () => {
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      await result.current.startRecording();
    });

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
  });

  // WHY: stopRecording should flush chunks into a blob and leave the hook in the ready state for upload.
  it('converts buffered audio into a blob on stop', async () => {
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.status).toBe('ready');
    expect(result.current.audioBlob).toBeInstanceOf(Blob);
    const buffer = await new Response(result.current.audioBlob!).arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  // WHY: microphone permission denial should bubble a human-readable error for UI display.
  it('surfaces permission denied errors clearly', async () => {
    getUserMediaMock.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    const { result } = renderHook(() => useRecorder());

    await expect(async () => {
      await result.current.startRecording();
    }).rejects.toThrow('denied');

    await act(async () => {});
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Permission microphone refusée. Vérifiez les paramètres de votre navigateur.');
  });

  // WHY: network/server errors during upload must propagate to consumers for proper toast messaging.
  it('propagates upload errors from the API response', async () => {
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

    await act(async () => {
      const uploadResult = await result.current.uploadAudio();
      expect(uploadResult?.error).toBe('failed');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('failed');
  });

  // WHY: low-level fetch rejections (offline, CORS, etc.) should also mark the hook as errored.
  it('handles network exceptions during upload', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    act(() => {
      result.current.stopRecording();
    });

    await act(async () => {
      const uploadResult = await result.current.uploadAudio();
      expect(uploadResult?.error).toBe('network down');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('network down');
  });
});
