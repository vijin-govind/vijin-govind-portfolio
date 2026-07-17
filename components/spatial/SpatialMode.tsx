'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { AnimatePresence, motion } from 'motion/react';
import { OrbitControls } from '@react-three/drei';
import { useExperience } from '../ExperienceProvider';
import { HandSkeleton } from '../HandSkeleton';
import { GestureController } from './GestureController';
import { ProjectAnchor } from './ProjectAnchor';
import {
  SpatialCtx,
  createTransforms,
  type ReachState,
  type SpatialValue,
} from './spatialStore';
import { SpatialHUD } from './SpatialHUD';
import { projects, profile } from '@/content/portfolio';
import { playWhoosh } from '@/lib/audio';

/**
 * The mixed-reality view: the visitor's room as backdrop, the work anchored in
 * front of it.
 *
 * The camera feed is a plain fullscreen <video> behind a transparent WebGL
 * canvas rather than a WebGL-textured plane — the browser's own video pipeline
 * composites more cheaply than a texture upload every frame, and it leaves the
 * canvas free to be pure content.
 */
export function SpatialMode() {
  const { stream, exitSpatial, soundOn, cameraStatus } = useExperience();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(projects[0].id);
  const [opened, setOpened] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [glLost, setGlLost] = useState(false);
  /** Bumped to force a fresh <Canvas> — and a fresh GL context — after a loss. */
  const [canvasKey, setCanvasKey] = useState(0);
  const [toast, setToast] = useState<{ id: number; label: string } | null>(null);
  const progressRef = useRef<{ label: string; value: number } | null>(null);
  const reachRef = useRef<ReachState | null>(null);

  const transforms = useMemo(() => createTransforms(), []);

  // Plain ref write: called every frame from the gesture loop, read every frame
  // by the HUD. Neither side needs React to know.
  const setReach = useCallback((r: ReachState | null) => {
    reachRef.current = r;
  }, []);

  const announce = useCallback((label: string) => {
    setToast({ id: Date.now(), label });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  // The same MediaStream can feed several <video> elements; this is a second
  // view of the dock's stream, not a second camera acquisition.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    void v.play().catch(() => {});
  }, [stream]);

  // Browsers drop the GL context on backgrounded tabs and on driver resets, and
  // they do not always fire `webglcontextrestored` afterwards. Waiting for an
  // event that may never arrive would strand the visitor on the error card, so
  // rebuild the canvas ourselves once the page is back in front.
  useEffect(() => {
    if (!glLost) return;

    const rebuild = () => {
      if (document.visibilityState !== 'visible') return;
      setCanvasKey((k) => k + 1);
      setGlLost(false);
    };

    if (document.visibilityState === 'visible') {
      const id = setTimeout(rebuild, 400);
      return () => clearTimeout(id);
    }

    document.addEventListener('visibilitychange', rebuild);
    return () => document.removeEventListener('visibilitychange', rebuild);
  }, [glLost]);

  const handleExit = useCallback(() => {
    if (soundOn) playWhoosh(true);
    exitSpatial();
  }, [exitSpatial, soundOn]);

  const navigate = useCallback(
    (dir: 'left' | 'right') => {
      setSelected((cur) => {
        const i = projects.findIndex((p) => p.id === cur);
        const base = i === -1 ? 0 : i;
        const next = (base + (dir === 'right' ? 1 : -1) + projects.length) % projects.length;
        announce(`${projects[next].title}`);
        return projects[next].id;
      });
      setOpened(null);
    },
    [announce],
  );

  // Escape is the keyboard equivalent of the closed fist — every gesture in
  // this mode needs a non-gesture path or a failed camera traps the visitor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (opened || contactOpen) {
          setOpened(null);
          setContactOpen(false);
        } else {
          handleExit();
        }
      }
      if (e.key === 'ArrowRight') navigate('right');
      if (e.key === 'ArrowLeft') navigate('left');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleExit, navigate, opened, contactOpen]);

  const value: SpatialValue = useMemo(
    () => ({
      transforms,
      hovered,
      setHovered,
      selected,
      setSelected,
      opened,
      setOpened,
      contactOpen,
      setContactOpen,
      announce,
      dragging,
      setDragging,
      reachRef,
      setReach,
    }),
    [transforms, hovered, selected, opened, contactOpen, announce, dragging, setReach],
  );

  return (
    <SpatialCtx.Provider value={value}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-50 bg-ink"
      >
        {/* Room. Blurred so the work reads as the subject and the visitor's
            space reads as depth behind it — this is a display surface only.
            Hand tracking runs off the dock's element and never sees this
            filter, so the gesture pipeline is untouched.

            scale(1.06) hides the transparent fringe that blur pulls in at the
            edges; the mirror keeps the visitor's own movement intuitive. */}
        <motion.video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: 'scaleX(-1) scale(1.06)',
            // Darkened as well as blurred: the objects are near-white, and a
            // brightly lit room would leave them with almost no edge contrast.
            filter: 'blur(16px) saturate(0.6) brightness(0.62)',
            willChange: 'filter',
          }}
        />

        {/* Scrim: a radial vignette rather than a flat wash, so the room stays
            readable at the edges while the centre — where the work sits — gets
            the contrast. A uniform overlay muddies both equally. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2 }}
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 46%, rgba(10,10,10,0.42) 0%, rgba(10,10,10,0.58) 55%, rgba(10,10,10,0.78) 100%)',
          }}
        />

        <Canvas
          key={canvasKey}
          className="absolute inset-0"
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          camera={{ position: [0, 0, 0.6], fov: 55, near: 0.05, far: 60 }}
          dpr={[1, 2]}
          shadows
          onCreated={({ gl }) => {
            const canvas = gl.domElement;
            // Without preventDefault the browser will not even attempt to
            // restore a lost context, and the scene stays black forever.
            canvas.addEventListener('webglcontextlost', (e) => {
              e.preventDefault();
              setGlLost(true);
            });
            canvas.addEventListener('webglcontextrestored', () => setGlLost(false));
          }}
        >
          {/* Three explicit lights instead of drei's <Environment> preset: that
              preset streams an HDRI from a third-party CDN, which would be the
              only remote dependency in the whole build, and its reflections are
              nearly invisible on surfaces this matte. */}
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 6, 4]} intensity={1.4} castShadow />
          <directionalLight position={[-4, 2, -3]} intensity={0.55} />
          <directionalLight position={[0, -3, 2]} intensity={0.25} />

          {projects.map((p) => (
            <ProjectAnchor key={p.id} project={p} />
          ))}

          <GestureController
            onExit={handleExit}
            onHome={handleExit}
            onContact={() => setContactOpen((v) => !v)}
            onNavigate={navigate}
            progressRef={progressRef}
          />

          {/* Mouse fallback for walking around the objects. Disabled mid-drag so
              a gesture drag does not also spin the whole room. makeDefault must
              stay so FitCamera can find the controls and re-sync them. */}
          <OrbitControls
            enabled={!dragging}
            enablePan={false}
            enableZoom
            minDistance={0.4}
            maxDistance={11}
            target={SCENE_CENTER}
            dampingFactor={0.06}
            enableDamping
            makeDefault
          />
          <FitCamera />
        </Canvas>

        {cameraStatus === 'granted' && (
          <HandSkeleton className="pointer-events-none absolute inset-0 h-full w-full" mirrored light />
        )}

        <SpatialHUD
          progressRef={progressRef}
          reachRef={reachRef}
          toast={toast}
          onExit={handleExit}
          selected={selected}
        />

        {glLost && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/80 p-8 text-center">
            <p className="text-sm text-paper">The 3D context was lost.</p>
            <p className="max-w-sm text-xs leading-relaxed text-paper/60">
              This usually means the GPU was reclaimed by another application. The scene will
              recover on its own if the browser restores it.
            </p>
            <button
              type="button"
              onClick={handleExit}
              className="mt-2 rounded-full border border-paper/30 px-4 py-2 text-[11px] text-paper"
            >
              Back to the homepage
            </button>
          </div>
        )}

        <AnimatePresence>
          {contactOpen && <ContactCard onClose={() => setContactOpen(false)} />}
        </AnimatePresence>
      </motion.div>
    </SpatialCtx.Provider>
  );
}

