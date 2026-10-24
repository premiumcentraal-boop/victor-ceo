import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { markGestureHintShown, shouldShowGestureHint } from "../state/gestures";

type Gesture = "pinch" | "drag";

/** Each gesture plays once, in turn: a pinch to zoom, then a drag to turn. */
const GESTURES: Gesture[] = ["pinch", "drag"];
/** How long one gesture plays. Long enough to follow the finger, short enough to feel quick. */
const GESTURE_MS = 1200;
const GESTURE_SECONDS = GESTURE_MS / 1000;
const ACCENT = "rgb(103 232 249)";
/** Ease in-out: the finger starts gently, carries through the middle, and settles softly. One curve for every move. */
const EASE = [0.42, 0, 0.58, 1] as const;
/** A slight darkening behind the gestures, so the eye goes to them. It is lighter at the edges. */
const HINT_SCRIM = "radial-gradient(ellipse at center, rgba(1,1,1,0.34) 0%, rgba(1,1,1,0.18) 60%, rgba(1,1,1,0.3) 100%)";

/**
 * A short, wordless lesson in two gestures, shown as a finger: a pinch to zoom, then a drag to turn. Each plays
 * once over a slight darkening that fades away. It shows once per session, and not at all when the visitor asks
 * for less motion. It is decoration: the screen reader and keyboard controls carry the same actions.
 */
export function GestureHint() {
  const reduced = useReducedMotion();
  // Read once, on mount, so a re-render never cuts the hint short.
  const [enabled] = useState(() => !reduced && shouldShowGestureHint());
  const [step, setStep] = useState(0);
  const shown = enabled && step < GESTURES.length;

  // Recorded when the hint starts, so a re-mount in this session stays quiet.
  useEffect(() => {
    if (enabled) markGestureHintShown();
  }, [enabled]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setStep((current) => current + 1), GESTURE_MS);
    return () => window.clearTimeout(timer);
  }, [shown, step]);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="gesture-hint"
          aria-hidden="true"
          data-gesture-hint
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center"
          style={{ background: HINT_SCRIM }}
        >
          {/* The gestures cross-fade in one cell, so the next one rises exactly where the last one settles. */}
          <div className="grid place-items-center">
            <AnimatePresence>
              <motion.div
                key={step}
                style={{ gridArea: "1 / 1" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <GestureFigure gesture={GESTURES[step]} />
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * One progress value, from 0 to 1 over the whole gesture, on the ease. Every part of a gesture reads it, so the
 * motion is a single continuous curve rather than a chain of separate moves that stop and start at each joint.
 */
function useGestureProgress(): MotionValue<number> {
  const progress = useMotionValue(0);
  useEffect(() => {
    const controls = animate(progress, 1, { duration: GESTURE_SECONDS, ease: EASE });
    return () => controls.stop();
  }, [progress]);
  return progress;
}

/** A finger, its fingertip at the origin, so it moves and turns about the point it touches. */
const FINGER = "M -8 44 Q -8 48 -4 48 L 4 48 Q 8 48 8 44 L 7 14 Q 7 0 0 0 Q -7 0 -7 14 Z";

/** A pointing hand, its index fingertip at the origin: the index finger, a curled fist, and the thumb. */
const HAND_INDEX = "M -7 62 L -7 14 Q -7 0 0 0 Q 7 0 7 14 L 7 62 Z";
const HAND_FIST = "M -22 66 Q -22 60 -16 60 L 16 60 Q 22 60 22 66 L 22 84 Q 22 98 8 98 L -8 98 Q -22 98 -22 84 Z";
const HAND_THUMB = "M -22 70 Q -32 68 -33 77 Q -33 86 -22 84 Z";

function GestureFigure({ gesture }: { gesture: Gesture }) {
  return (
    <svg
      viewBox="0 0 200 120"
      className="h-36 w-56 sm:h-44 sm:w-72"
      style={{ overflow: "visible", filter: "drop-shadow(0 0 10px rgba(103, 232, 249, 0.35))" }}
      aria-hidden="true"
    >
      {gesture === "pinch" ? <Pinch /> : <Drag />}
    </svg>
  );
}

/** Two fingers close in on the galaxy and open out again: pinch to zoom. The gap follows one smooth curve. */
function Pinch() {
  const t = useGestureProgress();
  // Apart at the start, together at the middle, apart again at the end: a single cosine, so there is no joint.
  const gap = useTransform(t, (v) => 22 + 12 * Math.cos(2 * Math.PI * v));
  const leftX = useTransform(gap, (g) => 100 - g);
  const rightX = useTransform(gap, (g) => 100 + g);
  return (
    <>
      <motion.g style={{ x: leftX, y: 34 }}>
        <g transform="rotate(12)">
          <path d={FINGER} fill="rgba(255,255,255,0.92)" />
        </g>
      </motion.g>
      <motion.g style={{ x: rightX, y: 34 }}>
        <g transform="rotate(-12)">
          <path d={FINGER} fill="rgba(255,255,255,0.92)" />
        </g>
      </motion.g>
    </>
  );
}

/** A pointing hand drags across the galaxy and lifts gently over its middle: drag to turn. */
function Drag() {
  const t = useGestureProgress();
  const x = useTransform(t, (v) => 52 + 96 * v);
  const y = useTransform(t, (v) => 30 - 12 * Math.sin(Math.PI * v));
  return (
    <motion.g style={{ x, y }}>
      <g transform="translate(-5 0) scale(0.72)" fill="rgba(255,255,255,0.92)">
        <path d={HAND_INDEX} />
        <path d={HAND_FIST} />
        <path d={HAND_THUMB} />
      </g>
    </motion.g>
  );
}
