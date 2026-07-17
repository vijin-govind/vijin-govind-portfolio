'use client';

import { useEffect, useRef } from 'react';
import { useExperience } from './ExperienceProvider';
import { coverPoint, coverTransform, videoSize } from '@/lib/videoMapping';

/** MediaPipe's hand topology: bone pairs by landmark index. */
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/**
 * Live landmark overlay. Draws straight from the tracking ref inside its own
 * rAF loop — routing 21 points × 2 hands through React state would re-render
 * the tree 30 times a second for a purely decorative layer.
 */
export function HandSkeleton({
  className,
  mirrored = false,
  light = false,
}: {
  className?: string;
  /** Match the mirrored preview so the skeleton lands on the visitor's hand. */
  mirrored?: boolean;
  /** Draw in paper-white, for use over a dark camera feed. */
  light?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { framesRef, videoRef } = useExperience();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();

    // The dock is fixed-size but the spatial overlay is not; observe rather
    // than assume so the skeleton never drifts out of register with the video.
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const stroke = light ? 'rgba(255,255,255,0.9)' : 'rgba(10,10,10,0.75)';
    const fill = light ? '#ffffff' : '#0a0a0a';

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      const hands = framesRef.current.hands;
      if (hands.length === 0) return;

      // The video is painted with object-cover, so normalized landmarks do not
      // span the canvas — they span the *painted* frame, most of which may be
      // cropped away. Solving that layout is what keeps the skeleton sitting on
      // the visitor's real hand instead of floating beside it.
      const vsize = videoSize(videoRef.current);
      if (!vsize) return;
      const t = coverTransform(vsize, { width: w, height: h });
      const map = (lx: number, ly: number) => coverPoint(lx, ly, t, mirrored);

      for (const hand of hands) {
        const lm = hand.landmarks;
        const pinching = hand.gesture === 'pinch';

        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(1, w * 0.004);
        ctx.lineCap = 'round';

        for (const [a, b] of BONES) {
          const pa = map(lm[a].x, lm[a].y);
          const pb = map(lm[b].x, lm[b].y);
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }

        ctx.fillStyle = fill;
        for (let i = 0; i < lm.length; i++) {
          // Thumb and index tips carry the pinch, so they read larger and swell
          // as the pinch closes — the affordance is doing the explaining.
          const isPinchTip = i === 4 || i === 8;
          const r = isPinchTip
            ? Math.max(2.5, w * 0.011) * (1 + hand.pinchStrength * 0.6)
            : Math.max(1.4, w * 0.005);
          const p = map(lm[i].x, lm[i].y);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (pinching) {
          const c = map((lm[4].x + lm[8].x) / 2, (lm[4].y + lm[8].y) / 2);
          ctx.beginPath();
          ctx.arc(c.x, c.y, Math.max(6, w * 0.028), 0, Math.PI * 2);
          ctx.strokeStyle = fill;
          ctx.lineWidth = Math.max(1, w * 0.005);
          ctx.stroke();
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [framesRef, videoRef, mirrored, light]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