/** Centroid of the exhibition, and how much space it needs, in metres. */
const SCENE_CENTER: [number, number, number] = [0, 0.05, -2.5];
const SCENE_HALF_WIDTH = 2.4;
const SCENE_HALF_HEIGHT = 0.95;

/**
 * Frames the whole exhibition regardless of viewport shape.
 *
 * A fixed camera position only works at one aspect ratio: at 16:9 the four
 * projects fit, but on a portrait phone the horizontal field of view collapses
 * and the outer two fall outside the frustum entirely. This solves for the
 * distance that fits the scene's bounds on both axes and places the camera
 * there, before handing control to OrbitControls.
 */
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { update?: () => void } | null;

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const halfV = Math.tan(((55 * Math.PI) / 180) / 2);
    const distForHeight = SCENE_HALF_HEIGHT / halfV;
    const distForWidth = SCENE_HALF_WIDTH / (halfV * aspect);
    // 8% margin so nothing sits flush against the edge of the frame.
    const dist = Math.max(distForHeight, distForWidth, 1.2) * 1.08;

    camera.position.set(SCENE_CENTER[0], SCENE_CENTER[1] + 0.15, SCENE_CENTER[2] + dist);
    camera.updateProjectionMatrix();
    controls?.update?.();
  }, [camera, size, controls]);

  return null;
}

function ContactCard({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="absolute left-1/2 top-1/2 z-50 w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-paper/95 p-8 shadow-2xl backdrop-blur-2xl"
    >
      <h3 className="tracking-display text-3xl font-bold text-ink">Get in touch</h3>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {profile.name} · Product Designer
        <br />
        {profile.location}
      </p>

      <a
        href={`mailto:${profile.email}`}
        className="mt-6 block text-lg text-ink underline decoration-hairline underline-offset-8 transition-colors hover:decoration-ink"
      >
        {profile.email}
      </a>

      <div className="mt-6 flex gap-5">
        {profile.socials.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-ink-soft transition-colors hover:text-ink"
          >
            {s.label}
          </a>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-8 text-[11px] text-ink-faint transition-colors hover:text-ink"
      >
        Palm down or click to close
      </button>
    </motion.div>
  );
}
