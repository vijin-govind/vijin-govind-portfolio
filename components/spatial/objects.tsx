'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Project archetypes, built from primitives rather than loaded models.
 *
 * Two reasons: nothing to download, and the whole set stays in one material
 * language — matte white volumes with drawn edges, like a physical study model.
 * Colour in this scene belongs to the visitor's room, not to the work.
 */

const WHITE = '#f5f5f5';
const INK = '#0a0a0a';

function Shell({ children }: { children: React.ReactNode }) {
  return <group>{children}</group>;
}

/**
 * Shared surface: matte, slightly warm, reads against almost any room.
 *
 * Built once and mutated on highlight rather than rebuilt: keying the useMemo
 * on `highlight` would allocate a new material — and a new GPU program — every
 * time a hand passes over an object, and orphan the old one.
 */
function useSurface(highlight: boolean) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: WHITE,
        roughness: 0.62,
        metalness: 0.04,
      }),
    [],
  );

  useEffect(() => {
    mat.emissive.set(highlight ? '#ffffff' : '#000000');
    mat.emissiveIntensity = highlight ? 0.16 : 0;
  }, [mat, highlight]);

  useEffect(() => () => mat.dispose(), [mat]);

  return mat;
}

/* -------------------------------------------------------------------------- */
/* TempleAddress — a miniature temple with floating panels                     */
/* -------------------------------------------------------------------------- */

export function TempleObject({ highlight }: { highlight: boolean }) {
  const mat = useSurface(highlight);
  const panels = useRef<THREE.Group>(null);

  useFrame((state) => {
    // The panels orbit the sanctum slowly — the building is still, the
    // information around it is not.
    if (panels.current) panels.current.rotation.y = state.clock.elapsedTime * 0.18;
  });

  // Gopuram tiers: each level narrower and shorter than the one below.
  const tiers = useMemo(
    () => Array.from({ length: 5 }, (_, i) => ({ y: 0.30 + i * 0.1, w: 0.34 - i * 0.05, h: 0.08 })),
    [],
  );

  return (
    <Shell>
      {/* Plinth */}
      <mesh material={mat} position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[0.72, 0.06, 0.72]} />
        <Edges threshold={15} color={INK} />
      </mesh>
      <mesh material={mat} position={[0, 0.09, 0]}>
        <boxGeometry args={[0.6, 0.06, 0.6]} />
        <Edges threshold={15} color={INK} />
      </mesh>

      {/* Colonnade */}
      {[-0.2, 0.2].map((x) =>
        [-0.2, 0.2].map((z) => (
          <mesh key={`${x}-${z}`} material={mat} position={[x, 0.2, z]}>
            <cylinderGeometry args={[0.026, 0.03, 0.16, 12]} />
            <Edges threshold={30} color={INK} />
          </mesh>
        )),
      )}

      {/* Sanctum */}
      <mesh material={mat} position={[0, 0.2, 0]}>
        <boxGeometry args={[0.22, 0.16, 0.22]} />
        <Edges threshold={15} color={INK} />
      </mesh>

      {/* Roof slab */}
      <mesh material={mat} position={[0, 0.29, 0]}>
        <boxGeometry args={[0.52, 0.03, 0.52]} />
        <Edges threshold={15} color={INK} />
      </mesh>

      {/* Tiered tower */}
      {tiers.map((t, i) => (
        <mesh key={i} material={mat} position={[0, t.y, 0]}>
          <boxGeometry args={[t.w, t.h, t.w]} />
          <Edges threshold={15} color={INK} />
        </mesh>
      ))}

      {/* Finial */}
      <mesh material={mat} position={[0, 0.83, 0]}>
        <coneGeometry args={[0.05, 0.12, 8]} />
        <Edges threshold={20} color={INK} />
      </mesh>

      <group ref={panels} position={[0, 0.42, 0]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(a) * 0.5, i * 0.07, Math.sin(a) * 0.5]} rotation={[0, -a + Math.PI / 2, 0]}>
              <FloatingPanel width={0.26} height={0.17} lines={3} highlight={highlight} />
            </group>
          );
        })}
      </group>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */
/* IT MICS 360 — floating dashboards and analytics                            */
/* -------------------------------------------------------------------------- */

export function DashboardObject({ highlight }: { highlight: boolean }) {
  const mat = useSurface(highlight);
  const bars = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!bars.current) return;
    // Bars breathe on a phase offset so the board looks live rather than looped.
    bars.current.children.forEach((c, i) => {
      const h = 0.06 + (Math.sin(state.clock.elapsedTime * 0.9 + i * 0.7) * 0.5 + 0.5) * 0.16;
      c.scale.y = h / 0.1;
      c.position.y = (h - 0.1) / 2;
    });
  });

  return (
    <Shell>
      {/* Primary board */}
      <RoundedBox args={[0.78, 0.5, 0.016]} radius={0.012} smoothness={4} material={mat}>
        <Edges threshold={15} color={INK} />
      </RoundedBox>

      {/* Header rule */}
      <mesh position={[-0.16, 0.19, 0.012]}>
        <planeGeometry args={[0.4, 0.008]} />
        <meshBasicMaterial color={INK} />
      </mesh>

      {/* Bar chart */}
      <group ref={bars} position={[-0.24, -0.06, 0.014]}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[i * 0.055, 0, 0]}>
            <boxGeometry args={[0.03, 0.1, 0.006]} />
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
      </group>

      {/* Trend line */}
      <Sparkline position={[0.22, 0.02, 0.014]} />

      {/* Satellite cards, offset in depth so the set reads as a workspace */}
      <group position={[0.52, 0.2, -0.14]} rotation={[0, -0.5, 0]}>
        <FloatingPanel width={0.3} height={0.2} lines={4} highlight={highlight} />
      </group>
      <group position={[-0.54, -0.14, -0.1]} rotation={[0, 0.45, 0]}>
        <FloatingPanel width={0.26} height={0.16} lines={2} highlight={highlight} />
      </group>
    </Shell>
  );
}

