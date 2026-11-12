import * as THREE from 'three';

/**
 * Photo-like material textures, painted on canvases at runtime.
 *
 * The temple needs surfaces a photograph would show — terracotta tiles,
 * porous laterite, lime plaster, teak — but no photo of those exists in the
 * project, and fetching texture packs would break the build's self-hosted,
 * no-CDN rule. Painting them is a few kilobytes of code instead of megabytes
 * of images. Each texture also doubles as its own bump map, so the tiles and
 * pores catch the light rather than reading as printed paper.
 *
 * Cached per kind: every caller shares one GPU upload.
 */

type Kind = 'roofTiles' | 'laterite' | 'plaster' | 'teak' | 'grass';

const cache = new Map<Kind, THREE.CanvasTexture>();

/** Deterministic noise, so the model looks the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, r: () => number, dark: string, light: string) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = r() < 0.5 ? dark : light;
    const s = r() * 1.6 + 0.4;
    ctx.fillRect(r() * size, r() * size, s, s);
  }
}

function paintRoofTiles(ctx: CanvasRenderingContext2D, n: number) {
  const r = rng(11);
  ctx.fillStyle = '#5a2414';
  ctx.fillRect(0, 0, n, n);
  const rows = 14;
  const cols = 10;
  const rh = n / rows;
  const cw = n / cols;
  // Bottom row first so each row overlaps the one below it, as laid tiles do.
  for (let row = rows; row >= -1; row--) {
    const off = row % 2 ? cw / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      const x = col * cw + off;
      const y = row * rh;
      const hue = 14 + r() * 8;
      const light = 36 + r() * 12;
      const g = ctx.createLinearGradient(x, y, x, y + rh * 1.25);
      g.addColorStop(0, `hsl(${hue} 58% ${light + 10}%)`);
      g.addColorStop(0.7, `hsl(${hue} 60% ${light}%)`);
      g.addColorStop(1, `hsl(${hue} 55% ${light - 18}%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      // Rounded tile tongue.
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + cw - 1, y);
      ctx.lineTo(x + cw - 1, y + rh * 0.9);
      ctx.quadraticCurveTo(x + cw / 2, y + rh * 1.32, x + 1, y + rh * 0.9);
      ctx.closePath();
      ctx.fill();
      // Shadow line under the lip.
      ctx.strokeStyle = 'rgba(40,10,4,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + rh * 0.92);
      ctx.quadraticCurveTo(x + cw / 2, y + rh * 1.34, x + cw - 1, y + rh * 0.92);
      ctx.stroke();
    }
  }
  // Monsoon weathering: darker streaks running down the slope, a little moss.
  for (let i = 0; i < 40; i++) {
    const x = r() * n;
    const g = ctx.createLinearGradient(x, 0, x, n);
    g.addColorStop(0, 'rgba(20,14,8,0)');
    g.addColorStop(r(), `rgba(${r() < 0.3 ? '40,52,20' : '25,12,6'},${0.08 + r() * 0.12})`);
    g.addColorStop(1, 'rgba(20,14,8,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 2 + r() * 8, n);
  }
  speckle(ctx, n, 2600, r, 'rgba(30,10,4,0.35)', 'rgba(255,200,160,0.18)');
}

function paintLaterite(ctx: CanvasRenderingContext2D, n: number) {
  const r = rng(23);
  ctx.fillStyle = '#d8c3a5'; // lime mortar
  ctx.fillRect(0, 0, n, n);
  const rows = 6;
  const cols = 4;
  const bh = n / rows;
  const bw = n / cols;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col <= cols; col++) {
      const x = col * bw + off + 2;
      const y = row * bh + 2;
      const l = 30 + r() * 10;
      ctx.fillStyle = `hsl(${12 + r() * 10} ${45 + r() * 12}% ${l}%)`;
      ctx.fillRect(x, y, bw - 4, bh - 4);
      // Laterite is riddled with pores — the defining look of Kerala stone.
      for (let p = 0; p < 90; p++) {
        ctx.fillStyle = `rgba(${40 + r() * 30},${15 + r() * 10},8,${0.35 + r() * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(x + r() * (bw - 4), y + r() * (bh - 4), 1 + r() * 3, 0.8 + r() * 2.2, r() * 3, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,190,140,0.10)';
      ctx.fillRect(x, y, bw - 4, 3);
    }
  }
  speckle(ctx, n, 3000, r, 'rgba(50,20,10,0.3)', 'rgba(255,210,170,0.15)');
}

function paintPlaster(ctx: CanvasRenderingContext2D, n: number) {
  const r = rng(37);
  ctx.fillStyle = '#efe5d2';
  ctx.fillRect(0, 0, n, n);
  // Soft blotches of lime wash, unevenly applied by hand.
  for (let i = 0; i < 60; i++) {
    const x = r() * n;
    const y = r() * n;
    const rad = 20 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const warm = r() < 0.5;
    g.addColorStop(0, warm ? 'rgba(200,170,120,0.10)' : 'rgba(255,255,250,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Rain stains near the base.
  const g = ctx.createLinearGradient(0, n * 0.7, 0, n);
  g.addColorStop(0, 'rgba(110,90,60,0)');
  g.addColorStop(1, 'rgba(110,90,60,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  speckle(ctx, n, 4000, r, 'rgba(120,100,70,0.18)', 'rgba(255,255,255,0.25)');
}

function paintTeak(ctx: CanvasRenderingContext2D, n: number) {
  const r = rng(53);
  ctx.fillStyle = '#5a3720';
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 160; i++) {
    const y0 = r() * n;
    const amp = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    ctx.strokeStyle = r() < 0.5 ? `rgba(30,16,8,${0.2 + r() * 0.35})` : `rgba(150,100,60,${0.12 + r() * 0.2})`;
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    for (let x = 0; x <= n; x += 8) {
      const y = y0 + Math.sin(x * freq + i) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function paintGrass(ctx: CanvasRenderingContext2D, n: number) {
  const r = rng(71);
  ctx.fillStyle = '#3c7a3e';
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 9000; i++) {
    ctx.strokeStyle = `hsl(${95 + r() * 30} ${40 + r() * 25}% ${22 + r() * 22}%)`;
    ctx.lineWidth = 1;
    const x = r() * n;
    const y = r() * n;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5);
    ctx.stroke();
  }
  // Mown stripes, as on a circuit infield.
  for (let s = 0; s < 8; s++) {
    ctx.fillStyle = s % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect((s * n) / 8, 0, n / 8, n);
  }
}

const PAINTERS: Record<Kind, (ctx: CanvasRenderingContext2D, n: number) => void> = {
  roofTiles: paintRoofTiles,
  laterite: paintLaterite,
  plaster: paintPlaster,
  teak: paintTeak,
  grass: paintGrass,
};

/** Shared base texture for a material kind (sRGB, tiling). */
export function proceduralTexture(kind: Kind): THREE.CanvasTexture {
  let t = cache.get(kind);
  if (t) return t;
  const [c, ctx] = canvas(512);
  PAINTERS[kind](ctx, 512);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  cache.set(kind, t);
  return t;
}

/**
 * A textured, bump-mapped standard material. `repeat` tiles the pattern to the
 * surface's real size; the clone shares the canvas, so it costs no new upload.
 */
export function texturedMaterial(
  kind: Kind,
  repeat: [number, number],
  opts: { roughness?: number; metalness?: number; bump?: number; tint?: string } = {},
) {
  const base = proceduralTexture(kind);
  const map = base.clone();
  map.repeat.set(...repeat);
  map.needsUpdate = true;
  const bump = base.clone();
  bump.colorSpace = THREE.NoColorSpace;
  bump.repeat.set(...repeat);
  bump.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: opts.bump ?? 1.5,
    roughness: opts.roughness ?? 0.85,
    metalness: opts.metalness ?? 0,
    color: opts.tint ?? '#ffffff',
  });
}
