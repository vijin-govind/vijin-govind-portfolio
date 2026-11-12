'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useExperience } from '../ExperienceProvider';
import { HandSkeleton } from '../HandSkeleton';
import { GestureController } from './GestureController';
import { CaseStudyPanel, ProjectAnchor } from './ProjectAnchor';
import {
  SpatialCtx,
  createTransforms,
  useSpatial,
  type DwellState,
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
  const dwellRef = useRef<DwellState | null>(null);

  const transforms = useMemo(() => createTransforms(), []);

  /**
   * Portrait phones get a carousel instead of the exhibition: fitting all five
   * projects across a ~0.46 aspect leaves each one a few pixels tall and
   * impossible to tap. One project fills the view, its neighbours peek in at
   * the edges, and a horizontal swipe moves along.
   */
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-aspect-ratio: 4/5)');
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** Swipe tracking for the carousel. Pointer-based, so mouse drags work too. */
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  /**
   * Zoom impulses from the HUD's +/− buttons, consumed by CameraRig inside the
   * canvas. A ref, not state: it crosses the DOM→R3F boundary every click and
   * is read per frame.
   */
  const zoomStepsRef = useRef(0);

  // The homepage behind this fixed overlay stays scrollable, so any wheel that
  // misses the canvas (over HUD chrome, the legend, the panel) scrolls the page
  // underneath — invisible now, but on exit the visitor lands somewhere they
  // never scrolled to. Lock it for the lifetime of the overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  // Keyboard mirrors of the gestures — every gesture in this mode needs a
  // non-gesture path or a failed camera traps the visitor. Escape is the
  // closed fist, arrows are the swipe, Enter is palm up/down on the selection.
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
      if (e.key === 'Enter' && selected) {
        setOpened((o) => (o === selected ? null : selected));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleExit, navigate, opened, contactOpen, selected]);

  const openedProject = projects.find((p) => p.id === opened) ?? null;

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
      dwellRef,
      sheetMode: portrait,
    }),
    [transforms, hovered, selected, opened, contactOpen, announce, dragging, setReach, portrait],
  );

  return (
    <SpatialCtx.Provider value={value}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-50 bg-ink"
        onPointerDown={(e) => {
          if (!portrait) return;
          swipeStart.current = { x: e.clientX, y: e.clientY, t: performance.now() };
        }}
        onPointerUp={(e) => {
          const s = swipeStart.current;
          swipeStart.current = null;
          if (!portrait || !s || opened) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          // A deliberate horizontal flick, not a tap or a vertical scroll.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - s.t < 700) {
            navigate(dx < 0 ? 'right' : 'left');
          }
        }}
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
          // No shadows: there is no ground plane to receive them, so shadow
          // mapping was a per-frame depth pass rendering nothing.
          dpr={[1, 2]}
          // Same line-tolerance fix as the gesture raycaster, for the mouse:
          // the default 1m tolerance made hovering the temple light up MICS.
          raycaster={{ params: { Line: { threshold: 0 }, Points: { threshold: 0 } } as THREE.RaycasterParameters }}
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
          {/* Sky/ground hemisphere gives the coloured models a warm underside and
              a cool top for free; the key light is warm, the rim cool, so the
              palettes read as lit objects rather than flat paint. */}
          <LocalEnvironment />
          <hemisphereLight args={['#f4f7ff', '#5a4636', 0.45]} />
          <ambientLight intensity={0.15} />
          <directionalLight position={[3, 6, 4]} intensity={1.6} color="#fff1dc" />
          <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#cfe0ff" />
          <directionalLight position={[0, -3, 2]} intensity={0.2} />

          {projects.map((p) => (
            <ProjectAnchor key={p.id} project={p} />
          ))}

          {/* Soft contact shadows on the shared floor plane the ground-standing
              projects sit on. Transparent everywhere else, so the room still
              shows through. */}
          <ContactShadows
            position={[0.1, -0.352, -2.6]}
            scale={[6.5, 3]}
            resolution={512}
            blur={2.4}
            opacity={0.55}
            far={1.4}
            color="#0a0604"
          />

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
            // In the portrait carousel a one-finger drag is the swipe between
            // projects, so it must not also spin the room. Pinch still zooms.
            enableRotate={!portrait}
            enablePan={false}
            enableZoom
            minDistance={0.4}
            maxDistance={11}
            target={SCENE_CENTER}
            dampingFactor={0.06}
            enableDamping
            makeDefault
          />
          <FitCamera portrait={portrait} selected={selected} />
          <CameraRig zoomStepsRef={zoomStepsRef} portrait={portrait} />
        </Canvas>

        {cameraStatus === 'granted' && (
          <HandSkeleton className="pointer-events-none absolute inset-0 h-full w-full" mirrored light />
        )}

        <SpatialHUD
          progressRef={progressRef}
          reachRef={reachRef}
          toast={toast}
          onExit={handleExit}
          onContact={() => setContactOpen((v) => !v)}
          onNavigate={navigate}
          onOpenSelected={() => {
            if (selected) setOpened((o) => (o === selected ? null : selected));
          }}
          onZoom={(dir) => {
            zoomStepsRef.current += dir;
          }}
          selected={selected}
          opened={opened}
        />

        {glLost && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/80 p-8 text-center">
            <p className="text-sm text-paper">The 3D context was lost.</p>
            <p className="max-w-sm text-xs leading-relaxed text-paper/60">
              This usually means the GPU was reclaimed by another application. The scene will
              recover on its own if the browser restores it.
            </p>
            <div className="mt-2 flex gap-3">
              {/* Manual rebuild: the automatic path waits on a visibilitychange
                  that some embedded contexts never deliver. A button answers to
                  nothing but the click. */}
              <button
                type="button"
                onClick={() => {
                  setCanvasKey((k) => k + 1);
                  setGlLost(false);
                }}
                className="rounded-full bg-paper px-4 py-2 text-[11px] font-medium text-ink"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={handleExit}
                className="rounded-full border border-paper/30 px-4 py-2 text-[11px] text-paper"
              >
                Back to the homepage
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {contactOpen && <ContactCard onClose={() => setContactOpen(false)} />}
        </AnimatePresence>

        <AnimatePresence>
          {portrait && openedProject && (
            <CaseStudySheet
              key={openedProject.id}
              project={openedProject}
              onClose={() => setOpened(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </SpatialCtx.Provider>
  );
}

/**
 * Image-based lighting without a download: three's RoomEnvironment is a
 * procedural studio, rendered once into a PMREM. It is what makes brass read
 * as metal and the glass screens catch a highlight — drei's <Environment
 * preset> would do the same but fetches an HDRI from a CDN.
 */
function LocalEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.dispose?.();
    };
  }, [gl, scene]);
  return null;
}

