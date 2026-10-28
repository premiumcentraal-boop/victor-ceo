import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { markGestureHintShown, shouldShowGestureHint } from "../state/gestures";

/** How long the swipe plays: slow enough to read as a calm glide, short enough not to linger. */
const GESTURE_MS = 1600;
/** How long the hint takes to fade in and out. The hand keeps moving through both. */
const FADE_MS = 400;
/** Ease in-out for the fades: they start gently and settle softly. */
const EASE = [0.42, 0, 0.58, 1] as const;
/** A slight darkening behind the gesture, so the eye goes to it. It is lighter at the edges. */
const HINT_SCRIM = "radial-gradient(ellipse at center, rgba(1,1,1,0.34) 0%, rgba(1,1,1,0.18) 60%, rgba(1,1,1,0.3) 100%)";
/**
 * The page is busy for a moment as a piece arrives. The hint waits for this many smooth frames in a row before it
 * starts, so it never begins in a stutter; it waits no longer than the cap.
 */
const SETTLE_FRAMES = 4;
const SMOOTH_FRAME_MS = 40;
const SETTLE_CAP_MS = 1500;
/** The most one frame may move the hand on. A slow frame then pauses the glide for a moment instead of skipping it. */
const MAX_STEP_MS = 34;

type Phase = "settling" | "playing" | "done";

/**
 * A short, wordless lesson, shown as an icon: a hand that swipes along an arc. It is in motion from its first
 * frame to its last, plays once over a slight darkening that fades away, shows once per session, and not at all
 * when the visitor asks for less motion. It is decoration: the screen reader and keyboard controls carry the same
 * actions.
 */
export function GestureHint() {
  const reduced = useReducedMotion();
  // Read once, on mount, so a re-render never cuts the hint short.
  const [enabled] = useState(() => !reduced && shouldShowGestureHint());
  const [phase, setPhase] = useState<Phase>("settling");

  // Recorded when the hint is due, so a re-mount in this session stays quiet.
  useEffect(() => {
    if (enabled) markGestureHintShown();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || phase !== "settling") return;
    let frame = 0;
    let smooth = 0;
    let last = performance.now();
    const began = last;
    const tick = (now: number) => {
      smooth = now - last < SMOOTH_FRAME_MS ? smooth + 1 : 0;
      last = now;
      if (smooth >= SETTLE_FRAMES || now - began > SETTLE_CAP_MS) setPhase("playing");
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, phase]);

  return (
    <AnimatePresence>
      {enabled && phase === "playing" && (
        <motion.div
          key="gesture-hint"
          aria-hidden="true"
          data-gesture-hint
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: EASE }}
          className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center"
          style={{ background: HINT_SCRIM }}
        >
          {/* The fade out starts as the hand settles, so the hand is never seen standing still. */}
          <SwipeFigure onSettling={() => setPhase("done")} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * One progress value, from 0 to 1 at an even pace over the whole gesture, moved on frame by frame. Each part of the
 * gesture reads it through its own sine curve, which starts and ends at rest, so the motion is one continuous glide
 * with no joints. `onSettling` is called once, when only the fade out's length is left.
 */
function useGestureProgress(onSettling: () => void): MotionValue<number> {
  const progress = useMotionValue(0);
  const settling = useRef(false);
  useAnimationFrame((_, delta) => {
    const next = Math.min(1, progress.get() + Math.min(delta, MAX_STEP_MS) / GESTURE_MS);
    progress.set(next);
    if (!settling.current && next >= (GESTURE_MS - FADE_MS) / GESTURE_MS) {
      settling.current = true;
      onSettling();
    }
  });
  return progress;
}

/** Eases 0 to 1 on a half sine: still at both ends, quickest in the middle. The gentlest ease there is. */
const glide = (v: number) => (1 - Math.cos(Math.PI * v)) / 2;
/** Out and back on one sine: 0 at the ends, 1 at the middle, still at all three. */
const swell = (v: number) => Math.sin(Math.PI * v) ** 2;

/*
 * The icon is Google's Material Symbols "swipe" (rounded, filled), under the Apache License 2.0. It is split into
 * its arc and its hand, so the hand can glide under the arc. The paths keep the symbols' grid.
 */
const ICON_VIEWBOX = "0 -960 960 960";
const SWIPE_ARC =
  "M291.5-842.5Q202-805 127-740h113q8 0 14 6t6 14q0 8-6 14t-14 6H110q-13 0-21.5-8.5T80-730v-130q0-8 6-14t14-6q8 0 14 6t6 14v73q78-62 169-97.5T480-920q100 0 191 35.5T840-787v-73q0-8 6-14t14-6q8 0 14 6t6 14v130q0 13-8.5 21.5T850-700H720q-8 0-14-6t-6-14q0-8 6-14t14-6h113q-75-65-164.5-102.5T480-880q-99 0-188.5 37.5Z";
const SWIPE_HAND =
  "M470-80q-22 0-42-8t-36-24L202-302q-8-8-9-19t5-20l1-1q11-16 28.5-22.5T264-366l96 26v-340q0-13 8.5-21.5T390-710q13 0 21.5 8.5T420-680v290h67v-150q0-13 8.5-21.5T517-570q13 0 21.5 8.5T547-540v150h66v-110q0-13 8.5-21.5T643-530q13 0 21.5 8.5T673-500v110h67v-30q0-13 8.5-21.5T770-450q13 0 21.5 8.5T800-420v180q0 66-47 113T640-80H470Z";

function SwipeFigure({ onSettling }: { onSettling: () => void }) {
  return (
    <svg
      viewBox={ICON_VIEWBOX}
      className="h-24 w-24 sm:h-28 sm:w-28"
      fill="white"
      style={{ overflow: "visible", filter: "drop-shadow(0 0 10px rgba(103, 232, 249, 0.55)) drop-shadow(0 0 2px rgba(103, 232, 249, 0.6))" }}
      aria-hidden="true"
    >
      <Swipe onSettling={onSettling} />
    </svg>
  );
}

/** The hand glides from one end of the arc to the other, leaning gently into the move: swipe to turn. */
function Swipe({ onSettling }: { onSettling: () => void }) {
  const t = useGestureProgress(onSettling);
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
