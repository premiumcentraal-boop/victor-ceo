import { describe, expect, it } from "vitest";
import { GLOBE, GLOBE_LAYERS, globeLayerPoints, homeDirection, placePictures, pictureTabOrder, seededRandom } from "./layout";

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

describe("globeLayerPoints", () => {
  it.each(Object.keys(GLOBE_LAYERS) as (keyof typeof GLOBE_LAYERS)[])("%s has one entry per point, and is the same every time", (layer) => {
    const count = GLOBE_LAYERS[layer].count;
    const first = globeLayerPoints(layer);
    const second = globeLayerPoints(layer);
    expect(first.positions).toHaveLength(count * 3);
    expect(first.colors).toHaveLength(count * 3);
    expect(first.sizes).toHaveLength(count);
    expect(first.seeds).toHaveLength(count);
    expect(second.positions).toEqual(first.positions);
  });

  it.each(Object.keys(GLOBE_LAYERS) as (keyof typeof GLOBE_LAYERS)[])("%s stays inside the globe, so the edge is round", (layer) => {
    const { positions } = globeLayerPoints(layer);
    for (let i = 0; i < positions.length; i += 3) {
      const distance = Math.hypot(positions[i], positions[i + 1], positions[i + 2]);
      expect(distance).toBeLessThanOrEqual(GLOBE.radius);
    }
  });

  it("fills the globe rather than sitting in a flat disc: points spread above and below the arms", () => {
    const { positions } = globeLayerPoints("dust");
    let above = 0;
    let below = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 1] > 0.5) above++;
      if (positions[i + 1] < -0.5) below++;
    }
    expect(above).toBeGreaterThan(500);
    expect(below).toBeGreaterThan(500);
  });
});

describe("placePictures", () => {
  it("places every picture just outside the globe, with a unit facing vector", () => {
    const placements = placePictures(8, homeDirection());
    expect(placements).toHaveLength(8);
    for (const { position, normal } of placements) {
      expect(Math.hypot(normal[0], normal[1], normal[2])).toBeCloseTo(1, 10);
      const distance = Math.hypot(position[0], position[1], position[2]);
      expect(distance).toBeCloseTo(GLOBE.radius + GLOBE.pictureStandoff, 10);
    }
  });

  it("keeps the pictures within about 25 degrees of the equator", () => {
    for (const { position } of placePictures(8, homeDirection())) {
      const latitude = Math.asin(position[1] / Math.hypot(position[0], position[1], position[2]));
      expect(Math.abs(latitude)).toBeLessThan(0.5);
    }
  });

  it("spreads the pictures apart: no two sit on the same spot", () => {
    const placements = placePictures(8, homeDirection());
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i].position;
        const b = placements[j].position;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(0.5);
      }
    }
  });
});

describe("pictureTabOrder", () => {
  it("is a permutation of the pictures", () => {
    const order = pictureTabOrder(8);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("runs round the globe in angle order", () => {
    const placements = placePictures(8, homeDirection());
    const angles = pictureTabOrder(8).map((index) => {
      const [x, , z] = placements[index].position;
      return (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    });
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
  });
});
