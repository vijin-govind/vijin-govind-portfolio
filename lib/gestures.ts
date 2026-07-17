/**
 * Gesture classification from MediaPipe Hands landmarks.
 *
 * Every threshold here is expressed as a ratio of the hand's own scale
 * (wrist → middle knuckle) rather than in normalized image units. Without that,
 * a hand held near the lens reads as a permanent open palm and a hand held far
 * away can never un-pinch.
 */

import type { DepthReading } from './handDepth';

export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const;

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureName =
  | 'none'
  | 'open'
  | 'pinch'
  | 'point'
  | 'fist'
  | 'peace'
  | 'thumbsUp'
  | 'palmUp'
  | 'palmDown';

export interface HandReading {
  /** Which physical hand MediaPipe believes this is, already un-mirrored. */
  handedness: 'Left' | 'Right';
  landmarks: Landmark[];
  gesture: GestureName;
  /** 0–1 pinch closure. 1 is fully closed; useful for analogue grip feedback. */
  pinchStrength: number;
  /** Midpoint of thumb and index tips — the natural "grab point" of a pinch. */
  pinchPoint: { x: number; y: number };
  /** Palm centre in normalized image space. */
  palmCenter: { x: number; y: number };
  /** Rough distance proxy: larger hand scale means closer to the lens. */
  scale: number;
  /** Index-to-middle fingertip gap, hand-scale normalised. Drives two-finger zoom. */
  spread: number;
  extended: [boolean, boolean, boolean, boolean, boolean];
  /** Estimated camera→hand distance and reach band. See lib/handDepth.ts. */
  depth: DepthReading;
}

const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

const dist3 = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.5);

/** Wrist → middle knuckle. Stable under finger movement, unlike a bounding box. */
export function handScale(lm: Landmark[]): number {
  return Math.max(dist(lm[LANDMARK.WRIST], lm[LANDMARK.MIDDLE_MCP]), 1e-4);
}

/**
 * A finger is extended when its tip is further from the wrist than its middle
 * joint. Comparing radial distance rather than raw Y keeps this correct when
 * the hand is rotated or upside down.
 */
function fingerExtended(lm: Landmark[], tip: number, pip: number): boolean {
  const wrist = lm[LANDMARK.WRIST];
  return dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.12;
}

/**
 * The thumb never folds toward the wrist the way the fingers do, so radial
 * distance misreads it. Measure how far the tip has travelled away from the
 * index knuckle instead — that is the axis it actually moves along.
 */
function thumbExtended(lm: Landmark[]): boolean {
  const s = handScale(lm);
  return dist(lm[LANDMARK.THUMB_TIP], lm[LANDMARK.INDEX_MCP]) / s > 0.72;
}

export function fingerStates(lm: Landmark[]): [boolean, boolean, boolean, boolean, boolean] {
  return [
    thumbExtended(lm),
    fingerExtended(lm, LANDMARK.INDEX_TIP, LANDMARK.INDEX_PIP),
    fingerExtended(lm, LANDMARK.MIDDLE_TIP, LANDMARK.MIDDLE_PIP),
    fingerExtended(lm, LANDMARK.RING_TIP, LANDMARK.RING_PIP),
    fingerExtended(lm, LANDMARK.PINKY_TIP, LANDMARK.PINKY_PIP),
  ];
}

/**
 * Gap between the index and middle fingertips, as a ratio of hand scale.
 *
 * This is the "two-finger" caliper: held in a V, opening and closing the two
 * fingers is a zoom the way spreading two fingers on a trackpad is. Normalising
 * by hand scale is what makes it independent of how far the hand is from the
 * lens — otherwise simply leaning in would zoom.
 */
export function fingerSpread(lm: Landmark[]): number {
  return dist(lm[LANDMARK.INDEX_TIP], lm[LANDMARK.MIDDLE_TIP]) / handScale(lm);
}

