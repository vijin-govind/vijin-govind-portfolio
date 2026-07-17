'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useExperience } from '../ExperienceProvider';
import { useSpatial } from './spatialStore';
import { SwipeDetector, type GestureName } from '@/lib/gestures';
import { coverPoint, coverTransform, toNdc, videoSize } from '@/lib/videoMapping';
import { playClick, playTone } from '@/lib/audio';
import { projects } from '@/content/portfolio';

/** Gestures that must be held before they fire, in ms. */
const HOLD_MS: Partial<Record<GestureName, number>> = {
  fist: 700, // exits the whole experience
  thumbsUp: 550, // returns home
  // Long, because a V is also the zoom pose. At 400ms this fired before a human
  // could physically begin spreading their fingers — the gesture stabiliser
  // alone costs ~130ms, and reaching for a deliberate movement costs a few
  // hundred more — so contact details opened over the scene every time someone
  // tried to zoom, which read as "zoom is broken". Contact is a rare escape
  // hatch; making it the slow, deliberate one of the pair is the right trade.
  peace: 1200,
  palmUp: 300,
  palmDown: 300,
};

/** An air tap is a pinch shorter than this that barely moved. */
const TAP_MAX_MS = 320;
const TAP_MAX_TRAVEL = 0.05; // normalized camera units

/** A second tap within this window, on the same object, reads as a double tap. */
const DOUBLE_TAP_MS = 420;
const DOUBLE_TAP_TRAVEL = 0.09;

/**
 * How far the two fingers must open or close, as a fraction of hand scale,
 * before a V is treated as a zoom rather than a peace sign.
 *
 * The V shape is shared by both gestures, so they are told apart by motion, not
 * pose: a hand held still is asking for contact details, a hand working its
 * fingers is scaling an object. The threshold sits well above the jitter of a
 * deliberately-still hand, and once zoom engages it stays engaged until the V
 * breaks — so a gesture never flickers between the two meanings mid-use.
 */
const ZOOM_ENGAGE = 0.1;
/** Exponent on the spread ratio. >1 means less finger travel per unit of zoom. */
const ZOOM_GAIN = 1.35;
const SCALE_MIN = 0.35;
const SCALE_MAX = 3.2;

interface HandMemory {
  last: GestureName;
  since: number;
  fired: boolean;
  pinchStart: { x: number; y: number; t: number } | null;
}

/**
 * Translates tracked hands into scene actions. Lives inside the R3F canvas so
 * it can raycast with the live camera and write transforms in useFrame, on the
 * same clock as rendering.
 */
