'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Project, ProjectForm } from '@/content/portfolio';
import { playTone } from '@/lib/audio';
import { useSpatial } from './spatialStore';
import {
  DashboardObject,
  EaselObject,
  FilmObject,
  RacetrackObject,
  TempleObject,
} from './objects';

/**
 * Per-archetype furniture, in metres.
 *
 * The objects have wildly different extents — the temple is tall and narrow,
 * the dashboard is a board centred on its origin — so a single
 * shared offset either buries the label inside the object or leaves it floating
 * far below. `label` sits under the object's real footprint; `panel` clears its
 * top; `ring` matches its radius.
 */
const LAYOUT: Record<
  ProjectForm,
  { label: number; panel: number; ring: number; hit: [number, number, number]; hitY: number }
> = {
  temple: { label: -0.07, panel: 1.08, ring: 0.62, hit: [1.06, 0.86, 1.06], hitY: 0.43 },
  dashboard: { label: -0.47, panel: 0.48, ring: 0.62, hit: [1.15, 0.76, 0.4], hitY: -0.05 },
  racetrack: { label: -0.04, panel: 0.88, ring: 0.44, hit: [0.76, 0.56, 0.5], hitY: 0.24 },
  easel: { label: -0.04, panel: 1.0, ring: 0.32, hit: [0.5, 0.82, 0.36], hitY: 0.4 },
  film: { label: -0.04, panel: 0.75, ring: 0.36, hit: [0.66, 0.44, 0.26], hitY: 0.2 },
};

/** Segments in the point-and-hold ring. */
const DWELL_SEGMENTS = 48;

/**
 * Places one project in the room: the object itself, its label, its selection
 * state and its case-study panel.
 *
 * Reads its transform from the shared store inside useFrame rather than taking
 * it as a prop, so a drag never re-renders this subtree.
 */
