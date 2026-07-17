'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { Project, ProjectForm } from '@/content/portfolio';
import { useSpatial } from './spatialStore';
import { DashboardObject, HologramObject, PrototypeObject, TempleObject } from './objects';

/**
 * Per-archetype furniture, in metres.
 *
 * The four objects have wildly different extents — the temple is tall and
 * narrow, the hologram is a sphere of rings centred on its origin — so a single
 * shared offset either buries the label inside the object or leaves it floating
 * far below. `label` sits under the object's real footprint; `panel` clears its
 * top; `ring` matches its radius.
 */
const LAYOUT: Record<
  ProjectForm,
  { label: number; panel: number; ring: number; hit: [number, number, number]; hitY: number }
> = {
  temple: { label: -0.1, panel: 1.05, ring: 0.5, hit: [0.8, 0.98, 0.8], hitY: 0.46 },
  dashboard: { label: -0.3, panel: 0.45, ring: 0.58, hit: [0.9, 0.58, 0.3], hitY: 0 },
  hologram: { label: -0.46, panel: 0.5, ring: 0.5, hit: [0.86, 0.8, 0.8], hitY: 0 },
  prototype: { label: -0.08, panel: 0.62, ring: 0.4, hit: [0.5, 0.42, 0.36], hitY: 0.13 },
};

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

  const hovered = spatial.hovered === project.id;
  const selected = spatial.selected === project.id;
  const opened = spatial.opened === project.id;
  const highlight = hovered || selected;
  const layout = LAYOUT[project.form];

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

    if (ring.current) {
      const target = highlight ? 1 : 0;
      const m = ring.current.material as THREE.Material & { opacity: number };
      m.opacity += (target * 0.9 - m.opacity) * (1 - Math.pow(0.002, delta));
      ring.current.rotation.z += delta * 0.4;
    }
  });

  return (
    // userData.projectId is what the gesture raycaster walks the tree looking
    // for, so it must live on the outermost group.
    <group ref={group} userData={{ projectId: project.id }}>
      <group ref={bob}>
        {project.form === 'temple' && <TempleObject highlight={highlight} />}
        {project.form === 'dashboard' && <DashboardObject highlight={highlight} />}
        {project.form === 'hologram' && <HologramObject highlight={highlight} />}
        {project.form === 'prototype' && <PrototypeObject highlight={highlight} />}
      </group>

      {/* Selection ring on the floor beneath the object. */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, layout.label - 0.04, 0]}>
        <ringGeometry args={[layout.ring, layout.ring + 0.02, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>

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
          {`${project.discipline}  ·  ${project.year}`}
        </Text>
      </Billboard>

      {opened && (
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

function CaseStudyPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  return (
    <div className="w-[380px] rounded-2xl bg-paper/95 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="tracking-display text-2xl font-bold leading-tight text-ink">
            {project.title}
          </h3>
          <p className="mt-1 text-[11px] text-ink-faint">
            {project.discipline} · {project.year}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[10px] text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          Close
        </button>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">{project.summary}</p>

      <div className="mt-5 border-t border-hairline pt-4">
        <p className="text-[10px] uppercase tracking-widest text-ink-faint">Role</p>
        <p className="mt-1 text-xs text-ink">{project.role}</p>
      </div>

      <div className="mt-4 space-y-3">
        {project.detail.map((para, i) => (
          <p key={i} className="text-[12px] leading-relaxed text-ink-soft">
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

      <p className="mt-5 text-[10px] text-ink-faint">Palm down to close · Thumbs up for home</p>
    </div>
  );
}
