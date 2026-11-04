import { describe, expect, it } from "vitest";
import { PARALLAX, UNIVERSE, bandNormal, farGalaxies, homeViewDirection, nebulaCentres } from "./universe";
import { DEEP_FIELD } from "./layout";
import { FAR_GALAXIES, FAR_NEBULAE } from "./shaders";

const length = ([x, y, z]: number[]) => Math.hypot(x, y, z);
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("the far universe", () => {
  it("lies beyond the deep field, wherever the camera is", () => {
    // The dome follows the camera, which never goes further than 22 from the centre.
    expect(UNIVERSE.domeRadius - 22).toBeGreaterThan(DEEP_FIELD.outer);
  });

  it("moves less the further away a layer is, and always less than the galaxy", () => {
    expect(PARALLAX.drift).toBeLessThan(1);
    expect(PARALLAX.starfield).toBeLessThan(PARALLAX.drift);
    expect(PARALLAX.deepField).toBeLessThan(PARALLAX.starfield);
    expect(PARALLAX.universe).toBeLessThan(PARALLAX.deepField);
    expect(PARALLAX.universe).toBeGreaterThan(0);
  });

  it("scatters the same small distant galaxies on every visit", () => {
    const galaxies = farGalaxies();
    expect(galaxies).toHaveLength(UNIVERSE.galaxies);
    // The shader draws exactly as many as there are.
    expect(FAR_GALAXIES).toBe(UNIVERSE.galaxies);
    expect(farGalaxies()).toEqual(galaxies);
    for (const galaxy of galaxies) {
      expect(length(galaxy.direction)).toBeCloseTo(1, 6);
      expect(galaxy.radius).toBeGreaterThan(0);
      expect(galaxy.radius).toBeLessThan(0.05);
      expect(galaxy.ratio).toBeGreaterThan(0);
      expect(galaxy.ratio).toBeLessThanOrEqual(1);
    }
  });

  it("puts the band of the sky across the home view, so it shows from the first frame", () => {
    const normal = bandNormal();
    expect(length(normal)).toBeCloseTo(1, 6);
    // The view direction lies in the band's plane.
    expect(Math.abs(dot(normal, homeViewDirection()))).toBeLessThan(1e-6);
  });

  it("places one nebula close behind the galaxy in the home view", () => {
    const centres = nebulaCentres();
    expect(centres).toHaveLength(UNIVERSE.nebulae);
    expect(FAR_NEBULAE).toBe(UNIVERSE.nebulae);
    for (const centre of centres) expect(length(centre)).toBeCloseTo(1, 6);
    expect(dot(centres[0], homeViewDirection())).toBeGreaterThan(0.85);
  });

  it("spreads the nebulae round the whole sky, so every direction has one near it", () => {
    const centres = nebulaCentres();
    // Sample directions over the sphere: each lies within reach (cos > 0.3) of at least one cloud.
    for (let i = 0; i < 400; i++) {
      const y = 1 - (2 * (i + 0.5)) / 400;
      const across = Math.sqrt(1 - y * y);
      const direction = [across * Math.cos(i * 2.39996), y, across * Math.sin(i * 2.39996)];
      expect(Math.max(...centres.map((c) => dot(c, direction)))).toBeGreaterThan(0.3);
    }
  });
});