export function ProjectAnchor({ project }: { project: Project }) {
  const spatial = useSpatial();
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const bob = useRef<THREE.Group>(null);
  const dwellGroup = useRef<THREE.Group>(null);
  const dwellArc = useRef<THREE.Group>(null);

  const hovered = spatial.hovered === project.id;
  const selected = spatial.selected === project.id;
  const opened = spatial.opened === project.id;
  const highlight = hovered || selected;
  const layout = LAYOUT[project.form];
  const dwellRadius = Math.max(layout.hit[0], layout.hit[1]) * 0.62;

  useFrame((state, delta) => {
    const t = spatial.transforms.get(project.id);
    if (!t || !group.current) return;

    group.current.position.copy(t.position);
    group.current.quaternion.copy(t.quaternion);
    group.current.scale.setScalar(t.scale);

    // Idle float. Suspended slightly off the floor plane, each object on its own
    // phase so the set never pulses in unison.
    if (bob.current) {
      const phase = project.position[0] * 2.3 + project.position[2];
      bob.current.position.y = Math.sin(state.clock.elapsedTime * 0.6 + phase) * 0.012;
    }

    // Point-and-hold ring: segments light up clockwise as the dwell fills.
    const d = spatial.dwellRef.current;
    const v = d && d.id === project.id ? d.value : 0;
    if (dwellGroup.current) dwellGroup.current.visible = v > 0;
    if (dwellArc.current && v > 0) {
      const lit = Math.round(v * DWELL_SEGMENTS);
      dwellArc.current.children.forEach((c, i) => {
        c.visible = i < lit;
      });
    }

    if (ring.current) {
      const target = highlight ? 1 : 0;
      const m = ring.current.material as THREE.Material & { opacity: number };
      m.opacity += (target * 0.9 - m.opacity) * (1 - Math.pow(0.002, delta));
      ring.current.rotation.z += delta * 0.4;
    }
  });

  // Mouse path: hover mirrors pointing, click mirrors point-and-hold.
  const toggleOpen = () => {
    const opening = spatial.opened !== project.id;
    spatial.setSelected(project.id);
    spatial.setOpened(opening ? project.id : null);
    spatial.announce(`${opening ? 'Opened' : 'Closed'} · ${project.title}`);
    playTone(opening ? 760 : 360, 0.2, 0.09); // master gain is 0 when muted
  };

  return (
    // userData.projectId is what the gesture raycaster walks the tree looking
    // for, so it must live on the outermost group.
    <group
      ref={group}
      userData={{ projectId: project.id }}
      onPointerOver={(e) => {
        e.stopPropagation();
        spatial.setHovered(project.id);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        if (spatial.hovered === project.id) spatial.setHovered(null);
        document.body.style.cursor = '';
      }}
      onClick={(e) => {
        e.stopPropagation();
        // An orbit drag that happens to end over an object is not a click.
        if (e.delta > 6) return;
        // One click opens, a second closes — the same single action pointing
        // performs. Click-to-select-then-double-click-to-open was a two-step
        // model nobody found on their own.
        toggleOpen();
      }}
    >
      <group ref={bob}>
        {project.form === 'temple' && <TempleObject highlight={highlight} />}
        {project.form === 'dashboard' && <DashboardObject highlight={highlight} />}
        {project.form === 'racetrack' && <RacetrackObject highlight={highlight} />}
        {project.form === 'easel' && <EaselObject highlight={highlight} />}
        {project.form === 'film' && <FilmObject highlight={highlight} />}
      </group>

      {/* Selection ring on the floor beneath the object. */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, layout.label - 0.04, 0]}>
        <ringGeometry args={[layout.ring, layout.ring + 0.02, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

      {/* Point-and-hold progress, facing the visitor around the object. */}
      <Billboard position={[0, layout.hitY, 0]}>
        <group ref={dwellGroup} visible={false}>
          <mesh>
            <ringGeometry args={[dwellRadius - 0.006, dwellRadius + 0.006, 96]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthTest={false} />
          </mesh>
          <group ref={dwellArc}>
            {Array.from({ length: DWELL_SEGMENTS }, (_, i) => {
              // Clockwise from twelve o'clock.
              const a = Math.PI / 2 - (i / DWELL_SEGMENTS) * Math.PI * 2;
              return (
                <mesh
                  key={i}
                  position={[Math.cos(a) * dwellRadius, Math.sin(a) * dwellRadius, 0.001]}
                  rotation={[0, 0, a]}
                  visible={false}
                >
                  <planeGeometry args={[0.016, ((Math.PI * 2 * dwellRadius) / DWELL_SEGMENTS) * 0.82]} />
                  <meshBasicMaterial color="#ffffff" depthTest={false} />
                </mesh>
              );
            })}
          </group>
        </group>
      </Billboard>

      {/* Invisible grab volume: the procedural objects are full of gaps, and
          raycasting against their actual geometry makes them nearly impossible
          to point at. This gives every project one honest hit box, sized to the
          shape it actually stands in for. */}
      <mesh visible={false} position={[0, layout.hitY, 0]}>
        <boxGeometry args={layout.hit} />
      </mesh>

      <Billboard position={[0, layout.label, 0]}>
        <Text
          fontSize={0.062}
          color="#ffffff"
          anchorX="center"
          anchorY="top"
          outlineWidth={0.004}
          outlineColor="#000000"
          letterSpacing={-0.02}
        >
          {project.title}
        </Text>
        <Text
          position={[0, -0.085, 0]}
          fontSize={0.032}
          color="#d4d4d4"
          anchorX="center"
          anchorY="top"
          outlineWidth={0.002}
          outlineColor="#000000"
        >
          {project.year ? `${project.discipline}  ·  ${project.year}` : project.discipline}
        </Text>
      </Billboard>

      {opened && !spatial.sheetMode && (
        <Billboard position={[0, layout.panel, 0]}>
          <Html
            transform
            distanceFactor={1.6}
            occlude={false}
            style={{ pointerEvents: 'auto' }}
            zIndexRange={[40, 0]}
          >
            <CaseStudyPanel project={project} onClose={() => spatial.setOpened(null)} />
          </Html>
        </Billboard>
      )}
    </group>
  );
}

export function CaseStudyPanel({
  project,
  onClose,
  variant = 'floating',
}: {
  project: Project;
  onClose: () => void;
  /** `floating` sits in the 3D scene; `sheet` fills a phone's bottom sheet. */
  variant?: 'floating' | 'sheet';
}) {
  return (
    <div
      className={
        variant === 'sheet'
          ? 'w-full pt-2'
          : 'w-[380px] rounded-2xl bg-paper/95 p-6 shadow-2xl backdrop-blur-xl'
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="tracking-display text-2xl font-bold leading-tight text-ink">
            {project.title}
          </h3>
          <p className="mt-1 text-[11px] text-ink-faint">
            {project.year ? `${project.discipline} · ${project.year}` : project.discipline}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`shrink-0 rounded-full border border-hairline text-ink-soft transition-colors hover:border-ink hover:text-ink ${
            variant === 'sheet' ? 'px-3.5 py-2 text-xs' : 'px-2.5 py-1 text-[10px]'
          }`}
        >
          Close
        </button>
      </div>

      {project.image && (
        // Plain <img>: this lives inside drei's <Html>, outside Next's image
        // pipeline, and the file is already a sized cover from public/works.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={project.image}
          alt=""
          loading="lazy"
          className="mt-4 aspect-[2/1] w-full rounded-lg object-cover"
        />
      )}

      <p className={`mt-4 leading-relaxed text-ink-soft ${variant === 'sheet' ? 'text-[15px]' : 'text-[13px]'}`}>
        {project.summary}
      </p>

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="text-[10px] uppercase tracking-widest text-ink-faint">Role</p>
        <p className="mt-1 text-xs text-ink">{project.role}</p>
      </div>

      <div className="mt-4 space-y-3">
        {project.detail.map((para, i) => (
          <p
            key={i}
            className={`leading-relaxed text-ink-soft ${variant === 'sheet' ? 'text-[14px]' : 'text-[12px]'}`}
          >
            {para}
          </p>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-hairline pt-4">
        {project.metrics.map((m) => (
          <div key={m.label}>
            <dt className="text-[9px] uppercase tracking-wider text-ink-faint">{m.label}</dt>
            <dd className="mt-1 text-xs font-medium text-ink">{m.value}</dd>
          </div>
        ))}
      </dl>

      {project.href && (
        // New tab, so reading the case study never tears down the scene, the
        // camera stream or the hand tracker — closing the tab lands the visitor
        // back in the room exactly where they were.
        <a
          href={project.href}
          target="_blank"
          rel="noopener"
          className="mt-5 flex items-center justify-between rounded-full bg-ink px-4 py-2.5 text-[12px] font-medium text-paper transition-opacity hover:opacity-85"
        >
          View full case study
          <span aria-hidden>↗</span>
        </a>
      )}

      <p className="mt-4 text-[10px] text-ink-faint">
        {variant === 'sheet'
          ? 'Swipe down or tap outside to close'
          : 'Close: palm facing down, Esc, or the Close button'}
      </p>
    </div>
  );
}
