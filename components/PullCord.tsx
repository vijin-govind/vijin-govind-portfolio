'use client';

import { useEffect, useRef, useState } from 'react';
import { Rope } from '@/lib/cordPhysics';
import { createTensionVoice, initAudio, playClick } from '@/lib/audio';
import { expandPoint } from '@/lib/videoMapping';
import { useExperience } from './ExperienceProvider';

/**
 * Cord anchor, as a fraction of viewport width, clamped to a sane pixel band.
 * The minimum keeps the cord clear of the content inset on narrow screens; the
 * maximum stops it drifting into the middle of very wide ones.
 */
const ANCHOR_FRACTION = 0.08;
const ANCHOR_MIN = 40;
const ANCHOR_MAX = 170;

/** Cord stretch, in px, required to trip the switch. */
const ACTIVATION_PULL = 190;
/** How close the pointer/hand must be to the handle to take hold of it. */
const GRAB_RADIUS = 46;
/** Hands are noisier than a mouse, so gesture grabs get a wider catch. */
const GRAB_RADIUS_HAND = 120;

type CordState = 'idle' | 'ready' | 'grabbed';

export function PullCord() {
  const { framesRef, mode, enterSpatial, cameraStatus, soundOn } = useExperience();

  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const hitRef = useRef<SVGPathElement>(null);
  const handleRef = useRef<SVGGElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const cursorRef = useRef<SVGGElement>(null);
  const progressRef = useRef<SVGCircleElement>(null);

  const ropeRef = useRef<Rope | null>(null);
  const grabRef = useRef<{ x: number; y: number } | null>(null);
  const grabSourceRef = useRef<'mouse' | 'hand' | null>(null);
  const tensionRef = useRef<ReturnType<typeof createTensionVoice> | null>(null);
  const armedRef = useRef(false);

  // Mirrors of the refs above, used only to drive CSS classes and copy. Written
  // at most a few times per interaction rather than per frame.
  const [state, setState] = useState<CordState>('idle');
  const stateRef = useRef<CordState>('idle');

  // `mode` and `soundOn` are read inside the animation loop but must not be
  // effect dependencies: re-running the effect rebuilds the Rope, so toggling
  // sound or opening the spatial view would silently reset the cord's physics
  // mid-swing. Mirroring them into refs keeps the loop reading live values
  // while the effect itself mounts exactly once.
  const modeRef = useRef(mode);
  const soundRef = useRef(soundOn);
  modeRef.current = mode;
  soundRef.current = soundOn;
  const enterSpatialRef = useRef(enterSpatial);
  enterSpatialRef.current = enterSpatial;

  const setCordState = (next: CordState) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    setState(next);
  };

  useEffect(() => {
    const anchorX = () =>
      Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, window.innerWidth * ANCHOR_FRACTION));

    const rope = new Rope(anchorX(), 0);
    ropeRef.current = rope;

    const onResize = () => rope.setAnchor(anchorX(), 0);
    window.addEventListener('resize', onResize);

    let raf = 0;
    let last = performance.now();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      // Clamp dt: a backgrounded tab produces a multi-second delta that would
      // fling the rope to infinity on return.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      if (modeRef.current !== 'site') {
        // Keep integrating so the cord is settled when the visitor returns.
        rope.step(dt, null);
        draw();
        return;
      }

      resolveHand(now);
      rope.step(dt, grabRef.current);

      const pull = rope.pullDistance();
      const t = Math.min(1, pull / ACTIVATION_PULL);

      if (grabRef.current) {
        tensionRef.current?.set(t);
        if (t >= 1) armedRef.current = true;
      }

      draw(t);
    };

    /** Decide whether the tracked hand is grabbing, and where. */
    function resolveHand(now: number) {
      // A mouse drag in progress owns the cord; ignore the camera until it ends.
      if (grabSourceRef.current === 'mouse') return;

      const hands = framesRef.current.hands;
      if (hands.length === 0) {
        if (grabSourceRef.current === 'hand') release();
        else if (stateRef.current === 'ready') setCordState('idle');
        hideCursor();
        return;
      }

      // Prefer a pinching hand; otherwise track the first hand seen.
      const hand = hands.find((h) => h.gesture === 'pinch') ?? hands[0];

      // There is no full-screen video to align against here — the camera only
      // appears in the corner dock — so the cursor uses the expanded mapping.
      // A raw 0–1 stretch would put the cord, at ~8% of the viewport, out at the
      // very edge of the camera frame where tracking is least reliable.
      const p = expandPoint(
        hand.pinchPoint.x,
        hand.pinchPoint.y,
        { width: window.innerWidth, height: window.innerHeight },
        true,
      );
      const hx = p.x;
      const hy = p.y;
      showCursor(hx, hy, hand.gesture === 'pinch');

      const end = rope.end;
      const near = Math.hypot(hx - end.x, hy - end.y) < GRAB_RADIUS_HAND;

      if (grabSourceRef.current === 'hand') {
        if (hand.gesture === 'pinch') {
          grabRef.current = { x: hx, y: hy };
        } else {
          release();
        }
        return;
      }

      if (hand.gesture === 'pinch' && near) {
        grab(hx, hy, 'hand');
      } else if (hand.gesture === 'open' || hand.gesture === 'point' || near) {
        setCordState('ready');
      } else {
        setCordState('idle');
      }
    }

    function draw(tension = 0) {
      const path = pathRef.current;
      if (!path) return;
      const d = rope.toPath();
      path.setAttribute('d', d);
      hitRef.current?.setAttribute('d', d);

      const end = rope.end;
      const prev = rope.points[rope.points.length - 2];
      // Align the handle with the cord's final segment so it hangs correctly
      // when the rope swings rather than staying stubbornly vertical.
      const angle = (Math.atan2(end.x - prev.x, end.y - prev.y) * -180) / Math.PI;
      handleRef.current?.setAttribute(
        'transform',
        `translate(${end.x.toFixed(2)} ${end.y.toFixed(2)}) rotate(${angle.toFixed(2)})`,
      );

      glowRef.current?.setAttribute('cx', end.x.toFixed(2));
      glowRef.current?.setAttribute('cy', end.y.toFixed(2));

      if (progressRef.current) {
        const c = 2 * Math.PI * 26;
        progressRef.current.setAttribute('cx', end.x.toFixed(2));
        progressRef.current.setAttribute('cy', end.y.toFixed(2));
        progressRef.current.style.strokeDasharray = `${(tension * c).toFixed(2)} ${c}`;
        progressRef.current.style.opacity = tension > 0.02 ? '1' : '0';
      }

      // Cord thins slightly under tension — a small cue, but it is the kind of
      // detail that makes the rope read as physical rather than drawn.
      path.setAttribute('stroke-width', (1.5 - tension * 0.4).toFixed(2));
    }

    function showCursor(x: number, y: number, pinching: boolean) {
      const g = cursorRef.current;
      if (!g) return;
      g.style.opacity = '1';
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      g.dataset.pinching = pinching ? 'true' : 'false';
    }

    function hideCursor() {
      if (cursorRef.current) cursorRef.current.style.opacity = '0';
    }

    function grab(x: number, y: number, source: 'mouse' | 'hand') {
      grabSourceRef.current = source;
      grabRef.current = { x, y };
      armedRef.current = false;
      setCordState('grabbed');
      document.documentElement.classList.add('cursor-cord-grabbing');
      if (soundRef.current) {
        initAudio();
        tensionRef.current?.stop();
        tensionRef.current = createTensionVoice();
      }
    }

    function release() {
      // Arm on where the visitor actually pulled to, not on where the rope has
      // simulated to. The two agree during a normal drag, but a fast flick can
      // cross the threshold and be released before the solver ever catches up —
      // and that flick is unambiguously a pull, so it must count.
      const intent = grabRef.current ? grabRef.current.y - rope.restY : rope.pullDistance();
      const wasArmed = armedRef.current || intent >= ACTIVATION_PULL;
      grabRef.current = null;
      grabSourceRef.current = null;
      armedRef.current = false;
      document.documentElement.classList.remove('cursor-cord-grabbing');
      tensionRef.current?.set(0);
      tensionRef.current?.stop();
      tensionRef.current = null;
      setCordState('idle');

      if (wasArmed) {
        // Snap: a sharp upward impulse on top of the rope's own stored momentum.
        rope.kick(0, -26);
        if (soundRef.current) playClick(1);
        // Let the recoil read for a beat before the world changes underneath it.
        window.setTimeout(() => enterSpatialRef.current(), 260);
      }
    }

    // --- Pointer input -----------------------------------------------------
    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'site') return;
      const end = rope.end;
      if (Math.hypot(e.clientX - end.x, e.clientY - end.y) > GRAB_RADIUS) return;
      e.preventDefault();
      // Capture on the root so a fast drag that outruns the pointer keeps the
      // grab instead of dropping it the moment the cursor leaves the handle.
      // Throws if the pointer is no longer active, which must not abort the grab.
      try {
        svgRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      grab(e.clientX, e.clientY, 'mouse');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (grabSourceRef.current === 'mouse') {
        grabRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (modeRef.current !== 'site' || grabSourceRef.current) return;
      const end = rope.end;
      const near = Math.hypot(e.clientX - end.x, e.clientY - end.y) < GRAB_RADIUS;
      setCordState(near ? 'ready' : 'idle');
    };

    const onPointerUp = (e: PointerEvent) => {
      if (grabSourceRef.current !== 'mouse') return;
      // The up event carries the authoritative release position. Relying on the
      // last pointermove instead loses the pull whenever the browser coalesces
      // or drops that final move — which it does on fast flicks, exactly the
      // gesture most likely to clear the threshold.
      grabRef.current = { x: e.clientX, y: e.clientY };
      release();
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      tensionRef.current?.stop();
      document.documentElement.classList.remove('cursor-cord-grabbing');
    };
    // Mount once. Live values arrive through refs — see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesRef]);

  const active = state !== 'idle';

  return (
    <>
      <svg
        ref={svgRef}
        className="pointer-events-none fixed inset-0 z-30 h-full w-full"
        aria-hidden
      >
        {/* Widened transparent stroke: gives the 1.5px cord a hit area a human
            can actually target without making the cord itself thicker. */}
        <path
          ref={hitRef}
          fill="none"
          stroke="transparent"
          strokeWidth={22}
          className="pointer-events-auto"
          style={{ cursor: state === 'grabbed' ? 'grabbing' : 'grab' }}
        />

        <circle
          ref={glowRef}
          r={34}
          className="transition-opacity duration-500"
          fill="url(#cord-glow)"
          opacity={state === 'ready' ? 1 : 0}
        />

        <circle
          ref={progressRef}
          r={26}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0}
          transform="rotate(-90)"
          style={{ transition: 'opacity 200ms', transformOrigin: 'center' }}
        />

        <path
          ref={pathRef}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />

        <g ref={handleRef}>
          <CordHandle emphasised={active} />
        </g>

        {/* Hand cursor: only rendered while a hand is actually tracked. */}
        <g ref={cursorRef} opacity={0} className="transition-opacity duration-200">
          <circle r={11} fill="none" stroke="var(--color-ink)" strokeWidth={1.25} opacity={0.85} />
          <circle r={2.5} fill="var(--color-ink)" />
        </g>

        <defs>
          <radialGradient id="cord-glow">
            <stop offset="0%" stopColor="var(--color-ink)" stopOpacity={0.14} />
            <stop offset="70%" stopColor="var(--color-ink)" stopOpacity={0.04} />
            <stop offset="100%" stopColor="var(--color-ink)" stopOpacity={0} />
          </radialGradient>
        </defs>
      </svg>

      <CordHint state={state} cameraStatus={cameraStatus} mode={mode} />
    </>
  );
}

