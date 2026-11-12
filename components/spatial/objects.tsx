'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges as DreiEdges, RoundedBox, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { texturedMaterial } from '@/lib/proceduralTextures';

/**
 * Project archetypes, built from primitives rather than loaded models.
 *
 * Two reasons: nothing to download, and the whole set stays in one material
 * language — painted study models with softly drawn edges. Each project has
 * its own palette, taken from the work itself: Kerala laterite, terracotta and
 * brass for the temple, AB InBev navy for MICS, AMG teal on the circuit, warm
 * wood for the easel, a charcoal cine camera with amber film.
 */

const WHITE = '#f5f5f5';
const INK = '#0a0a0a';

function Shell({ children }: { children: React.ReactNode }) {
  return <group>{children}</group>;
}

/**
 * Shared surface: a matte, painted study-model finish in the object's own
 * colour. Highlight lifts it with a glow in that same colour rather than a
 * white wash, so a lit object still reads as itself.
 *
 * Built once and mutated on highlight rather than rebuilt: keying the useMemo
 * on `highlight` would allocate a new material — and a new GPU program — every
 * time a hand passes over an object, and orphan the old one.
 */
function useSurface(highlight: boolean, color: string = WHITE, roughness = 0.62, metalness = 0.04) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness, metalness }),
    [color, roughness, metalness],
  );

  useEffect(() => {
    mat.emissive.set(highlight ? color : '#000000');
    mat.emissiveIntensity = highlight ? 0.35 : 0;
  }, [mat, highlight, color]);

  useEffect(() => () => mat.dispose(), [mat]);

  return mat;
}

/** A photo-textured surface (see lib/proceduralTextures) with the same highlight glow. */
function useTexturedSurface(
  highlight: boolean,
  kind: Parameters<typeof texturedMaterial>[0],
  repeat: [number, number],
  opts: Parameters<typeof texturedMaterial>[2] = {},
) {
  // Options are literals at every call site; build once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mat = useMemo(() => texturedMaterial(kind, repeat, opts), []);
  useEffect(() => {
    mat.emissive.set(highlight ? '#ffffff' : '#000000');
    mat.emissiveIntensity = highlight ? 0.12 : 0;
  }, [mat, highlight]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

/**
 * Drawn edges, softened. At full ink they turned every coloured volume into a
 * line drawing; at low opacity they still define the forms on the pale
 * materials and simply disappear into the dark ones.
 */
function Edges({ threshold }: { threshold?: number; color?: string }) {
  return <DreiEdges threshold={threshold} color="#000000" transparent opacity={0.28} />;
}

/* -------------------------------------------------------------------------- */
/* TempleAddress — a Kerala temple                                            */
/* -------------------------------------------------------------------------- */

/**
 * Brass for the flagstaff, the lamp tower, the finial and the eave tips — the
 * parts that are brass or gilt on a real Kerala temple. With the scene's
 * environment map it can be properly metallic and pick up reflections.
 */
function useBrass(highlight: boolean) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#d9a640', roughness: 0.28, metalness: 0.9 }),
    [],
  );
  useEffect(() => {
    mat.emissive.set(highlight ? '#ffcf70' : '#000000');
    mat.emissiveIntensity = highlight ? 0.25 : 0;
  }, [mat, highlight]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

/**
 * The temple's photo-textured materials: laterite, lime plaster, terracotta
 * tile, teak, granite. Built once; highlight lifts them all together.
 */
function useTempleMaterials(highlight: boolean) {
  const mats = useMemo(
    () => ({
      laterite: texturedMaterial('laterite', [2, 1], { bump: 2, roughness: 0.92, tint: '#d9937a' }),
      lateriteSmall: texturedMaterial('laterite', [1, 0.5], { bump: 2, roughness: 0.92, tint: '#d9937a' }),
      plaster: texturedMaterial('plaster', [1, 1], { bump: 0.6, roughness: 0.95 }),
      // Tinted deeper: under the environment light the raw tile reads pale.
      roof: texturedMaterial('roofTiles', [6, 1.4], { bump: 3, roughness: 0.62, tint: '#e0846a' }),
      roofSmall: texturedMaterial('roofTiles', [4, 1], { bump: 3, roughness: 0.62, tint: '#e0846a' }),
      teak: texturedMaterial('teak', [1, 2], { bump: 1, roughness: 0.6 }),
      granite: new THREE.MeshStandardMaterial({ color: '#8f877b', roughness: 0.8 }),
      palmTrunk: texturedMaterial('teak', [1, 3], { bump: 2, roughness: 0.9, tint: '#b8a48c' }),
      frond: new THREE.MeshStandardMaterial({
        color: '#4f8a2e',
        roughness: 0.75,
        side: THREE.DoubleSide,
      }),
    }),
    [],
  );
  useEffect(() => {
    for (const m of Object.values(mats)) {
      m.emissive.set(highlight ? '#ffffff' : '#000000');
      m.emissiveIntensity = highlight ? 0.1 : 0;
    }
  }, [mats, highlight]);
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose();
    },
    [mats],
  );
  return mats;
}

