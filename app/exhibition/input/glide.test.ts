import { describe, expect, it } from "vitest";
import { GLIDE_FRICTION, glideStep } from "./glide";

/** Runs a flick to rest in frames of `dt` seconds, and returns the total travel. */
function totalTravel(velocity: number, dt: number, rest: number): number {
  let travel = 0;
  let current = velocity;
  for (let frame = 0; frame < 60 * 60 && current !== 0; frame++) {
    const step = glideStep(current, dt, rest);
    travel += step.travel;
    current = step.velocity;
  }
  return travel;
}

describe("glideStep", () => {
  it("moves about the velocity times the time, for a short step", () => {
    const step = glideStep(1000, 1 / 1000, 1);
    expect(step.travel).toBeCloseTo(1, 1);
  });

  it("keeps the direction of the flick", () => {
    expect(glideStep(-500, 1 / 60, 1).travel).toBeLessThan(0);
    expect(glideStep(500, 1 / 60, 1).travel).toBeGreaterThan(0);
  });

  it("covers the same distance however the frames divide the time", () => {
    const coarse = totalTravel(1000, 1 / 30, 8);
    const fine = totalTravel(1000, 1 / 240, 8);
    expect(coarse).toBeCloseTo(fine, 0);
  });

  it("travels the velocity over the friction in all, less the little that is left at rest", () => {
    const rest = 8;
    const expected = 1000 / GLIDE_FRICTION - rest / GLIDE_FRICTION;
    expect(totalTravel(1000, 1 / 60, rest)).toBeCloseTo(expected, 0);
  });

  it("comes to rest below the rest speed, and then stops moving", () => {
    const step = glideStep(3, 1 / 60, 8);
    expect(step.velocity).toBe(0);
  });
});
