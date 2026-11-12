import { expect, test } from "@playwright/test";

test.describe("AgentBridge product integration", () => {
  // The external service is separately deployed; the host test must not depend on it.
  test.beforeEach(async ({ page }) => {
    await page.route("https://agentbridge.victor.ceo/**", route => route.fulfill({
      contentType: "text/html", body: "<title>AgentBridge</title><p>Product service</p>",
    }));
  });
  test("dedicated tab embeds the product and offers direct product and studio links", async ({ page }) => {
    await page.goto("/agentbridge");
    const entry = page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "AGENTBRIDGE" });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute("href", "/agentbridge");
    await expect(entry).toHaveAttribute("aria-current", "page");
    const product = page.locator('iframe[title="AgentBridge product page"]');
    await expect(product).toHaveAttribute("src", "https://agentbridge.victor.ceo");
    await expect(product).toHaveAttribute("allow", /microphone 'none'/);
    await expect(product).toHaveAttribute("sandbox", /allow-top-navigation-by-user-activation/);
    await expect(page.getByRole("link", { name: "Open AgentBridge" })).toHaveAttribute("href", "https://agentbridge.victor.ceo");
    const studio = page.getByRole("link", { name: "Control studio" });
    await expect(studio).toHaveAttribute("href", "https://agentbridge.victor.ceo/studio/");
    await expect(studio).toHaveAttribute("target", "_blank");
    await expect(studio).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("mobile product card reaches AgentBridge and offers a direct studio shortcut", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pre-release");
    await page.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("dialog", { name: "Explore Victor" });
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Connect agents worldwide.")).toBeVisible();
    await expect(menu.getByRole("link", { name: "MERIDIAN", exact: true })).toBeVisible();
    const studio = menu.getByRole("link", { name: "Open studio", exact: true });
    await expect(studio).toBeInViewport();
    await expect(studio).toHaveAttribute("href", "https://agentbridge.victor.ceo/studio/");
    await expect(studio).toHaveAttribute("target", "_blank");
    await menu.getByRole("link", { name: "AGENTBRIDGE", exact: true }).click();
    await expect(page).toHaveURL(/\/agentbridge$/);
    await expect(menu).toBeHidden();
    await expect(page.getByRole("link", { name: "Open AgentBridge" })).toBeVisible();
  });

  test("mobile drawer traps focus and restores it when dismissed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agentbridge");
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Explore Victor" });
    const close = menu.getByRole("button", { name: "Close menu" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(menu.getByRole("link", { name: "Open studio", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("switching to desktop closes the mobile drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agentbridge");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("dialog", { name: "Explore Victor" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("dialog", { name: "Explore Victor" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link", { name: "AGENTBRIDGE" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("dialog", { name: "Explore Victor" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
  });

  for (const width of [320, 390]) {
    test(`product frame fits a ${width}px mobile viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/agentbridge");
      const frame = page.locator('iframe[title="AgentBridge product page"]');
      await expect(frame).toBeVisible();
      const bounds = await frame.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
});
