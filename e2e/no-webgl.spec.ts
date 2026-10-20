import { expect, test } from "@playwright/test";

// A browser with no WebGL at all. Launch options must sit at the top of a file, so this runs on its own.
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis", "--disable-gpu"] } });

test("without WebGL, the list opens the flat viewer at the sharp size, with no page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator('ul[aria-label="The pieces"] button').nth(2).evaluate((button) => (button as HTMLElement).click());

  await expect(page.locator('img[alt^="Gallery piece"]')).toHaveAttribute("src", /w_2400,c_limit/);
  expect(errors).toEqual([]);
});