/**
 * Camera behaviours that need to live inside the canvas: focus-on-open and
 * button-driven zoom.
 *
 * Focus: panels are billboarded above their objects, so a project near the
 * edge of the layout opens its panel half off-screen. Rather than clamping the
 * panel to the viewport — which would tear it away from the object it belongs
 * to — the camera swings to centre the object itself. Closing eases back to
 * the exhibition's centroid. Orbiting while open still works; this only moves
 * the target the user orbits around.
 *
 * Zoom: scroll-wheel zoom exists but is invisible — nothing on screen says it
 * is possible, and trackpad users often never try. The HUD's +/− buttons feed
 * impulses through `zoomStepsRef`; each becomes a smooth dolly toward or away
 * from the target. OrbitControls clamps the resulting radius to its own
 * min/max on update, so the buttons can never dolly through an object or into
 * the far void.
 */
function CameraRig({
  zoomStepsRef,
  portrait,
}: {
  zoomStepsRef: React.RefObject<number>;
  portrait: boolean;
}) {
  const spatial = useSpatial();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3 } | null;
  const desired = useRef(new THREE.Vector3());
  const desiredDist = useRef<number | null>(null);
  const offset = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!controls?.target) return;
    const k = 1 - Math.pow(0.03, delta);

    // Portrait carousel: always centred on the selected project.
    const focusId = spatial.opened ?? (portrait ? spatial.selected : null);
    const t = focusId ? spatial.transforms.get(focusId) : null;
    if (t && !spatial.opened) {
      // Aim a little below the object's middle so it sits at the optical
      // centre of a tall screen, clear of the guide card at the bottom.
      desired.current.set(t.position.x, t.position.y + 0.08, t.position.z);
    } else if (t) {
      // Aim between the object and its panel: the panel (with its cover image)
      // is the taller of the two, and centring lower clips its top edge.
      desired.current.set(t.position.x, t.position.y + 0.45, t.position.z);
    } else {
      desired.current.set(...SCENE_CENTER);
    }
    // Drei's OrbitControls updates itself each frame; only the target moves —
    // except in the carousel, where the camera travels with it, so moving to
    // the next project slides the view sideways rather than turning the head.
    if (portrait) {
      offset.current.copy(controls.target);
      controls.target.lerp(desired.current, k);
      camera.position.add(offset.current.sub(controls.target).negate());
    } else {
      controls.target.lerp(desired.current, k);
    }

    // Consume pending zoom impulses: each step multiplies the dolly distance.
    const steps = zoomStepsRef.current;
    if (steps !== 0) {
      zoomStepsRef.current = 0;
      const cur = camera.position.distanceTo(controls.target);
      desiredDist.current = (desiredDist.current ?? cur) * Math.pow(0.72, steps);
    }

    if (desiredDist.current !== null) {
      const cur = camera.position.distanceTo(controls.target);
      const next = THREE.MathUtils.lerp(cur, desiredDist.current, k);
      offset.current.copy(camera.position).sub(controls.target).setLength(next);
      camera.position.copy(controls.target).add(offset.current);
      // Hand the distance back to the wheel once the ease has landed, so
      // button zoom and scroll zoom never fight over the radius.
      if (Math.abs(next - desiredDist.current) < 0.01) desiredDist.current = null;
    }
  });

  return null;
}

