'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useExperience } from '../ExperienceProvider';
import { projects } from '@/content/portfolio';
import { useSpatial, type ReachState } from './spatialStore';
import { REACH_FAR, REACH_NEAR } from '@/lib/handDepth';
import { coverPoint, coverTransform, videoSize } from '@/lib/videoMapping';

/**
 * The five gestures anyone needs, then the rest. The old legend listed twelve
 * at equal weight, which read as homework before anything could be done.
 */
const ESSENTIALS: { gesture: string; action: string }[] = [
  { gesture: 'Point', action: 'Highlight a project' },
  { gesture: 'Keep pointing', action: 'Open it' },
  { gesture: 'Palm facing down', action: 'Close it' },
  { gesture: 'Swipe open hand', action: 'Next project' },
  { gesture: 'Fist (hold)', action: 'Exit' },
];

const ADVANCED: { gesture: string; action: string }[] = [
  { gesture: 'Pinch + move', action: 'Move an object' },
  { gesture: 'Two-hand pinch', action: 'Scale · Rotate' },
  { gesture: 'Two fingers', action: 'Spread to zoom' },
  { gesture: 'Peace (hold)', action: 'Contact' },
  { gesture: 'Thumbs up (hold)', action: 'Homepage' },
];

/**
 * Non-diegetic layer over the room: what gestures exist, what the hands are
 * currently doing, and a way out that does not require a hand at all.
 */
