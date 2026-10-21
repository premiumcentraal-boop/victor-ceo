import { describe, expect, it } from "vitest";
import { GALAXY, GALAXY_LAYERS, ORBIT, galaxyLayerPoints, homeDirection, placePictures, pictureTabOrder, seededRandom } from "./layout";

const TAU = Math.PI * 2;

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays within [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("homeDirection", () => {
  it("is a unit vector", () => {
    const [x, y, z] = homeDirection();
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
  });
});

describe("galaxyLayerPoints", () => {
  it.each(Object.keys(GALAXY_LAYERS) as (keyof typeof GALAXY_LAYERS)[])("%s has one entry per point, and is the same every time", (layer) => {
    const count = GALAXY_LAYERS[layer].count;
    const first = galaxyLayerPoints(layer);
    const second = galaxyLayerPoints(layer);
    expect(first.positions).toHaveLength(count * 3);
    expect(first.colors).toHaveLength(count * 3);
    expect(first.sizes).toHaveLength(count);
    expect(first.seeds).toHaveLength(count);
    expect(second.positions).toEqual(first.positions);
  });

  it.each(Object.keys(GALAXY_LAYERS) as (keyof typeof GALAXY_LAYERS)[])("%s stays within the galaxy's disc", (layer) => {
    const { positions } = galaxyLayerPoints(layer);
    for (let i = 0; i < positions.length; i += 3) {
      const reach = Math.hypot(positions[i], positions[i + 2]);
      expect(reach).toBeLessThanOrEqual(GALAXY.outerRadius);
    }
  });

  it("is a flat spiral, not a ball: almost every point lies close to the galaxy's plane", () => {
    for (const layer of Object.keys(GALAXY_LAYERS) as (keyof typeof GALAXY_LAYERS)[]) {
      const { positions } = galaxyLayerPoints(layer);
      let far = 0;
      for (let i = 0; i < positions.length; i += 3) {
        if (Math.abs(positions[i + 1]) > 1) far++;
      }
      expect(far / (positions.length / 3)).toBeLessThan(0.005);
    }
  });
});

describe("placePictures", () => {
  it("places every picture on the ring, in the galaxy's plane", () => {
    const placements = placePictures(8);
    expect(placements).toHaveLength(8);
    for (const { position } of placements) {
      expect(position[1]).toBe(0);
      expect(Math.hypot(position[0], position[2])).toBeCloseTo(ORBIT.radius, 10);
    }
  });

  it("faces each picture outwards, tangent to the ring, so they read as one circle", () => {
    for (const { position, normal } of placePictures(8)) {
      expect(Math.hypot(normal[0], normal[1], normal[2])).toBeCloseTo(1, 10);
      const radialLength = Math.hypot(position[0], position[2]);
      const radialDot = (position[0] * normal[0] + position[2] * normal[2]) / radialLength;
      expect(radialDot).toBeCloseTo(1, 10);
      expect(normal[1]).toBe(0);
    }
  });

  it("spaces the pictures evenly round the ring", () => {
    const count = 8;
    const angles = placePictures(count).map(({ position }) => (Math.atan2(position[2], position[0]) + TAU) % TAU);
    for (let k = 1; k < count; k++) {
      const step = (angles[k] - angles[k - 1] + TAU) % TAU;
      expect(step).toBeCloseTo(TAU / count, 10);
    }
  });
});

describe("pictureTabOrder", () => {
  it("is a permutation of the pictures", () => {
    const order = pictureTabOrder(8);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("runs round the ring, in the same order the pictures sit on it", () => {
    const placements = placePictures(8);
    const angles = pictureTabOrder(8).map((index) => {
      const [x, , z] = placements[index].position;
      return (Math.atan2(z, x) + TAU) % TAU;
    });
    for (let k = 1; k < angles.length; k++) {
      expect((angles[k] - angles[k - 1] + TAU) % TAU).toBeCloseTo(TAU / 8, 10);
    }
  });
});
