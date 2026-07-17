/**
 * Procedural sound design. Everything here is synthesised at runtime — there
 * are no audio assets to load.
 *
 * Rope tension has to track pull distance continuously, which a sample cannot
 * do; and a synthesised click stays crisp at any sample rate while costing
 * nothing to download. The palette is deliberately dry and mechanical to match
 * the visual language.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;

/**
 * Browsers refuse to start an AudioContext without a user gesture, so this is
 * called from the first pointer/pinch rather than at module load.
 */
export function initAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  // Two seconds of white noise, reused as the source for every transient.
  const len = ctx.sampleRate * 2;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  return ctx;
}

export function setMuted(next: boolean) {
  muted = next;
  if (master && ctx) {
    master.gain.setTargetAtTime(next ? 0 : 0.5, ctx.currentTime, 0.05);
  }
}

export function isMuted() {
  return muted;
}

function noiseSource(): AudioBufferSourceNode | null {
  if (!ctx || !noiseBuffer) return null;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

/**
 * The mechanical click of a pull switch: a hard, band-passed noise transient
 * with a short body resonance. Two stages — the pawl release, then the housing.
 */
export function playClick(intensity = 1) {
  const c = initAudio();
  if (!c || !master) return;

  const now = c.currentTime;

  // Stage one: the snap.
  const src = noiseSource();
  if (!src) return;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 1.4;

  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.55 * intensity, now + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  src.connect(bp).connect(g).connect(master);
  src.start(now);
  src.stop(now + 0.06);

  // Stage two: the housing ringing briefly after the snap.
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
  const og = c.createGain();
  og.gain.setValueAtTime(0.18 * intensity, now + 0.002);
  og.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(og).connect(master);
  osc.start(now);
  osc.stop(now + 0.1);
}

/**
 * Continuous rope tension. Returns a handle whose `set(amount)` maps 0–1 pull
 * onto filter cutoff and gain, so the creak tightens as the cord stretches.
 */
export function createTensionVoice() {
  const c = initAudio();
  if (!c || !master) {
    return { set: (_: number) => {}, stop: () => {} };
  }

  const src = noiseSource();
  if (!src) return { set: (_: number) => {}, stop: () => {} };

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420;
  bp.Q.value = 6;

  const g = c.createGain();
  g.gain.value = 0;

  src.connect(bp).connect(g).connect(master);
  src.start();

  let stopped = false;

  return {
    set(amount: number) {
      if (stopped || !ctx) return;
      const a = Math.min(1, Math.max(0, amount));
      const t = ctx.currentTime;
      // Fibre creak climbs in pitch as tension rises.
      bp.frequency.setTargetAtTime(380 + a * 900, t, 0.06);
      g.gain.setTargetAtTime(a * 0.09, t, 0.06);
    },
    stop() {
      if (stopped || !ctx) return;
      stopped = true;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }, 250);
    },
  };
}

/** Low room tone for the spatial mode. Returns a stop handle. */
export function startAmbience() {
  const c = initAudio();
  if (!c || !master) return () => {};

  const src = noiseSource();
  if (!src) return () => {};

  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  lp.Q.value = 0.7;

  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.setTargetAtTime(0.035, c.currentTime, 1.4);

  // A slow LFO on the cutoff keeps the tone from reading as a flat hiss.
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 60;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start();

  src.connect(lp).connect(g).connect(master);
  src.start();

  return () => {
    if (!ctx) return;
    g.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    setTimeout(() => {
      try {
        src.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    }, 2000);
  };
}

/** Soft mallet tone for object selection in the spatial view. */
export function playTone(freq = 640, duration = 0.22, gain = 0.14) {
  const c = initAudio();
  if (!c || !master) return;
  const now = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;

  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(g).connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Airy transition sweep for entering and leaving the spatial view. */
export function playWhoosh(reverse = false) {
  const c = initAudio();
  if (!c || !master) return;
  const now = c.currentTime;

  const src = noiseSource();
  if (!src) return;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(reverse ? 2400 : 300, now);
  bp.frequency.exponentialRampToValueAtTime(reverse ? 300 : 2400, now + 0.75);

  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.1, now + 0.18);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

  src.connect(bp).connect(g).connect(master);
  src.start(now);
  src.stop(now + 0.85);
}
