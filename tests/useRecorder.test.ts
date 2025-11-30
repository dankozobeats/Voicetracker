import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useRecorder from '@/hooks/useRecorder';
import { renderHook, act } from '@testing-library/react-hooks';

// Provide a minimal fake MediaRecorder implementation
class FakeMediaRecorder {
  state = 'inactive';
  stream: MediaStream;
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  private chunks: Blob[] = [];

  constructor(stream: MediaStream) {
    this.stream = stream;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const event = { data: blob } as any;
    if (this.ondataavailable) this.ondataavailable(event);
    if (this.onstop) this.onstop();
  }

  addEventListener(name: string, fn: any) {
    if (name === 'dataavailable') this.ondataavailable = fn;
    if (name === 'stop') this.onstop = fn;
  }
}

describe('useRecorder', () => {
  let originalMediaDevices: any;

  beforeEach(() => {
    originalMediaDevices = (global as any).navigator?.mediaDevices;
    (global as any).navigator = (global as any).navigator ?? {};
    (global as any).navigator.mediaDevices = {
      getUserMedia: vi.fn(async () => {
        // return a dummy MediaStream
        return { getTracks: () => [] } as any;
      }),
    };

    // @ts-ignore
    (global as any).MediaRecorder = FakeMediaRecorder;
  });

  afterEach(() => {
    (global as any).navigator.mediaDevices = originalMediaDevices;
    vi.restoreAllMocks();
  });

  it('records and produces an audio blob', async () => {
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.isRecording).toBe(true);

    act(() => {
      result.current.stopRecording();
    });

    // After stop, audioBlob should be set
    expect(result.current.audioBlob).not.toBeNull();
    expect(result.current.status).toBe('ready');
  });
});
