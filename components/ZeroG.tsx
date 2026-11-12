'use client';

import { Fragment, useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { useExperience } from './ExperienceProvider';
import { expandPoint } from '@/lib/videoMapping';
import { LANDMARK } from '@/lib/gestures';

/**
 * Zero-G: in XR mode the homepage's type and controls become loose objects
 * the visitor can push with a fingertip. Pushed things drift and turn as if in
 * microgravity — almost no friction, so a flick keeps going — and only after
 * they have been left alone for a while do they float back to their places.
 * The page has to stay readable and clickable; the return is what makes the
 * play safe.
 *
 * Two parts:
 *   <ZeroGText> splits text into per-letter or per-word bodies, but only while
 *               the field is active — in 2D the DOM is the plain string.
 *   <ZeroGField> is the physics loop: reads every [data-zerog] element, the
 *               fingertips, and writes transforms. Nothing goes through React.
 */

/** True while the homepage is in XR — the only time the field runs. */
export function useZeroGActive() {
  const { cameraStatus, mode } = useExperience();
  const reduced = useReducedMotion();
  return cameraStatus === 'granted' && mode === 'site' && !reduced;
}

/**
 * Text that comes apart into floating pieces in XR. `chars` for the hero name
 * (each letter its own body), `words` for running copy.
 */
export function ZeroGText({
  text,
  by = 'words',
  className,
}: {
  text: string;
  by?: 'chars' | 'words';
  className?: string;
}) {
  const active = useZeroGActive();
  if (!active) return className ? <span className={className}>{text}</span> : <>{text}</>;

  const words = text.split(' ');
  return (
    <span className={className}>
      {/* The pieces are visual; assistive tech gets the sentence once. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((w, wi) => (
          <Fragment key={wi}>
            {wi > 0 && ' '}
            {by === 'words' ? (
              <span data-zerog className="inline-block">
                {w}
              </span>
            ) : (
              // Letters of one word stay in a nowrap group so a line can only
              // break between words, exactly as the plain string would.
              <span className="inline-block whitespace-nowrap">
                {Array.from(w).map((ch, ci) => (
                  <span key={ci} data-zerog className="inline-block">
                    {ch}
                  </span>
                ))}
              </span>
            )}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

interface Body {
  el: HTMLElement;
  /** Displacement from the laid-out position, px. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Rotation, degrees, and its rate. */
  r: number;
  vr: number;
  /** Last time a finger touched it — the return waits on this. */
  touched: number;
  awake: boolean;
}

interface Tip {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seen: number;
}

/** Fingertip contact radius, px. */
const FINGER_R = 26;
/** Microgravity: velocity halves only every ~2s. */
const LINEAR_DRAG = 0.35;
const ANGULAR_DRAG = 0.6;
/** Left alone this long, a body starts floating home. */
const RETURN_AFTER_MS = 2600;
/** Return spring — soft and slightly under-damped, so it drifts, not snaps. */
const SPRING_K = 2.4;
const SPRING_C = 2.6;
const MAX_SPEED = 900;
/** Fraction of speed kept when a body bounces off the edge of the screen. */
const WALL_BOUNCE = 0.55;

/** Which fingertips push, by pose. Pinch is excluded: it is pulling the cord. */
function pushingTips(gesture: string): number[] {
  switch (gesture) {
    case 'point':
      return [LANDMARK.INDEX_TIP];
    case 'peace':
      return [LANDMARK.INDEX_TIP, LANDMARK.MIDDLE_TIP];
    case 'open':
    case 'palmUp':
    case 'palmDown':
      return [LANDMARK.INDEX_TIP, LANDMARK.MIDDLE_TIP, LANDMARK.RING_TIP, LANDMARK.PINKY_TIP];
    case 'pinch':
    case 'fist':
      return [];
    default:
      return [LANDMARK.INDEX_TIP];
  }
}

export function ZeroGField() {
  const { framesRef } = useExperience();

  useEffect(() => {
    const bodies = new Map<HTMLElement, Body>();
    const tips = new Map<string, Tip>();
    let raf = 0;
    let last = performance.now();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ---- Sync bodies with the DOM (text splits in and out on mode change).
      const els = document.querySelectorAll<HTMLElement>('[data-zerog]');
      const present = new Set<HTMLElement>();
      els.forEach((el) => {
        present.add(el);
        if (!bodies.has(el)) {
          bodies.set(el, { el, x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, touched: 0, awake: false });
        }
      });
      for (const el of bodies.keys()) if (!present.has(el)) bodies.delete(el);

      // ---- Fingertips, in the same expanded mapping as the cord and the
      //      homepage skeleton, so a push lands where the drawn finger is.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const live: Tip[] = [];
      const hands = framesRef.current.hands;
      hands.forEach((hand, hi) => {
        for (const idx of pushingTips(hand.gesture)) {
          const lm = hand.landmarks[idx];
          const p = expandPoint(lm.x, lm.y, { width: vw, height: vh }, true);
          const key = `${hi}:${idx}`;
          const prev = tips.get(key);
          let vx = 0;
          let vy = 0;
          if (prev && now - prev.seen < 120 && dt > 0) {
            // Smoothed finger velocity: raw landmark deltas are noisy, and the
            // noise would otherwise read as tiny pushes on everything nearby.
            vx = prev.vx * 0.6 + ((p.x - prev.x) / dt) * 0.4;
            vy = prev.vy * 0.6 + ((p.y - prev.y) / dt) * 0.4;
          }
          const tip = { x: p.x, y: p.y, vx, vy, seen: now };
          tips.set(key, tip);
          live.push(tip);
        }
      });
      for (const [k, t] of tips) if (now - t.seen > 300) tips.delete(k);

      // ---- Read every rect first, then write every transform: one layout
      //      pass per frame instead of one per element.
      const geo: { b: Body; cx: number; cy: number; hw: number; hh: number }[] = [];
      for (const b of bodies.values()) {
        const rect = b.el.getBoundingClientRect();
        // The rect includes our own transform; rotation keeps the centre, so
        // subtracting the displacement recovers the home centre. Half-sizes
        // come from layout, not the rotated bounding box.
        const hw = b.el.offsetWidth / 2;
        const hh = b.el.offsetHeight / 2;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // Off-screen and at rest: nothing can touch it, skip the maths.
        if (!b.awake && (cy + hh < -50 || cy - hh > vh + 50)) continue;
        geo.push({ b, cx, cy, hw, hh });
      }

      for (const g of geo) {
        const { b, cx, cy, hw, hh } = g;
        // Laid-out centre, before this frame's displacement.
        const homeX = cx - b.x;
        const homeY = cy - b.y;

        // ---- Finger contacts.
        for (const t of live) {
          const qx = Math.max(cx - hw, Math.min(t.x, cx + hw));
          const qy = Math.max(cy - hh, Math.min(t.y, cy + hh));
          const d = Math.hypot(t.x - qx, t.y - qy);
          if (d >= FINGER_R) continue;

          // Push away from the fingertip, through the body's centre.
          let nx = cx - t.x;
          let ny = cy - t.y;
          const nl = Math.hypot(nx, ny) || 1;
          nx /= nl;
          ny /= nl;
          const pen = FINGER_R - d;
          const approach = Math.max(0, t.vx * nx + t.vy * ny);

          // Tuned for a nudge, not a bat: a casual flick should send a letter
          // drifting across the page, not out of the window.
          const ix = nx * (pen * 9 + approach * 0.5) + t.vx * 0.1;
          const iy = ny * (pen * 9 + approach * 0.5) + t.vy * 0.1;
          b.vx += ix;
          b.vy += iy;
          // Off-centre hits spin it: torque from the contact offset.
          const rx = t.x - cx;
          const ry = t.y - cy;
          const size = Math.max(hw, hh, 8);
          b.vr += ((rx * iy - ry * ix) / (size * size)) * 9;

          b.touched = now;
          b.awake = true;
        }

        if (!b.awake) continue;

        // ---- Microgravity drift, then the slow way home.
        const home = now - b.touched > RETURN_AFTER_MS;
        if (home) {
          b.vx += (-SPRING_K * b.x - SPRING_C * b.vx) * dt;
          b.vy += (-SPRING_K * b.y - SPRING_C * b.vy) * dt;
          b.vr += (-SPRING_K * b.r - SPRING_C * b.vr) * dt;
        }
        const ld = Math.exp(-LINEAR_DRAG * dt);
        b.vx *= ld;
        b.vy *= ld;
        b.vr *= Math.exp(-ANGULAR_DRAG * dt);

        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) {
          b.vx *= MAX_SPEED / sp;
          b.vy *= MAX_SPEED / sp;
        }
        b.vr = Math.max(-540, Math.min(540, b.vr));

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.r += b.vr * dt;

        // The screen is the capsule: pieces bounce softly off its edges and
        // keep floating in view instead of leaving for good. Measured from the
        // body's home centre plus displacement, i.e. where it is drawn now.
        const px = homeX + b.x;
        const py = homeY + b.y;
        if (px - hw < 0 && b.vx < 0) {
          b.x += hw - px;
          b.vx = -b.vx * WALL_BOUNCE;
        } else if (px + hw > vw && b.vx > 0) {
          b.x -= px + hw - vw;
          b.vx = -b.vx * WALL_BOUNCE;
        }
        // Vertical walls only for things that started on screen: content
        // further down the page is reached by scrolling, not by floating.
        if (homeY > 0 && homeY < vh) {
          if (py - hh < 0 && b.vy < 0) {
            b.y += hh - py;
            b.vy = -b.vy * WALL_BOUNCE;
          } else if (py + hh > vh && b.vy > 0) {
            b.y -= py + hh - vh;
            b.vy = -b.vy * WALL_BOUNCE;
          }
        }

        // Settled back home: drop the transform entirely and sleep.
        if (
          home &&
          Math.abs(b.x) < 0.3 &&
          Math.abs(b.y) < 0.3 &&
          Math.abs(b.r) < 0.2 &&
          Math.hypot(b.vx, b.vy) < 2
        ) {
          b.x = b.y = b.vx = b.vy = b.r = b.vr = 0;
          b.awake = false;
          b.el.style.transform = '';
          b.el.style.willChange = '';
          continue;
        }

        b.el.style.willChange = 'transform';
        b.el.style.transform = `translate3d(${b.x.toFixed(2)}px, ${b.y.toFixed(2)}px, 0) rotate(${b.r.toFixed(2)}deg)`;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Leaving XR: everything floats back into place rather than snapping.
      for (const b of bodies.values()) {
        if (!b.awake) continue;
        const el = b.el;
        el.style.transition = 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
        el.style.willChange = '';
        setTimeout(() => {
          el.style.transition = '';
        }, 750);
      }
    };
  }, [framesRef]);

  return null;
}
