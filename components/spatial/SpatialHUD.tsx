'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useExperience } from '../ExperienceProvider';
import { projects } from '@/content/portfolio';
import type { ReachState } from './spatialStore';
import { REACH_FAR, REACH_NEAR } from '@/lib/handDepth';

const LEGEND: { gesture: string; action: string }[] = [
  { gesture: 'Point', action: 'Highlight' },
  { gesture: 'Air tap', action: 'Select' },
  { gesture: 'Double tap', action: 'Open · Close project' },
  { gesture: 'Two fingers', action: 'Spread to zoom' },
  { gesture: 'Pinch + move', action: 'Drag' },
  { gesture: 'Two-hand pinch', action: 'Scale · Rotate' },
  { gesture: 'Swipe', action: 'Next project' },
  { gesture: 'Palm up', action: 'Open details' },
  { gesture: 'Palm down', action: 'Close details' },
  { gesture: 'Peace (hold)', action: 'Contact' },
  { gesture: 'Thumbs up', action: 'Homepage' },
  { gesture: 'Closed fist', action: 'Exit' },
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
  const [legendOpen, setLegendOpen] = useState(true);

  const selectedProject = projects.find((p) => p.id === selected);

  // Collapse the legend once the visitor has clearly got the idea — it is
  // scaffolding, not chrome, and it should not outstay its usefulness.
  useEffect(() => {
    const id = setTimeout(() => setLegendOpen(false), 12000);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-start justify-between p-6 lg:p-8">
        <div>
          <p className="text-xs font-medium tracking-wide text-paper">Spatial Mode</p>
          <p className="mt-1 text-[11px] text-paper/55">
            {selectedProject ? selectedProject.title : 'Point at a project'}
          </p>
        </div>

        <div className="pointer-events-auto flex items-center gap-3">
          {/* Mouse-reachable twin of the peace gesture: without it, a visitor
              with no camera has no route to the contact card at all. */}
          <button
            type="button"
            onClick={onContact}
            className="rounded-full border border-paper/25 px-3 py-1.5 text-[10px] text-paper/80 backdrop-blur-md transition-colors hover:border-paper hover:text-paper"
          >
            Contact
          </button>
          <button
            type="button"
            onClick={toggleSound}
            className="rounded-full border border-paper/25 px-3 py-1.5 text-[10px] text-paper/80 backdrop-blur-md transition-colors hover:border-paper hover:text-paper"
          >
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-paper/25 px-3 py-1.5 text-[10px] text-paper/80 backdrop-blur-md transition-colors hover:border-paper hover:text-paper"
          >
            Exit · Esc
          </button>
        </div>
      </div>

      <HoldRing progressRef={progressRef} />
      {cameraStatus === 'granted' && <ReachMeter reachRef={reachRef} />}

      {/* Gesture legend */}
      <div className="pointer-events-auto absolute bottom-6 left-6 z-50 lg:bottom-8 lg:left-8">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          className="mb-2 text-[10px] uppercase tracking-widest text-paper/50 transition-colors hover:text-paper"
        >
          {legendOpen ? 'Hide gestures' : 'Gestures'}
        </button>

        <AnimatePresence>
          {legendOpen && (
            <motion.ul
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-1.5 rounded-xl bg-ink/40 p-4 backdrop-blur-lg"
            >
              {LEGEND.map((l) => (
                <li key={l.gesture} className="flex gap-4 text-[10px] leading-tight">
                  <span className="w-[86px] shrink-0 text-paper">{l.gesture}</span>
                  <span className="text-paper/55">{l.action}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Tracking status */}
      <div className="pointer-events-none absolute bottom-6 right-6 z-50 text-right lg:bottom-8 lg:right-8">
        {cameraStatus !== 'granted' ? (
          <p className="max-w-[240px] text-[10px] leading-relaxed text-paper/55">
            Mouse-driven without a camera: drag to orbit, scroll to zoom, click to select,
            double-click (or Enter) for the case study, arrows to change project.
          </p>
        ) : (
          <p className="flex items-center justify-end gap-2 text-[10px] text-paper/55">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
                handsVisible ? 'bg-paper' : 'bg-paper/30'
              }`}
            />
            {handsVisible ? 'Hands tracked' : 'Show your hands'}
          </p>
        )}
      </div>

      {/* Control bar: the explicit, always-visible spine of the experience.
          Gestures and scroll are the expressive inputs, but none of them are
          discoverable by looking at the screen — a first-time visitor needs
          controls that say what is possible. Prev/next, the case-study CTA,
          and zoom each mirror a gesture; nothing here is button-only. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-5 z-50 flex justify-center">
        <div className="flex items-center gap-1 rounded-full bg-ink/45 p-1.5 backdrop-blur-lg">
          <BarButton onClick={() => onNavigate('left')} label="Previous project">
            ‹
          </BarButton>

          <button
            type="button"
            onClick={onOpenSelected}
            disabled={!selected}
            className="rounded-full bg-paper px-4 py-1.5 text-[11px] font-medium text-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40"
          >
            {opened ? 'Close case study' : 'Open case study'}
            <span className="ml-2 font-normal text-ink/45">
              {selectedProject ? `${projects.indexOf(selectedProject) + 1} / ${projects.length}` : ''}
            </span>
          </button>

          <BarButton onClick={() => onNavigate('right')} label="Next project">
            ›
          </BarButton>

          <span aria-hidden className="mx-1 h-4 w-px bg-paper/20" />

          <BarButton onClick={() => onZoom(1)} label="Zoom in">
            +
          </BarButton>
          <BarButton onClick={() => onZoom(-1)} label="Zoom out">
            −
          </BarButton>
        </div>
      </div>

      {/* Gesture toast */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center">
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
      className="flex h-8 w-8 items-center justify-center rounded-full text-base leading-none text-paper/75 transition-colors duration-200 hover:bg-paper/15 hover:text-paper"
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
