'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useExperience } from './ExperienceProvider';

const SEEN_KEY = 'vg.welcome.seen';

/**
 * First-visit chooser: how does the visitor want to explore?
 *
 * Still not a permission prompt. Browsers only offer one camera prompt, and a
 * visitor who declines it because they did not understand why it appeared has
 * permanently lost the interaction. So this *shows* the interaction first — a
 * looping demo of the real cursor pinching and pulling the real cord — then
 * offers two equal, clearly-labelled ways in. getUserMedia only fires after
 * the visitor picks "With your hands".
 *
 * The two options mirror the 2D / XR switch in the dock, so the choice made
 * here is the same control they will see afterwards, and can change any time.
 */
export function WelcomeModal() {
  const { cameraStatus, requestCamera } = useExperience();
  const [open, setOpen] = useState(false);
  /**
   * Closing is a CSS fade we control, not an AnimatePresence exit: the exit
   * was held up for seconds behind other work on first load, leaving a dead
   * dialog on screen after the visitor had already chosen. This drops input
   * and starts fading on the click itself, then unmounts.
   */
  const [closing, setClosing] = useState(false);
  const firstRef = useRef<HTMLButtonElement>(null);

  // localStorage is read in an effect, never during render: touching it on the
  // server (or on the first client render) would break hydration.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Private mode / storage disabled. Showing the chooser once per visit is
      // a better failure than never showing it.
    }
    if (!seen && cameraStatus === 'idle') {
      const id = setTimeout(() => setOpen(true), 700);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* nothing to persist to; the chooser simply returns next visit */
    }
    setClosing(true);
    window.setTimeout(() => setOpen(false), 260);
  };

  const chooseXR = async () => {
    // Close first so the browser's own permission prompt is not stacked on top
    // of our dialog — two overlapping asks read as a dark pattern.
    dismiss();
    await requestCamera();
  };

  useEffect(() => {
    if (!open) return;
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Escape is the no-camera path, same as choosing 2D.
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        // A plain element owns the closing fade; motion owns only entrances,
        // so the two never fight over the same opacity.
        <div
          key="welcome"
          style={{
            opacity: closing ? 0 : 1,
            pointerEvents: closing ? 'none' : undefined,
            transition: 'opacity 220ms ease-in',
          }}
          // Phone: a bottom sheet in thumb reach. Larger: a centred card.
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
          aria-describedby="welcome-desc"
        >
          <motion.button
            type="button"
            aria-label="Continue in 2D"
            tabIndex={-1}
            onClick={dismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[6px]"
          />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30, delay: 0.05 }}
            className="relative w-full max-w-[460px] rounded-t-[28px] bg-paper p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] ring-1 ring-hairline sm:rounded-[28px] sm:p-6"
          >
            {/* Drag-handle affordance on the phone sheet */}
            <div className="mb-3 flex justify-center sm:hidden" aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-ink/15" />
            </div>

            <CordDemo />

            <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
              Welcome
            </p>
            <h2
              id="welcome-title"
              className="tracking-display mt-1.5 text-[1.6rem] font-bold leading-[1.1] text-ink sm:text-[1.85rem]"
            >
              Choose how you explore
            </h2>
            <p id="welcome-desc" className="mt-2 text-sm leading-relaxed text-ink-soft">
              My work lives in a 3D room. Pull the cord to open it.
            </p>

            <div className="mt-5 grid gap-2.5">
              <Option
                ref={firstRef}
                tone="primary"
                badge="XR"
                title="With your hands"
                body="Your camera turns your hand into the cursor. Pinch the cord and pull."
                note="Processed on this device. Never recorded or uploaded."
                icon={<HandIcon />}
                onClick={chooseXR}
              />
              <Option
                tone="secondary"
                badge="2D"
                title="With mouse or touch"
                body="Drag the cord to open the room. Quick, and no camera needed."
                icon={<PointerIcon />}
                onClick={dismiss}
              />
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-faint">
              <SwitchIcon />
              Change any time with the 2D / XR switch at the bottom of the page.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */

const Option = ({
  ref,
  tone,
  badge,
  title,
  body,
  note,
  icon,
  onClick,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  tone: 'primary' | 'secondary';
  badge: string;
  title: string;
  body: string;
  note?: string;
  icon: React.ReactNode;
  onClick: () => void;
}) => {
  const primary = tone === 'primary';
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`group flex w-full items-start gap-3.5 rounded-2xl p-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink active:scale-[0.99] ${
        primary
          ? 'bg-ink text-paper hover:shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)]'
          : 'border border-hairline bg-paper text-ink hover:border-ink/40'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          primary ? 'bg-paper/10' : 'bg-ink/[0.05]'
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-semibold">{title}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wider ${
              primary ? 'bg-paper/15 text-paper' : 'bg-ink/[0.06] text-ink-soft'
            }`}
          >
            {badge}
          </span>
        </span>
        <span className={`mt-1 block text-[12.5px] leading-snug ${primary ? 'text-paper/70' : 'text-ink-soft'}`}>
          {body}
        </span>
        {note && (
          <span className={`mt-2 flex items-center gap-1.5 text-[11px] ${primary ? 'text-paper/55' : 'text-ink-faint'}`}>
            <LockIcon />
            {note}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={`mt-0.5 shrink-0 text-lg transition-transform duration-300 group-hover:translate-x-0.5 ${
          primary ? 'text-paper/70' : 'text-ink-faint'
        }`}
      >
        →
      </span>
    </button>
  );
};

/* -------------------------------------------------------------------------- */

/** One loop of the demo, in seconds. */
const LOOP = 4.6;
/**
 * Keyframe times across the loop: approach → pinch → pull → release → room
 * appears → reset. Shared so the cursor, cord and tiles stay in sync.
 */
const T = [0, 0.18, 0.28, 0.52, 0.6, 0.86, 1];

/**
 * A looping demo of the real interaction, drawn with the site's own parts: the
 * same cord and bobbin, the same ring-and-dot hand cursor. It answers "what
 * will the camera be used for?" before the visitor has to read a word.
 */
function CordDemo() {
  const reduced = useReducedMotion();
  const loop = { duration: LOOP, times: T, repeat: Infinity, ease: 'easeInOut' as const };

  // Cord end (handle) y: rests, held, pulled, snaps back.
  const handleY = [64, 64, 64, 104, 64, 64, 64];
  // Cursor path: off to the right → onto the handle → down with it → away.
  const cx = [176, 60, 60, 60, 60, 176, 176];
  const cy = [42, 70, 70, 110, 70, 42, 42];

  return (
    <div
      className="relative h-[132px] overflow-hidden rounded-2xl bg-[radial-gradient(120%_120%_at_30%_0%,#f4f4f2_0%,#e9e8e4_100%)]"
      aria-hidden
    >
      <svg viewBox="0 0 400 132" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* The cord */}
        <motion.line
          x1={60}
          y1={0}
          x2={60}
          stroke="#0a0a0a"
          strokeWidth={1.4}
          initial={false}
          animate={reduced ? { y2: 64 } : { y2: handleY }}
          transition={reduced ? undefined : loop}
        />
        <motion.g initial={false} animate={reduced ? { y: 64 } : { y: handleY }} transition={reduced ? undefined : loop}>
          <g transform="translate(60 0)">
            <rect x={-2} y={-2} width={4} height={4} fill="#0a0a0a" />
            <path d="M -5.5 0 L 5.5 0 L 3 9 L 5.5 18 L -5.5 18 L -3 9 Z" fill="#0a0a0a" />
          </g>
        </motion.g>

        {/* The hand cursor: the same ring-and-dot the site uses. The ring
            closes as the "pinch" happens. */}
        {!reduced && (
          <motion.g initial={false} animate={{ x: cx, y: cy, opacity: [0, 1, 1, 1, 1, 0, 0] }} transition={loop}>
            <motion.circle
              r={11}
              fill="none"
              stroke="#0a0a0a"
              strokeWidth={1.3}
              initial={false}
              animate={{ r: [11, 11, 7, 7, 11, 11, 11] }}
              transition={loop}
            />
            <circle r={2.6} fill="#0a0a0a" />
          </motion.g>
        )}

        {/* "Pull" label riding with the handle */}
        {!reduced && (
          <motion.text
            x={78}
            fontSize={10}
            fontWeight={600}
            letterSpacing={1.5}
            fill="#6b6b6b"
            initial={false}
            animate={{ y: [76, 76, 76, 116, 76, 76, 76], opacity: [0, 0, 1, 1, 0, 0, 0] }}
            transition={loop}
          >
            PULL
          </motion.text>
        )}

        {/* The room opening: the projects rise into place in perspective */}
        {[
          { x: 196, color: '#1e2b4d', accent: '#f5b335', label: 'MICS' },
          { x: 262, color: '#b4472b', accent: '#e0b040', label: 'Temple' },
          { x: 328, color: '#3c7a3e', accent: '#00a19c', label: 'AMG' },
        ].map((p, i) => (
          <motion.g
            key={p.label}
            initial={false}
            animate={
              reduced
                ? { y: 0, opacity: 1 }
                : {
                    y: [24, 24, 24, 24, 0, 0, 24],
                    opacity: [0, 0, 0, 0, 1, 1, 0],
                  }
            }
            transition={reduced ? undefined : { ...loop, delay: i * 0.08 }}
          >
            <g transform={`translate(${p.x} 44) skewY(-8)`}>
              <rect width={52} height={40} rx={6} fill={p.color} />
              <rect x={7} y={8} width={22} height={4} rx={2} fill={p.accent} />
              <rect x={7} y={16} width={34} height={3} rx={1.5} fill="#ffffff" opacity={0.55} />
              <rect x={7} y={23} width={28} height={3} rx={1.5} fill="#ffffff" opacity={0.35} />
            </g>
            <ellipse cx={p.x + 26} cy={100} rx={24} ry={4} fill="#000" opacity={0.08} />
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5" />
      <path d="M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14" />
      <path d="M17 9.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.6-2.2L4 15.6a1.6 1.6 0 0 1 2.4-2.1L8 15" />
    </svg>
  );
}

function PointerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3l14 7-6 2-2 6z" />
      <path d="M13 12l6 6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <circle cx="16" cy="12" r="3" />
    </svg>
  );
}
