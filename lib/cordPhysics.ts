/**
 * Verlet rope for the pull cord.
 *
 * A single spring on the handle would ease back to rest in a straight line,
 * which reads as an animation. A chain of constrained points carries momentum
 * through the rope, so releasing it produces the slack, overshoot and lateral
 * whip of an actual cord — that behaviour is the whole point of the object.
 */

export interface Point {
  x: number;
  y: number;
  px: number; // previous position; velocity is implicit in (x - px)
  py: number;
  pinned: boolean;
}

export interface RopeConfig {
  segments: number;
  restLength: number;
  gravity: number;
  damping: number;
  /** Constraint relaxation passes per step. More passes = stiffer rope. */
  iterations: number;
}

export const DEFAULT_ROPE: RopeConfig = {
  segments: 22,
  restLength: 14,
  gravity: 1400,
  damping: 0.994,
  iterations: 14,
};

export class Rope {
  points: Point[] = [];
  private cfg: RopeConfig;
  private anchorX = 0;
  private anchorY = 0;

  constructor(anchorX: number, anchorY: number, cfg: Partial<RopeConfig> = {}) {
    this.cfg = { ...DEFAULT_ROPE, ...cfg };
    this.reset(anchorX, anchorY);
  }

  reset(anchorX: number, anchorY: number) {
    this.anchorX = anchorX;
    this.anchorY = anchorY;
    this.points = [];
    for (let i = 0; i < this.cfg.segments; i++) {
      const y = anchorY + i * this.cfg.restLength;
      this.points.push({ x: anchorX, y, px: anchorX, py: y, pinned: i === 0 });
    }
  }

  /** Re-pin the top without destroying the rope's current motion (on resize). */
  setAnchor(x: number, y: number) {
    this.anchorX = x;
    this.anchorY = y;
  }

  get end(): Point {
    return this.points[this.points.length - 1];
  }

  /** Resting Y of the handle, used to measure pull distance. */
  get restY(): number {
    return this.anchorY + (this.cfg.segments - 1) * this.cfg.restLength;
  }

  get length(): number {
    return (this.cfg.segments - 1) * this.cfg.restLength;
  }

  /**
   * @param dt        seconds; clamped by the caller
   * @param grabTarget when held, the position the handle is being dragged to
   */
  step(dt: number, grabTarget: { x: number; y: number } | null) {
    const { gravity, damping, iterations, restLength } = this.cfg;

    // Verlet integration: position carries velocity, so no explicit v term.
    for (const p of this.points) {
      if (p.pinned) continue;
      const vx = (p.x - p.px) * damping;
      const vy = (p.y - p.py) * damping;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + gravity * dt * dt;
    }

    const last = this.points.length - 1;
    for (let k = 0; k < iterations; k++) {
      // Anchor stays welded to the ceiling every pass, not just once, or the
      // distance constraints below drag it downward over time.
      this.points[0].x = this.anchorX;
      this.points[0].y = this.anchorY;

      // While grabbed the handle is authoritative: it is pinned to the pointer
      // and the rope resolves around it. This is what lets the cord stretch
      // rather than teleport.
      if (grabTarget) {
        this.points[last].x = grabTarget.x;
        this.points[last].y = grabTarget.y;
      }

      for (let i = 0; i < last; i++) {
        const a = this.points[i];
        const b = this.points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;

        // Allow mild extension under load — a real cord is not perfectly rigid,
        // and the slight give is what sells the tension.
        const diff = (d - restLength) / d;
        const aFixed = i === 0;
        const bFixed = grabTarget !== null && i + 1 === last;

        if (aFixed && bFixed) continue;

        // Weight the correction so a fixed neighbour absorbs none of it.
        let wa = 0.5;
        let wb = 0.5;
        if (aFixed) {
          wa = 0;
          wb = 1;
        } else if (bFixed) {
          wa = 1;
          wb = 0;
        }

        a.x += dx * diff * wa;
        a.y += dy * diff * wa;
        b.x -= dx * diff * wb;
        b.y -= dy * diff * wb;
      }
    }
  }

  /** How far the handle sits below its rest position, in pixels. */
  pullDistance(): number {
    return Math.max(0, this.end.y - this.restY);
  }

  /**
   * Catmull-Rom through the points, emitted as a cubic SVG path. Polyline
   * segments would show visible facets on a 22-point rope at rest.
   */
  toPath(): string {
    const p = this.points;
    if (p.length < 2) return '';
    let d = `M ${p[0].x.toFixed(2)} ${p[0].y.toFixed(2)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i === 0 ? 0 : i - 1];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2 >= p.length ? p.length - 1 : i + 2];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  }

  /** Impulse applied to the handle, used to add a kick on release. */
  kick(vx: number, vy: number) {
    const e = this.end;
    e.px = e.x - vx;
    e.py = e.y - vy;
  }
}