/** A four-sided roof frustum turned to face the walls. Half-widths in metres. */
function RoofTier({
  mat,
  y,
  half,
  topHalf,
  height,
}: {
  mat: THREE.Material;
  y: number;
  half: number;
  topHalf: number;
  height: number;
}) {
  return (
    <mesh material={mat} position={[0, y + height / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
      {/* Radii are to the corners, hence √2 × the half-width. */}
      <cylinderGeometry args={[topHalf * Math.SQRT2, half * Math.SQRT2, height, 4, 1]} />
    </mesh>
  );
}

/**
 * A Kerala roof tier: a shallow, wide flare at the eave — the kick that gives
 * these roofs their silhouette — then the steeper main slope, with a curled
 * brass tip at each corner.
 */
function KeralaRoof({
  roof,
  brass,
  y,
  eave,
  waist,
  top,
  flareH,
  slopeH,
}: {
  roof: THREE.Material;
  brass: THREE.Material;
  y: number;
  eave: number;
  waist: number;
  top: number;
  flareH: number;
  slopeH: number;
}) {
  const tips = useMemo(
    () =>
      [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz]) =>
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(sx, 0.9, sz).normalize(),
        ),
      ),
    [],
  );
  return (
    <group>
      <RoofTier mat={roof} y={y} half={eave} topHalf={waist} height={flareH} />
      <RoofTier mat={roof} y={y + flareH} half={waist} topHalf={top} height={slopeH} />
      {[
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].map(([sx, sz], i) => (
        <mesh
          key={i}
          material={brass}
          position={[sx * eave * 0.98, y + 0.006, sz * eave * 0.98]}
          quaternion={tips[i]}
        >
          <coneGeometry args={[0.007, 0.032, 8]} />
        </mesh>
      ))}
    </group>
  );
}

/** The front gable (mukhappu): a carved teak triangle on the lower roof. */
function Mukhappu({ teak, brass, z, y }: { teak: THREE.Material; brass: THREE.Material; z: number; y: number }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.07, 0);
    s.lineTo(0.07, 0);
    s.lineTo(0, 0.075);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false });
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <group position={[0, y, z]} rotation={[-0.25, 0, 0]}>
      <mesh geometry={geo} material={teak} position={[0, 0, -0.035]} />
      {/* Brass edge trim and finial */}
      <mesh material={brass} position={[0, 0.079, 0.002]}>
        <sphereGeometry args={[0.008, 12, 10]} />
      </mesh>
      <mesh material={brass} position={[0, 0.004, 0.002]}>
        <boxGeometry args={[0.14, 0.006, 0.006]} />
      </mesh>
    </group>
  );
}

/** One oil-lamp flame. Unlit and tone-mapping-free, so it reads as light. */
const FLAME_MAT = new THREE.MeshBasicMaterial({ color: '#ffc867', toneMapped: false });
const FLAME_GEO = new THREE.SphereGeometry(0.0055, 8, 6);

/**
 * Chuttuvilakku: the ring of oil lamps lining a Kerala temple's walls, lit at
 * dusk. Each flame flickers on its own phase.
 */
function LampRow({ from, to, count, y }: { from: [number, number]; to: [number, number]; count: number; y: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    g.current?.children.forEach((c, i) => {
      const f = 0.85 + Math.sin(t * 9 + i * 1.7) * 0.1 + Math.sin(t * 23 + i) * 0.06;
      c.scale.set(f, f * 1.5, f);
    });
  });
  return (
    <group ref={g}>
      {Array.from({ length: count }, (_, i) => {
        const k = count === 1 ? 0.5 : i / (count - 1);
        return (
          <mesh
            key={i}
            geometry={FLAME_GEO}
            material={FLAME_MAT}
            position={[from[0] + (to[0] - from[0]) * k, y, from[1] + (to[1] - from[1]) * k]}
          />
        );
      })}
    </group>
  );
}

/** A coconut palm, leaning the way they do in every Kerala temple yard. */
function CoconutPalm({
  trunk,
  frond,
  position,
}: {
  trunk: THREE.Material;
  frond: THREE.Material;
  position: [number, number, number];
}) {
  const crown = useRef<THREE.Group>(null);
  // Segmented trunk along a gentle curve.
  const segs = useMemo(() => {
    const pts = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return new THREE.Vector3(Math.sin(t * 1.2) * 0.09, t * 0.72, Math.sin(t * 0.8) * 0.03);
    });
    return pts.slice(0, -1).map((a, i) => {
      const b = pts[i + 1];
      const d = b.clone().sub(a);
      return {
        pos: a.clone().add(b).multiplyScalar(0.5),
        quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()),
        len: d.length(),
        r: 0.016 - i * 0.0009,
      };
    });
  }, []);
  // Frond: a tapered strip that arches and droops.
  const frondGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.3, 0.07, 12, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.15; // 0 at the crown → 0.3 at the tip
      const taper = 1 - (x / 0.3) * 0.85;
      p.setY(i, p.getY(i) * taper);
      p.setZ(i, -x * x * 1.6 + x * 0.25); // arch up, then droop
    }
    g.translate(0.15, 0, 0);
    g.computeVertexNormals();
    return g;
  }, []);
  useEffect(() => () => frondGeo.dispose(), [frondGeo]);

  useFrame((state) => {
    // A coastal breeze.
    if (crown.current) crown.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8) * 0.04;
  });

  const top = new THREE.Vector3(Math.sin(1.2) * 0.09, 0.72, Math.sin(0.8) * 0.03);
  return (
    <group position={position}>
      {segs.map((s, i) => (
        <mesh key={i} material={trunk} position={s.pos} quaternion={s.quat}>
          <cylinderGeometry args={[s.r * 0.92, s.r, s.len * 1.04, 10]} />
        </mesh>
      ))}
      <group ref={crown} position={top}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh
            key={i}
            geometry={frondGeo}
            material={frond}
            rotation={[Math.PI / 2 - 0.25, (i / 10) * Math.PI * 2, 0]}
          />
        ))}
        {/* Coconuts */}
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            position={[Math.cos(i * 2.1) * 0.02, -0.025, Math.sin(i * 2.1) * 0.02]}
          >
            <sphereGeometry args={[0.014, 10, 8]} />
            <meshStandardMaterial color="#6b5a2a" roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Plinth top: everything on the temple stands on this height. */
