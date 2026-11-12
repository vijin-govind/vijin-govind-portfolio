'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useExperience } from './ExperienceProvider';
import type { CameraStatus } from '@/lib/useCamera';

/**
 * The bottom-left XR / 2D switch.
 *
 * XR turns the camera on: the homepage backdrop becomes the visitor's room,
 * blurred, with their hand drawn over it (see XRBackdrop). 2D releases the
 * camera and returns the plain page. The camera state *is* the mode — there is
 * no separate flag that could disagree with whether the light is on.
 *
 * Still the permission surface too: getUserMedia only fires on an explicit
 * flip to XR, never on load, so the prompt arrives after the visitor has
 * already said yes to the idea.
 */
export function CameraDock() {
  const {
    cameraStatus,
    cameraError,
    requestCamera,
    stopCamera,
    registerVideo,
    mode,
    trackingStatus,
  } = useExperience();
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    registerVideo(localRef.current);
    return () => registerVideo(null);
  }, [registerVideo]);

  const xr = cameraStatus === 'granted';
  const pending = cameraStatus === 'requesting';
  const blocked =
    cameraStatus === 'denied' || cameraStatus === 'unavailable' || cameraStatus === 'insecure';

  const choose = (next: '2d' | 'xr') => {
    if (next === 'xr' && !xr && !pending && !blocked) void requestCamera();
    // Not while the browser prompt is open: stopping then would be undone the
    // moment the visitor clicked Allow, turning the camera on behind a switch
    // that says 2D.
    if (next === '2d' && xr) stopCamera();
  };

  // On phones only the switch itself is shown; the explanatory line appears in
  // a small bubble above it, and only when it says something actionable.
  const mobileNote =
    cameraStatus === 'idle' || (xr && trackingStatus === 'running')
      ? null
      : statusLine(cameraStatus, cameraError, trackingStatus);

  return (
    // Positioning lives on a plain wrapper: motion owns the inner element's
    // transform, which would otherwise override the centring translate.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-40 flex justify-center sm:inset-x-auto sm:bottom-8 sm:left-6 sm:block lg:bottom-10 lg:left-10"
    >
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{
        // The spatial view has its own controls; the dock steps aside.
        opacity: mode === 'spatial' ? 0 : 1,
        y: mode === 'spatial' ? 24 : 0,
      }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: mode === 'spatial' ? 0 : 0.6 }}
      className="relative flex flex-col items-center sm:block"
      style={{ pointerEvents: mode === 'spatial' ? 'none' : 'auto' }}
    >
      {mobileNote && (
        <p
          className="mb-2 max-w-[260px] rounded-full bg-ink/85 px-3 py-1.5 text-center text-[11px] leading-snug text-paper backdrop-blur-md sm:hidden"
          aria-live="polite"
        >
          {mobileNote}
        </p>
      )}
      {/* Phone: a compact pill — thumbnail + switch, ~44px tall, out of the
          content's way. Tablet and up: the full card with its explanation. */}
      <div className="flex items-center gap-1.5 rounded-full border border-hairline bg-paper/85 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.10)] backdrop-blur-xl sm:block sm:w-[240px] sm:rounded-2xl sm:p-4 sm:shadow-[0_8px_30px_rgba(0,0,0,0.06)] md:w-[272px]">
        <div className="flex items-start justify-between gap-3">
          <div className="hidden min-w-0 sm:block">
            <p className="text-xs font-medium text-ink">Experience</p>
            <p className="mt-1 text-[11px] leading-snug text-ink-soft" aria-live="polite">
              {statusLine(cameraStatus, cameraError, trackingStatus)}
            </p>
          </div>

          {/* Live thumbnail. Also the hand tracker's input: this element is
              what MediaPipe reads, so it stays mounted (and on screen —
              browsers may stop decoding a video nobody can see) in both
              modes. It is never filtered, so blurring the backdrop costs the
              tracker nothing. */}
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-scrim/60 sm:w-12 sm:rounded-md">
            <video
              ref={localRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full object-cover transition-opacity duration-500"
              style={{ transform: 'scaleX(-1)', opacity: xr ? 1 : 0 }}
            />
            {!xr && <CameraOffGlyph />}
            {xr && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#ff3b30] shadow-[0_0_0_2px_rgba(255,255,255,0.8)]" />
            )}
          </div>
        </div>

        <ModeSwitch
          value={xr ? 'xr' : pending ? 'xr' : '2d'}
          xrDisabled={blocked}
          onChange={choose}
        />
      </div>

      <p className="mt-3 hidden max-w-[272px] text-xs leading-relaxed text-ink-faint sm:block">
        {xr
          ? 'Pinch the cord with your hand and pull'
          : 'Switch to XR to use your hands as the cursor'}
      </p>
    </motion.div>
    </div>
  );
}

/** Two-position segmented switch with a sliding thumb. */
function ModeSwitch({
  value,
  xrDisabled,
  onChange,
}: {
  value: '2d' | 'xr';
  xrDisabled: boolean;
  onChange: (v: '2d' | 'xr') => void;
}) {
  const options: { id: '2d' | 'xr'; label: string }[] = [
    { id: '2d', label: '2D' },
    { id: 'xr', label: 'XR' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Viewing mode"
      className="relative grid w-[128px] grid-cols-2 rounded-full bg-ink/[0.06] p-1 sm:mt-3 sm:w-auto"
      onKeyDown={(e) => {
        // Arrow keys move the selection, as in any radio group.
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          onChange(e.key === 'ArrowRight' ? 'xr' : '2d');
        }
      }}
    >
      <motion.span
        aria-hidden
        // Track inset is 4px, so the thumb is exactly (width/2 − 4px) wide and
        // the second slot begins one thumb-width to the right: x 100% lands it.
        className="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-full bg-ink"
        initial={false}
        animate={{ x: value === '2d' ? '0%' : '100%' }}
        transition={{ type: 'spring', stiffness: 480, damping: 38 }}
      />
      {options.map((o) => {
        const active = value === o.id;
        const disabled = o.id === 'xr' && xrDisabled;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.id)}
            className={`relative z-10 rounded-full py-2 text-xs font-medium sm:py-1.5 sm:text-[11px] tracking-wide transition-colors duration-300 ${
              active ? 'text-paper' : 'text-ink-soft hover:text-ink'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One line of state. Each failure keeps its own recovery hint — a blanket
 * "allow camera" is useless to someone whose laptop has no camera at all.
 */
function statusLine(
  status: CameraStatus,
  error: string | null,
  tracking: 'idle' | 'loading' | 'running' | 'error',
): string {
  switch (status) {
    case 'granted':
      if (tracking === 'loading') return 'Loading hand tracking…';
      if (tracking === 'error') return 'Hand tracking failed. The mouse still works.';
      return 'Camera on. Video never leaves this device.';
    case 'requesting':
      return 'Choose “Allow” in your browser’s prompt.';
    case 'denied':
      return 'Camera blocked. Re-enable it in the address bar, then reload.';
    case 'unavailable':
      return error ?? 'No usable camera on this device.';
    case 'insecure':
      return 'XR needs HTTPS or localhost.';
    default:
      return 'Plain page. The cord works with a mouse.';
  }
}

function CameraOffGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="absolute inset-0 m-auto h-4 w-4 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 10.5 20 7v10l-5-3.5" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
