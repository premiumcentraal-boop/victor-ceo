// Two fingers on the galaxy mean one of two things: a pinch, which zooms, or a pan, which scrolls the scene.
// Doing both at once is what made the view jitter, so the gesture is decided once, and then held for the touch.

export type TwoFingerGesture = "undecided" | "pinch" | "pan";

/**
 * Decides a two-finger gesture from how far the fingers' distance has changed (`spread`) and how far their
 * middle has moved (`drift`), both in pixels since the touch began. It waits until the movement is clear, so a
 * wobble never picks the wrong gesture. The larger movement wins.
 */
export function decideTwoFingerGesture(spread: number, drift: number, clear = 12): TwoFingerGesture {
  if (Math.max(spread, drift) < clear) return "undecided";
  return spread >= drift ? "pinch" : "pan";
}