const T0 = 0.075;
/** Sanctum and pavilion sit on the temple's axis, sanctum behind. */
const SANCTUM_Z = -0.12;
const MANDAPAM_Z = 0.15;
/** Overall model scale — keep LAYOUT.temple in ProjectAnchor in step with it. */
const TEMPLE_SCALE = 1.3;

export function TempleObject({ highlight }: { highlight: boolean }) {
  const m = useTempleMaterials(highlight);
  const brass = useBrass(highlight);

  return (
    <Shell>
      <group scale={TEMPLE_SCALE}>
        {/* Adhishthanam — the stepped laterite base */}
        <mesh material={m.laterite} position={[0, 0.02, 0]}>
          <boxGeometry args={[0.8, 0.04, 0.8]} />
        </mesh>
        <mesh material={m.laterite} position={[0, 0.0575, 0]}>
          <boxGeometry args={[0.72, 0.035, 0.72]} />
        </mesh>

        {/* Mathilakam — plastered compound wall with a tiled coping, and the
            ring of lit oil lamps along its top */}
        {[
          { p: [0, T0 + 0.03, -0.35] as const, s: [0.7, 0.06, 0.02] as const },
          { p: [-0.35, T0 + 0.03, -0.16] as const, s: [0.02, 0.06, 0.4] as const },
          { p: [0.35, T0 + 0.03, -0.16] as const, s: [0.02, 0.06, 0.4] as const },
        ].map((w, i) => (
          <group key={i}>
            <mesh material={m.plaster} position={[...w.p]}>
              <boxGeometry args={[...w.s]} />
            </mesh>
            <mesh material={m.roofSmall} position={[w.p[0], w.p[1] + 0.036, w.p[2]]}>
              <boxGeometry args={[w.s[0] + 0.016, 0.012, w.s[2] + 0.016]} />
            </mesh>
          </group>
        ))}
        <LampRow from={[-0.33, -0.35]} to={[0.33, -0.35]} count={14} y={T0 + 0.1} />
        <LampRow from={[-0.35, -0.33]} to={[-0.35, 0.03]} count={8} y={T0 + 0.1} />
        <LampRow from={[0.35, -0.33]} to={[0.35, 0.03]} count={8} y={T0 + 0.1} />

        {/* Sreekovil — the sanctum */}
        <group position={[0, 0, SANCTUM_Z]}>
          <mesh material={m.lateriteSmall} position={[0, T0 + 0.015, 0]}>
            <boxGeometry args={[0.3, 0.03, 0.3]} />
          </mesh>
          <mesh material={m.plaster} position={[0, T0 + 0.03 + 0.085, 0]}>
            <boxGeometry args={[0.25, 0.17, 0.25]} />
          </mesh>
          {/* Teak door frame, the dark garbhagriha, and the lamp inside it */}
          <mesh material={m.teak} position={[0, T0 + 0.03 + 0.058, 0.127]}>
            <boxGeometry args={[0.082, 0.118, 0.006]} />
          </mesh>
          <mesh position={[0, T0 + 0.03 + 0.055, 0.1305]}>
            <planeGeometry args={[0.058, 0.1]} />
            <meshBasicMaterial color="#1a0d05" />
          </mesh>
          <mesh position={[0, T0 + 0.065, 0.131]}>
            <planeGeometry args={[0.02, 0.03]} />
            <meshBasicMaterial color="#ffb347" toneMapped={false} />
          </mesh>
          <pointLight position={[0, T0 + 0.08, 0.18]} color="#ffb04a" intensity={0.5} distance={0.9} decay={2} />
          {/* Granite steps up to the door */}
          {[0, 1, 2].map((i) => (
            <mesh key={i} material={m.granite} position={[0, T0 + 0.005 + i * 0.01, 0.16 - i * 0.014]}>
              <boxGeometry args={[0.1, 0.01, 0.03]} />
            </mesh>
          ))}

          {/* Two-tier Kerala roof: wide flared eave, steep slope, a drum, then
              the upper tier rising to the finial. */}
          <KeralaRoof
            roof={m.roof}
            brass={brass}
            y={T0 + 0.2}
            eave={0.225}
            waist={0.17}
            top={0.075}
            flareH={0.026}
            slopeH={0.09}
          />
          <Mukhappu teak={m.teak} brass={brass} z={0.13} y={T0 + 0.24} />
          <mesh material={m.teak} position={[0, T0 + 0.316 + 0.022, 0]}>
            <boxGeometry args={[0.12, 0.044, 0.12]} />
          </mesh>
          <KeralaRoof
            roof={m.roof}
            brass={brass}
            y={T0 + 0.36}
            eave={0.15}
            waist={0.112}
            top={0}
            flareH={0.02}
            slopeH={0.15}
          />

          {/* Thazhikakkudam — the brass pot finial */}
          <mesh material={brass} position={[0, T0 + 0.535, 0]}>
            <sphereGeometry args={[0.021, 18, 14]} />
          </mesh>
          <mesh material={brass} position={[0, T0 + 0.57, 0]}>
            <coneGeometry args={[0.01, 0.05, 14]} />
          </mesh>
        </group>

        {/* Namaskara mandapam — the open pillared pavilion before the shrine */}
        <group position={[0, 0, MANDAPAM_Z]}>
          <mesh material={m.lateriteSmall} position={[0, T0 + 0.01, 0]}>
            <boxGeometry args={[0.2, 0.02, 0.2]} />
          </mesh>
          {[-0.075, 0.075].map((x) =>
            [-0.075, 0.075].map((z) => (
              <group key={`${x}${z}`} position={[x, T0 + 0.02, z]}>
                <mesh material={m.granite} position={[0, 0.007, 0]}>
                  <boxGeometry args={[0.024, 0.014, 0.024]} />
                </mesh>
                <mesh material={m.teak} position={[0, 0.055, 0]}>
                  <cylinderGeometry args={[0.008, 0.009, 0.085, 12]} />
                </mesh>
                <mesh material={m.teak} position={[0, 0.1, 0]}>
                  <boxGeometry args={[0.024, 0.008, 0.024]} />
                </mesh>
              </group>
            )),
          )}
          <KeralaRoof
            roof={m.roofSmall}
            brass={brass}
            y={T0 + 0.124}
            eave={0.135}
            waist={0.1}
            top={0}
            flareH={0.016}
            slopeH={0.1}
          />
          <mesh material={brass} position={[0, T0 + 0.25, 0]}>
            <sphereGeometry args={[0.011, 14, 10]} />
          </mesh>
        </group>

        {/* Dhwajasthambham — the brass flagstaff on the axis */}
        <group position={[0, T0, 0.32]}>
          <mesh material={m.lateriteSmall} position={[0, 0.012, 0]}>
            <boxGeometry args={[0.06, 0.024, 0.06]} />
          </mesh>
          <mesh material={m.granite} position={[0, 0.03, 0]}>
            <boxGeometry args={[0.044, 0.014, 0.044]} />
          </mesh>
          <mesh material={brass} position={[0, 0.037 + 0.25, 0]}>
            <cylinderGeometry args={[0.006, 0.009, 0.5, 16]} />
          </mesh>
          {[0.12, 0.2, 0.28, 0.36, 0.44].map((y) => (
            <mesh key={y} material={brass} position={[0, 0.037 + y, 0]}>
              <cylinderGeometry args={[0.013, 0.013, 0.007, 16]} />
            </mesh>
          ))}
          <mesh material={brass} position={[0, 0.545, 0]}>
            <boxGeometry args={[0.07, 0.008, 0.012]} />
          </mesh>
          {[-0.03, -0.01, 0.01, 0.03].map((x) => (
            <mesh key={x} material={brass} position={[x, 0.53, 0]}>
              <coneGeometry args={[0.005, 0.013, 8]} />
            </mesh>
          ))}
        </group>

        {/* Deepasthambham — the tiered brass lamp tower, lit */}
        <group position={[-0.25, T0, 0.27]}>
          <mesh material={brass} position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.006, 0.011, 0.28, 12]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} material={brass} position={[0, 0.04 + i * 0.042, 0]}>
              <cylinderGeometry args={[0.042 - i * 0.005, 0.038 - i * 0.005, 0.006, 24]} />
            </mesh>
          ))}
          {Array.from({ length: 6 }, (_, i) => {
            const r = 0.038 - i * 0.005;
            const n = 8 - i;
            return (
              <group key={i}>
                {Array.from({ length: n }, (_, j) => (
                  <mesh
                    key={j}
                    geometry={FLAME_GEO}
                    material={FLAME_MAT}
                    position={[Math.cos((j / n) * Math.PI * 2) * r, 0.05 + i * 0.042, Math.sin((j / n) * Math.PI * 2) * r]}
                  />
                ))}
              </group>
            );
          })}
          <pointLight position={[0, 0.16, 0.02]} color="#ffb04a" intensity={0.35} distance={0.6} decay={2} />
          <mesh material={brass} position={[0, 0.3, 0]}>
            <coneGeometry args={[0.012, 0.035, 12]} />
          </mesh>
        </group>

        <group position={[0.29, T0, -0.27]} scale={0.82}>
          <CoconutPalm trunk={m.palmTrunk} frond={m.frond} position={[0, 0, 0]} />
        </group>

        {/* The product itself: the QR at the temple gate that a devotee scans
            to book, standing where it would on the real grounds. */}
        <QrStandee position={[0.24, T0, 0.29]} />
      </group>
    </Shell>
  );
}

