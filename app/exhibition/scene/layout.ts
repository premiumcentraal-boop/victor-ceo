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

/** The visitor's home view: how far above the globe, and from which side, the camera sits. */
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

/** The globe: a round world of galaxy, with the pictures orbiting just outside its surface. */
export const GLOBE = {
  /** The radius of the globe, in world units. */
  radius: 3.8,
  /** How far the pictures sit outside the surface. */
  pictureStandoff: 0.8,
} as const;

/** The galaxy inside the globe: two or three logarithmic arms that wind outwards from a warm core. */
export const GALAXY = {
  arms: 3,
  innerRadius: 0.35,
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

export type GlobeLayer = "dust" | "stars" | "core";

interface LayerSpec {
  count: number;
  inner: number;
  outer: number;
  /** Lateral spread of the arms, in world units. */
  scatter: number;
  /** How far the layer spreads above and below the arms' plane, at the centre of the globe. */
  thickness: number;
  size: [number, number];
  seed: number;
}

/**
 * The three layers that fill the globe. The spread above and below the plane narrows to nothing at
 * the rim, so the globe has a clean, round edge.
 */
export const GLOBE_LAYERS: Record<GlobeLayer, LayerSpec> = {
  dust: { count: 10000, inner: 0.4, outer: GLOBE.radius * 0.9, scatter: 0.34, thickness: 1.1, size: [0.6, 1.2], seed: 11 },
  stars: { count: 6000, inner: 0.35, outer: GLOBE.radius * 0.95, scatter: 0.13, thickness: 0.6, size: [0.9, 1.9], seed: 23 },
  core: { count: 1500, inner: 0.15, outer: 1.3, scatter: 0.8, thickness: 0.9, size: [1.6, 3.0], seed: 37 },
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

/** Points for one layer of the globe. Arms are denser near the core and carry a cool colour outwards. */
export function globeLayerPoints(layer: GlobeLayer): LayerPoints {
  const spec = GLOBE_LAYERS[layer];
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
    // Narrowing towards the rim keeps every point inside the sphere, so the edge stays round.
    const across = Math.sqrt(Math.max(0, 1 - (radius / GLOBE.radius) ** 2));
    const reach = Math.sqrt(Math.max(0, GLOBE.radius ** 2 - radius ** 2)) * 0.985;
    const height = Math.min(reach, Math.max(-reach, gaussian(random) * spec.thickness * across));

    positions[i * 3] = radius * Math.cos(angle);
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = radius * Math.sin(angle);

    const depth = radius / GLOBE.radius;
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
  /** Unit vector the picture faces: outwards from the globe, blended towards the visitor's view. */
  normal: [number, number, number];
}

/**
 * The order a visitor moves through the pieces with the keyboard: around the globe, not by number,
 * so Tab follows the globe's own sweep.
 */
export function pictureTabOrder(count: number): number[] {
  const placements = placePictures(count, homeDirection());
  return placements
    .map((placement, index) => ({ index, angle: Math.atan2(placement.position[2], placement.position[0]) }))
    .map(({ index, angle }) => ({ index, angle: (angle + TAU) % TAU }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ index }) => index);
}

/**
 * Places pictures round the globe, just outside its surface, like moons. They are spread evenly
 * round it and kept within about 25 degrees of the equator. Each faces partly outwards and partly
 * towards `facing` (the visitor's view), so the composition reads at rest, and the globe's spin
 * brings the rest round.
 */
export function placePictures(count: number, facing: [number, number, number]): PicturePlacement[] {
  const random = seededRandom(7);
  const radius = GLOBE.radius + GLOBE.pictureStandoff;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const placements: PicturePlacement[] = [];
  for (let k = 0; k < count; k++) {
    // Golden-angle spacing spreads the pictures evenly round the globe, for any count.
    const azimuth = k * goldenAngle + (random() - 0.5) * 0.12;
    const fraction = ((k + 0.5) * 0.618034) % 1;
    const latitude = (fraction - 0.5) * 0.9 + (random() - 0.5) * 0.08;
    const cosLat = Math.cos(latitude);
    const outward = [cosLat * Math.cos(azimuth), Math.sin(latitude), cosLat * Math.sin(azimuth)];
    const mixed = [
      outward[0] * 0.5 + facing[0] * 0.5,
      outward[1] * 0.5 + facing[1] * 0.5,
      outward[2] * 0.5 + facing[2] * 0.5,
    ];
    const len = Math.hypot(mixed[0], mixed[1], mixed[2]);
    placements.push({
      position: [radius * outward[0], radius * outward[1], radius * outward[2]],
      normal: [mixed[0] / len, mixed[1] / len, mixed[2] / len],
    });
  }
  return placements;
}