export function GestureController({
  onExit,
  onHome,
  onContact,
  onNavigate,
  progressRef,
}: {
  onExit: () => void;
  onHome: () => void;
  onContact: () => void;
  onNavigate: (dir: 'left' | 'right') => void;
  /** Reports 0–1 progress on a held gesture so the HUD can draw a ring. */
  progressRef: React.RefObject<{ label: string; value: number } | null>;
}) {
  const { framesRef, soundOn, videoRef } = useExperience();
  const spatial = useSpatial();
  const { camera, scene, size } = useThree();

  const raycaster = useRef(new THREE.Raycaster());
  const memory = useRef<HandMemory[]>([
    { last: 'none', since: 0, fired: false, pinchStart: null },
    { last: 'none', since: 0, fired: false, pinchStart: null },
  ]);
  const swipe = useRef(new SwipeDetector());

  const drag = useRef<{ id: string; grabOffset: THREE.Vector3; depth: number } | null>(null);
  const twoHand = useRef<{
    id: string;
    startDist: number;
    startScale: number;
    startAngle: number;
    startQuat: THREE.Quaternion;
  } | null>(null);

  /** Single-hand two-finger caliper zoom. Engages only once the fingers move. */
  const twoFinger = useRef<{
    id: string;
    startSpread: number;
    startScale: number;
    engaged: boolean;
  } | null>(null);

  /** Last committed tap, for pairing into a double tap. */
  const lastTap = useRef<{ t: number; id: string | null; x: number; y: number } | null>(null);

  const plane = useRef(new THREE.Plane());
  const hitPoint = useRef(new THREE.Vector3());

  /**
   * Camera-normalized hand position → NDC.
   *
   * Must use the identical object-cover solve as <HandSkeleton>, because the
   * skeleton is what the visitor aims with. If the raycast used a different
   * mapping, the highlighted object would sit somewhere other than under their
   * fingertip and nothing would feel connected. Falls back to a plain stretch
   * only before video metadata exists.
   */
  const handToNdc = (x: number, y: number) => {
    const vsize = videoSize(videoRef.current);
    if (!vsize) return toNdc((1 - x) * size.width, y * size.height, size);
    const t = coverTransform(vsize, size);
    const p = coverPoint(x, y, t, true);
    return toNdc(p.x, p.y, size);
  };

  const pickAt = (nx: number, ny: number): string | null => {
    raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.current.intersectObjects(scene.children, true);
    for (const h of hits) {
      // Walk up to the nearest ancestor tagged with a project id; the raycast
      // lands on whatever mesh happens to be nearest, not the group we care about.
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData?.projectId) return o.userData.projectId as string;
        o = o.parent;
      }
    }
    return null;
  };

  useFrame((_, delta) => {
    const now = performance.now();
    const hands = framesRef.current.hands;

    if (hands.length === 0) {
      progressRef.current = null;
      if (drag.current) {
        drag.current = null;
        spatial.setDragging(false);
      }
      twoHand.current = null;
      twoFinger.current = null;
      spatial.setReach(null);
      for (const m of memory.current) {
        m.last = 'none';
        m.fired = false;
        m.pinchStart = null;
      }
      swipe.current.reset();
      return;
    }

    // ---- Reach gate ------------------------------------------------------
    // Distance is what separates a deliberate point from a hand that happened
    // to cross the frame. It also tracks reliability: a hand far from the lens
    // is small in pixels, so its landmark noise is proportionally larger and is
    // exactly what makes taps misfire. Gating on the measured band buys both.
    //
    // The nearest hand wins — if the visitor has reached toward the screen with
    // one hand, that is the one they are interacting with.
    const lead = hands.reduce((a, b) => (b.depth.distance < a.depth.distance ? b : a));
    spatial.setReach({
      distance: lead.depth.distance,
      zone: lead.depth.zone,
      value: lead.depth.reach,
    });

    // The gate covers targeting only — pointing, tapping and dragging, which is
    // where distance actually decides intent and where a small, distant hand's
    // landmark noise does the damage. Pose-only gestures (fist to exit, thumbs
    // up, swipe) stay live at any distance: they do not aim at anything, and
    // locking the visitor out of the exit because they leaned back would be a
    // far worse bug than the jitter this is guarding against.
    const inReach = lead.depth.zone === 'reach';

    // A manipulation already under way is never interrupted. Pulling an object
    // out of someone's grip because they drifted a few centimetres past the
    // boundary would feel broken, not disciplined.
    const busy = !!drag.current || !!twoHand.current || !!twoFinger.current?.engaged;

    if (!inReach && !busy) {
      if (spatial.hovered) spatial.setHovered(null);
      // Cancel any pinch in flight so a tap cannot complete out of band.
      for (const m of memory.current) m.pinchStart = null;
    }

    // ---- Two-hand manipulation ------------------------------------------
    // Takes priority: if both hands are pinching, the visitor is sizing or
    // turning an object and single-hand drag must not also claim the input.
    const pinching = hands.filter((h) => h.gesture === 'pinch');
    if (pinching.length === 2) {
      const [a, b] = pinching;
      // Measure the two-hand span in NDC rather than raw camera units: on a
      // cropped feed the two are not proportional, so a raw span would make
      // scaling behave differently depending on the viewport's shape.
      const pa = handToNdc(a.pinchPoint.x, a.pinchPoint.y);
      const pb = handToNdc(b.pinchPoint.x, b.pinchPoint.y);
      const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);

      const targetId = spatial.selected ?? spatial.hovered ?? projects[0].id;
      const t = spatial.transforms.get(targetId);

      if (t) {
        if (!twoHand.current || twoHand.current.id !== targetId) {
          twoHand.current = {
            id: targetId,
            startDist: dist,
            startScale: t.targetScale,
            startAngle: angle,
            startQuat: t.targetQuaternion.clone(),
          };
          progressRef.current = { label: 'Two-hand transform', value: 1 };
        } else {
          const th = twoHand.current;
          const ratio = dist / Math.max(th.startDist, 1e-3);
          t.targetScale = THREE.MathUtils.clamp(th.startScale * ratio, 0.35, 3.2);

          // NDC y points up where image y points down, so the angle measured
          // here is the negation of the image-space one — hence no extra sign
          // flip: turning your hands clockwise turns the object clockwise.
          const dAngle = angle - th.startAngle;
          const spin = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            dAngle * 1.6,
          );
          t.targetQuaternion.copy(th.startQuat).multiply(spin);
        }
      }
      // Two-hand mode owns the frame; skip the single-hand paths entirely.
      for (const m of memory.current) m.pinchStart = null;
      return;
    }
    if (twoHand.current) {
      twoHand.current = null;
      progressRef.current = null;
      if (soundOn) playTone(520, 0.14, 0.08);
    }

    // ---- Single-hand two-finger caliper zoom -----------------------------
    // Resolved across all hands at once, NOT inside the per-hand loop. When it
    // lived in the loop, a second hand showing any other gesture ran the `else`
    // branch and cleared this state every frame — so the start spread was
    // re-captured continuously, the delta was always ~0, and zoom could never
    // engage while both hands were in frame. It has to be decided per-scene.
    const vIndex = hands.findIndex((h) => h.gesture === 'peace');
    if (vIndex >= 0) {
      const vHand = hands[vIndex];
      const targetId = spatial.selected ?? spatial.hovered;
      const t = targetId ? spatial.transforms.get(targetId) : null;

      if (t && targetId) {
        if (!twoFinger.current || twoFinger.current.id !== targetId) {
          twoFinger.current = {
            id: targetId,
            startSpread: vHand.spread,
            startScale: t.targetScale,
            engaged: false,
          };
        }

        const tf = twoFinger.current;
        if (!tf.engaged && Math.abs(vHand.spread - tf.startSpread) > ZOOM_ENGAGE) {
          tf.engaged = true;
          if (soundOn) playTone(600, 0.1, 0.06);
        }

        if (tf.engaged) {
          const ratio = vHand.spread / Math.max(tf.startSpread, 1e-3);
          t.targetScale = THREE.MathUtils.clamp(
            tf.startScale * Math.pow(ratio, ZOOM_GAIN),
            SCALE_MIN,
            SCALE_MAX,
          );
          progressRef.current = {
            label: `Zoom · ${t.targetScale.toFixed(2)}×`,
            value: (t.targetScale - SCALE_MIN) / (SCALE_MAX - SCALE_MIN),
          };
        }
      }
    } else if (twoFinger.current) {
      if (twoFinger.current.engaged && soundOn) playTone(480, 0.12, 0.06);
      twoFinger.current = null;
    }

    // ---- Per-hand handling ----------------------------------------------
    for (let i = 0; i < hands.length && i < 2; i++) {
      const hand = hands[i];
      const mem = memory.current[i];
      const g = hand.gesture;
      const ndc = handToNdc(hand.pinchPoint.x, hand.pinchPoint.y);

      if (g !== mem.last) {
        mem.last = g;
        mem.since = now;
        mem.fired = false;
      }
      const held = now - mem.since;

      // -- Point: highlight whatever the finger is over — but only from inside
      //    the reach band, so a hand crossing the back of the frame never lights
      //    objects up. Out of band, say why instead of silently doing nothing.
      if (g === 'point') {
        if (!inReach) {
          progressRef.current = {
            label:
              hand.depth.zone === 'tooFar'
                ? `Reach closer · ${(hand.depth.distance * 100).toFixed(0)}cm`
                : `Too close · ${(hand.depth.distance * 100).toFixed(0)}cm`,
            value: hand.depth.reach,
          };
        } else {
          const id = pickAt(ndc.x, ndc.y);
          if (id !== spatial.hovered) {
            spatial.setHovered(id);
            if (id && soundOn) playTone(880, 0.09, 0.05);
          }
          progressRef.current = id
            ? { label: `Pointing · ${(hand.depth.distance * 100).toFixed(0)}cm`, value: 1 }
            : null;
        }
      }

      // -- Two fingers: caliper zoom on the selected object.
      //    A V is also the peace sign, so the two are told apart by motion
      //    rather than pose — see ZOOM_ENGAGE. Once zoom takes the gesture it
      //    keeps it until the V breaks, so the meaning never flickers mid-use.
      // -- Pinch: begins a potential tap, and after a threshold becomes a drag.
      //    A pinch may only *start* inside the reach band — that is the moment
      //    of intent. Once it has started it survives to its release, so an
      //    outstretched drag is not cut off by crossing the boundary.
      if (g === 'pinch') {
        if (!mem.pinchStart) {
          if (!inReach) continue;
          mem.pinchStart = { x: hand.pinchPoint.x, y: hand.pinchPoint.y, t: now };
        }

        const travel = Math.hypot(
          hand.pinchPoint.x - mem.pinchStart.x,
          hand.pinchPoint.y - mem.pinchStart.y,
        );

        // Promote to a drag once the pinch has clearly moved or dwelled — this
        // is the line between "tap" and "drag" and it must be unambiguous.
        if (!drag.current && (travel > TAP_MAX_TRAVEL || held > TAP_MAX_MS)) {
          const id = pickAt(ndc.x, ndc.y) ?? spatial.selected;
          const t = id ? spatial.transforms.get(id) : null;
          if (id && t) {
            const depth = camera.position.distanceTo(t.position);
            raycaster.current.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
            plane.current.setFromNormalAndCoplanarPoint(
              camera.getWorldDirection(new THREE.Vector3()).negate(),
              t.position,
            );
            raycaster.current.ray.intersectPlane(plane.current, hitPoint.current);
            drag.current = {
              id,
              grabOffset: t.target.clone().sub(hitPoint.current),
              depth,
            };
            spatial.setDragging(true);
            spatial.setSelected(id);
            if (soundOn) playTone(420, 0.1, 0.07);
          }
        }

        if (drag.current) {
          const t = spatial.transforms.get(drag.current.id);
          if (t) {
            raycaster.current.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
            // Drag across the plane the object already occupies, so it tracks
            // the hand without drifting toward or away from the viewer.
            plane.current.setFromNormalAndCoplanarPoint(
              camera.getWorldDirection(new THREE.Vector3()).negate(),
              t.position,
            );
            if (raycaster.current.ray.intersectPlane(plane.current, hitPoint.current)) {
              t.target.copy(hitPoint.current).add(drag.current.grabOffset);
            }
          }
          progressRef.current = { label: 'Moving', value: 1 };
        }
      }

      // -- Pinch released: an air tap if it was short and still.
      if (g !== 'pinch' && mem.pinchStart) {
        const dur = now - mem.pinchStart.t;
        const travel = Math.hypot(
          hand.pinchPoint.x - mem.pinchStart.x,
          hand.pinchPoint.y - mem.pinchStart.y,
        );
        mem.pinchStart = null;

        if (drag.current) {
          drag.current = null;
          spatial.setDragging(false);
          progressRef.current = null;
        } else if (dur < TAP_MAX_MS && travel < TAP_MAX_TRAVEL) {
          const id = pickAt(ndc.x, ndc.y);
          const prev = lastTap.current;
          const isDouble =
            !!prev &&
            !!id &&
            prev.id === id &&
            now - prev.t < DOUBLE_TAP_MS &&
            Math.hypot(hand.pinchPoint.x - prev.x, hand.pinchPoint.y - prev.y) <
              DOUBLE_TAP_TRAVEL;

          if (isDouble) {
            // Second tap on the same object: toggle its case study. The first
            // tap of the pair already selected it, so nothing is deferred and a
            // single tap stays instant — the double tap simply adds a meaning
            // on top rather than making every tap wait to see what follows.
            const p = projects.find((x) => x.id === id);
            const opening = spatial.opened !== id;
            spatial.setOpened(opening ? id : null);
            spatial.announce(`${opening ? 'Opened' : 'Closed'} · ${p?.title ?? id}`);
            if (soundOn) playTone(opening ? 760 : 360, 0.2, 0.09);
            lastTap.current = null; // a third tap starts a fresh pair
          } else {
            if (id) {
              spatial.setSelected(id);
              const p = projects.find((x) => x.id === id);
              spatial.announce(`Selected · ${p?.title ?? id}`);
              if (soundOn) playClick(0.5);
            } else {
              spatial.setSelected(null);
              spatial.setOpened(null);
            }
            lastTap.current = { t: now, id, x: hand.pinchPoint.x, y: hand.pinchPoint.y };
          }
        }
      }

      // -- Swipe: only meaningful from an open hand, so a drag is never read
      //    as navigation.
      if (g === 'open') {
        const dir = swipe.current.push(1 - hand.palmCenter.x, now);
        if (dir) {
          onNavigate(dir);
          if (soundOn) playTone(dir === 'right' ? 700 : 560, 0.12, 0.07);
        }
      } else if (g !== 'point') {
        swipe.current.reset();
      }

      // -- Held discrete gestures.
      // A V that has already become a zoom must never also fire Contact. The
      // zoom block runs before this loop and owns the gesture once engaged.
      const claimedByZoom = g === 'peace' && !!twoFinger.current?.engaged;
      const need = HOLD_MS[g];
      if (need && !mem.fired && !claimedByZoom) {
        progressRef.current = { label: labelFor(g), value: Math.min(1, held / need) };
        if (held >= need) {
          mem.fired = true;
          progressRef.current = null;
          fire(g);
        }
      } else if (!need && g !== 'pinch' && g !== 'point') {
        progressRef.current = null;
      }
    }

    // Ease every object toward its target. Doing this here rather than in each
    // object keeps one authority over the transform and one spring constant.
    const k = 1 - Math.pow(0.001, delta);
    for (const t of spatial.transforms.values()) {
      t.position.lerp(t.target, k);
      t.quaternion.slerp(t.targetQuaternion, k);
      t.scale += (t.targetScale - t.scale) * k;
    }
  });

  function fire(g: GestureName) {
    switch (g) {
      case 'fist':
        if (soundOn) playClick(0.8);
        onExit();
        break;
      case 'thumbsUp':
        spatial.setOpened(null);
        spatial.setContactOpen(false);
        onHome();
        break;
      case 'peace':
        onContact();
        break;
      case 'palmUp': {
        const id = spatial.selected ?? spatial.hovered;
        if (id) {
          spatial.setOpened(id);
          const p = projects.find((x) => x.id === id);
          spatial.announce(`Opened · ${p?.title ?? id}`);
          if (soundOn) playTone(760, 0.2, 0.09);
        } else {
          spatial.announce('Point at a project first');
        }
        break;
      }
      case 'palmDown':
        if (spatial.opened || spatial.contactOpen) {
          spatial.setOpened(null);
          spatial.setContactOpen(false);
          if (soundOn) playTone(360, 0.16, 0.07);
        }
        break;
      default:
        break;
    }
  }

  return null;
}

function labelFor(g: GestureName): string {
  switch (g) {
    case 'fist':
      return 'Exit spatial mode';
    case 'thumbsUp':
      return 'Back to homepage';
    case 'peace':
      // Names the condition, not just the outcome: the same pose zooms the
      // moment the fingers move, so "hold still" is the actionable half.
      return 'Hold still · Contact';
    case 'palmUp':
      return 'Open details';
    case 'palmDown':
      return 'Close details';
    default:
      return '';
  }
}
