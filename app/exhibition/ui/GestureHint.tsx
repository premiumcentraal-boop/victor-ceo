import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { markGestureHintShown, shouldShowGestureHint } from "../state/gestures";

type Gesture = "pinch" | "swipe";

/** Each gesture plays once, in turn: a pinch to zoom, then a swipe to turn. */
const GESTURES: Gesture[] = ["pinch", "swipe"];
/** How long one gesture plays: slow enough to read as a calm glide, short enough not to linger. */
const GESTURE_MS = 1600;
const GESTURE_SECONDS = GESTURE_MS / 1000;
/** Ease in-out for the fades: they start gently and settle softly. */
const EASE = [0.42, 0, 0.58, 1] as const;
/** A slight darkening behind the gestures, so the eye goes to them. It is lighter at the edges. */
const HINT_SCRIM = "radial-gradient(ellipse at center, rgba(1,1,1,0.34) 0%, rgba(1,1,1,0.18) 60%, rgba(1,1,1,0.3) 100%)";

/**
 * A short, wordless lesson in two gestures, shown as icons: a pinch to zoom, then a swipe to turn. Each plays
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
 * One progress value, from 0 to 1 at an even pace over the whole gesture. Each part of a gesture reads it through
 * its own sine curve, which starts and ends at rest, so the motion is one continuous glide with no joints.
 */
function useGestureProgress(): MotionValue<number> {
  const progress = useMotionValue(0);
  useEffect(() => {
    const controls = animate(progress, 1, { duration: GESTURE_SECONDS, ease: "linear" });
    return () => controls.stop();
  }, [progress]);
  return progress;
}

/** Eases 0 to 1 on a half sine: still at both ends, quickest in the middle. The gentlest ease there is. */
const glide = (v: number) => (1 - Math.cos(Math.PI * v)) / 2;
/** Out and back on one sine: 0 at the ends, 1 at the middle, still at all three. */
const swell = (v: number) => Math.sin(Math.PI * v) ** 2;

/*
 * The icons are Google's Material Symbols "pinch" and "swipe" (rounded, filled), under the Apache License 2.0.
 * Each is split into its arrows and its hand, so the two can move separately. They share the symbols' grid.
 */
const ICON_VIEWBOX = "0 -960 960 960";
const PINCH_ARROWS =
  "M400-852 108-560h82q8 0 14 6t6 14q0 8-6 14t-14 6H70q-13 0-21.5-8.5T40-550v-120q0-8 6-14t14-6q8 0 14 6t6 14v82l292-292h-82q-8 0-14-6t-6-14q0-8 6-14t14-6h120q13 0 21.5 8.5T440-890v120q0 8-6 14t-14 6q-8 0-14-6t-6-14v-82Z";
const PINCH_HAND =
  "M590-40q-22 0-42-8t-36-24L322-262q-8-8-8.5-19t5.5-21q11-16 28.5-22.5T384-326l96 26v-340q0-13 8.5-21.5T510-670q13 0 21.5 8.5T540-640v290h67v-150q0-13 8.5-21.5T637-530q13 0 21.5 8.5T667-500v150h66v-110q0-13 8.5-21.5T763-490q13 0 21.5 8.5T793-460v110h67v-30q0-13 8.5-21.5T890-410q13 0 21.5 8.5T920-380v180q0 66-47 113T760-40H590Z";
const SWIPE_ARC =
  "M291.5-842.5Q202-805 127-740h113q8 0 14 6t6 14q0 8-6 14t-14 6H110q-13 0-21.5-8.5T80-730v-130q0-8 6-14t14-6q8 0 14 6t6 14v73q78-62 169-97.5T480-920q100 0 191 35.5T840-787v-73q0-8 6-14t14-6q8 0 14 6t6 14v130q0 13-8.5 21.5T850-700H720q-8 0-14-6t-6-14q0-8 6-14t14-6h113q-75-65-164.5-102.5T480-880q-99 0-188.5 37.5Z";
const SWIPE_HAND =
  "M470-80q-22 0-42-8t-36-24L202-302q-8-8-9-19t5-20l1-1q11-16 28.5-22.5T264-366l96 26v-340q0-13 8.5-21.5T390-710q13 0 21.5 8.5T420-680v290h67v-150q0-13 8.5-21.5T517-570q13 0 21.5 8.5T547-540v150h66v-110q0-13 8.5-21.5T643-530q13 0 21.5 8.5T673-500v110h67v-30q0-13 8.5-21.5T770-450q13 0 21.5 8.5T800-420v180q0 66-47 113T640-80H470Z";

function GestureFigure({ gesture }: { gesture: Gesture }) {
  return (
    <svg
      viewBox={ICON_VIEWBOX}
      className="h-24 w-24 sm:h-28 sm:w-28"
      fill="white"
      style={{ overflow: "visible", filter: "drop-shadow(0 0 10px rgba(103, 232, 249, 0.55)) drop-shadow(0 0 2px rgba(103, 232, 249, 0.6))" }}
      aria-hidden="true"
    >
      {gesture === "pinch" ? <Pinch /> : <Swipe />}
    </svg>
  );
}

/** The arrows draw in towards each other and out again as the hand presses: pinch to zoom. */
function Pinch() {
  const t = useGestureProgress();
  const arrows = useTransform(t, (v) => 1 - 0.3 * swell(v));
  const hand = useTransform(t, (v) => 1 - 0.05 * swell(v));
  return (
    <>
      <motion.path d={PINCH_ARROWS} style={{ scale: arrows, transformBox: "fill-box", transformOrigin: "center" }} />
      <motion.path d={PINCH_HAND} style={{ scale: hand, transformBox: "fill-box", transformOrigin: "50% 100%" }} />
    </>
  );
}

/** The hand glides from one end of the arc to the other, leaning gently into the move: swipe to turn. */
function Swipe() {
  const t = useGestureProgress();
  const x = useTransform(t, (v) => -110 + 220 * glide(v));
  const rotate = useTransform(t, (v) => -8 + 16 * glide(v));
  const arc = useTransform(t, (v) => 0.75 + 0.25 * swell(v));
  return (
    <>
      <motion.path d={SWIPE_ARC} style={{ opacity: arc }} />
      <motion.path d={SWIPE_HAND} style={{ x, rotate, transformBox: "fill-box", transformOrigin: "30% 100%" }} />
    </>
  );
}
