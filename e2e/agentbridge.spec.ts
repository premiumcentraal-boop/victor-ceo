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
    await expect(page.locator("header").getByRole("link", { name: "AGENTBRIDGE" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator('iframe[title="AgentBridge product page"]')).toHaveAttribute("src", "https://agentbridge.victor.ceo");
    await expect(page.getByRole("link", { name: "Open AgentBridge" })).toHaveAttribute("href", "https://agentbridge.victor.ceo");
    await expect(page.getByRole("link", { name: "Control studio" })).toHaveAttribute("href", "https://agentbridge.victor.ceo/studio/");
  });
  test("mobile navigation reaches the product and retains a direct link", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agentbridge");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "AGENTBRIDGE", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "AGENTBRIDGE", exact: true }).click();
    await expect(page.getByRole("link", { name: "Open AgentBridge" })).toBeVisible();
  });
});
