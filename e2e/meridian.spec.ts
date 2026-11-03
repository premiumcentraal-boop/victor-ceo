import { expect, test, type Page } from "@playwright/test";

const MERIDIAN_URL = "https://meridian.victor.ceo";

/** The plain link to Meridian, which must stay usable even when a browser refuses the frame. */
const openLink = (page: Page) => page.getByRole("link", { name: "Open Meridian" });

test.describe("the Meridian page", () => {
  test("at desktop width, the nav marks Meridian, the app is framed and the plain link is shown", async ({ page }) => {
    await page.goto("/meridian");
    await expect(page).toHaveURL(/\/meridian$/);

    const navLink = page.locator("header").getByRole("link", { name: "MERIDIAN" });
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute("aria-current", "page");

    await expect(page.locator('iframe[title="Meridian"]')).toHaveAttribute("src", MERIDIAN_URL);

    await expect(openLink(page)).toBeVisible();
    await expect(openLink(page)).toHaveAttribute("href", MERIDIAN_URL);
    await expect(openLink(page)).toHaveAttribute("target", "_blank");
    await expect(openLink(page)).toHaveAttribute("rel", "noopener noreferrer");
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("the plain link to Meridian is still visible", async ({ page }) => {
      await page.goto("/meridian");
      await expect(openLink(page)).toBeVisible();
      await expect(openLink(page)).toHaveAttribute("href", MERIDIAN_URL);
    });
  });
});
