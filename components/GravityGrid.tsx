'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

/** Grid pitch, CSS px. */
const CELL = 46;
/** Sampling step along each line — fine enough that bends read as curves. */
const STEP = 10;
/** Radius of the well's influence (Gaussian sigma), CSS px. */
const SIGMA = 150;
/**
 * Peak pull toward the cursor, as a fraction of the distance. Kept under ~0.5
 * so lines bend into the well but never cross each other.
 */
const PULL = 0.42;

/**
 * The 2D homepage's background: a thin grid that behaves like spacetime around
 * a mass. Wherever the cursor is, the lines sink toward it — the familiar
 * "gravity well" picture — and when the cursor leaves, the fabric relaxes flat.
 *
 * One fixed canvas behind the page. The well's position and depth are springs,
 * so it glides after the cursor rather than snapping; once everything has
 * settled flat the loop stops drawing altogether.
 */
export function GravityGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    };

    // Target: where the cursor is, and whether a mass should be there at all.
    let tx = -9999;
    let ty = -9999;
    let present = false;
    // Springs: the well's actual centre and depth (0 = flat, 1 = full well).
    let wx = -9999;
    let wy = -9999;
    let depth = 0;
    let dirty = true;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!present) {
        // Arriving from outside: start the well where the cursor is, rather
        // than sweeping in from wherever it was last.
        if (depth < 0.02) {
          wx = tx;
          wy = ty;
        }
        present = true;
      }
    };
    const onLeave = () => {
      present = false;
    };
    // A lifted finger removes the mass; a mouse button release does not.
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') onLeave();
    };
    const onOut = (e: PointerEvent | MouseEvent) => {
      // Fired on every element boundary; only the window edge means "gone".
      if (!(e as MouseEvent).relatedTarget) present = false;
    };

    /** Displace one grid point toward the well. Returns [x, y, sink 0–1]. */
    const warp = (px: number, py: number): [number, number, number] => {
      if (depth < 0.001) return [px, py, 0];
      const dx = wx - px;
      const dy = wy - py;
      const g = Math.exp(-(dx * dx + dy * dy) / (2 * SIGMA * SIGMA)) * depth;
      const k = g * PULL;
      return [px + dx * k, py + dy * k, g];
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;

      // Lines run past the edges so the warp never pulls a free end into view.
      const x0 = -CELL;
      const y0 = -CELL;
      const x1 = w + CELL;
      const y1 = h + CELL;

      const strokeLine = (pts: [number, number, number][]) => {
        // Split each line into short runs so the colour can deepen inside the
        // well — the shading is what sells it as depth rather than a smudge.
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const sink = (a[2] + b[2]) / 2;
          const alpha = 0.07 + sink * 0.16;
          ctx.strokeStyle = `rgba(10,10,10,${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      };

      // Fast path: completely flat — plain straight lines, one stroke.
      if (depth < 0.001) {
        ctx.strokeStyle = 'rgba(10,10,10,0.07)';
        ctx.beginPath();
        for (let x = 0; x <= w; x += CELL) {
          ctx.moveTo(x + 0.5, 0);
          ctx.lineTo(x + 0.5, h);
        }
        for (let y = 0; y <= h; y += CELL) {
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(w, y + 0.5);
        }
        ctx.stroke();
        return;
      }

      // Only lines near the well can bend; the rest are drawn straight.
      const reach = SIGMA * 3.2;
      ctx.strokeStyle = 'rgba(10,10,10,0.07)';
      ctx.beginPath();
      for (let x = 0; x <= w; x += CELL) {
        if (Math.abs(x - wx) < reach) continue;
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
      }
      for (let y = 0; y <= h; y += CELL) {
        if (Math.abs(y - wy) < reach) continue;
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
      }
      ctx.stroke();

      for (let x = 0; x <= w; x += CELL) {
        if (Math.abs(x - wx) >= reach) continue;
        const pts: [number, number, number][] = [];
        for (let y = y0; y <= y1; y += STEP) pts.push(warp(x + 0.5, y));
        strokeLine(pts);
      }
      for (let y = 0; y <= h; y += CELL) {
        if (Math.abs(y - wy) >= reach) continue;
        const pts: [number, number, number][] = [];
        for (let x = x0; x <= x1; x += STEP) pts.push(warp(x, y + 0.5));
        strokeLine(pts);
      }

      // A faint shadow at the bottom of the well.
      const r = SIGMA * 1.1;
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      grad.addColorStop(0, `rgba(10,10,10,${(0.035 * depth).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(10,10,10,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(wx - r, wy - r, r * 2, r * 2);
    };

    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Critically-damped-ish follow: the well glides after the cursor.
      const follow = 1 - Math.exp(-dt * 9);
      const prevX = wx;
      const prevY = wy;
      const prevD = depth;
      if (present) {
        wx += (tx - wx) * follow;
        wy += (ty - wy) * follow;
      }
      // Sinks in quickly, relaxes back a little slower — spacetime easing out.
      const target = present ? 1 : 0;
      const rate = present ? 6 : 3;
      depth += (target - depth) * (1 - Math.exp(-dt * rate));
      if (!present && depth < 0.002) depth = 0;

      const moved =
        Math.abs(wx - prevX) > 0.05 || Math.abs(wy - prevY) > 0.05 || Math.abs(depth - prevD) > 0.0005;
      if (moved || dirty) {
        draw();
        dirty = false;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    if (reduced) {
      // Still, flat grid: no well, no loop.
      draw();
      return () => window.removeEventListener('resize', resize);
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    // Finger lifted, gesture taken over by scrolling, or the mouse left.
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onLeave, { passive: true });
    document.addEventListener('mouseout', onOut);
    window.addEventListener('blur', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onLeave);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('blur', onLeave);
    };
  }, [reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
