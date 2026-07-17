/**
 * How far the hand is from the camera, and whether it is close enough to mean
 * anything.
 *
 * Why this exists: a raycast alone cannot tell a deliberate point from a hand
 * that merely drifted through frame. Worse, apparent landmark noise grows as the
 * hand gets smaller in frame, so a distant hand produces exactly the jitter that
 * makes taps misfire. Distance is the missing signal — it decides whether the
 * visitor is reaching for something or just present.
 *
 * The estimate is a pinhole-camera solve:
 *
 *     apparent = real / (distance · 2·tan(fov/2))   ⟹   distance = real / (apparent · 2·tan(fov/2))
 *
 * `real` comes from MediaPipe's world landmarks, which are metric — so this
 * calibrates itself to the actual person's hand rather than assuming an average
 * one. A large hand held far away and a small hand held near no longer read the
 * same, which is the classic failure of size-only depth.
 */

import { LANDMARK, type Landmark } from './gestures';

/**
 * Assumed vertical field of view for a typical laptop webcam, in degrees.
 *
 * No browser API reports a camera's FOV — `getCapabilities()` has no such field
 * — so this has to be assumed. It scales the estimate linearly: if a given
 * camera is wider than this, reported distances read proportionally short.
 * That is tolerable because every threshold downstream is a generous band and
 * the *relative* signal (near vs far, approaching vs withdrawing) stays correct
 * regardless. Treat reported centimetres as a good estimate, not a measurement.
 */
const ASSUMED_FOV_Y_DEG = 42;

/** Plausible range for a real wrist→middle-knuckle span, in metres. */
const HAND_SPAN_MIN = 0.055;
const HAND_SPAN_MAX = 0.135;
/** Used only when world landmarks are unavailable or implausible. */
const HAND_SPAN_FALLBACK = 0.093;

/** The band within which a hand is treated as interacting, in metres. */
export const REACH_NEAR = 0.28;
export const REACH_FAR = 0.95;

export type ReachZone = 'tooClose' | 'reach' | 'tooFar';

export interface DepthReading {
  /** Estimated camera→hand distance, in metres. */
  distance: number;
  /** 0 at the far edge of the usable band, 1 at the near edge. */
  reach: number;
  zone: ReachZone;
  /** Metres per second toward the camera; positive means approaching. */
  approachSpeed: number;
  /** Real wrist→knuckle span in metres, once world landmarks resolve it. */
  handSpan: number;
}

const dist3 = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Apparent wrist→knuckle span, expressed in units of image *height*.
 *
 * MediaPipe normalises x by width and y by height, so raw Euclidean distance in
 * that space is stretched by the aspect ratio. Measuring a length without
 * undoing that would make the same hand read as a different size purely because
 * the camera is widescreen.
 */
export function apparentSpan(lm: Landmark[], aspect: number): number {
  const dx = (lm[LANDMARK.MIDDLE_MCP].x - lm[LANDMARK.WRIST].x) * aspect;
  const dy = lm[LANDMARK.MIDDLE_MCP].y - lm[LANDMARK.WRIST].y;
  return Math.max(Math.hypot(dx, dy), 1e-5);
}

/** True metric span from world landmarks, or null if implausible. */
export function metricSpan(world: Landmark[] | undefined): number | null {
  if (!world || world.length <= LANDMARK.MIDDLE_MCP) return null;
  const s = dist3(world[LANDMARK.WRIST], world[LANDMARK.MIDDLE_MCP]);
  if (!Number.isFinite(s) || s < HAND_SPAN_MIN || s > HAND_SPAN_MAX) return null;
  return s;
}

const TAN_HALF_FOV = Math.tan((ASSUMED_FOV_Y_DEG * Math.PI) / 360);

export function zoneFor(distance: number): ReachZone {
  if (distance < REACH_NEAR) return 'tooClose';
  if (distance > REACH_FAR) return 'tooFar';
  return 'reach';
}

/**
 * Per-hand depth estimator.
 *
 * Holds state because two things need history: the smoothed distance (raw
 * per-frame estimates are noisy enough to make a reach meter flicker) and the
 * approach speed, which needs a previous sample to exist at all.
 *
 * The person's hand span is smoothed separately and slowly — it is a physical
 * constant, so it should settle once and then stop moving, and letting it drift
 * frame-to-frame would feed noise straight into every distance estimate.
 */
export class DepthTracker {
  private smoothed = 0;
  private span = HAND_SPAN_FALLBACK;
  private spanSamples = 0;
  private lastT = 0;
  private velocity = 0;
  private started = false;

  reset() {
    this.started = false;
    this.smoothed = 0;
    this.velocity = 0;
    this.spanSamples = 0;
    this.span = HAND_SPAN_FALLBACK;
  }

  update(
    lm: Landmark[],
    world: Landmark[] | undefined,
    aspect: number,
    now: number,
  ): DepthReading {
    // Converge on this person's real hand size, then effectively freeze it.
    const measured = metricSpan(world);
    if (measured !== null) {
      this.spanSamples = Math.min(this.spanSamples + 1, 120);
      const alpha = 1 / this.spanSamples; // running mean, tightening over time
      this.span += (measured - this.span) * alpha;
    }

    const raw = this.span / (apparentSpan(lm, aspect) * 2 * TAN_HALF_FOV);
    const clamped = Math.min(4, Math.max(0.08, raw));

    if (!this.started) {
      this.smoothed = clamped;
      this.lastT = now;
      this.started = true;
    } else {
      const dt = Math.max((now - this.lastT) / 1000, 1e-3);
      this.lastT = now;
      const prev = this.smoothed;
      // Fixed-cutoff EMA: depth changes slowly compared to lateral motion, so
      // it can be smoothed harder than the landmark positions without feeling
      // laggy.
      this.smoothed += (clamped - this.smoothed) * Math.min(1, dt * 9);
      const instant = (prev - this.smoothed) / dt; // + = approaching
      this.velocity += (instant - this.velocity) * Math.min(1, dt * 8);
    }

    const d = this.smoothed;
    const reach = Math.min(1, Math.max(0, (REACH_FAR - d) / (REACH_FAR - REACH_NEAR)));

    return {
      distance: d,
      reach,
      zone: zoneFor(d),
      approachSpeed: this.velocity,
      handSpan: this.span,
    };
  }
}
