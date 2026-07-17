'use client';

import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { useExperience } from './ExperienceProvider';
import { Hero } from './Hero';
import { PullCord } from './PullCord';
import { CameraDock } from './CameraDock';
import { WelcomeModal } from './WelcomeModal';

// Three.js, drei and the whole spatial layer are ~600kB that a visitor who
// never pulls the cord should never pay for. ssr:false because the scene reads
// window and a live MediaStream on mount.
const SpatialMode = dynamic(
  () => import('./spatial/SpatialMode').then((m) => m.SpatialMode),
  { ssr: false },
);

export function Stage() {
  const { mode } = useExperience();

  return (
    <main className="relative">
      {/* The page does not unmount when the spatial view opens — it recedes.
          Unmounting would drop the cord's physics state and cost a full
          remount on the way back. */}
      <motion.div
        animate={{
          opacity: mode === 'spatial' ? 0 : 1,
          filter: mode === 'spatial' ? 'blur(6px)' : 'blur(0px)',
        }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ pointerEvents: mode === 'spatial' ? 'none' : 'auto' }}
      >
        <Hero />
      </motion.div>

      <PullCord />
      <CameraDock />
      {mode === 'site' && <WelcomeModal />}

      <AnimatePresence>{mode === 'spatial' && <SpatialMode key="spatial" />}</AnimatePresence>
    </main>
  );
}
