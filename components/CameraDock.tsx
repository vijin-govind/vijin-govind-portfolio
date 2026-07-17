'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useExperience } from './ExperienceProvider';
import { HandSkeleton } from './HandSkeleton';

/**
 * The bottom-left camera preview. Also the permission surface: rather than
 * firing getUserMedia on load — which burns the prompt before the visitor knows
 * why — it explains the trade first and asks on an explicit click.
 */
export function CameraDock() {
  const { cameraStatus, cameraError, requestCamera, registerVideo, mode, trackingStatus } =
    useExperience();
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    registerVideo(localRef.current);
    return () => registerVideo(null);
  }, [registerVideo]);

  const granted = cameraStatus === 'granted';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{
        // The dock's stream is re-parented into the spatial view, so the dock
        // itself steps aside rather than competing with it.
        opacity: mode === 'spatial' ? 0 : 1,
        y: mode === 'spatial' ? 24 : 0,
      }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: mode === 'spatial' ? 0 : 0.6 }}
      className="fixed bottom-8 left-6 z-40 lg:bottom-10 lg:left-10"
      style={{ pointerEvents: mode === 'spatial' ? 'none' : 'auto' }}
    >
      {/* Deliberately smaller on phones: at desktop size this sits on top of the
          experience list for most of the scroll. */}
      <div className="relative h-[124px] w-[176px] overflow-hidden rounded-2xl bg-scrim/70 sm:h-[168px] sm:w-[240px] md:h-[190px] md:w-[272px]">
        {/* The element is always mounted — tearing it down on a denied
            permission would also tear down the tracking loop's only input. */}
        <video
          ref={localRef}
          muted
          playsInline
          autoPlay
          className="h-full w-full object-cover transition-opacity duration-700"
          style={{
            transform: 'scaleX(-1)', // mirror: visitors expect to see themselves
            opacity: granted ? 1 : 0,
          }}
        />

        {granted && <HandSkeleton className="absolute inset-0 h-full w-full" mirrored />}

        {!granted && <DockPlaceholder status={cameraStatus} error={cameraError} onEnable={requestCamera} />}

        {granted && trackingStatus === 'loading' && (
          <div className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-2">
            <p className="text-[10px] tracking-wide text-paper">Loading hand tracking…</p>
          </div>
        )}
      </div>

      <p className="mt-3 max-w-[176px] text-[11px] leading-relaxed text-ink-faint sm:max-w-[272px] sm:text-xs">
        {granted
          ? 'Pull the cord using your hands and view my works'
          : 'Camera access unlocks the interactive portfolio'}
      </p>
    </motion.div>
  );
}

function DockPlaceholder({
  status,
  error,
  onEnable,
}: {
  status: string;
  error: string | null;
  onEnable: () => void;
}) {
  // Each failure mode gets its own recovery path. A blanket "allow camera"
  // message is useless to someone whose laptop has no camera at all.
  if (status === 'denied') {
    return (
      <Panel title="Camera blocked">
        <p>
          Re-enable it from the camera icon in your browser’s address bar, then reload. The cord
          still works with a mouse.
        </p>
      </Panel>
    );
  }

  if (status === 'unavailable') {
    return (
      <Panel title="No camera available">
        <p>{error ?? 'This device has no usable camera.'} You can still pull the cord with a mouse.</p>
      </Panel>
    );
  }

  if (status === 'insecure') {
    return (
      <Panel title="HTTPS required">
        <p>Browsers only expose the camera over HTTPS or on localhost.</p>
      </Panel>
    );
  }

  if (status === 'requesting') {
    return (
      <Panel title="Waiting for permission">
        <p>Choose “Allow” in your browser’s prompt.</p>
      </Panel>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col justify-between p-4">
      <div>
        <p className="text-xs font-medium text-ink">Enable camera</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
          Your hands become the cursor. Video never leaves this device.
        </p>
      </div>
      <button
        type="button"
        onClick={onEnable}
        className="w-full rounded-lg bg-ink px-3 py-2 text-[11px] font-medium text-paper transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
      >
        Allow camera
      </button>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center p-4">
      <p className="text-xs font-medium text-ink">{title}</p>
      <div className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}
