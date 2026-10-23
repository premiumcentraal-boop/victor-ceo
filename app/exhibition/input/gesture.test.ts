import { describe, expect, it } from "vitest";
import { decideTwoFingerGesture } from "./gesture";

describe("decideTwoFingerGesture", () => {
  it("waits while the movement is small, so a wobble decides nothing", () => {
    expect(decideTwoFingerGesture(3, 4)).toBe("undecided");
  });

  it("is a pinch when the fingers spread or close more than they move together", () => {
    expect(decideTwoFingerGesture(40, 6)).toBe("pinch");
  });

  it("is a pan when the fingers move together more than they spread", () => {
    expect(decideTwoFingerGesture(5, 60)).toBe("pan");
  });

  it("is a pinch on a tie, so a pinch with a little drift still zooms", () => {
    expect(decideTwoFingerGesture(30, 30)).toBe("pinch");
  });
});
