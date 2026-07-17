# Vijin Govind — Interactive Portfolio

A typography-first portfolio whose signature interaction is a physical pull cord. Pull it — with a
mouse or with your hand in front of the camera — and the page gives way to a spatial view where the
work is anchored as objects in your room.

```bash
npm install
npm run dev      # http://localhost:3000
```

Camera access requires a secure context: `localhost` works, and any deployment must be HTTPS.

## How it fits together

| Path | What it does |
| --- | --- |
| `content/portfolio.ts` | **All copy and project data.** Edit here; the flat page and the spatial scene both read from it. |
| `lib/cordPhysics.ts` | Verlet rope solver for the cord. |
| `lib/videoMapping.ts` | Camera space → screen space. **Every landmark-to-pixel conversion goes through here.** |
| `lib/handDepth.ts` | Camera→hand distance, and the reach band that gates targeting. |
| `lib/gestures.ts` | Hand-landmark → gesture classification, smoothing, debouncing. |
| `lib/useHandTracking.ts` | MediaPipe inference loop; publishes readings through a ref. |
| `lib/useCamera.ts` | WebRTC acquisition and its failure modes. |
| `lib/audio.ts` | All sound, synthesised at runtime. No audio assets. |
| `components/PullCord.tsx` | The cord: rendering, input, activation. |
| `components/spatial/` | The spatial view — scene, objects, gestures, HUD. |

## Things worth knowing before you change them

**Everything is self-hosted.** The MediaPipe WASM runtime (`public/mediapipe/wasm`) and the hand
model (`public/models/hand_landmarker.task`, 7.8 MB) are served from this origin, not a CDN. The
build has no third-party runtime dependencies and works offline. If you re-add drei's
`<Environment preset>`, you reintroduce a CDN fetch.

**Sound is synthesised, not sampled.** Rope tension has to track pull distance continuously, which a
sample cannot do. See `lib/audio.ts`.

**The hot paths deliberately avoid React state.** The cord, the hand skeleton, the gesture
controller and the HUD's progress ring all run their own rAF loops and write to the DOM or to
mutable refs. Routing 60fps updates through `setState` would re-render the tree every frame and
fight the physics. Selection and hover *are* state, because they change rarely.

**Gesture thresholds are ratios of hand scale**, never raw image units — otherwise a hand near the
lens reads as a permanent open palm. Discrete gestures are edge-triggered; the destructive ones
(closed fist to exit, thumbs up to go home) require a deliberate hold.

**The V is two gestures, told apart by motion rather than pose.** A peace sign and a two-finger zoom
are the same shape, so a *still* V opens contact details and a V whose fingers are *working* zooms
the selected object. Once zoom engages it keeps the gesture until the V breaks, so the meaning never
flickers mid-use. If you add a gesture that shares a pose with an existing one, disambiguate it this
way rather than by stacking thresholds.

**A single tap stays instant.** Double tap adds a meaning on top of select rather than making every
tap wait to see whether a second one follows — the first tap of a pair has already selected, and the
second only toggles the case study.

**The hero's rotating word overlaps its handover, and stops entirely under reduced motion.**
`RotatingWord` crossfades the outgoing and incoming words instead of swapping them in sequence — a
`mode="wait"` handover leaves the sentence visibly missing its object for the length of the exit,
which reads as a flicker. Overlapping needs the words out of flow, which is what the invisible spacer
is for: it gives the inline box its width, height and baseline. Two rules worth keeping if you touch
it: the rotation *is* content, so under `prefers-reduced-motion` it states the full list rather than
animating a gentler version; and screen readers get one static `sr-only` sentence while the live word
is `aria-hidden`, because announcing a word that mutates on a loop forever is hostile.

**Never map a landmark to the screen by hand.** MediaPipe reports normalized 0–1 coordinates in the
*video's* space, but every video here is drawn with `object-cover`, which crops it. On a portrait
phone only camera x ∈ [0.37, 0.63] is actually on screen — 74% of the frame is cropped away. Treating
0–1 as spanning the box puts a fingertip up to ~37% of the screen width from the real hand, which
makes pointing impossible. `lib/videoMapping.ts` has two mappings, and the choice matters:

