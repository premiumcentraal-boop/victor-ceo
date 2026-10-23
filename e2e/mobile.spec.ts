import { expect, test, type Page } from "@playwright/test";

// A phone: the galaxy's touch gestures, tested with real multi-finger touch sequences.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

type Point = { x: number; y: number };

/** Moves one or two fingers in a straight line, the way a visitor's hand does, through the browser's own touch input. */
async function drag(page: Page, from: Point[], to: Point[], steps = 14) {
  const cdp = await page.context().newCDPSession(page);
  const at = (fraction: number) =>
    from.map((point, id) => ({ id, x: point.x + (to[id].x - point.x) * fraction, y: point.y + (to[id].y - point.y) * fraction }));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
  for (let step = 1; step <= steps; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(step / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

const galaxy = (page: Page) => page.locator("[data-focus-state]");
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

test.describe("the galaxy on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // The galaxy has drawn its first frame once it reports its tilt.
    await expect(galaxy(page)).toHaveAttribute("data-tilt", /\d+/);
  });

  test("one finger tilts the galaxy, as a mouse drag does, and leaves the page where it is", async ({ page }) => {
    const before = Number(await galaxy(page).getAttribute("data-tilt"));
    await drag(page, [{ x: 195, y: 430 }], [{ x: 195, y: 520 }]);
    await expect.poll(async () => Number(await galaxy(page).getAttribute("data-tilt"))).toBeGreaterThan(before + 5);
    expect(await scrollY(page)).toBe(0);
  });

  test("one finger sideways turns the galaxy without tilting it or scrolling the page", async ({ page }) => {
    const before = await galaxy(page).getAttribute("data-tilt");
    await drag(page, [{ x: 110, y: 430 }], [{ x: 280, y: 430 }]);
    await page.waitForTimeout(400);
    expect(await galaxy(page).getAttribute("data-tilt")).toBe(before);
    expect(await scrollY(page)).toBe(0);
  });

  test("two fingers scroll the scene, as a trackpad does, and the page follows them", async ({ page }) => {
    await drag(page, [{ x: 150, y: 560 }, { x: 240, y: 560 }], [{ x: 150, y: 330 }, { x: 240, y: 330 }]);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(150);
  });

  test("a pinch zooms the galaxy, and spreading the fingers brings it closer", async ({ page }) => {
    const before = Number(await galaxy(page).getAttribute("data-zoom"));
    await drag(page, [{ x: 170, y: 430 }, { x: 220, y: 430 }], [{ x: 110, y: 430 }, { x: 280, y: 430 }]);
    await expect.poll(async () => Number(await galaxy(page).getAttribute("data-zoom"))).toBeLessThan(before - 0.1);
    // A pinch zooms and nothing else: the page does not move under the fingers.
    expect(await scrollY(page)).toBe(0);
  });

  test("one finger on the scroll cue scrolls the scene, as it would on any page", async ({ page }) => {
    const cue = await page.getByText("Scroll to explore").boundingBox();
    expect(cue).not.toBeNull();
    await drag(page, [{ x: cue!.x + cue!.width / 2, y: cue!.y + 4 }], [{ x: cue!.x + cue!.width / 2, y: cue!.y - 200 }]);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(120);
  });
});
