import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core"), "utf8");

const galaxy = (page: import("@playwright/test").Page) => page.locator("[data-focus-state]");
const caption = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Focused piece" });
/** The first piece in the keyboard order, opened the way a screen reader user opens it. */
const openFirstPieceFromList = (page: import("@playwright/test").Page) =>
  page.locator('ul[aria-label="The pieces"] button').first().evaluate((button) => (button as HTMLElement).click());

test.describe("the galaxy", () => {
  test("a piece opened from the list flies in, the arrows step to the next, and Esc returns", async ({ page }) => {
    await page.goto("/");
    await openFirstPieceFromList(page);

    await expect(galaxy(page)).toHaveAttribute("data-focus-state", "focused");
    await expect(caption(page).getByRole("heading")).toBeFocused();
    const before = (await caption(page).textContent())?.match(/(\d{2}) \/ (\d{2})/);
    expect(before).not.toBeNull();
    const total = Number(before![2]);
    const next = `${String((Number(before![1]) % total) + 1).padStart(2, "0")} / ${before![2]}`;

    await page.keyboard.press("ArrowRight");
    await expect(caption(page)).toContainText(next);
    await expect(galaxy(page)).toHaveAttribute("data-focus-state", "focused");

    await page.keyboard.press("Escape");
    await expect(galaxy(page)).toHaveAttribute("data-focus-state", "overview");
    await expect(caption(page)).toHaveCount(0);
  });

  test("a piece shows no written instructions, and the three gestures show once per session", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Enter the galaxy|Back to overview/i })).toHaveCount(0);
    await openFirstPieceFromList(page);

    await expect(caption(page).getByRole("heading")).toBeFocused();
    await expect(caption(page)).not.toContainText(/zoom|pinch|drag|esc|swipe|scroll/i);
    await expect(page.locator("[data-gesture-hint]")).toBeVisible();
    await expect(page.locator("[data-gesture-hint]")).toHaveCount(0, { timeout: 6000 });
    expect(await page.evaluate(() => sessionStorage.getItem("victor-ceo:exhibition:gestures"))).toBe("1");

    await page.keyboard.press("Escape");
    await expect(galaxy(page)).toHaveAttribute("data-focus-state", "overview");
    await openFirstPieceFromList(page);
    await expect(caption(page).getByRole("heading")).toBeFocused();
    await expect(page.locator("[data-gesture-hint]")).toHaveCount(0);
  });

  test("a grid card scrolls to the galaxy and flies to its piece", async ({ page }) => {
    await page.goto("/");
    // The grid card holds the picture; the screen-reader list has a text-only button with the same title.
    const card = page.locator("button").filter({ has: page.locator("img") }).filter({ hasText: "Lust" });
    await card.scrollIntoViewIfNeeded();
    await card.evaluate((button) => (button as HTMLElement).click());

    await expect(galaxy(page)).toHaveAttribute("data-focus-state", "focused");
    await expect(caption(page)).toContainText("08 / 08");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
  });

  test("the opening plays on the first visit of a session, and not on the next", async ({ page }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("victor-ceo:exhibition:intro"))).toBe("1");
    await page.reload();
    await expect(page.getByRole("heading", { name: /Our stories are united/ })).toBeVisible();
    await expect(page.locator('section[aria-label="The galaxy"] .z-\\[6\\]')).toHaveCount(0);
  });

  test("the page has no WCAG 2.0 A/AA or 2.1 AA violations in the overview or the grid", async ({ page }) => {
    await page.goto("/");
    await page.addScriptTag({ content: AXE_SOURCE });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe;
      const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`);
    });
    expect(violations).toEqual([]);
  });
});

test.describe("with reduced motion", () => {
  test("the opening is skipped, and it is not recorded as played", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await expect(page.getByRole("heading", { name: /Our stories are united/ })).toBeVisible();
    await expect(page.locator('section[aria-label="The galaxy"] .z-\\[6\\]')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("victor-ceo:exhibition:intro"))).toBeNull();
  });
});
