// The focus move: pure camera maths, with no rendering. The scene and the hero call these.

import * as THREE from "three";

export interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Vertical field of view, in degrees. */
  fov: number;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * The distance at which a flat picture of `width` × `height` fills `fillHeight` of the usable screen
 * height, and `fillWidth` of its width. The larger of the two wins, so the picture always fits.
 * `usableHeightFraction` is the share of the viewport below the header.
 */
export function fitDistance(options: {
  width: number;
  height: number;
  viewportAspect: number;
  fovDeg: number;
  usableHeightFraction: number;
  fillHeight?: number;
  fillWidth?: number;
}): number {
  const { width, height, viewportAspect, fovDeg, usableHeightFraction } = options;
  const fillHeight = options.fillHeight ?? 0.88;
  const fillWidth = options.fillWidth ?? 0.9;
  const halfTan = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const byHeight = height / (fillHeight * usableHeightFraction * 2 * halfTan);
  const byWidth = width / (fillWidth * 2 * halfTan * viewportAspect);
  return Math.max(byHeight, byWidth);
}

/** A camera pose that looks straight at `center` from `distance` along `normal`, level with `up`. */
export function framedPose(options: {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  distance: number;
  fovDeg: number;
}): Pose {
  const position = options.center.clone().addScaledVector(options.normal, options.distance);
  const matrix = new THREE.Matrix4().lookAt(position, options.center, options.up);
  return {
    position,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    fov: options.fovDeg,
  };
}

/** The control point of the arc: the midpoint pushed outwards from the centre, so the path curves round the disc. */
export function arcControlPoint(start: THREE.Vector3, end: THREE.Vector3, outward: number): THREE.Vector3 {
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const dir = mid.lengthSq() > 1e-6 ? mid.clone().normalize() : new THREE.Vector3(0, 1, 0);
  return mid.addScaledVector(dir, outward);
}

/** A point on a quadratic Bézier curve. */
export function quadraticPoint(a: THREE.Vector3, control: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const u = 1 - t;
  return new THREE.Vector3(
    u * u * a.x + 2 * u * t * control.x + t * t * b.x,
    u * u * a.y + 2 * u * t * control.y + t * t * b.y,
    u * u * a.z + 2 * u * t * control.z + t * t * b.z
  );
}

/**
 * One timed move from a starting pose to a target. The target may change while the move runs
 * (the picture turns slowly), and the move follows it to the end exactly. It finishes on the target.
 */
export class FocusMove {
  private elapsed = 0;

  constructor(
    private readonly start: Pose,
    private readonly duration: number,
    private readonly bulge: number
  ) {}

  /** How far the move has got, from 0 to 1, after easing. */
  get progress(): number {
    return easeInOutCubic(this.elapsed / this.duration);
  }

  step(dt: number, target: Pose): { pose: Pose; done: boolean } {
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = easeInOutCubic(this.elapsed / this.duration);
    const control = arcControlPoint(this.start.position, target.position, this.bulge);
    return {
      pose: {
        position: quadraticPoint(this.start.position, control, target.position, t),
        quaternion: this.start.quaternion.clone().slerp(target.quaternion, t),
        fov: THREE.MathUtils.lerp(this.start.fov, target.fov, t),
      },
      done: this.elapsed >= this.duration,
    };
  }
}

export const FOCUS_DURATION = 1.4;
export const EXIT_DURATION = 1.1;
