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
      json: async () => ({
        mode: 'audio',
        transcript: 'Transcription ok',
        extracted: { id: '1', amount: 10, category: 'courses', raw_transcription: 'Transcription ok' },
      }),
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
      expect(uploadResult?.transcript).toBe('Transcription ok');
      expect(uploadResult?.mode).toBe('audio');
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchMock = fetchSpy as unknown as ReturnType<typeof vi.fn>;
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall?.[0]).toBe('/api/voice');
    expect(fetchCall?.[1]?.method).toBe('POST');
    expect(fetchCall?.[1]?.body).toBeInstanceOf(FormData);
    const fetchBody = fetchCall?.[1]?.body as FormData | undefined;
    if (!fetchBody) throw new Error('Expected FormData body');
    expect(Array.from(fetchBody.keys())).toContain('audio');
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
      expect(uploadResult?.mode).toBe('audio');
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
      expect(uploadResult?.mode).toBe('audio');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('network down');
  });

  // WHY: manual text fallback should call the API with JSON payload and update the same state as audio submissions.
  it('submits manual text successfully', async () => {
    const manualResponse = {
      ok: true,
      json: async () => ({
        mode: 'text',
        transcript: '12 euros courses hier',
        extracted: {
          id: '1',
          amount: 12,
          category: 'courses',
          expense_date: '2025-01-01T00:00:00.000Z',
          confidence_score: 0.9,
          raw_transcription: '12 euros courses hier',
        },
      }),
    } as Response;

    const fetchSpy = vi.fn().mockResolvedValue(manualResponse) as unknown as typeof fetch;
    global.fetch = fetchSpy;

    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      const submission = await result.current.submitManualText(' 12 euros courses hier ');
      expect(submission?.transcript).toBe('12 euros courses hier');
      expect(submission?.mode).toBe('text');
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/voice?type=text',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '12 euros courses hier' }),
      }),
    );
    expect(result.current.status).toBe('success');
    expect(result.current.transcription).toBe('12 euros courses hier');
  });

  // WHY: empty manual submissions should be rejected client-side without calling the network.
  it('rejects empty manual text submissions', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      const submission = await result.current.submitManualText('   ');
      expect(submission).toBeNull();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Le texte ne peut pas être vide');
  });
});
