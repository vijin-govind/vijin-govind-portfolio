/**
 * Mapping between MediaPipe's normalized camera space and screen pixels.
 *
 * MediaPipe reports landmarks in the video's own 0–1 space. Every video in this
 * project is rendered with `object-cover`, which scales the frame to fill its
 * box and crops the overflow — so normalized 0–1 does NOT span the box. Mapping
 * them as if it did squashes the hand overlay and offsets it from the visitor's
 * real hand by enough to make pointing impossible.
 *
 * Everything that turns a landmark into a screen position must go through here.
 */

export interface Box {
  width: number;
  height: number;
}

export interface CoverTransform {
  /** Size the video is actually painted at, after cover scaling. */
  dispW: number;
  dispH: number;
  /** Top-left of the painted video relative to the box; negative when cropped. */
  offX: number;
  offY: number;
}

/** Solve the `object-fit: cover` layout for a video inside a box. */
export function coverTransform(video: Box, box: Box): CoverTransform {
  const vw = Math.max(video.width, 1);
  const vh = Math.max(video.height, 1);
  const scale = Math.max(box.width / vw, box.height / vh);
  const dispW = vw * scale;
  const dispH = vh * scale;
  return {
    dispW,
    dispH,
    offX: (box.width - dispW) / 2,
    offY: (box.height - dispH) / 2,
  };
}

/**
 * Place a normalized landmark at the pixel where it is actually drawn.
 *
 * `mirrored` matches the CSS `scaleX(-1)` on the previews: the visitor expects
 * to see themselves, so the flip has to be applied before the cover offset,
 * not after.
 */
export function coverPoint(
  nx: number,
  ny: number,
  t: CoverTransform,
  mirrored: boolean,
): { x: number; y: number } {
  const x = mirrored ? 1 - nx : nx;
  return { x: t.offX + x * t.dispW, y: t.offY + ny * t.dispH };
}

/**
 * Cursor mapping for surfaces with no visible video to align against — the
 * homepage, where the camera only appears in a small corner dock.
 *
 * A straight 0–1 → full-width mapping technically works but is miserable to
 * use: the pull cord sits at ~8% of the viewport, so grabbing it would mean
 * holding your hand at the extreme edge of the camera frame, where tracking is
 * least reliable and the pose is least comfortable. Expanding a comfortable
 * centre region to cover the whole screen means small, natural movements reach
 * every corner.
 */
export function expandPoint(
  nx: number,
  ny: number,
  box: Box,
  mirrored: boolean,
  insetX = 0.22,
  insetY = 0.16,
): { x: number; y: number } {
  const x = mirrored ? 1 - nx : nx;
  const spanX = 1 - insetX * 2;
  const spanY = 1 - insetY * 2;
  const ex = (x - insetX) / spanX;
  const ey = (ny - insetY) / spanY;
  // Clamp rather than let the cursor fly off: a hand at the very edge of frame
  // should rest at the edge of the screen, not vanish past it.
  return {
    x: Math.min(1, Math.max(0, ex)) * box.width,
    y: Math.min(1, Math.max(0, ey)) * box.height,
  };
}

/** Screen pixels → WebGL normalized device coordinates. */
export function toNdc(px: number, py: number, box: Box): { x: number; y: number } {
  return {
    x: (px / Math.max(box.width, 1)) * 2 - 1,
    y: -((py / Math.max(box.height, 1)) * 2 - 1),
  };
}

/** Intrinsic frame size, or null before metadata has loaded. */
export function videoSize(el: HTMLVideoElement | null): Box | null {
  if (!el || !el.videoWidth || !el.videoHeight) return null;
  return { width: el.videoWidth, height: el.videoHeight };
}
