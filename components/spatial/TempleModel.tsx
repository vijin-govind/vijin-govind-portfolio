'use client';

import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Clone, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { TempleObject } from './objects';

/** Self-hosted GLB, generated from the reference photo. See README. */
const TEMPLE_URL = '/models/temple.glb';

/** The GLB is fit into a box this tall (metres), matching the procedural temple. */
const TARGET_HEIGHT = 0.9;

/**
 * The generated temple, loaded from a GLB and normalised to the scene's scale.
 *
 * A raw image-to-3D export arrives at an arbitrary size, off-centre, and with
 * its base anywhere relative to the origin — so it is measured once and the
 * correcting transform is applied to a wrapper group: scaled to a known
 * height, centred on X/Z, base seated on y=0 like every other object here.
 *
 * Rendering uses drei's <Clone> rather than <primitive object={scene}>. A bare
 * primitive holding a memoised object is re-attached by React StrictMode's
 * mount/unmount/mount cycle and leaves the previous copy in the scene — which
 * is exactly the "three stacked temples" this replaced. <Clone> is built to
 * survive that cycle.
 */
function TempleModel({ highlight }: { highlight: boolean }) {
  const { scene } = useGLTF(TEMPLE_URL);

  // Derive the fit transform from the source bounds without mutating the cached
  // scene (which is shared across every consumer of this GLB).
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = TARGET_HEIGHT / Math.max(size.y, 1e-3);
    return {
      scale,
      position: [-center.x * scale, -box.min.y * scale, -center.z * scale] as const,
    };
  }, [scene]);

  const group = useRef<THREE.Group>(null);

  // Highlight lifts the model's emissive so it glows on hover/select, matching
  // the affordance the procedural objects give. Materials are cloned lazily on
  // first touch (flagged in userData) so the shared cached materials are never
  // mutated — otherwise the glow would persist into the next mount.
  useFrame((_, delta) => {
    if (!group.current) return;
    const k = 1 - Math.pow(0.01, delta);
    group.current.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < mats.length; i++) {
        let sm = mats[i] as THREE.MeshStandardMaterial;
        if (!sm.emissive) continue;
        if (!sm.userData.owned) {
          sm = sm.clone();
          sm.userData.owned = true;
          sm.userData.baseEmissive = sm.emissiveIntensity ?? 0;
          if (Array.isArray(mesh.material)) (mesh.material as THREE.Material[])[i] = sm;
          else mesh.material = sm;
        }
        const base = (sm.userData.baseEmissive as number) ?? 0;
        const target = highlight ? base + 0.4 : base;
        sm.emissiveIntensity += (target - sm.emissiveIntensity) * k;
        if (highlight && sm.emissive.getHex() === 0x000000) sm.emissive.set('#ffffff');
      }
    });
  });

  return (
    <group ref={group} scale={fit.scale} position={fit.position as unknown as THREE.Vector3}>
      <Clone object={scene} />
    </group>
  );
}

/**
 * Error boundary that falls back to the procedural temple.
 *
 * useGLTF throws (not suspends) on a 404, which is exactly the state before the
 * GLB has been placed — and could recur if a deploy ships without the asset.
 * Catching it here means the scene always has a temple, generated or drawn.
 */
class TempleBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* swallow: the fallback is the recovery, nothing to report */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Public entry: the GLB temple when available, the procedural one otherwise —
 * during load, on error, and before the asset exists at all.
 */
export function TempleForm({ highlight }: { highlight: boolean }) {
  const fallback = <TempleObject highlight={highlight} />;
  return (
    <TempleBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <TempleModel highlight={highlight} />
      </Suspense>
    </TempleBoundary>
  );
}

// Preloading is safe even while the file is absent: the failed fetch is caught
// by the boundary, and it warms the cache the instant the asset ships.
useGLTF.preload(TEMPLE_URL);
