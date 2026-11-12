'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { useExperience } from './ExperienceProvider';
import { HandSkeleton } from './HandSkeleton';

/**
 * The homepage in XR mode: the visitor's room behind the page, blurred, with
 * their hand drawn over everything.
 *
 * Two layers, deliberately split. The room sits *behind* the content (negative
 * z, so it paints under the page's normal flow); the hand sits *above* it, so
 * it reads as the cursor it is rather than as part of the wallpaper. Neither
 * takes pointer events.
 *
 * The video here is a second view of the shared stream, not a second camera.
 * It is display-only: tracking reads the dock's unfiltered element, and a CSS
 * filter could not reach the decoded frames anyway.
 */
export function XRBackdrop() {
  const { stream } = useExperience();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    void v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [stream]);

  return (
    <>
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-paper"
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            // Mirror so movement feels natural; scale hides the soft fringe the
            // blur pulls in from outside the frame.
            transform: 'scaleX(-1) scale(1.12)',
            filter: 'blur(28px) saturate(0.85)',
            willChange: 'filter',
          }}
        />
        {/* A paper wash, not a dark one: the page is ink on white, and the
            type has to stay as legible as it is in 2D. Strongest on the left
            third, where the cord, the hero copy and the dock sit. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0.84) 0%, rgba(255,255,255,0.64) 45%, rgba(255,255,255,0.55) 100%)',
          }}
        />
      </motion.div>

      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6 }}
        className="pointer-events-none fixed inset-0 z-20"
      >
        {/* Same mapping as the cord's hand cursor, so the skeleton's pinch
            point is exactly where the cord feels the grab. */}
        <HandSkeleton className="h-full w-full" mirrored mapping="expand" />
      </motion.div>
    </>
  );
}
