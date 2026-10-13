// A picture of each screen in every browser, so a change can be looked at without running the
// page. CI keeps them with each run (the "screens" artifact). Nothing is compared: a picture that
// changes isn't a failure. The page has one theme, so dark mode is pictured to show it stays light.
import { expect, test } from "@playwright/test";
import { openOptions } from "./helpers.js";

test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });

const LINK = "https://example.com/menu";

const screens = {
  arriving: async () => {},
  "a-code": async (page) => {
    await page.locator("#text").fill(LINK);
    await expect(page.locator("#status")).toHaveText("Scans fine.");
  },
  "a-fix-offered": async (page) => {
    await page.locator("#text").fill("example.com/menu");
    await expect(page.locator("#status")).not.toBeEmpty();
  },
  "too-long": async (page) => page.locator("#text").fill("a".repeat(3412)),
  "colours-and-robin": async (page) => {
    await page.locator("#text").fill(LINK);
    await openOptions(page);
    await page.locator("#fg").getByRole("button", { name: "Forest", exact: true }).click();
    await page.locator("#bg").getByRole("button", { name: "Peach", exact: true }).click();
    await page.getByRole("button", { name: "Robin", exact: true }).click();
    await expect(page.locator("#status")).toHaveText("Scans fine.");
  },
  "colours-too-alike": async (page) => {
    await page.locator("#text").fill(LINK);
    await openOptions(page);
    await page.locator("#fg").getByRole("button", { name: "Pale", exact: true }).click();
    await expect(page.locator("#status")).toContainText("Doesn’t scan");
  },
  "language-picker": async (page) => page.locator("#language").click(),
  "a-sheet": async (page) => {
    await page.locator("#text").fill(LINK);
    await expect(page.locator("#status")).toHaveText("Scans fine.");
    await page.getByRole("button", { name: "Print a sheet" }).click();
    await page.locator("#caption").fill("Scan for the menu");
  },
  "a-sheet-own-size": async (page) => {
    await page.locator("#text").fill(LINK);
    await expect(page.locator("#status")).toHaveText("Scans fine.");
    await page.getByRole("button", { name: "Print a sheet" }).click();
    await page.getByRole("button", { name: "Choose your own size" }).click();
    await page.getByRole("button", { name: "Bigger" }).click();
  },
};

for (const [name, show] of Object.entries(screens)) {
  for (const colorScheme of ["light", "dark"]) {
    if (colorScheme === "dark" && !["arriving", "a-code"].includes(name)) continue;
    test(`picture: ${name} (${colorScheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      await show(page);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `screens/${testInfo.project.name}-${name}-${colorScheme}.png`, fullPage: true });
    });
  }
}

for (const code of ["de", "ja", "ko"]) {
  test(`picture: a code in ${code}`, async ({ page }, testInfo) => {
    await page.goto(`/${code}/`);
    await page.locator("#text").fill(LINK);
    await expect(page.locator("#status")).not.toBeEmpty();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `screens/${testInfo.project.name}-${code}-a-code.png`, fullPage: true });
  });
}