/** 0 when the pinch is wide open, 1 when thumb and index tips are touching. */
export function pinchStrength(lm: Landmark[]): number {
  const gap = dist3(lm[LANDMARK.THUMB_TIP], lm[LANDMARK.INDEX_TIP]) / handScale(lm);
  // Open ≈ 1.0 of hand scale, closed ≈ 0.25. Map that band onto 0–1.
  return clamp01((1.0 - gap) / (1.0 - 0.25));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Palm facing, derived from the palm plane's normal. The sign of the normal
 * depends on which hand it is — a left palm and a right palm with identical
 * orientation wind their knuckles in opposite directions — so handedness has to
 * flip it or every "palm up" reads as "palm down" for one of the two hands.
 */
function palmFacing(lm: Landmark[], handedness: 'Left' | 'Right'): 'up' | 'down' | 'side' {
  const wrist = lm[LANDMARK.WRIST];
  const a = {
    x: lm[LANDMARK.INDEX_MCP].x - wrist.x,
    y: lm[LANDMARK.INDEX_MCP].y - wrist.y,
    z: lm[LANDMARK.INDEX_MCP].z - wrist.z,
  };
  const b = {
    x: lm[LANDMARK.PINKY_MCP].x - wrist.x,
    y: lm[LANDMARK.PINKY_MCP].y - wrist.y,
    z: lm[LANDMARK.PINKY_MCP].z - wrist.z,
  };
  // Cross product a × b gives the palm normal in image space (+z toward camera).
  let nz = a.x * b.y - a.y * b.x;
  if (handedness === 'Left') nz = -nz;

  const mag = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  const normalized = mag > 1e-6 ? nz / mag : 0;

  if (normalized > 0.35) return 'up';
  if (normalized < -0.35) return 'down';
  return 'side';
}

/**
 * Classify a single frame. Order matters: pinch is tested before open-hand
 * because a pinching hand still has three fingers extended and would otherwise
 * be swallowed by the open-hand case.
 */
export function classify(lm: Landmark[], handedness: 'Left' | 'Right'): GestureName {
  const [thumb, index, middle, ring, pinky] = fingerStates(lm);
  const pinch = pinchStrength(lm);

  if (pinch > 0.72) return 'pinch';

  const curledCount = [index, middle, ring, pinky].filter((f) => !f).length;

  // Thumbs up: thumb out, everything else curled, thumb pointing screen-up.
  if (thumb && curledCount === 4) {
    const up = lm[LANDMARK.THUMB_TIP].y < lm[LANDMARK.WRIST].y - handScale(lm) * 0.35;
    if (up) return 'thumbsUp';
    return 'fist';
  }

  if (curledCount === 4) return 'fist';
  if (index && !middle && !ring && !pinky) return 'point';
  if (index && middle && !ring && !pinky) return 'peace';

  if (index && middle && ring && pinky) {
    const facing = palmFacing(lm, handedness);
    if (facing === 'up') return 'palmUp';
    if (facing === 'down') return 'palmDown';
    return 'open';
  }

  return 'none';
}

/**
 * Temporal debounce. MediaPipe flickers between neighbouring classes on single
 * frames — a pinch drops for one frame mid-drag, an open hand blips to 'none'.
 * Committing a gesture only after it holds for N consecutive frames trades a
 * few milliseconds of latency for an interaction that does not chatter.
 *
 * Pinch is deliberately given a shorter hold than the rest: it is the one
 * gesture whose latency the user can feel as "the cord didn't grab".
 */
export class GestureStabilizer {
  private candidate: GestureName = 'none';
  private streak = 0;
  private committed: GestureName = 'none';

  constructor(
    private readonly holdFrames = 4,
    private readonly fastHoldFrames = 2,
  ) {}

  push(g: GestureName): GestureName {
    if (g === this.candidate) {
      this.streak += 1;
    } else {
      this.candidate = g;
      this.streak = 1;
    }

    const needed = g === 'pinch' || g === 'none' ? this.fastHoldFrames : this.holdFrames;
    if (this.streak >= needed) this.committed = this.candidate;
    return this.committed;
  }

  get current(): GestureName {
    return this.committed;
  }

  reset() {
    this.candidate = 'none';
    this.streak = 0;
    this.committed = 'none';
  }
}

/**
 * One-euro-style smoothing for landmark positions. A plain lerp forces a choice
 * between jittery-but-responsive and smooth-but-laggy; this adapts the cutoff
 * to speed, so slow hands are smoothed hard and fast hands stay responsive.
 */
export class PointSmoother {
  private x = 0;
  private y = 0;
  private initialized = false;

  constructor(
    private readonly minCutoff = 0.9,
    private readonly beta = 0.02,
  ) {}

  filter(px: number, py: number, dt: number): { x: number; y: number } {
    if (!this.initialized) {
      this.x = px;
      this.y = py;
      this.initialized = true;
      return { x: this.x, y: this.y };
    }

    const speed = Math.hypot(px - this.x, py - this.y) / Math.max(dt, 1e-3);
    const cutoff = this.minCutoff + this.beta * speed;
    const tau = 1 / (2 * Math.PI * cutoff);
    const alpha = 1 / (1 + tau / Math.max(dt, 1e-3));

    this.x += alpha * (px - this.x);
    this.y += alpha * (py - this.y);
    return { x: this.x, y: this.y };
  }

  reset() {
    this.initialized = false;
  }
}

/** Detects a horizontal flick from a short history of palm positions. */
export class SwipeDetector {
  private history: { x: number; t: number }[] = [];

  push(x: number, t: number): 'left' | 'right' | null {
    this.history.push({ x, t });
    // Keep a 300ms window — long enough to measure a flick, short enough that a
    // slow deliberate hand movement never accumulates into one.
    while (this.history.length > 1 && t - this.history[0].t > 300) this.history.shift();
    if (this.history.length < 4) return null;

    const first = this.history[0];
    const last = this.history[this.history.length - 1];
    const dx = last.x - first.x;
    const dt = (last.t - first.t) / 1000;
    if (dt < 0.05) return null;

    const velocity = dx / dt;
    if (Math.abs(dx) < 0.18 || Math.abs(velocity) < 0.9) return null;

    this.history = [];
    return dx > 0 ? 'right' : 'left';
  }

  reset() {
    this.history = [];
  }
}
