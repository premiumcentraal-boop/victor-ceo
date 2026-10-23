import { describe, expect, it } from "vitest";
import { coreTravel, cubicBezier } from "./zoom";

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
