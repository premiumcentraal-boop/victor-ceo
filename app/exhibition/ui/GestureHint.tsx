import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { markGestureHintShown, shouldShowGestureHint } from "../state/gestures";

type Gesture = "pinch" | "swipe";

/** Each gesture plays once, in turn: a pinch to zoom, then a swipe to turn. */
const GESTURES: Gesture[] = ["pinch", "swipe"];
/** How long one gesture plays. Long enough to follow the hand, short enough to feel quick. */
const GESTURE_MS = 1200;
const GESTURE_SECONDS = GESTURE_MS / 1000;
const ACCENT = "rgb(103 232 249)";
/** The hand's easing: it leaves gently, carries through the motion, and settles softly, as a real hand does. */
const EASE = [0.45, 0, 0.2, 1] as const;
/** A slight darkening behind the gestures, so the eye goes to them. It is lighter at the edges. */
const HINT_SCRIM = "radial-gradient(ellipse at center, rgba(1,1,1,0.34) 0%, rgba(1,1,1,0.18) 60%, rgba(1,1,1,0.3) 100%)";

/**
 * A short, wordless lesson in two gestures, drawn with fingers: a pinch to zoom, then a swipe to turn. Each plays
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
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 1.01 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="rounded-[28px] border border-white/10 bg-black/35 px-7 py-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:px-10 sm:py-7"
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
 * A finger, drawn as a line: a capsule whose fingertip sits at the origin, so it can be moved and turned about
 * the point where it touches. The bright dot is the contact.
 */
const FINGER = "M -8 40 L -8 8 A 8 8 0 0 1 8 8 L 8 40 A 8 8 0 0 1 -8 40 Z";

function GestureFigure({ gesture }: { gesture: Gesture }) {
  return (
    <svg
      viewBox="0 0 200 120"
      className="h-36 w-56 sm:h-44 sm:w-72"
      style={{ overflow: "visible", filter: `drop-shadow(0 0 8px rgba(103, 232, 249, 0.28))` }}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {gesture === "pinch" ? <Pinch /> : <Swipe />}
    </svg>
  );
}

/** Two fingers close in on the galaxy, then open out again: pinch to zoom. */
function Pinch() {
  return (
    <>
      <Fingertip x={54} y={40} lean={14} travel={[0, 32, 0]} />
      <Fingertip x={146} y={40} lean={-14} travel={[0, -32, 0]} />
    </>
  );
}

function Fingertip({ x, y, lean, travel }: { x: number; y: number; lean: number; travel: number[] }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g
        initial={{ x: 0 }}
        animate={{ x: travel }}
        transition={{ duration: GESTURE_SECONDS, times: [0, 0.5, 1], ease: EASE }}
      >
        <g transform={`rotate(${lean})`}>
          <motion.circle
            r={9}
            fill="none"
            stroke={ACCENT}
            strokeWidth={1.4}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 2.4], opacity: [0.8, 0] }}
            transition={{ duration: 0.7, delay: GESTURE_SECONDS * 0.5 - 0.05, ease: "easeOut" }}
          />
          <path d={FINGER} stroke="rgba(255,255,255,0.85)" strokeWidth={1.6} fill="rgba(255,255,255,0.06)" />
          <circle r={3.2} fill={ACCENT} stroke="none" />
        </g>
      </motion.g>
    </g>
  );
}

/** A finger draws a curve across the galaxy, leaving a trail of light: swipe to turn it. */
const SWIPE_START = { x: 44, y: 78 };
const SWIPE_CURVE = "M 44 78 Q 100 28 156 78";

function Swipe() {
  return (
    <>
      <motion.path
        d={SWIPE_CURVE}
        stroke={ACCENT}
        strokeWidth={2}
        initial={{ pathLength: 0, opacity: 0.9 }}
        animate={{ pathLength: 1, opacity: [0.9, 0.9, 0] }}
        transition={{
          pathLength: { duration: GESTURE_SECONDS, ease: EASE },
          opacity: { duration: GESTURE_SECONDS, times: [0, 0.7, 1], ease: "linear" },
        }}
      />
      <motion.circle
        cx={SWIPE_START.x}
        cy={SWIPE_START.y}
        r={9}
        fill="none"
        stroke={ACCENT}
        strokeWidth={1.4}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 2.4], opacity: [0.8, 0] }}
        transition={{ duration: 0.7, delay: 0.05, ease: "easeOut" }}
      />
      <g transform={`translate(${SWIPE_START.x} ${SWIPE_START.y})`}>
        <motion.g
          animate={{ x: [0, 28, 56, 84, 112], y: [0, -19, -25, -19, 0] }}
          transition={{ duration: GESTURE_SECONDS, times: [0, 0.25, 0.5, 0.75, 1], ease: EASE }}
        >
          <g transform="rotate(12)">
            <path d={FINGER} stroke="rgba(255,255,255,0.85)" strokeWidth={1.6} fill="rgba(255,255,255,0.06)" />
            <circle r={3.2} fill={ACCENT} stroke="none" />
          </g>
        </motion.g>
      </g>
    </>
  );
}