/** Fixed pseudo-random module pattern with the three finder squares. */
const QR_N = 9;
const QR_CELLS: [number, number][] = (() => {
  const cells: [number, number][] = [];
  const finder = (r: number, c: number) =>
    (r < 3 && c < 3) || (r < 3 && c >= QR_N - 3) || (r >= QR_N - 3 && c < 3);
  let seed = 7;
  for (let r = 0; r < QR_N; r++) {
    for (let c = 0; c < QR_N; c++) {
      // Finder squares: solid 3×3 blocks in three corners, as on a real code.
      if (finder(r, c)) {
        cells.push([r, c]);
        continue;
      }
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 > 0.52) cells.push([r, c]);
    }
  }
  return cells;
})();

function QrStandee({ position }: { position: [number, number, number] }) {
  const mat = useSurface(false);
  const cell = 0.0075;
  const size = QR_N * cell;
  return (
    <group position={position} rotation={[0, -0.35, 0]}>
      <mesh material={mat} position={[0, 0.045, 0]}>
        <boxGeometry args={[0.006, 0.09, 0.006]} />
      </mesh>
      <mesh material={mat} position={[0, 0.09 + size / 2 + 0.008, 0]}>
        <boxGeometry args={[size + 0.016, size + 0.016, 0.006]} />
        <Edges threshold={15} color={INK} />
      </mesh>
      {QR_CELLS.map(([r, c]) => (
        <mesh
          key={`${r}-${c}`}
          position={[
            -size / 2 + (c + 0.5) * cell,
            0.098 + size - (r + 0.5) * cell,
            0.0035,
          ]}
        >
          <planeGeometry args={[cell, cell]} />
          <meshBasicMaterial color={INK} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* MICS 360 — the real product, as a floating glass workspace                  */
/* -------------------------------------------------------------------------- */

/** Crops of the MICS 360 UI from the case study, self-hosted. */
const MICS_SCREENS = {
  dashboard: '/textures/mics-dashboard.jpg',
  login: '/textures/mics-login.jpg',
  upcoming: '/textures/mics-upcoming.jpg',
  assessment: '/textures/mics-assessment.jpg',
  importHistory: '/textures/mics-import.jpg',
};
const MICS_GOLD = '#f5b335';

/** Main screen size, metres — matches the dashboard crop's 862×615 ratio. */
const MICS_W = 0.8;
const MICS_H = MICS_W * (615 / 862);

/** Satellite screens: where each floats, and how it is angled toward the main one. */
const MICS_SATS: {
  key: Exclude<keyof typeof MICS_SCREENS, 'dashboard'>;
  w: number;
  h: number;
  pos: [number, number, number];
  rotY: number;
  phase: number;
}[] = [
  { key: 'login', w: 0.2, h: 0.2 * (252 / 268), pos: [-0.56, 0.14, 0.1], rotY: 0.5, phase: 0 },
  { key: 'upcoming', w: 0.19, h: 0.19 * (462 / 302), pos: [0.56, 0.06, 0.1], rotY: -0.5, phase: 1.3 },
  { key: 'assessment', w: 0.34, h: 0.34 * (316 / 622), pos: [-0.3, -0.36, 0.16], rotY: 0.25, phase: 2.1 },
  { key: 'importHistory', w: 0.32, h: 0.32 * (296 / 543), pos: [0.32, -0.36, 0.16], rotY: -0.25, phase: 3.4 },
];

export function DashboardObject({ highlight }: { highlight: boolean }) {
  return (
    // Screens appear once their images have loaded; nothing blocks the scene.
    <Suspense fallback={null}>
      <MicsWorkspace highlight={highlight} />
    </Suspense>
  );
}

function MicsWorkspace({ highlight }: { highlight: boolean }) {
  const tex = useTexture(MICS_SCREENS);
  useEffect(() => {
    for (const t of Object.values(tex)) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
  }, [tex]);

  const rig = useRef<THREE.Group>(null);
  const sats = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const pulses = useRef<THREE.Group>(null);

  const bezel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0c0e13', roughness: 0.22, metalness: 0.7 }),
    [],
  );
  useEffect(() => () => bezel.dispose(), [bezel]);

  // A blurred rounded-rect, painted once: the halo fades out softly instead
  // of ending in a hard edge that read as a picture frame.
  const glowTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const ctx = c.getContext('2d')!;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 60;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(90, 80, 332, 224, 18);
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => glowTex.dispose(), [glowTex]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // The whole workspace sways a little, so the depth between screens reads.
    if (rig.current) rig.current.rotation.y = Math.sin(t * 0.35) * 0.09;

    // Satellites drift on their own phases.
    sats.current?.children.forEach((c, i) => {
      const s = MICS_SATS[i];
      c.position.y = s.pos[1] + Math.sin(t * 0.9 + s.phase) * 0.012;
      c.rotation.y = s.rotY + Math.sin(t * 0.6 + s.phase) * 0.04;
    });

    // A scan line sweeps the dashboard top to bottom — the screen is live.
    if (scan.current) {
      const u = (t * 0.28) % 1;
      scan.current.position.y = MICS_H / 2 - u * MICS_H;
      (scan.current.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI) * 0.35;
    }

    // Gold halo breathes; brighter under the visitor's hand.
    if (halo.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      m.opacity = (highlight ? 0.5 : 0.28) + Math.sin(t * 1.6) * 0.08;
    }

    // Data pulses travel from the dashboard out to each satellite.
    pulses.current?.children.forEach((c, i) => {
      const s = MICS_SATS[i];
      const u = (t * 0.45 + i * 0.27) % 1;
      c.position.set(s.pos[0] * u, s.pos[1] * u, 0.02 + s.pos[2] * u);
      c.scale.setScalar(Math.sin(u * Math.PI) * 1 + 0.001);
    });
  });

  return (
    <Shell>
      {/* Scaled as a whole so the workspace fits its slot at the left of the arc. */}
      <group ref={rig} scale={0.88}>
        {/* Soft gold glow behind the main screen — feathered, not a frame */}
        <mesh ref={halo} position={[0, 0, -0.02]}>
          <planeGeometry args={[MICS_W + 0.3, MICS_H + 0.3]} />
          <meshBasicMaterial
            map={glowTex}
            color={MICS_GOLD}
            transparent
            opacity={0.16}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* Main screen: the dashboard, in a dark glass bezel */}
        <RoundedBox args={[MICS_W + 0.024, MICS_H + 0.024, 0.014]} radius={0.01} smoothness={4} material={bezel} />
        <mesh position={[0, 0, 0.0075]}>
          <planeGeometry args={[MICS_W, MICS_H]} />
          <meshBasicMaterial map={tex.dashboard} toneMapped={false} color={highlight ? '#ffffff' : '#e6e6e6'} />
        </mesh>
        <mesh ref={scan} position={[0, 0, 0.0085]}>
          <planeGeometry args={[MICS_W, 0.012]} />
          <meshBasicMaterial
            color={MICS_GOLD}
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* Satellite screens from the same product */}
        <group ref={sats}>
          {MICS_SATS.map((s) => (
            <group key={s.key} position={s.pos} rotation={[0, s.rotY, 0]}>
              <RoundedBox args={[s.w + 0.014, s.h + 0.014, 0.01]} radius={0.007} smoothness={4} material={bezel} />
              <mesh position={[0, 0, 0.0055]}>
                <planeGeometry args={[s.w, s.h]} />
                <meshBasicMaterial map={tex[s.key]} toneMapped={false} color={highlight ? '#ffffff' : '#e0e0e0'} />
              </mesh>
            </group>
          ))}
        </group>

        {/* Data pulses */}
        <group ref={pulses}>
          {MICS_SATS.map((s) => (
            <mesh key={s.key}>
              <sphereGeometry args={[0.008, 10, 8]} />
              <meshBasicMaterial color={MICS_GOLD} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </group>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */
/* AMG — a race circuit with the organizer's screen hovering over it          */
/* -------------------------------------------------------------------------- */

/** Circuit centreline on the plinth top, in metres. Closed loop, clockwise. */
const CIRCUIT: [number, number][] = [
  [-0.27, 0.02],
  [-0.22, -0.13],
  [-0.02, -0.16],
  [0.2, -0.13],
  [0.29, 0.0],
  [0.2, 0.13],
  [0.04, 0.07],
  [-0.12, 0.15],
];
const TRACK_Y = 0.052;

export function RacetrackObject({ highlight }: { highlight: boolean }) {
  const mat = useTexturedSurface(highlight, 'grass', [2, 1.4], { bump: 1.2, roughness: 0.95 }); // mown infield
  const carMat = useSurface(highlight, '#00a19c', 0.35, 0.3); // AMG teal
  const car = useRef<THREE.Group>(null);

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        CIRCUIT.map(([x, z]) => new THREE.Vector3(x, TRACK_Y, z)),
        true,
        'centripetal',
      ),
    [],
  );
  const track = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.014, 8, true), [curve]);
  useEffect(() => () => track.dispose(), [track]);

  const tangent = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!car.current) return;
    // One lap every nine seconds — fast enough to read as a race, slow enough
    // that the eye can follow it round the hairpin.
    const u = (state.clock.elapsedTime / 9) % 1;
    car.current.position.copy(curve.getPointAt(u));
    curve.getTangentAt(u, tangent);
    car.current.rotation.y = Math.atan2(tangent.x, tangent.z);
  });

  return (
    <Shell>
      {/* Plinth */}
      <RoundedBox args={[0.7, 0.04, 0.46]} radius={0.012} smoothness={4} material={mat} position={[0, 0.025, 0]}>
        <Edges threshold={15} color={INK} />
      </RoundedBox>

      {/* Circuit */}
      <mesh geometry={track}>
        <meshStandardMaterial color="#2b2e33" roughness={0.9} />
      </mesh>

      {/* The car, lapping */}
      <group ref={car}>
        <mesh material={carMat} position={[0, 0.012, 0]}>
          <boxGeometry args={[0.024, 0.016, 0.052]} />
          <Edges threshold={15} color={INK} />
        </mesh>
      </group>

      {/* Chequered flag at the start line */}
      <group position={[0.3, 0.045, -0.16]}>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 0.3, 6]} />
          <meshBasicMaterial color={INK} />
        </mesh>
        <ChequeredFlag position={[-0.05, 0.26, 0]} />
      </group>

      {/* The one screen the whole project was about, floating over the track */}
      <group position={[-0.05, 0.36, -0.04]} rotation={[-0.18, 0, 0]}>
        <Suspense
          fallback={
            <FloatingPanel width={0.4} height={0.226} lines={3} highlight={highlight} bg="#14171c" ink="#e5e7eb" accent="#00d2be" />
          }
        >
          <AmgMonitor highlight={highlight} />
        </Suspense>
      </group>
    </Shell>
  );
}

