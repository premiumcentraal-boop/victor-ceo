import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { markGestureHintShown, shouldShowGestureHint } from "../state/gestures";

type Gesture = "pinch" | "drag" | "scroll";

/** One second for each gesture, in turn: pinch to zoom, drag to pan, scroll to move in and out. */
const GESTURES: Gesture[] = ["pinch", "drag", "scroll"];
const STEP_MS = 1000;
const ACCENT = "rgb(103 232 249)";
/** A slight darkening behind the gestures, so the eye goes to them. It is lighter at the edges. */
const HINT_SCRIM = "radial-gradient(ellipse at center, rgba(1,1,1,0.34) 0%, rgba(1,1,1,0.18) 60%, rgba(1,1,1,0.3) 100%)";

/**
 * A three-second, wordless lesson in the gestures: pinch, drag and scroll, one second each, over a slight
 * darkening that fades away. It shows once per session, and not at all when the visitor asks for less motion.
 * It is decoration: the screen reader and keyboard controls carry the same actions.
 */
export function GestureHint() {
  const reduced = useReducedMotion();
  // Read once, on mount, so a re-render never cuts the hint short.
  const [enabled] = useState(() => !reduced && shouldShowGestureHint());
  const [touch] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [step, setStep] = useState(0);
  const shown = enabled && step < GESTURES.length;

  // Recorded when the hint starts, so a re-mount in this session stays quiet.
  useEffect(() => {
    if (enabled) markGestureHintShown();
  }, [enabled]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setStep((current) => current + 1), STEP_MS);
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
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center"
          style={{ background: HINT_SCRIM }}
        >
          {/* Keyed by step: each gesture starts its own one-second motion as it appears. */}
          <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
            <Glyph gesture={GESTURES[step]} touch={touch} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Glyph({ gesture, touch }: { gesture: Gesture; touch: boolean }) {
  // Each glyph is drawn in a 200 by 120 box, so the three line up when they swap.
  const svgProps = {
    viewBox: "0 0 200 120",
    className: "h-28 w-48",
    fill: "none",
    stroke: "rgba(255,255,255,0.8)",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { filter: `drop-shadow(0 0 10px ${ACCENT})`, overflow: "visible" },
  };

  if (gesture === "pinch") {
    // Two fingertips close together, spread apart, and close again: pinch to zoom.
    return (
      <svg {...svgProps}>
        <motion.circle cy={60} r={11} fill="white" stroke="none" initial={{ cx: 58 }} animate={{ cx: [58, 88, 58] }} transition={{ duration: 1, ease: "easeInOut" }} />
        <motion.circle cy={60} r={11} fill="white" stroke="none" initial={{ cx: 142 }} animate={{ cx: [142, 112, 142] }} transition={{ duration: 1, ease: "easeInOut" }} />
      </svg>
    );
  }

  if (gesture === "drag") {
    // A pointer travels across the picture, leaving a trail: drag to pan.
    return (
      <svg {...svgProps}>
        <motion.path d="M 66 84 L 150 36" stroke={ACCENT} strokeOpacity={0.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: "easeInOut" }} />
        <motion.circle r={10} fill={ACCENT} stroke="none" initial={{ cx: 66, cy: 84 }} animate={{ cx: 150, cy: 36 }} transition={{ duration: 1, ease: "easeInOut" }} />
      </svg>
    );
  }

  if (touch) {
    // Two fingers move up the screen and back together: scroll through the scene on a touch screen.
    return (
      <svg {...svgProps}>
        <path d="M 100 14 L 100 106" strokeOpacity={0.25} strokeDasharray="2 7" />
        <motion.circle cx={86} r={9} fill="white" stroke="none" initial={{ cy: 86 }} animate={{ cy: [86, 34, 86] }} transition={{ duration: 1, ease: "easeInOut" }} />
        <motion.circle cx={114} r={9} fill="white" stroke="none" initial={{ cy: 86 }} animate={{ cy: [86, 34, 86] }} transition={{ duration: 1, ease: "easeInOut" }} />
      </svg>
    );
  }

  // A mouse wheel turns, and the arrows show which way the page moves: scroll with a wheel or a trackpad.
  return (
    <svg {...svgProps}>
      <rect x={80} y={14} width={40} height={66} rx={20} />
      <motion.circle cx={100} r={3.5} fill={ACCENT} stroke="none" initial={{ cy: 34 }} animate={{ cy: [34, 52, 34] }} transition={{ duration: 1, ease: "easeInOut" }} />
      <motion.path d="M 52 58 L 52 36 M 45 43 L 52 36 L 59 43" initial={{ opacity: 0.25 }} animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1, ease: "easeInOut" }} />
      <motion.path d="M 148 36 L 148 58 M 141 51 L 148 58 L 155 51" initial={{ opacity: 0.25 }} animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1, ease: "easeInOut" }} />
    </svg>
  );
}
