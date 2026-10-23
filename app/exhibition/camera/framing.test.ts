import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ringExtent, restShift } from "./framing";

const FOV = 40;
const CAMERA = new THREE.Vector3(0, 0, 12);
const ORIGIN = new THREE.Vector3(0, 0, 0);

describe("ringExtent", () => {
  it("spans the ring on screen, with its near side reaching lower than its far side reaches up", () => {
    const { top, bottom } = ringExtent(CAMERA, ORIGIN, FOV, 390, 844);
    expect(top).toBeLessThan(422);
    expect(bottom).toBeGreaterThan(422);
    // Perspective: the near side is closer to the camera, so it spreads further from the middle.
    expect(bottom - 422).toBeGreaterThan(422 - top);
  });
});

describe("restShift", () => {
  const base = { fovDeg: FOV, position: CAMERA, look: ORIGIN };

  it("does not move a landscape screen", () => {
    expect(restShift({ ...base, width: 1440, height: 900, openArea: { top: 300, bottom: 800 } })).toBe(0);
  });

  it("does not move when there is no open area to measure", () => {
    expect(restShift({ ...base, width: 390, height: 844, openArea: null })).toBe(0);
  });

  it("centres the ring of pictures in the open area on a portrait screen", () => {
    const openArea = { top: 330, bottom: 760 };
    const shift = restShift({ ...base, width: 390, height: 844, openArea });
    const ring = ringExtent(CAMERA, ORIGIN, FOV, 390, 844);
    expect((ring.top + ring.bottom) / 2 + shift).toBeCloseTo((openArea.top + openArea.bottom) / 2, 6);
  });

  it("keeps the galaxy on screen even for an odd open area", () => {
    const shift = restShift({ ...base, width: 390, height: 844, openArea: { top: 0, bottom: 5000 } });
    expect(shift).toBeLessThanOrEqual(844 * 0.3);
  });
});