- `coverPoint` — for surfaces showing the video (the dock overlay, the spatial view). Solves the
  cover layout so the skeleton lands on the visitor's actual hand. **The gesture raycast uses this
  too**, because the skeleton is what people aim with; if the two disagreed, the highlighted object
  would sit somewhere other than under their finger.
- `expandPoint` — for the homepage, where the camera is only a corner dock and there is nothing to
  align against. Expands a comfortable centre region to cover the whole screen, so the cord at ~8%
  of the viewport doesn't require holding your hand at the edge of frame where tracking is worst.

**Activation is measured from where the visitor pulled to, not from where the rope simulated to.**
A fast flick can cross the threshold and be released before the solver catches up, and that flick
is unambiguously a pull.

**The blur on the spatial background is display-only.** Hand tracking reads the corner dock's video
element, which is never filtered — and a CSS filter cannot affect the decoded frames MediaPipe reads
regardless. Blurring costs nothing in tracking accuracy.

**Distance decides whether a point or click counts.** A raycast alone cannot tell a deliberate point
from a hand that drifted through frame, and landmark noise grows as the hand shrinks in frame — so a
distant hand produces exactly the jitter that makes taps misfire. `lib/handDepth.ts` solves the
pinhole relation `distance = real_span / (apparent_span · 2·tan(fov/2))`, and only hands inside the
**28–95 cm reach band** may highlight, tap or start a drag.

Two details carry that:

- *It calibrates to the actual person.* `real_span` comes from MediaPipe's **world landmarks**, which
  are metric. Assuming an average hand instead, a 7 cm hand and a 12.5 cm hand at the same 60 cm read
  as 80 cm and 45 cm — a 35 cm spread that would wreck any fixed band. With world landmarks both
  resolve to 60.0 cm.
- *The FOV is assumed* (42° vertical), because no browser API reports it. It scales the estimate
  linearly, so a wider camera reads proportionally short. Every threshold is a generous band and the
  relative signal stays correct, but treat reported centimetres as a good estimate, not a
  measurement. `ASSUMED_FOV_Y_DEG` is the one knob if it reads consistently off.

The gate deliberately covers **targeting only**. Pose-only gestures (closed fist to exit, thumbs up,
swipe) stay live at any distance — they aren't aiming at anything, and locking someone out of the
exit because they leaned back would be a worse bug than the jitter being guarded against. A
manipulation already under way is never interrupted by drifting past the boundary.

## Fallbacks

Nothing here is a dead end:

- **No camera / denied / no HTTPS** — each gets its own message and recovery path. The cord still
  works with a mouse, and the spatial view is drivable with drag-to-orbit, scroll-to-zoom and arrow
  keys.
- **Escape** always does what a closed fist does. Every gesture has a non-gesture equivalent.
- **Lost WebGL context** — detected, and the canvas is rebuilt once the page is back in front.
- **MediaPipe GPU delegate unavailable** — falls back to the CPU delegate.
- **Reduced motion** — decorative easing collapses; tracking still works.

## On "AR"

The spatial view is **camera passthrough**: a fullscreen video feed with a transparent WebGL overlay,
driven by hand tracking. It runs on any browser with a camera, including desktop Safari, Chrome and
Firefox — which is where a portfolio actually gets reviewed.

True WebXR `immersive-ar` (`navigator.xr`) is **not** wired up. It only exists on Android Chrome and
headsets, needs `@react-three/xr` to integrate with the render loop, and could not be verified
without an AR device. The passthrough path is the shipped experience; adding a real WebXR session as
a progressive upgrade is a contained piece of work on top of the current scene.

## Content

`content/portfolio.ts` carries placeholder case-study prose written to the brief. Replace the
`detail`, `metrics` and `summary` fields with real project writing, and set the real Instagram and
LinkedIn URLs in `profile.socials` — they currently point at the bare domains.
