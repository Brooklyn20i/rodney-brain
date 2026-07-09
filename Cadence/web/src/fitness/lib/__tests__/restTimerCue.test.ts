import { describe, expect, it, vi } from 'vitest';
import { createRestTimerCue } from '../restTimerCue';

type OscillatorNodeStub = {
  type: OscillatorType;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type GainNodeStub = {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
};

function makeAudioWindow(initialState: AudioContextState = 'running') {
  const oscillators: OscillatorNodeStub[] = [];
  const gains: GainNodeStub[] = [];
  const resume = vi.fn(() => Promise.resolve());
  class FakeAudioContext {
    state: AudioContextState = initialState;
    currentTime = 10;
    destination = {};
    resume = resume;
    createOscillator() {
      const osc: OscillatorNodeStub = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(() => gain),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const gain = makeGain();
      oscillators.push(osc);
      return osc;
    }
    createGain() {
      const gain = makeGain();
      gains.push(gain);
      return gain;
    }
  }
  const makeGain = (): GainNodeStub => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => ({})),
  });
  const audioSession = { type: 'auto' };
  const win = {
    AudioContext: FakeAudioContext,
    navigator: { audioSession },
  } as unknown as Window;
  return { win, oscillators, gains, resume, audioSession };
}

describe('createRestTimerCue', () => {
  it('primes Web Audio with an ambient/mixing session instead of playback', () => {
    const { win, audioSession } = makeAudioWindow();
    const cue = createRestTimerCue(win);

    expect(cue.isPrimed()).toBe(false);
    expect(cue.prime()).not.toBeNull();

    expect(cue.isPrimed()).toBe(true);
    expect(audioSession.type).toBe('ambient');
  });

  it('plays one short two-note cue when asked', () => {
    const { win, oscillators, gains } = makeAudioWindow();
    const cue = createRestTimerCue(win);

    cue.play();

    expect(oscillators).toHaveLength(2);
    expect(gains).toHaveLength(2);
    expect(oscillators.map((osc) => osc.frequency.value)).toEqual([880, 1175]);
    expect(oscillators.every((osc) => osc.start.mock.calls.length === 1 && osc.stop.mock.calls.length === 1)).toBe(true);
  });

  it('resumes a suspended context when primed by a user gesture', () => {
    const { win, resume } = makeAudioWindow('suspended');
    const cue = createRestTimerCue(win);

    cue.prime();

    expect(resume).toHaveBeenCalledTimes(1);
  });
});