function Sparkline({ position }: { position: [number, number, number] }) {
  // The Line object itself must be memoised, not just its geometry: building it
  // inline in JSX would allocate a fresh geometry and material on every render
  // and leak both, since <primitive> never disposes what it did not create.
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 24; i++) {
      const x = (i / 23) * 0.3 - 0.15;
      const y = Math.sin(i * 0.55) * 0.03 + Math.sin(i * 0.21) * 0.025;
      pts.push(new THREE.Vector3(x, y, 0));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: INK }));
  }, []);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  return (
    <group position={position}>
      <primitive object={line} />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Conversational AI — holographic interface                                  */
/* -------------------------------------------------------------------------- */

export function HologramObject({ highlight }: { highlight: boolean }) {
  const rings = useRef<THREE.Group>(null);
  const bubbles = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (rings.current) {
      rings.current.rotation.z = t * 0.3;
      rings.current.children.forEach((c, i) => {
        c.rotation.x = t * (0.4 + i * 0.15);
        c.rotation.y = t * (0.25 + i * 0.1);
      });
    }
    if (bubbles.current) {
      bubbles.current.children.forEach((c, i) => {
        c.position.y = Math.sin(t * 0.7 + i * 1.1) * 0.014 + (i - 1) * 0.15;
      });
    }
  });

  // Additive so the interface reads as projected light rather than a solid —
  // the one place in the scene where the room is meant to show through.
  const glass = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => {
    glass.opacity = highlight ? 0.3 : 0.18;
  }, [glass, highlight]);

  useEffect(() => () => glass.dispose(), [glass]);

  return (
    <Shell>
      <group ref={rings}>
        {[0.2, 0.28, 0.36].map((r, i) => (
          <mesh key={i}>
            <torusGeometry args={[r, 0.0035, 8, 64]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.75 - i * 0.18} />
          </mesh>
        ))}
      </group>

      {/* Core */}
      <mesh>
        <icosahedronGeometry args={[0.09, 1]} />
        <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.9} />
      </mesh>

      <group ref={bubbles} position={[0.4, 0, 0]}>
        {[0, 1, 2].map((i) => (
          <group key={i} position={[i % 2 === 0 ? 0 : 0.06, 0, 0]}>
            <mesh material={glass}>
              <planeGeometry args={[0.3, 0.1]} />
            </mesh>
            <mesh position={[0, 0, 0.001]}>
              <planeGeometry args={[0.3, 0.1]} />
              <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.35} />
            </mesh>
            {Array.from({ length: 2 }, (_, l) => (
              <mesh key={l} position={[-0.06 + l * 0.01, 0.02 - l * 0.03, 0.002]}>
                <planeGeometry args={[0.16 - l * 0.05, 0.006]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */
/* Physical Objects — an interactive prototype                                */
/* -------------------------------------------------------------------------- */

export function PrototypeObject({ highlight }: { highlight: boolean }) {
  const mat = useSurface(highlight);
  const knob = useRef<THREE.Mesh>(null);
  const cord = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (knob.current) knob.current.rotation.y = t * 0.5;
    // A miniature of the cord the visitor just pulled, still swinging.
    if (cord.current) cord.current.rotation.z = Math.sin(t * 1.6) * 0.06;
  });

  return (
    <Shell>
      {/* Body */}
      <RoundedBox args={[0.44, 0.1, 0.3]} radius={0.03} smoothness={5} material={mat} position={[0, 0.05, 0]}>
        <Edges threshold={22} color={INK} />
      </RoundedBox>

      {/* Machined dial */}
      <mesh ref={knob} material={mat} position={[-0.11, 0.12, 0]}>
        <cylinderGeometry args={[0.052, 0.052, 0.045, 32]} />
        <Edges threshold={28} color={INK} />
      </mesh>
      {/* Index mark on the dial */}
      <mesh position={[-0.11, 0.143, 0.03]}>
        <boxGeometry args={[0.004, 0.002, 0.02]} />
        <meshBasicMaterial color={INK} />
      </mesh>

      {/* Toggle plate */}
      <mesh material={mat} position={[0.1, 0.108, 0]}>
        <boxGeometry args={[0.16, 0.012, 0.1]} />
        <Edges threshold={20} color={INK} />
      </mesh>

      {/* The cord, in miniature */}
      <group position={[0.19, 0.34, 0]}>
        <mesh ref={cord}>
          <cylinderGeometry args={[0.0016, 0.0016, 0.34, 6]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <mesh material={mat} position={[0, -0.18, 0]}>
          <cylinderGeometry args={[0.011, 0.008, 0.038, 12]} />
          <Edges threshold={30} color={INK} />
        </mesh>
      </group>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

/** Generic UI card used as satellite content around the objects. */
function FloatingPanel({
  width,
  height,
  lines,
  highlight,
}: {
  width: number;
  height: number;
  lines: number;
  highlight: boolean;
}) {
  return (
    <group>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={highlight ? 0.94 : 0.86}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.0005]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={INK} wireframe transparent opacity={0.35} />
      </mesh>
      {Array.from({ length: lines }, (_, i) => (
        <mesh
          key={i}
          position={[-width * 0.1, height * 0.28 - i * (height * 0.18), 0.001]}
        >
          <planeGeometry args={[width * (0.62 - i * 0.1), height * 0.035]} />
          <meshBasicMaterial color={INK} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}
