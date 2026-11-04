// Pure layout for the far universe round the galaxy: no three.js objects, so it can be tested and reused.
import { homeDirection, seededRandom } from "./layout";

const TAU = Math.PI * 2;

export type Vec3 = [number, number, number];

/**
 * The far universe: a sphere of sky round the whole scene, drawn once into a cube texture and then shown on a
 * dome that stays centred on the camera, so it is always infinitely far away.
 */
export const UNIVERSE = {
  /** The dome's radius. It sits beyond the deep field and inside the far plane, wherever the camera goes. */
  domeRadius: 200,
  /** How many distant galaxies are scattered over the sky. */
  galaxies: 28,
  /** The sky turns on its own, very slowly, so it is never quite still: radians a second. */
  driftRate: 0.0035,
  /** How long the sky takes to fade in once it is drawn, in seconds. */
  fadeSeconds: 1.6,
} as const;

/**
 * How much each layer of the sky moves with the galaxy, as a share of the galaxy's own movement. The galaxy is 1.
 * The whole sky sweeps along as the galaxy turns, so a turn feels like flying round it rather than spinning it in
 * front of a backdrop; nearer layers sweep a little more and further ones a little less, so the sky reads as depth.
 */
export const PARALLAX = {
  drift: 0.9,
  starfield: 0.7,
  deepField: 0.55,
  universe: 0.4,
} as const;

export interface FarGalaxy {
  /** The unit direction it lies in. */
  direction: Vec3;
  /** Its angular radius on the sky, in radians. */
  radius: number;
  /** How round it looks: 1 is face on, small values are seen edge on. */
  ratio: number;
  /** The turn of its long axis on the sky, in radians. */
  angle: number;
  brightness: number;
  /** 0 is a blue-white galaxy, 1 a warm, old one. */
  warmth: number;
}

function unit([x, y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** A uniform random direction. */
function randomDirection(random: () => number): Vec3 {
  const z = random() * 2 - 1;
  const azimuth = random() * TAU;
  const across = Math.sqrt(1 - z * z);
  return [across * Math.cos(azimuth), z, across * Math.sin(azimuth)];
}

/** The distant galaxies: small and faint, a few larger ones among them, scattered in every direction. */
export function farGalaxies(seed = 97): FarGalaxy[] {
  const random = seededRandom(seed);
  const galaxies: FarGalaxy[] = [];
  for (let i = 0; i < UNIVERSE.galaxies; i++) {
    const size = Math.pow(random(), 3);
    galaxies.push({
      direction: randomDirection(random),
      radius: 0.006 + 0.03 * size,
      ratio: 0.25 + 0.75 * random(),
      angle: random() * Math.PI,
      brightness: 0.35 + 0.65 * random(),
      warmth: random(),
    });
  }
  return galaxies;
}

/** The direction the visitor looks in from the home view: from the camera towards the galaxy. */
export function homeViewDirection(): Vec3 {
  const [x, y, z] = homeDirection();
  return unit([-x, -y, -z]);
}

/**
 * The normal of the band of the far sky, like our own Milky Way seen from inside. It is chosen so the band
 * crosses behind the galaxy at a slant in the home view, so the visitor sees it from the first frame.
 */
export function bandNormal(): Vec3 {
  return unit(cross(homeViewDirection(), [0.45, 1, 0.1]));
}

/**
 * Where the three nebula clouds sit: one just off the home view, behind the galaxy, one across the sky, and one
 * overhead, so turning and tilting always brings one into view.
 */
export function nebulaCentres(): Vec3[] {
  const view = homeViewDirection();
  return [
    unit([view[0] + 0.35, view[1] + 0.25, view[2] - 0.2]),
    unit([-view[0] + 0.3, 0.15, -view[2] - 0.4]),
    unit([0.25, 1, -0.3]),
  ];
}
