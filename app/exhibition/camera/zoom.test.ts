import { describe, expect, it } from "vitest";
import { coreTravel, cubicBezier, flareAt, shockAt } from "./zoom";

describe("cubicBezier", () => {
  it("runs from 0 to 1 over the whole curve", () => {
    const ease = cubicBezier(0.42, 0, 0.58, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("matches the familiar ease-in-out at its midpoint", () => {
    expect(cubicBezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 3);
  });
});

describe("coreTravel", () => {
  it("starts at the overview and arrives at the core", () => {
    expect(coreTravel(0)).toBe(0);
    expect(coreTravel(1)).toBe(1);
  });

  it("never moves backwards as the page scrolls down", () => {
    let previous = -1;
    for (let p = 0; p <= 1; p += 0.01) {
      const value = coreTravel(p);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });

  it("starts slowly, so the overview holds before the zoom gathers pace", () => {
    expect(coreTravel(0.2)).toBeLessThan(0.1);
  });

  it("rushes at the end, so the last fifth of the scroll covers most of the way in", () => {
    const lastFifth = coreTravel(1) - coreTravel(0.8);
    expect(lastFifth).toBeGreaterThan(0.4);
  });
});

describe("flareAt", () => {
  it("is dark at the core and gone once the gallery has the screen", () => {
    expect(flareAt(0)).toBeCloseTo(0, 6);
    expect(flareAt(1)).toBeCloseTo(0, 6);
  });

  it("peaks as the camera passes through the core", () => {
    expect(flareAt(0.4)).toBeGreaterThan(0.99);
    expect(flareAt(0.4)).toBeGreaterThan(flareAt(0.2));
    expect(flareAt(0.4)).toBeGreaterThan(flareAt(0.7));
  });
});

describe("shockAt", () => {
  it("has no ring before the camera reaches the core", () => {
    expect(shockAt(0.1).opacity).toBe(0);
  });

  it("grows and fades as the camera passes through", () => {
    const early = shockAt(0.4);
    const late = shockAt(0.9);
    expect(late.scale).toBeGreaterThan(early.scale);
    expect(late.opacity).toBeLessThan(early.opacity);
  });
});
