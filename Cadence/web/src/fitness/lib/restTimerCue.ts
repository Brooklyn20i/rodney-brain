type AudioContextCtor = new () => AudioContext;

type AudioSession = {
  type?: 'auto' | 'ambient' | 'playback' | 'transient' | 'transient-solo';
};

type AudioWindow = Window & {
  AudioContext?: AudioContextCtor;
  webkitAudioContext?: AudioContextCtor;
};

type AudioNavigator = Navigator & {
  audioSession?: AudioSession;
};

export type RestTimerCue = {
  prime: () => AudioContext | null;
  play: () => void;
  isPrimed: () => boolean;
};

export function createRestTimerCue(win: AudioWindow | undefined = typeof window === 'undefined' ? undefined : (window as AudioWindow)): RestTimerCue {
  let audioCtx: AudioContext | null = null;

  const prime = () => {
    if (!win) return null;
    try {
      if (!audioCtx) {
        const Ctx = win.AudioContext || win.webkitAudioContext;
        if (!Ctx) return null;

        // Prefer a mixing session. On Safari/iOS this is best-effort: Web Audio
        // can play a short cue over Spotify/podcasts when the page is foregrounded
        // and unlocked by a user gesture, but the browser/OS may still limit
        // background or silent-switch behaviour. Do not use "playback" here: it
        // is louder through silent mode, but can duck or interrupt other audio.
        const audioSession = (win.navigator as AudioNavigator).audioSession;
        if (audioSession) audioSession.type = 'ambient';

        audioCtx = new Ctx();
      }
      const ctx = audioCtx;
      if (!ctx) return null;
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  };

  const scheduleCue = (ctx: AudioContext) => {
    const now = ctx.currentTime;
    [
      [0, 880],
      [0.14, 1175],
    ].forEach(([t, freq]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.32, now + t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.13);
    });
  };

  const play = () => {
    const ctx = prime();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().then(() => scheduleCue(ctx)).catch(() => {});
    else scheduleCue(ctx);
  };

  return {
    prime,
    play,
    isPrimed: () => Boolean(audioCtx),
  };
}
