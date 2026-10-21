// Pure layout for the galaxy: no three.js objects, so it can be tested and reused.

/** Seeded random numbers, so the galaxy looks the same on every visit and in every test. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

/** The disc: two or three logarithmic arms that wind outward from a warm core. */
export const GALAXY = {
  arms: 3,
  innerRadius: 0.35,
  outerRadius: 5.6,
  /** Radians of winding per e-fold of radius. Larger values wind the arms more tightly. */
  winding: 2.1,
} as const;

/** The angle of an arm at a given radius. */
export function armAngle(arm: number, radius: number): number {
  return (arm / GALAXY.arms) * TAU + GALAXY.winding * Math.log(radius / GALAXY.innerRadius);
}

function gaussian(random: () => number): number {
  const u = Math.max(random(), 1e-6);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export type DiscLayer = "dust" | "stars" | "core";

interface LayerSpec {
  count: number;
  inner: number;
  outer: number;
  /** Lateral spread of the arms, in world units. */
  scatter: number;
  thickness: number;
  size: [number, number];
  seed: number;
}

export const DISC_LAYERS: Record<DiscLayer, LayerSpec> = {
  dust: { count: 7400, inner: 0.5, outer: 6.6, scatter: 0.36, thickness: 0.3, size: [0.6, 1.2], seed: 11 },
  stars: { count: 4200, inner: 0.35, outer: GALAXY.outerRadius, scatter: 0.13, thickness: 0.14, size: [0.9, 1.9], seed: 23 },
  core: { count: 1100, inner: 0.15, outer: 1.5, scatter: 0.9, thickness: 0.12, size: [1.6, 3.0], seed: 37 },
};

export interface LayerPoints {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  seeds: Float32Array;
}

const WARM: [number, number, number] = [1.0, 0.86, 0.7];
const COOL: [number, number, number] = [0.45, 0.9, 1.0];
const VIOLET: [number, number, number] = [0.55, 0.38, 0.95];
const DEEP: [number, number, number] = [0.2, 0.5, 0.95];

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Points for one layer of the disc. Arms are denser near the core and carry a cool colour outwards. */
export function discLayerPoints(layer: DiscLayer): LayerPoints {
  const spec = DISC_LAYERS[layer];
  const random = seededRandom(spec.seed);
  const positions = new Float32Array(spec.count * 3);
  const colors = new Float32Array(spec.count * 3);
  const sizes = new Float32Array(spec.count);
  const seeds = new Float32Array(spec.count);

  for (let i = 0; i < spec.count; i++) {
    const t = Math.pow(random(), 1.35);
    const radius = spec.inner + (spec.outer - spec.inner) * t;
    const arm = Math.floor(random() * GALAXY.arms);
    // Constant lateral spread: an angular offset that shrinks with radius.
    const angle = armAngle(arm, radius) + (gaussian(random) * spec.scatter) / radius;
    const height = gaussian(random) * spec.thickness * (1.35 - 0.7 * t);

    positions[i * 3] = radius * Math.cos(angle);
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = radius * Math.sin(angle);

    const outer = smoothstep(0.8, 4.8, radius);
    const base = layer === "core" ? WARM : mix(WARM, COOL, outer);
    const tinted = layer === "dust" ? mix(DEEP, VIOLET, smoothstep(2.5, 6.5, radius)) : base;
    const jitter = (random() - 0.5) * 0.12;
    colors[i * 3] = tinted[0] + jitter;
    colors[i * 3 + 1] = tinted[1] + jitter;
    colors[i * 3 + 2] = tinted[2] + jitter;

    sizes[i] = spec.size[0] + (spec.size[1] - spec.size[0]) * Math.pow(random(), 3);
    seeds[i] = random();
  }

  return { positions, colors, sizes, seeds };
}

export interface PicturePlacement {
  position: [number, number, number];
  /** Unit vector the picture faces: outwards from the core, tilted slightly upwards. */
  normal: [number, number, number];
}

/**
 * Places pictures along the arms, spread across the radius and around the disc.
 * Each one faces partly outwards and partly towards `facing` (the visitor's view), so the
 * composition reads at rest, and the slow spin brings the rest of the pictures round.
 */
export function placePictures(count: number, facing: [number, number, number]): PicturePlacement[] {
  const random = seededRandom(7);
  const placements: PicturePlacement[] = [];
  for (let k = 0; k < count; k++) {
    // Golden-ratio spacing gives an even spread across radius and around the disc, for any count.
    const fraction = ((k + 0.5) * 0.618034) % 1;
    const radius = 2.0 + fraction * 2.9;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    // Each picture sits on the winding of an arm at its radius, so they follow the spiral.
    const angle = k * goldenAngle + GALAXY.winding * 0.35 * Math.log(radius / GALAXY.innerRadius) + (random() - 0.5) * 0.12;
    const height = (random() - 0.5) * 0.5;

    const outward = [Math.cos(angle), 0.12, Math.sin(angle)];
    const mixed = [
      outward[0] * 0.5 + facing[0] * 0.5,
      outward[1] * 0.5 + facing[1] * 0.5,
      outward[2] * 0.5 + facing[2] * 0.5,
    ];
    const len = Math.hypot(mixed[0], mixed[1], mixed[2]);
    placements.push({
      position: [radius * Math.cos(angle), height, radius * Math.sin(angle)],
      normal: [mixed[0] / len, mixed[1] / len, mixed[2] / len],
    });
  }
  return placements;
}
