// How a flick slows. A gesture's speed carries on after the finger lifts and loses it at a steady rate,
// so the motion eases to a stop, as a native scroll does. Pure, so it can be tested without a browser.

/** How quickly a flick loses its speed, per second. A higher number stops a flick sooner. */
export const GLIDE_FRICTION = 4;

export interface GlideStep {
  /** How far the flick moves in this step, in the units of its velocity. */
  travel: number;
  /** The speed left after the step. Zero once the flick has come to rest. */
  velocity: number;
}

/**
 * Advances a flick by `dt` seconds. The travel is the exact integral of the decaying speed, so a flick covers
 * the same distance however the frames divide the time. Below `rest` the flick stops.
 */
export function glideStep(velocity: number, dt: number, rest: number): GlideStep {
  const next = velocity * Math.exp(-GLIDE_FRICTION * dt);
  const travel = (velocity - next) / GLIDE_FRICTION;
  return { travel, velocity: Math.abs(next) < rest ? 0 : next };
}