/** Centroid of the exhibition, and how much space it needs, in metres. */
const SCENE_CENTER: [number, number, number] = [0.05, 0.05, -2.55];
const SCENE_HALF_WIDTH = 2.6;
const SCENE_HALF_HEIGHT = 0.95;

/**
 * Frames the whole exhibition regardless of viewport shape.
 *
 * A fixed camera position only works at one aspect ratio: at 16:9 the five
 * projects fit, but on a portrait phone the horizontal field of view collapses
 * and the outer two fall outside the frustum entirely. This solves for the
 * distance that fits the scene's bounds on both axes and places the camera
 * there, before handing control to OrbitControls.
 */
function FitCamera({ portrait, selected }: { portrait: boolean; selected: string | null }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as { update?: () => void } | null;
  const spatial = useSpatial();

  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const halfV = Math.tan(((55 * Math.PI) / 180) / 2);

    if (portrait) {
      // Frame one project (~1.5m wide) with its neighbours peeking in.
      const t = selected ? spatial.transforms.get(selected) : null;
      const cx = t ? t.position.x : SCENE_CENTER[0];
      const cy = t ? t.position.y + 0.08 : SCENE_CENTER[1];
      const cz = t ? t.position.z : SCENE_CENTER[2];
      const dist = Math.max(0.75 / (halfV * aspect), 1.6);
      camera.position.set(cx, cy + 0.2, cz + dist);
      camera.updateProjectionMatrix();
      controls?.update?.();
      return;
    }

    const distForHeight = SCENE_HALF_HEIGHT / halfV;
    const distForWidth = SCENE_HALF_WIDTH / (halfV * aspect);
    // 8% margin so nothing sits flush against the edge of the frame.
    const dist = Math.max(distForHeight, distForWidth, 1.2) * 1.08;

    camera.position.set(SCENE_CENTER[0], SCENE_CENTER[1] + 0.15, SCENE_CENTER[2] + dist);
    camera.updateProjectionMatrix();
    controls?.update?.();
    // Re-fit on layout changes only; following the selection is CameraRig's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size, controls, portrait]);

  return null;
}

/**
 * The case study on a phone: a bottom sheet over the scene. Anchored to the
 * thumb, scrollable, with the close control always on screen — the 3D-placed
 * card it replaces was taller than the viewport and lost its own Close button.
 */
function CaseStudySheet({
  project,
  onClose,
}: {
  project: (typeof projects)[number];
  onClose: () => void;
}) {
  // Drag starts only from the handle: a drag-anywhere sheet would swallow the
  // vertical swipes the visitor needs to scroll the case study itself.
  const drag = useDragControls();
  return (
    <>
      <motion.button
        type="button"
        aria-label="Close case study"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 z-[60] bg-ink/45"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={project.title}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 36 }}
        drag="y"
        dragControls={drag}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          // Pull down past a third of a thumb-length, or flick down, to close.
          if (info.offset.y > 120 || info.velocity.y > 600) onClose();
        }}
        className="absolute inset-x-0 bottom-0 z-[61] flex max-h-[86dvh] flex-col rounded-t-3xl bg-paper shadow-2xl"
      >
        <div
          className="flex cursor-grab touch-none justify-center pb-2 pt-3"
          onPointerDown={(e) => drag.start(e)}
          aria-hidden
        >
          <span className="h-1.5 w-11 rounded-full bg-ink/20" />
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <CaseStudyPanel project={project} onClose={onClose} variant="sheet" />
        </div>
      </motion.div>
    </>
  );
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

      {/* Same calls to action as the homepage: LinkedIn first, then the
          resume. New tabs, so the 3D scene keeps running behind. */}
      <div className="mt-6 flex flex-col gap-3">
        <a
          href={profile.linkedin}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center justify-between rounded-full bg-ink px-5 py-3 text-sm font-medium text-paper transition-opacity hover:opacity-85"
        >
          Connect on LinkedIn
          <span aria-hidden>↗</span>
        </a>
        <a
          href="/resume.pdf"
          download="Vijin-Govind-Resume.pdf"
          className="flex items-center justify-between rounded-full border border-ink px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          Download resume
          <span aria-hidden className="text-xs">↓</span>
        </a>
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
