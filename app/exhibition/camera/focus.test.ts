import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { arcControlPoint, easeInOutCubic, fitDistance, FocusMove, framedPose, quadraticPoint } from "./focus";

const FOV = 34;
const VIEWPORT_W = 1440;
const VIEWPORT_H = 900;
const USABLE = (VIEWPORT_H - 73) / VIEWPORT_H;

/** The height of the view at a distance, for a camera with the given field of view. */
function visibleHeight(distance: number, fovDeg: number): number {
  return 2 * distance * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
}

describe("easeInOutCubic", () => {
  it("starts at 0, ends at 1, and passes through the middle", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it("never runs backwards", () => {
    let last = -Infinity;
    for (let t = 0; t <= 1; t += 0.01) {
      const value = easeInOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
  });
});

describe("fitDistance", () => {
  it("fills 88% of the usable height for a tall picture", () => {
    const height = 2;
    const distance = fitDistance({
      width: 1.4,
      height,
      viewportAspect: VIEWPORT_W / VIEWPORT_H,
      fovDeg: FOV,
      usableHeightFraction: USABLE,
    });
    expect(height / visibleHeight(distance, FOV)).toBeCloseTo(0.88 * USABLE, 6);
  });

  it("fills 90% of the width for a wide picture, so the picture always fits", () => {
    const width = 6;
    const aspect = VIEWPORT_W / VIEWPORT_H;
    const distance = fitDistance({
      width,
      height: 1,
      viewportAspect: aspect,
      fovDeg: FOV,
      usableHeightFraction: USABLE,
    });
    const visibleWidth = visibleHeight(distance, FOV) * aspect;
    expect(width / visibleWidth).toBeCloseTo(0.9, 6);
  });

  it("takes the larger distance, so neither edge is cut off", () => {
    const options = { width: 1.4, height: 2, viewportAspect: 1.6, fovDeg: FOV, usableHeightFraction: USABLE };
    const distance = fitDistance(options);
    const byHeight = fitDistance({ ...options, width: 0.01 });
    const byWidth = fitDistance({ ...options, height: 0.01 });
    expect(distance).toBeCloseTo(Math.max(byHeight, byWidth), 10);
  });
});

describe("framedPose", () => {
  it("stands on the picture's normal and looks straight back at its centre", () => {
    const center = new THREE.Vector3(1, 2, 3);
    const normal = new THREE.Vector3(0, 0, 1);
    const pose = framedPose({ center, normal, up: new THREE.Vector3(0, 1, 0), distance: 5, fovDeg: FOV });
    expect(pose.position.distanceTo(center)).toBeCloseTo(5, 10);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(pose.quaternion);
    const toCentre = center.clone().sub(pose.position).normalize();
    expect(forward.dot(toCentre)).toBeCloseTo(1, 10);
    expect(pose.fov).toBe(FOV);
  });
});

describe("FocusMove", () => {
  const start = {
    position: new THREE.Vector3(12, 3, 0),
    quaternion: new THREE.Quaternion(),
    fov: 40,
  };

  it("lands exactly on a target that moves while the move runs", () => {
    const move = new FocusMove(start, 1.4, 2);
    let done = false;
    let target = { position: new THREE.Vector3(0, 0, 5), quaternion: new THREE.Quaternion(), fov: 34 };
    for (let i = 0; i < 200 && !done; i++) {
      target = { ...target, position: target.position.clone().add(new THREE.Vector3(0.001, 0, 0)) };
      const result = move.step(1 / 60, target);
      done = result.done;
      if (done) {
        expect(result.pose.position.distanceTo(target.position)).toBeLessThan(1e-9);
        expect(result.pose.fov).toBeCloseTo(34, 9);
      }
    }
    expect(done).toBe(true);
  });

  it("bows outwards: the middle of the path is further from the disc than a straight line", () => {
    const target = { position: new THREE.Vector3(0, 0, 5), quaternion: new THREE.Quaternion(), fov: 34 };
    const move = new FocusMove(start, 1, 2);
    let middle = new THREE.Vector3();
    for (let i = 0; i < 30; i++) middle = move.step(1 / 60, target).pose.position.clone();
    const straightMiddle = start.position.clone().lerp(target.position, move.progress);
    expect(middle.length()).toBeGreaterThan(straightMiddle.length());
  });
});

describe("arcControlPoint and quadraticPoint", () => {
  it("pushes the control point outwards from the centre", () => {
    const a = new THREE.Vector3(2, 0, 0);
    const b = new THREE.Vector3(0, 0, 2);
    const control = arcControlPoint(a, b, 1.5);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    expect(control.length()).toBeCloseTo(mid.length() + 1.5, 10);
  });

  it("meets its ends at t = 0 and t = 1", () => {
    const a = new THREE.Vector3(1, 2, 3);
    const b = new THREE.Vector3(-4, 0, 5);
    const c = new THREE.Vector3(0, 9, 0);
    expect(quadraticPoint(a, c, b, 0).distanceTo(a)).toBeLessThan(1e-12);
    expect(quadraticPoint(a, c, b, 1).distanceTo(b)).toBeLessThan(1e-12);
  });
});
