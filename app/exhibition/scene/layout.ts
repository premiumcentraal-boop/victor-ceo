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

/** The visitor's home view: how far above the galaxy, and from which side, the camera sits. */
export const VIEW = {
  pitch: (24 * Math.PI) / 180,
  azimuth: -Math.PI / 4,
} as const;

/** The unit direction from the centre to the camera's home position. */
export function homeDirection(): [number, number, number] {
  return [
    Math.sin(VIEW.azimuth) * Math.cos(VIEW.pitch),
    Math.sin(VIEW.pitch),
    Math.cos(VIEW.azimuth) * Math.cos(VIEW.pitch),
  ];
}

/** The galaxy: a flat spiral of two or three logarithmic arms that wind outwards from a warm core. */
export const GALAXY = {
  arms: 3,
  innerRadius: 0.35,
  /** The radius of the galaxy's disc, in world units. The pictures orbit outside it. */
  outerRadius: 3.6,
  /** Radians of winding per e-fold of radius. Larger values wind the arms more tightly. */
  winding: 2.1,
} as const;

/**
 * The ring the pictures turn on, round the galaxy. Only the pictures sit on it; it is never drawn, so it
 * shows as the circle the paintings make as they spin.
 */
export const ORBIT = {
  radius: 4.7,
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

export type GalaxyLayer = "dust" | "stars" | "core";

interface LayerSpec {
  count: number;
  inner: number;
  outer: number;
  /** Lateral spread of the arms, in world units. */
  scatter: number;
  /** How far the layer spreads above and below the galaxy's plane. */
  thickness: number;
  size: [number, number];
  seed: number;
}

export const GALAXY_LAYERS: Record<GalaxyLayer, LayerSpec> = {
  dust: { count: 10000, inner: 0.4, outer: GALAXY.outerRadius * 0.95, scatter: 0.34, thickness: 0.3, size: [0.6, 1.2], seed: 11 },
  stars: { count: 6000, inner: 0.35, outer: GALAXY.outerRadius, scatter: 0.13, thickness: 0.14, size: [0.9, 1.9], seed: 23 },
  core: { count: 1500, inner: 0.15, outer: 1.3, scatter: 0.8, thickness: 0.22, size: [1.6, 3.0], seed: 37 },
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

/** Points for one layer of the galaxy. Arms are denser near the core and carry a cool colour outwards. */
export function galaxyLayerPoints(layer: GalaxyLayer): LayerPoints {
  const spec = GALAXY_LAYERS[layer];
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
    const height = gaussian(random) * spec.thickness;

    positions[i * 3] = radius * Math.cos(angle);
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = radius * Math.sin(angle);

    const depth = radius / GALAXY.outerRadius;
    const outer = smoothstep(0.2, 0.85, depth);
    const base = layer === "core" ? WARM : mix(WARM, COOL, outer);
    const tinted = layer === "dust" ? mix(DEEP, VIOLET, smoothstep(0.45, 0.95, depth)) : base;
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
  /** Unit vector the picture faces: outwards from the centre, tangent to the ring. */
  normal: [number, number, number];
}

/**
 * The order a visitor moves through the pieces with the keyboard: round the ring, so Tab follows the
 * circle the pictures make.
 */
export function pictureTabOrder(count: number): number[] {
  return placePictures(count).map((_, index) => index);
}

/**
 * Places the pictures on one ring round the galaxy, evenly spaced. Each faces outwards, tangent to the
 * ring, so together they read as a single circle of paintings turning round the galaxy.
 */
export function placePictures(count: number): PicturePlacement[] {
  const placements: PicturePlacement[] = [];
  for (let k = 0; k < count; k++) {
    const angle = (k / count) * TAU;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    placements.push({
      position: [ORBIT.radius * x, 0, ORBIT.radius * z],
      normal: [x, 0, z],
    });
  }
  return placements;
}