/**
 * The switch itself — a turned bobbin with knurling, drawn at the origin so the
 * parent <g> can place and rotate it.
 */
function CordHandle({ emphasised }: { emphasised: boolean }) {
  return (
    <g style={{ transition: 'opacity 300ms' }} opacity={emphasised ? 1 : 0.92}>
      {/* Ferrule where the cord enters the handle. */}
      <rect x={-2} y={-2} width={4} height={4} fill="var(--color-ink)" />
      {/* Tapered body: wide at the shoulders, pinched at the waist. */}
      <path
        d="M -5.5 0 L 5.5 0 L 3 9 L 5.5 18 L -5.5 18 L -3 9 Z"
        fill="var(--color-ink)"
      />
      {/* Knurl lines, cut in paper-white so they read at any zoom. */}
      <g stroke="var(--color-paper)" strokeWidth={0.6} opacity={0.55}>
        <line x1={-4} y1={3} x2={4} y2={3} />
        <line x1={-3.4} y1={5.5} x2={3.4} y2={5.5} />
        <line x1={-3.2} y1={12.5} x2={3.2} y2={12.5} />
        <line x1={-4} y1={15} x2={4} y2={15} />
      </g>
    </g>
  );
}

/** The one line of copy that teaches the interaction, and nothing more. */
function CordHint({
  state,
  cameraStatus,
  mode,
}: {
  state: CordState;
  cameraStatus: string;
  mode: string;
}) {
  if (mode !== 'site') return null;

  const copy =
    state === 'grabbed'
      ? 'Keep pulling'
      : cameraStatus === 'granted'
        ? 'Pinch the cord with your hand and pull'
        : 'Pull the cord to view my work';

  return (
    <div
      className="pointer-events-none fixed left-6 top-[52%] z-30 hidden -translate-y-1/2 md:block lg:left-10"
      style={{ opacity: state === 'idle' ? 0.55 : 1, transition: 'opacity 400ms' }}
    >
      <p className="max-w-[9rem] text-xs leading-relaxed text-ink-faint">{copy}</p>
    </div>
  );
}
