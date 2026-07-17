'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useCamera, type CameraStatus } from '@/lib/useCamera';
import { useHandTracking, type HandFrame } from '@/lib/useHandTracking';
import { playWhoosh, startAmbience } from '@/lib/audio';

export type Mode = 'site' | 'spatial';

interface ExperienceValue {
  mode: Mode;
  enterSpatial: () => void;
  exitSpatial: () => void;

  cameraStatus: CameraStatus;
  cameraError: string | null;
  requestCamera: () => Promise<void>;
  stream: MediaStream | null;

  /** The single shared <video>. Both the dock and the spatial view draw from it. */
  videoRef: RefObject<HTMLVideoElement | null>;
  registerVideo: (el: HTMLVideoElement | null) => void;

  framesRef: RefObject<HandFrame>;
  trackingStatus: 'idle' | 'loading' | 'running' | 'error';
  trackingError: string | null;

  handsVisible: boolean;
  soundOn: boolean;
  toggleSound: () => void;
}

const Ctx = createContext<ExperienceValue | null>(null);

export function useExperience() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useExperience must be used inside <ExperienceProvider>');
  return v;
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>('site');
  const [soundOn, setSoundOn] = useState(true);
  const [handsVisible, setHandsVisible] = useState(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camera = useCamera();

  const registerVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);

  // Tracking only runs once there is both a granted stream and a mounted video.
  const trackingEnabled = camera.status === 'granted' && !!videoEl;
  const { framesRef, status: trackingStatus, error: trackingError } = useHandTracking(
    videoEl,
    trackingEnabled,
  );

  // Attach the stream to the shared element whenever either side changes.
  useEffect(() => {
    if (!videoEl || !camera.stream) return;
    videoEl.srcObject = camera.stream;
    void videoEl.play().catch(() => {
      /* autoplay rejection is non-fatal; the element is muted+playsInline */
    });
  }, [videoEl, camera.stream]);

  // Hand presence drives UI affordances, so it does need to be state — but it is
  // polled at 10Hz rather than per frame, since it only ever flips a boolean.
  useEffect(() => {
    if (!trackingEnabled) {
      setHandsVisible(false);
      return;
    }
    const id = setInterval(() => {
      setHandsVisible(framesRef.current.hands.length > 0);
    }, 100);
    return () => clearInterval(id);
  }, [trackingEnabled, framesRef]);

  const enterSpatial = useCallback(() => {
    setMode((m) => (m === 'spatial' ? m : 'spatial'));
  }, []);

  const exitSpatial = useCallback(() => {
    setMode((m) => (m === 'site' ? m : 'site'));
  }, []);

  // Ambience belongs to spatial mode and must be torn down with it, including
  // when the visitor leaves via a route change rather than a gesture.
  useEffect(() => {
    if (mode !== 'spatial' || !soundOn) return;
    playWhoosh(false);
    const stop = startAmbience();
    return () => stop();
  }, [mode, soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((s) => {
      const next = !s;
      void import('@/lib/audio').then((m) => m.setMuted(!next));
      return next;
    });
  }, []);

  const value = useMemo<ExperienceValue>(
    () => ({
      mode,
      enterSpatial,
      exitSpatial,
      cameraStatus: camera.status,
      cameraError: camera.error,
      requestCamera: camera.request,
      stream: camera.stream,
      videoRef,
      registerVideo,
      framesRef,
      trackingStatus,
      trackingError,
      handsVisible,
      soundOn,
      toggleSound,
    }),
    [
      mode,
      enterSpatial,
      exitSpatial,
      camera.status,
      camera.error,
      camera.request,
      camera.stream,
      registerVideo,
      framesRef,
      trackingStatus,
      trackingError,
      handsVisible,
      soundOn,
      toggleSound,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