function ChequeredFlag({ position }: { position: [number, number, number] }) {
  const cols = 5;
  const rows = 3;
  const cell = 0.018;
  return (
    <group position={position}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        return (
          <mesh
            key={i}
            position={[(c - (cols - 1) / 2) * cell, (r - (rows - 1) / 2) * cell, 0]}
          >
            <planeGeometry args={[cell, cell]} />
            <meshBasicMaterial color={(c + r) % 2 === 0 ? INK : WHITE} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Art & Craft — a studio easel holding a real Kerala mural                   */
/* -------------------------------------------------------------------------- */

/** Self-hosted, 4:3. Matches the canvas proportions below. */
const MURAL_URL = '/case-studies/art-craft/assets/kerala-mural.jpg';
const CANVAS_W = 0.42;
const CANVAS_H = 0.315;

export function EaselObject({ highlight }: { highlight: boolean }) {
  const mat = useTexturedSurface(highlight, 'teak', [1, 3], { bump: 1, roughness: 0.6, tint: '#e2b98c' }); // easel wood
  const canvasMat = useSurface(highlight, '#f7f3ea', 0.9);

  return (
    <Shell>
      {/* Two front legs splayed, one back leg propping the frame */}
      <Strut mat={mat} from={[-0.17, 0, 0.08]} to={[-0.07, 0.8, 0]} />
      <Strut mat={mat} from={[0.17, 0, 0.08]} to={[0.07, 0.8, 0]} />
      <Strut mat={mat} from={[0, 0, -0.24]} to={[0, 0.72, -0.02]} />

      {/* Everything that leans with the front legs */}
      <group rotation={[-0.1, 0, 0]}>
        {/* Ledge */}
        <mesh material={mat} position={[0, 0.26, 0.05]}>
          <boxGeometry args={[0.48, 0.016, 0.05]} />
          <Edges threshold={15} color={INK} />
        </mesh>

        {/* Canvas */}
        <mesh material={canvasMat} position={[0, 0.27 + CANVAS_H / 2, 0.04]}>
          <boxGeometry args={[CANVAS_W, CANVAS_H, 0.014]} />
          <Edges threshold={15} color={INK} />
        </mesh>
        {/* The painting: the one place in the scene where the work's own colour
            appears, because for a mural the colour is the work. Falls back to
            the bare canvas while the image loads or if it is missing. */}
        <Suspense fallback={null}>
          <Painting position={[0, 0.27 + CANVAS_H / 2, 0.048]} highlight={highlight} />
        </Suspense>

        {/* Top clamp */}
        <mesh material={mat} position={[0, 0.27 + CANVAS_H + 0.02, 0.04]}>
          <boxGeometry args={[0.1, 0.03, 0.03]} />
          <Edges threshold={15} color={INK} />
        </mesh>
      </group>
    </Shell>
  );
}

function Painting({
  position,
  highlight,
}: {
  position: [number, number, number];
  highlight: boolean;
}) {
  const tex = useTexture(MURAL_URL);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
  }, [tex]);

  return (
    <mesh position={position}>
      <planeGeometry args={[CANVAS_W - 0.02, CANVAS_H - 0.02]} />
      {/* Unlit: the image keeps its own colour instead of being shaded grey by
          the scene lights. Brightens slightly under the hand, like the rest. */}
      <meshBasicMaterial
        map={tex}
        toneMapped={false}
        color={highlight ? '#ffffff' : '#e8e8e8'}
      />
    </mesh>
  );
}

/** A cylinder strung between two points — legs, struts, anything rod-like. */
function Strut({
  mat,
  from,
  to,
  radius = 0.011,
}: {
  mat: THREE.Material;
  from: [number, number, number];
  to: [number, number, number];
  radius?: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize(),
      ),
      length: dir.length(),
    };
    // Points are literals at every call site; stringify keeps the memo stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.join(), to.join()]);

  return (
    <mesh material={mat} position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <Edges threshold={30} color={INK} />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/* Film & Motion — a cine camera, film running out of the lens                */
/* -------------------------------------------------------------------------- */

const FRAMES = 7;

export function FilmObject({ highlight }: { highlight: boolean }) {
  const mat = useSurface(highlight, '#4a5468', 0.45, 0.25); // slate camera body
  const black = useSurface(highlight, '#1d2027', 0.35, 0.3);
  const silver = useSurface(highlight, '#c9ccd2', 0.35, 0.55); // reels
  const reels = useRef<THREE.Group>(null);
  const strip = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (reels.current) {
      reels.current.children.forEach((c) => {
        c.rotation.z = -t * 1.1;
      });
    }
    // Frames travel out of the lens along a gentle arc and fade by shrinking
    // at both ends, so the strip reads as continuous without a visible loop.
    if (strip.current) {
      strip.current.children.forEach((c, i) => {
        const u = (i / FRAMES + t * 0.06) % 1;
        c.position.set(
          -0.2 - u * 0.26,
          0.11 + Math.sin(u * Math.PI) * 0.1 + u * 0.06,
          Math.sin(u * Math.PI * 2) * 0.04,
        );
        c.rotation.y = 0.3 - u * 0.6;
        c.scale.setScalar(Math.sin(u * Math.PI));
      });
    }
  });

  return (
    <Shell>
      {/* Base */}
      <mesh material={mat} position={[0, 0.015, 0]}>
        <boxGeometry args={[0.32, 0.03, 0.16]} />
        <Edges threshold={15} color={INK} />
      </mesh>

      {/* Body, seen side-on with the lens facing into the exhibition */}
      <RoundedBox args={[0.28, 0.16, 0.12]} radius={0.014} smoothness={4} material={mat} position={[0, 0.11, 0]}>
        <Edges threshold={22} color={INK} />
      </RoundedBox>

      {/* Lens */}
      <mesh material={black} position={[-0.18, 0.11, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.042, 0.036, 0.08, 24]} />
        <Edges threshold={28} color={INK} />
      </mesh>
      <mesh position={[-0.221, 0.11, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <ringGeometry args={[0.018, 0.034, 32]} />
        <meshBasicMaterial color="#4f8fd6" side={THREE.DoubleSide} toneMapped={false} />
      </mesh>

      {/* Viewfinder */}
      <mesh material={black} position={[0.15, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.05, 16]} />
        <Edges threshold={28} color={INK} />
      </mesh>

      {/* Twin reels, faces toward the visitor */}
      <group ref={reels}>
        {[
          [-0.06, 0.27, 0],
          [0.09, 0.27, 0],
        ].map((p, i) => (
          <group key={i} position={p as [number, number, number]}>
            <mesh material={silver} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.075, 0.075, 0.022, 32]} />
              <Edges threshold={28} color={INK} />
            </mesh>
            {/* Spokes, so the spin is visible */}
            {[0, 1, 2].map((s) => (
              <mesh key={s} position={[0, 0, 0.0125]} rotation={[0, 0, (s / 3) * Math.PI]}>
                <planeGeometry args={[0.12, 0.008]} />
                <meshBasicMaterial color="#2d2e33" />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Film strip */}
      <group ref={strip}>
        {Array.from({ length: FRAMES }, (_, i) => (
          <group key={i}>
            <mesh>
              <planeGeometry args={[0.07, 0.05]} />
              <meshBasicMaterial color="#ffbf5e" transparent opacity={highlight ? 0.95 : 0.85} side={THREE.DoubleSide} />
            </mesh>
            <Suspense
              fallback={
                <mesh position={[0, 0, 0.0005]}>
                  <planeGeometry args={[0.052, 0.034]} />
                  <meshBasicMaterial color="#3a2410" side={THREE.DoubleSide} />
                </mesh>
              }
            >
              <FilmStill index={i} />
            </Suspense>
          </group>
        ))}
      </group>
    </Shell>
  );
}

/* -------------------------------------------------------------------------- */

/** AMG's real race-day dashboard, on a slim floating monitor. */
function AmgMonitor({ highlight }: { highlight: boolean }) {
  const tex = useTexture('/textures/amg-dashboard.jpg');
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  const W = 0.4;
  const H = W * (544 / 964);
  return (
    <group>
      <RoundedBox args={[W + 0.02, H + 0.02, 0.012]} radius={0.008} smoothness={4}>
        <meshStandardMaterial color="#0b0c0f" roughness={0.25} metalness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0.0065]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={tex} toneMapped={false} color={highlight ? '#ffffff' : '#e4e4e4'} />
      </mesh>
      {/* AMG-red underglow */}
      <mesh position={[0, -H / 2 - 0.013, 0]}>
        <planeGeometry args={[W * 0.9, 0.004]} />
        <meshBasicMaterial color="#ff2d2d" toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * One frame of the film strip: a still from Thread 2 Thread. Each frame reads
 * a different window of the same image, so the strip looks like successive
 * shots rather than one picture repeated.
 */
function FilmStill({ index }: { index: number }) {
  const base = useTexture('/works/film-motion.jpg');
  const tex = useMemo(() => {
    const t = base.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(0.42, 0.42);
    t.offset.set(((index * 0.37) % 0.58), 0.12 + ((index * 0.23) % 0.42));
    t.needsUpdate = true;
    return t;
  }, [base, index]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 0, 0.0005]}>
      <planeGeometry args={[0.052, 0.034]} />
      <meshBasicMaterial map={tex} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

/** Generic UI card used as satellite content around the objects. */
function FloatingPanel({
  width,
  height,
  lines,
  highlight,
  bg = '#ffffff',
  ink = INK,
  accent,
}: {
  width: number;
  height: number;
  lines: number;
  highlight: boolean;
  bg?: string;
  ink?: string;
  /** Colour for the first line — the card's "headline". */
  accent?: string;
}) {
  return (
    <group>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={bg}
          transparent
          opacity={highlight ? 0.97 : 0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0, 0.0005]}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={ink} wireframe transparent opacity={0.25} />
      </mesh>
      {Array.from({ length: lines }, (_, i) => (
        <mesh
          key={i}
          position={[-width * 0.1, height * 0.28 - i * (height * 0.18), 0.001]}
        >
          <planeGeometry args={[width * (0.62 - i * 0.1), height * (i === 0 ? 0.06 : 0.035)]} />
          <meshBasicMaterial
            color={i === 0 && accent ? accent : ink}
            transparent
            opacity={i === 0 && accent ? 1 : 0.7}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
