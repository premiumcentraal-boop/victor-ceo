// How the camera travels into the galaxy's core as the page scrolls. Pure, so the curve can be tested directly.

/**
 * A cubic Bézier curve, as a function of x: the y at which the curve crosses that x. The control points are
 * (x1, y1) and (x2, y2), as in a CSS cubic-bezier, and x1 and x2 lie within [0, 1].
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const sample = (a: number, b: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Find the curve's parameter at this x by bisection: x runs steadily along the curve, so it always converges.
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 40; i++) {
      const at = sample(x1, x2, t);
      if (Math.abs(at - x) < 1e-7) break;
      if (at < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sample(y1, y2, t);
  };
}

/**
 * The zoom's pace. It starts slowly, gathers speed through the scroll, and rushes at the end, so the last
 * stretch dives into the core and reveals the gallery. Scrolling back up runs the same curve in reverse: the
 * return starts fast and eases to rest at the overview.
 */
const CORE_CURVE = cubicBezier(0.55, 0, 0.85, 0.5);

/** How far the camera has travelled into the core: 0 at the overview, 1 at the core. */
export function coreTravel(progress: number): number {
  return CORE_CURVE(progress);
}

/**
 * How bright the core's light blooms as the camera passes through it. It is zero until the camera has reached
 * the core, peaks as it passes through, and is gone by the time the gallery has taken the screen.
 */
export function flareAt(reveal: number): number {
  const t = Math.min(1, Math.max(0, reveal / 0.8));
  return Math.sin(Math.PI * t);
}

/**
 * The shockwave: a ring of light that leaves the core as the camera passes through it. It grows and fades.
 * Returns its scale in world units, and its opacity.
 */
export function shockAt(reveal: number): { scale: number; opacity: number } {
  const t = Math.min(1, Math.max(0, (reveal - 0.2) / 0.8));
  if (t <= 0) return { scale: 2, opacity: 0 };
  return { scale: 2 + 30 * t * t, opacity: 0.9 * (1 - t) ** 1.5 };
}
