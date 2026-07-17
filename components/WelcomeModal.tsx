'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useExperience } from './ExperienceProvider';

const SEEN_KEY = 'vg.welcome.seen';

/**
 * First-visit invitation.
 *
 * Deliberately not a permission prompt. Browsers only offer one camera prompt,
 * and a visitor who declines it because they did not understand why it appeared
 * has permanently lost the interaction — recovering means digging through site
 * settings. So this explains the trade first, in the visitor's own language, and
 * only calls getUserMedia once they have said yes to the idea.
 *
 * Declining is a real option, not a dead end: the cord works with a mouse.
 */
export function WelcomeModal() {
  const { cameraStatus, requestCamera } = useExperience();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // localStorage is read in an effect, never during render: touching it on the
  // server (or on the first client render) would break hydration.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Private mode / storage disabled. Showing the modal once per visit is a
      // better failure than never showing it.
    }
    if (!seen && cameraStatus === 'idle') {
      const id = setTimeout(() => setOpen(true), 900);
      return () => clearTimeout(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* nothing to persist to; the modal simply returns next visit */
    }
    setOpen(false);
  };

  const accept = async () => {
    setBusy(true);
    // Close first so the browser's own permission prompt is not stacked on top
    // of our dialog — two overlapping asks read as a dark pattern.
    dismiss();
    await requestCamera();
    setBusy(false);
  };

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-title"
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="absolute inset-0 cursor-default bg-paper/70 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
            className="relative w-full max-w-[440px] rounded-3xl bg-paper p-8 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.28)] ring-1 ring-hairline md:p-10"
          >
            <CordMark />

            <h2
              id="welcome-title"
              className="tracking-display mt-7 text-[1.75rem] font-bold leading-[1.1] text-ink md:text-[2rem]"
            >
              Pull the cord
              <br />
              with your hands.
            </h2>

            <p className="mt-5 text-sm leading-relaxed text-ink-soft">
              Turn on your camera and your hands become the cursor. Pinch the cord, pull, and the
              page gives way to my work — placed in the room around you.
            </p>

            <ul className="mt-6 space-y-2.5 border-t border-hairline pt-6">
              <Point>The video is processed on this device and never uploaded.</Point>
              <Point>Nothing is recorded, stored, or sent anywhere.</Point>
              <Point>You can turn it off at any time.</Point>
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                ref={primaryRef}
                type="button"
                onClick={accept}
                disabled={busy}
                className="flex-1 rounded-xl bg-ink px-5 py-3.5 text-[13px] font-medium text-paper transition-transform duration-300 hover:scale-[1.015] active:scale-[0.985] disabled:opacity-60"
              >
                {busy ? 'Waiting for permission…' : 'Enable camera'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl px-5 py-3.5 text-[13px] text-ink-soft transition-colors duration-300 hover:text-ink"
              >
                Use a mouse instead
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[12px] leading-relaxed text-ink-faint">
      <span aria-hidden className="mt-[7px] h-px w-3 shrink-0 bg-ink-faint" />
      <span>{children}</span>
    </li>
  );
}

/** A small still portrait of the cord, so the modal shows the object it names. */
function CordMark() {
  return (
    <svg width="30" height="64" viewBox="0 0 30 64" aria-hidden className="overflow-visible">
      <line x1="15" y1="0" x2="15" y2="40" stroke="var(--color-ink)" strokeWidth="1.25" />
      <g transform="translate(15 40)">
        <rect x={-2} y={-2} width={4} height={4} fill="var(--color-ink)" />
        <path d="M -5.5 0 L 5.5 0 L 3 9 L 5.5 18 L -5.5 18 L -3 9 Z" fill="var(--color-ink)" />
        <g stroke="var(--color-paper)" strokeWidth={0.6} opacity={0.55}>
          <line x1={-4} y1={3} x2={4} y2={3} />
          <line x1={-3.2} y1={12.5} x2={3.2} y2={12.5} />
        </g>
      </g>
    </svg>
  );
}
