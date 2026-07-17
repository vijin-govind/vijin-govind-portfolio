'use client';

import { useEffect, useRef, useState } from 'react';
import {
  classify,
  fingerSpread,
  fingerStates,
  GestureStabilizer,
  handScale,
  LANDMARK,
  PointSmoother,
  pinchStrength,
  type HandReading,
  type Landmark,
} from './gestures';
import { DepthTracker } from './handDepth';

export interface HandFrame {
  hands: HandReading[];
  /** Wall-clock ms of the frame these readings came from. */
  timestamp: number;
}

type TrackingStatus = 'idle' | 'loading' | 'running' | 'error';

/**
 * Runs MediaPipe HandLandmarker against a video element on every animation
 * frame and publishes readings through a ref.
 *
 * Deliberately a ref and not state: at 30–60fps, setState would re-render the
 * entire tree every frame and the cord physics would fight React's scheduler.
 * Consumers read `framesRef.current` from inside their own rAF loop instead.
 */
export function useHandTracking(
  video: HTMLVideoElement | null,
  enabled: boolean,
  opts: { maxHands?: number } = {},
) {
  const maxHands = opts.maxHands ?? 2;
  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const framesRef = useRef<HandFrame>({ hands: [], timestamp: 0 });
  const landmarkerRef = useRef<import('@mediapipe/tasks-vision').HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  // One stabilizer, smoother and depth tracker per hand slot, persisted across
  // frames so the temporal filters actually have history to work with.
  const stabilizers = useRef([new GestureStabilizer(), new GestureStabilizer()]);
  const smoothers = useRef([new PointSmoother(), new PointSmoother()]);
  const depths = useRef([new DepthTracker(), new DepthTracker()]);

  useEffect(() => {
    if (!enabled || !video) return;

    let cancelled = false;
    let lastVideoTime = -1;
    let lastNow = performance.now();

    async function start() {
      setStatus('loading');
      try {
        // Imported lazily: the vision bundle is large and irrelevant until the
        // visitor has actually granted camera access.
        const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');

        const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        if (cancelled) return;

        const build = (delegate: 'GPU' | 'CPU') =>
          HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: '/models/hand_landmarker.task',
              delegate,
            },
            runningMode: 'VIDEO',
            numHands: maxHands,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

        // The GPU delegate is roughly an order of magnitude faster, but it fails
        // outright on some drivers and in software-rendered contexts. Falling
        // back to CPU costs frame rate; not falling back costs the entire
        // gesture layer.
        let landmarker;
        try {
          landmarker = await build('GPU');
        } catch {
          if (cancelled) return;
          landmarker = await build('CPU');
        }

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setStatus('running');
        loop();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Hand tracking failed to initialise.');
        setStatus('error');
      }
    }

    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const landmarker = landmarkerRef.current;
      if (!landmarker || !video || video.readyState < 2) return;

      // detectForVideo throws if handed the same timestamp twice, which happens
      // whenever rAF outruns the camera's frame rate.
      if (video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;

      const now = performance.now();
      const dt = (now - lastNow) / 1000;
      lastNow = now;

      let result;
      try {
        result = landmarker.detectForVideo(video, now);
      } catch {
        return;
      }

      const hands: HandReading[] = [];
      for (let i = 0; i < result.landmarks.length; i++) {
        const raw = result.landmarks[i] as Landmark[];

        // MediaPipe reports handedness from the camera's point of view. The
        // preview is mirrored so the visitor sees themselves correctly, which
        // means the label must be flipped to describe their actual hand.
        const reported = result.handednesses[i]?.[0]?.categoryName;
        const handedness: 'Left' | 'Right' = reported === 'Left' ? 'Right' : 'Left';

        const scale = handScale(raw);
        const strength = pinchStrength(raw);

        // Depth needs the frame's aspect to undo MediaPipe's per-axis
        // normalisation, and the metric world landmarks to calibrate to this
        // person's actual hand.
        const aspect = video.videoWidth / Math.max(video.videoHeight, 1);
        const depth = depths.current[i].update(
          raw,
          result.worldLandmarks?.[i] as Landmark[] | undefined,
          aspect,
          now,
        );

        const rawPinchX = (raw[LANDMARK.THUMB_TIP].x + raw[LANDMARK.INDEX_TIP].x) / 2;
        const rawPinchY = (raw[LANDMARK.THUMB_TIP].y + raw[LANDMARK.INDEX_TIP].y) / 2;
        const smoothed = smoothers.current[i]?.filter(rawPinchX, rawPinchY, dt) ?? {
          x: rawPinchX,
          y: rawPinchY,
        };

        const gesture = stabilizers.current[i]?.push(classify(raw, handedness)) ?? 'none';

        hands.push({
          handedness,
          landmarks: raw,
          gesture,
          pinchStrength: strength,
          pinchPoint: smoothed,
          palmCenter: {
            x: (raw[LANDMARK.WRIST].x + raw[LANDMARK.MIDDLE_MCP].x) / 2,
            y: (raw[LANDMARK.WRIST].y + raw[LANDMARK.MIDDLE_MCP].y) / 2,
          },
          scale,
          spread: fingerSpread(raw),
          extended: fingerStates(raw),
          depth,
        });
      }

      // When a hand leaves frame its slot must forget its history, or the next
      // hand to appear inherits the last one's smoothing and snaps across screen.
      for (let i = result.landmarks.length; i < 2; i++) {
        stabilizers.current[i]?.reset();
        smoothers.current[i]?.reset();
        depths.current[i]?.reset();
      }

      framesRef.current = { hands, timestamp: now };
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      framesRef.current = { hands: [], timestamp: 0 };
      setStatus('idle');
    };
  }, [video, enabled, maxHands]);

  return { framesRef, status, error };
}