export function SpatialHUD({
  progressRef,
  reachRef,
  toast,
  onExit,
  onContact,
  onNavigate,
  onOpenSelected,
  onZoom,
  selected,
  opened,
}: {
  progressRef: React.RefObject<{ label: string; value: number } | null>;
  reachRef: React.RefObject<ReachState | null>;
  toast: { id: number; label: string } | null;
  onExit: () => void;
  onContact: () => void;
  onNavigate: (dir: 'left' | 'right') => void;
  onOpenSelected: () => void;
  onZoom: (dir: 1 | -1) => void;
  selected: string | null;
  opened: string | null;
}) {
  const { handsVisible, cameraStatus, soundOn, toggleSound } = useExperience();
  const [legendOpen, setLegendOpen] = useState(false);
  /** Bumped by "Replay guide" to remount the coach from step one. */
  const [coachKey, setCoachKey] = useState(0);

  const selectedProject = projects.find((p) => p.id === selected);

  return (
    <>
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between gap-3 p-4 pt-[max(16px,env(safe-area-inset-top))] sm:p-6 lg:p-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-paper">Spatial Mode</p>
          <p className="mt-1 text-[11px] text-paper/55">
            {selectedProject ? selectedProject.title : 'Point at a project'}
          </p>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Mouse-reachable twin of the peace gesture: without it, a visitor
              with no camera has no route to the contact card at all. */}
          <button
            type="button"
            onClick={onContact}
            className="rounded-full border border-paper/25 px-3 py-2 text-[11px] text-paper/80 backdrop-blur-md transition-colors hover:border-paper hover:text-paper sm:py-1.5 sm:text-[10px]"
          >
            Contact
          </button>
          <button
            type="button"
            onClick={toggleSound}
            className="rounded-full border border-paper/25 px-3 py-2 text-[11px] text-paper/80 backdrop-blur-md transition-colors hover:border-paper hover:text-paper sm:py-1.5 sm:text-[10px]"
          >
            {soundOn ? 'Sound' : 'Muted'}
            <span className="hidden sm:inline">{soundOn ? ' on' : ''}</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-paper/25 px-3 py-2 text-[11px] text-paper/80 backdrop-blur-md transition-colors hover:border-paper hover:text-paper sm:py-1.5 sm:text-[10px]"
          >
            Exit<span className="hidden sm:inline"> · Esc</span>
          </button>
        </div>
      </div>

      <HoldRing progressRef={progressRef} />
      {cameraStatus === 'granted' && <ReachMeter reachRef={reachRef} />}

      {cameraStatus === 'granted' && <FingerCursor />}
      <Coach key={coachKey} hands={cameraStatus === 'granted'} />

      {/* Gesture reference — closed by default; the coach teaches the basics. */}
      {/* Phones: under the title, top-left — the bottom edge belongs to the
          control bar there, and the two collided. */}
      <div className="pointer-events-auto absolute left-4 top-[76px] z-50 sm:left-6 sm:top-auto sm:bottom-6 lg:bottom-8 lg:left-8">
        <div className="mb-2 flex gap-4">
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="text-[10px] uppercase tracking-widest text-paper/60 transition-colors hover:text-paper"
          >
            {legendOpen ? 'Hide gestures' : 'Gestures'}
          </button>
          <button
            type="button"
            onClick={() => setCoachKey((k) => k + 1)}
            className="text-[10px] uppercase tracking-widest text-paper/60 transition-colors hover:text-paper"
          >
            Replay guide
          </button>
        </div>

        <AnimatePresence>
          {legendOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-[250px] rounded-xl bg-ink/55 p-4 backdrop-blur-lg"
            >
              <ul className="space-y-1.5">
                {ESSENTIALS.map((l) => (
                  <li key={l.gesture} className="flex gap-3 text-[11px] leading-tight">
                    <span className="w-[108px] shrink-0 font-medium text-paper">{l.gesture}</span>
                    <span className="text-paper/65">{l.action}</span>
                  </li>
                ))}
              </ul>
              <p className="mb-1.5 mt-3 border-t border-paper/15 pt-3 text-[9px] uppercase tracking-widest text-paper/40">
                More
              </p>
              <ul className="space-y-1.5">
                {ADVANCED.map((l) => (
                  <li key={l.gesture} className="flex gap-3 text-[10px] leading-tight">
                    <span className="w-[108px] shrink-0 text-paper/80">{l.gesture}</span>
                    <span className="text-paper/50">{l.action}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tracking status */}
      <div className="pointer-events-none absolute bottom-6 right-6 z-50 hidden text-right sm:block lg:bottom-8 lg:right-8">
        {cameraStatus !== 'granted' ? (
          <p className="max-w-[240px] text-[10px] leading-relaxed text-paper/55">
            Click a project to open it · drag to look around · scroll to zoom · ← → to
            browse
          </p>
        ) : (
          <p className="flex items-center justify-end gap-2 text-[10px] text-paper/55">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                handsVisible ? 'bg-paper' : 'bg-paper/30'
              }`}
            />
            {handsVisible ? 'Hand tracked' : 'Raise a hand to the camera'}
          </p>
        )}
      </div>

      {/* Control bar: the explicit, always-visible spine of the experience.
          Gestures and scroll are the expressive inputs, but none of them are
          discoverable by looking at the screen — a first-time visitor needs
          controls that say what is possible. Prev/next, the case-study CTA,
          and zoom each mirror a gesture; nothing here is button-only. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-50 flex justify-center">
        <div className="flex items-center gap-1 rounded-full bg-ink/45 p-1.5 backdrop-blur-lg">
          <BarButton onClick={() => onNavigate('left')} label="Previous project">
            ‹
          </BarButton>

          <button
            type="button"
            onClick={onOpenSelected}
            disabled={!selected}
            className="rounded-full bg-paper px-5 py-2.5 text-xs font-medium text-ink transition-transform sm:px-4 sm:py-1.5 sm:text-[11px] duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40"
          >
            {opened ? 'Close case study' : 'Open case study'}
            <span className="ml-2 font-normal text-ink/45">
              {selectedProject ? `${projects.indexOf(selectedProject) + 1} / ${projects.length}` : ''}
            </span>
          </button>

          <BarButton onClick={() => onNavigate('right')} label="Next project">
            ›
          </BarButton>

          {/* Zoom buttons are for mice; on a touch screen, pinch does it. */}
          <span className="hidden items-center gap-1 sm:flex">
            <span aria-hidden className="mx-1 h-4 w-px bg-paper/20" />
            <BarButton onClick={() => onZoom(1)} label="Zoom in">
              +
            </BarButton>
            <BarButton onClick={() => onZoom(-1)} label="Zoom out">
              −
            </BarButton>
          </span>
        </div>
      </div>

      {/* Gesture toast — up top, clear of the coach card at the bottom. */}
      <div className="pointer-events-none absolute inset-x-0 top-[150px] z-50 flex justify-center">
        <AnimatePresence mode="wait">
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-full bg-paper px-4 py-2 text-[11px] font-medium text-ink"
            >
              {toast.label}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/** Round icon button for the control bar. */
function BarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-lg leading-none text-paper/75 sm:h-8 sm:w-8 sm:text-base transition-colors duration-200 hover:bg-paper/15 hover:text-paper"
    >
      {children}
    </button>
  );
}

/**
 * Reach meter: how far the hand is, and whether it is close enough to interact.
 *
 * The distance gate would otherwise be invisible — a visitor whose hand is out
 * of band would just find that pointing silently stopped working, which reads
 * as broken rather than as a rule. Showing the measurement and the usable band
 * turns a refusal into an instruction.
 *
 * Polled on rAF and written straight to the DOM; distance changes every frame
 * and this is a readout, not application state.
 */
function ReachMeter({ reachRef }: { reachRef: React.RefObject<ReachState | null> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLParagraphElement>(null);
  const dot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastText = '';

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const r = reachRef.current;
      if (!wrap.current || !fill.current || !label.current || !dot.current) return;

      if (!r) {
        wrap.current.style.opacity = '0';
        return;
      }
      wrap.current.style.opacity = '1';

      // The bar spans the usable band, so the fill *is* the reach fraction.
      fill.current.style.transform = `scaleX(${r.value.toFixed(3)})`;

      const cm = Math.round(r.distance * 100);
      const text =
        r.zone === 'reach'
          ? `${cm}cm · in reach`
          : r.zone === 'tooFar'
            ? `${cm}cm · too far`
            : `${cm}cm · too close`;
      if (text !== lastText) {
        label.current.textContent = text;
        lastText = text;
      }

      const ok = r.zone === 'reach';
      dot.current.style.background = ok ? '#ffffff' : 'rgba(255,255,255,0.3)';
      fill.current.style.background = ok ? '#ffffff' : 'rgba(255,255,255,0.35)';
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reachRef]);

  return (
    <div
      ref={wrap}
      className="pointer-events-none absolute left-1/2 top-24 z-50 flex w-[168px] -translate-x-1/2 flex-col items-center opacity-0 transition-opacity duration-300"
    >
      <div className="h-[3px] w-full overflow-hidden rounded-full bg-paper/20">
        <div
          ref={fill}
          className="h-full w-full origin-left rounded-full bg-paper transition-[background] duration-300"
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] text-paper/70">
        <span ref={dot} className="inline-block h-1 w-1 rounded-full bg-paper/30" />
        <span ref={label} />
      </p>
      <p className="mt-0.5 text-[9px] text-paper/35">
        reach band {Math.round(REACH_NEAR * 100)}–{Math.round(REACH_FAR * 100)}cm
      </p>
    </div>
  );
}

/**
 * Progress ring for held gestures.
 *
 * Polls the ref on rAF and writes to the DOM directly: the value changes every
 * frame while a gesture is held, and this is a HUD decoration — it has no
 * business re-rendering the React tree.
 */
function HoldRing({
  progressRef,
}: {
  progressRef: React.RefObject<{ label: string; value: number } | null>;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const circle = useRef<SVGCircleElement>(null);
  const label = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let raf = 0;
    const C = 2 * Math.PI * 22;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = progressRef.current;
      if (!wrap.current || !circle.current || !label.current) return;

      if (!p || !p.label) {
        wrap.current.style.opacity = '0';
        return;
      }

      wrap.current.style.opacity = '1';
      circle.current.style.strokeDasharray = `${(p.value * C).toFixed(2)} ${C}`;
      if (label.current.textContent !== p.label) label.current.textContent = p.label;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progressRef]);

  return (
    <div
      ref={wrap}
      className="pointer-events-none absolute left-1/2 top-8 z-50 flex -translate-x-1/2 flex-col items-center opacity-0 transition-opacity duration-200"
    >
      <svg width={52} height={52} viewBox="0 0 52 52">
        <circle cx={26} cy={26} r={22} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
        <circle
          ref={circle}
          cx={26}
          cy={26}
          r={22}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeLinecap="round"
          transform="rotate(-90 26 26)"
        />
      </svg>
      <p ref={label} className="mt-2 text-[10px] text-paper" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fingertip cursor                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A cursor on the visitor's index fingertip that fills while they hold a
 * point. This is the piece that makes dwell self-explanatory: the ring is the
 * instruction ("keep still") and the progress at once.
 *
 * Mapped with the same object-cover solve and mirroring as the gesture
 * raycast, so the cursor sits exactly where the raycast aims. rAF + direct DOM
 * writes, like the other per-frame readouts.
 */
function FingerCursor() {
  const { framesRef, videoRef } = useExperience();
  const spatial = useSpatial();
  const wrap = useRef<HTMLDivElement>(null);
  const arc = useRef<SVGCircleElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let raf = 0;
    const C = 2 * Math.PI * 20;
    let lastText = '';

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = wrap.current;
      if (!el || !arc.current || !dot.current || !label.current) return;

      const hands = framesRef.current.hands;
      const vsize = videoSize(videoRef.current);
      if (hands.length === 0 || !vsize) {
        el.style.opacity = '0';
        return;
      }
      const hand = hands.reduce((a, b) => (b.depth.distance < a.depth.distance ? b : a));
      const t = coverTransform(vsize, { width: window.innerWidth, height: window.innerHeight });
      const p = coverPoint(hand.aimPoint.x, hand.aimPoint.y, t, true);

      el.style.opacity = '1';
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;

      const pointing = hand.gesture === 'point';
      const d = spatial.dwellRef.current;
      const value = pointing && d ? d.value : 0;
      arc.current.style.strokeDasharray = `${(value * C).toFixed(2)} ${C}`;
      arc.current.parentElement!.style.opacity = pointing ? '1' : '0';
      dot.current.style.transform = `translate(-50%, -50%) scale(${pointing ? 1 : 0.7})`;
      dot.current.style.opacity = pointing ? '1' : '0.55';

      let text = '';
      if (pointing) {
        const title = d ? projects.find((x) => x.id === d.id)?.title : null;
        text = !title
          ? 'Point at a project'
          : d && d.value >= 1
            ? `${title} · open`
            : `Hold to open · ${title}`;
      }
      if (text !== lastText) {
        label.current.textContent = text;
        label.current.style.opacity = text ? '1' : '0';
        lastText = text;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [framesRef, videoRef, spatial.dwellRef]);

  return (
    <div
      ref={wrap}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-[45] opacity-0 transition-opacity duration-200"
    >
      <svg
        width={48}
        height={48}
        viewBox="0 0 48 48"
        className="absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-150"
        style={{ left: 0, top: 0 }}
      >
        <circle cx={24} cy={24} r={20} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
        <circle
          ref={arc}
          cx={24}
          cy={24}
          r={20}
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
          style={{ strokeDasharray: '0 200' }}
        />
      </svg>
      <span
        ref={dot}
        className="absolute left-0 top-0 h-3 w-3 rounded-full bg-paper shadow-[0_0_0_3px_rgba(10,10,10,0.35)] transition-transform duration-150"
      />
      <p
        ref={label}
        className="absolute left-0 top-7 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink/70 px-2.5 py-1 text-[11px] font-medium text-paper opacity-0 backdrop-blur-md transition-opacity duration-200"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Coach                                                                      */
/* -------------------------------------------------------------------------- */

interface CoachStep {
  icon: string;
  title: string;
  body: string;
}

const HAND_STEPS: CoachStep[] = [
  {
    icon: '✋',
    title: 'Raise your hand',
    body: 'Hold it up in front of the camera, about an arm’s length from the screen.',
  },
  {
    icon: '☝️',
    title: 'Point at a project',
    body: 'Aim with your index finger. A white dot follows your fingertip.',
  },
  {
    icon: '⏳',
    title: 'Keep pointing to open it',
    body: 'Hold still while the ring around your finger fills.',
  },
  {
    icon: '🫳',
    title: 'Palm facing down to close',
    body: 'Turn your open hand palm-down. A held fist, or Esc, leaves this view.',
  },
];

const MOUSE_STEP: CoachStep = {
  icon: '🖱️',
  title: 'Click a project to open it',
  body: 'Drag to look around, scroll to zoom, and use ‹ › below to browse.',
};

const TOUCH_STEP: CoachStep = {
  icon: '👆',
  title: 'Tap a project to open it',
  body: 'Swipe left or right to browse, and pinch to zoom.',
};

/**
 * A guided first run. Each step advances on its own when the visitor actually
 * does the thing — raising a hand, pointing at something, opening it — so the
 * coach teaches by confirming, not by asking them to read a list first.
 */
function Coach({ hands }: { hands: boolean }) {
  const { handsVisible } = useExperience();
  const { hovered, opened } = useSpatial();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  // Touch screens get touch words: "click" and "scroll to zoom" mean nothing
  // on a phone. Read once; it does not change mid-visit.
  const [touch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );
  const steps = hands ? HAND_STEPS : [touch ? TOUCH_STEP : MOUSE_STEP];
  const sawOpen = useRef(false);

  // Advance when the current step's action happens.
  useEffect(() => {
    if (done) return;
    if (!hands) {
      if (opened) setDone(true);
      return;
    }
    if (step === 0 && handsVisible) setStep(1);
    else if (step === 1 && hovered) setStep(2);
    else if (step === 2 && opened) {
      sawOpen.current = true;
      setStep(3);
    } else if (step === 3 && sawOpen.current && !opened) setDone(true);
  }, [hands, step, done, handsVisible, hovered, opened]);

  // The last step is informational; let it go on its own after a while.
  useEffect(() => {
    const last = hands ? 3 : 0;
    if (done || step !== last) return;
    const id = setTimeout(() => setDone(true), hands ? 9000 : 10000);
    return () => clearTimeout(id);
  }, [hands, step, done]);

  const s = steps[Math.min(step, steps.length - 1)];

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto absolute inset-x-0 bottom-[calc(max(20px,env(safe-area-inset-bottom))+64px)] z-50 flex justify-center px-4 sm:bottom-20"
        >
          <div className="flex w-full max-w-[400px] items-center gap-4 rounded-2xl bg-paper/95 p-4 pr-5 shadow-2xl backdrop-blur-xl">
            <AnimatePresence mode="wait">
              <motion.span
                key={s.title}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink/[0.06] text-2xl"
                aria-hidden
              >
                {s.icon}
              </motion.span>
            </AnimatePresence>
            <div className="min-w-0 flex-1">
              {hands && (
                <p className="text-[10px] uppercase tracking-widest text-ink-faint">
                  Step {step + 1} of {steps.length}
                </p>
              )}
              <p className="mt-0.5 text-sm font-semibold text-ink" aria-live="polite">
                {s.title}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">{s.body}</p>
            </div>
            <button
              type="button"
              onClick={() => setDone(true)}
              className="shrink-0 self-start text-[11px] text-ink-faint transition-colors hover:text-ink"
            >
              {hands && step < steps.length - 1 ? 'Skip' : 'Got it'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
