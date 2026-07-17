'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'insecure';

interface CameraState {
  status: CameraStatus;
  stream: MediaStream | null;
  error: string | null;
}

/**
 * WebRTC camera acquisition, shared by the corner preview and the spatial view
 * so the visitor is only ever prompted once and only one MediaStream exists.
 *
 * Distinguishes the failure modes that need different copy: a hard denial is
 * recoverable only through browser chrome, whereas "no camera attached" and
 * "not on HTTPS" are not the visitor's fault at all.
 */
export function useCamera() {
  const [state, setState] = useState<CameraState>({
    status: 'idle',
    stream: null,
    error: null,
  });
  const streamRef = useRef<MediaStream | null>(null);

  const request = useCallback(async () => {
    // getUserMedia is undefined outside a secure context; surfacing that as a
    // permission denial would send the visitor to fix settings that are fine.
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) {
      setState({ status: 'insecure', stream: null, error: 'Camera requires HTTPS or localhost.' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: 'unavailable', stream: null, error: 'This browser has no camera API.' });
      return;
    }

    setState((s) => ({ ...s, status: 'requesting', error: null }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setState({ status: 'granted', stream, error: null });
    } catch (err) {
      const e = err as DOMException;
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
        setState({ status: 'denied', stream: null, error: 'Camera permission was declined.' });
      } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
        setState({ status: 'unavailable', stream: null, error: 'No camera was found on this device.' });
      } else if (e.name === 'NotReadableError') {
        setState({
          status: 'unavailable',
          stream: null,
          error: 'The camera is already in use by another application.',
        });
      } else {
        setState({ status: 'unavailable', stream: null, error: e.message || 'Camera unavailable.' });
      }
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ status: 'idle', stream: null, error: null });
  }, []);

  // Release the hardware when the tab is torn down; a live camera light left on
  // after navigation reads as spyware even when it is a leak.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { ...state, request, stop };
}
