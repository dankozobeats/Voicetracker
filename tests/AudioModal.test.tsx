import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import AudioModal from '@/components/AudioModal';

const voiceRecorderSpies = {
  start: vi.fn(),
  stop: vi.fn(),
};

vi.mock('@/components/VoiceRecorder', () => ({
  __esModule: true,
  default: () => (
    <div>
      <button type="button" onClick={voiceRecorderSpies.start}>
        Start recording
      </button>
      <button type="button" onClick={voiceRecorderSpies.stop}>
        Stop recording
      </button>
    </div>
  ),
}));

describe('AudioModal', () => {
  beforeEach(() => {
    voiceRecorderSpies.start.mockReset();
    voiceRecorderSpies.stop.mockReset();
  });

  // WHY: ensures the floating action button actually opens the modal dialog rendered via portal.
  it('opens the modal when the FAB is clicked', () => {
    render(<AudioModal />);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ouvrir la modale/i }));
    expect(screen.getByRole('dialog', { name: /enregistrement vocal/i })).toBeTruthy();
  });

  // WHY: validates that pressing the start action inside the modal triggers the recorder behavior.
  it('wires the VoiceRecorder start control', () => {
    render(<AudioModal />);
    fireEvent.click(screen.getByRole('button', { name: /ouvrir la modale/i }));

    fireEvent.click(screen.getByRole('button', { name: /start recording/i }));
    expect(voiceRecorderSpies.start).toHaveBeenCalledTimes(1);
  });

  // WHY: validates that pressing stop routes to VoiceRecorder stop control so users can end sessions.
  it('wires the VoiceRecorder stop control', () => {
    render(<AudioModal />);
    fireEvent.click(screen.getByRole('button', { name: /ouvrir la modale/i }));

    fireEvent.click(screen.getByRole('button', { name: /stop recording/i }));
    expect(voiceRecorderSpies.stop).toHaveBeenCalledTimes(1);
  });
});
