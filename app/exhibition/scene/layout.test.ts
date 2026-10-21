import { describe, expect, it } from "vitest";
import { DISC_LAYERS, discLayerPoints, homeDirection, placePictures, pictureTabOrder, seededRandom } from "./layout";

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

describe("discLayerPoints", () => {
  it.each(Object.keys(DISC_LAYERS) as (keyof typeof DISC_LAYERS)[])("%s has one entry per point, and is the same every time", (layer) => {
    const count = DISC_LAYERS[layer].count;
    const first = discLayerPoints(layer);
    const second = discLayerPoints(layer);
    expect(first.positions).toHaveLength(count * 3);
    expect(first.colors).toHaveLength(count * 3);
    expect(first.sizes).toHaveLength(count);
    expect(first.seeds).toHaveLength(count);
    expect(second.positions).toEqual(first.positions);
  });

  it("keeps the dust and stars inside the galaxy's radius", () => {
    const { positions } = discLayerPoints("stars");
    for (let i = 0; i < positions.length; i += 3) {
      const radius = Math.hypot(positions[i], positions[i + 2]);
      expect(radius).toBeLessThan(DISC_LAYERS.stars.outer * 1.1);
    }
  });
});

describe("placePictures", () => {
  it("places every picture with a unit facing vector, between the core and the rim", () => {
    const placements = placePictures(8, homeDirection());
    expect(placements).toHaveLength(8);
    for (const { position, normal } of placements) {
      expect(Math.hypot(normal[0], normal[1], normal[2])).toBeCloseTo(1, 10);
      const radius = Math.hypot(position[0], position[2]);
      expect(radius).toBeGreaterThan(2.0);
      expect(radius).toBeLessThan(4.9 + 1e-9);
    }
  });

  it("spreads the pictures apart: no two sit on the same spot", () => {
    const placements = placePictures(8, homeDirection());
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i].position;
        const b = placements[j].position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.5);
      }
    }
  });
});

describe("pictureTabOrder", () => {
  it("is a permutation of the pictures", () => {
    const order = pictureTabOrder(8);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("runs round the disc in angle order", () => {
    const placements = placePictures(8, homeDirection());
    const angles = pictureTabOrder(8).map((index) => {
      const [x, , z] = placements[index].position;
      return (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2);
    });
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
  });
});
