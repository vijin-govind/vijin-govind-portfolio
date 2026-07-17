'use client';

import { createContext, useContext, type RefObject } from 'react';
import * as THREE from 'three';
import { projects } from '@/content/portfolio';

/**
 * Per-object transform state.
 *
 * Held in plain mutable objects rather than React state: a drag writes to these
 * every frame, and routing that through setState would re-render four project
 * subtrees at 60fps. Components read them inside useFrame instead.
 */
export interface ObjectTransform {
  position: THREE.Vector3;
  /** Target the position eases toward, so drags feel weighted rather than glued. */
  target: THREE.Vector3;
  quaternion: THREE.Quaternion;
  targetQuaternion: THREE.Quaternion;
  scale: number;
  targetScale: number;
  /** Home pose, so a reset can always undo the visitor's rearranging. */
  home: THREE.Vector3;
}

export function createTransforms(): Map<string, ObjectTransform> {
  const map = new Map<string, ObjectTransform>();
  for (const p of projects) {
    const home = new THREE.Vector3(...p.position);
    map.set(p.id, {
      position: home.clone(),
      target: home.clone(),
      quaternion: new THREE.Quaternion(),
      targetQuaternion: new THREE.Quaternion(),
      scale: 1,
      targetScale: 1,
      home: home.clone(),
    });
  }
  return map;
}

export type HudEvent = {
  id: number;
  label: string;
};

/** Live reach readout for the HUD. Null when no hand is tracked. */
export interface ReachState {
  /** Estimated metres from the camera. */
  distance: number;
  zone: 'tooClose' | 'reach' | 'tooFar';
  /** 0 at the far edge of the usable band, 1 at the near edge. */
  value: number;
}

export interface SpatialValue {
  transforms: Map<string, ObjectTransform>;
  hovered: string | null;
  setHovered: (id: string | null) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  opened: string | null;
  setOpened: (id: string | null) => void;
  contactOpen: boolean;
  setContactOpen: (v: boolean) => void;
  /** Transient gesture toast, e.g. "Air tap · TempleAddress". */
  announce: (label: string) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  /**
   * Written from the gesture loop via a ref, not state: distance changes every
   * frame, and re-rendering the scene at 60fps to move a meter would be absurd.
   * The HUD polls it from its own rAF.
   */
  reachRef: RefObject<ReachState | null>;
  setReach: (r: ReachState | null) => void;
}

export const SpatialCtx = createContext<SpatialValue | null>(null);

export function useSpatial() {
  const v = useContext(SpatialCtx);
  if (!v) throw new Error('useSpatial must be used inside the spatial scene');
  return v;
}
