// Thirteen languages: each page speaks its own, numbers are written its way, and the language
// follows the person: the browser's own list, or what they picked, never the IP address.
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

const LANGUAGES = ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "hr", "tr", "id", "ja", "ko"];
const path = (code) => (code === "en" ? "/" : `/${code}/`);
const LINK = "https://example.com/menu";

for (const code of LANGUAGES) {
  test(`the ${code} page works in its own language`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the words are the same in every browser");
    await page.goto(path(code));
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(code);
    await page.locator("#text").fill(LINK);
    const status = page.locator("#status");
    await expect(status).not.toBeEmpty();
    expect(await status.getAttribute("data-verdict")).toBe("fine");
    const line = await page.locator("#bubble").textContent();
    const squares = new Intl.NumberFormat(code === "en" ? "en-GB" : code).format(625);
    expect(line).toContain(squares);
    // Every placeholder was filled and every bracket turned into bold or a link.
    const shown = await page.evaluate(() => document.body.innerText);
    expect(shown).not.toMatch(/\{[a-z]+\}|\[[^\]]*\]|undefined|NaN|\[object/);
    // Every page links to the Robin's Code, which says how it's made.
    await expect(page.locator('footer a[href="https://honestrobin.com/code"]')).toBeVisible();
    await page.locator("#text").fill("a".repeat(3412));
    const tooLong = await page.locator("#advice").textContent();
    expect(tooLong).toContain(new Intl.NumberFormat(code === "en" ? "en-GB" : code).format(3412));
  });
}

// The robin's line changes from its hello to the code's squares. On a small phone, in every
// language, both fit beside the robin, so the field under them never jumps.
for (const code of LANGUAGES) {
  test(`on a small phone, the ${code} robin's line never moves the field`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one small width is enough; the words are the same in every browser");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path(code));
    await page.evaluate(() => document.fonts.ready);
    const field = () => page.locator(".field-box").evaluate((box) => Math.round(box.getBoundingClientRect().top + scrollY));
    const before = await field();
    // A short link, and a longer one whose code has a four-digit number of squares.
    for (const link of [LINK, `${LINK}/lunch?table=12&lang=en&from=window-sticker&campaign=autumn-2026-poster`]) {
      await page.locator("#text").fill(link);
      await expect(page.locator("#status")).not.toBeEmpty();
      expect(await page.locator("#status").getAttribute("data-verdict")).toBe("fine");
      expect(await field(), `the field moved with ${link}`).toBe(before);
    }
  });
}

test.describe("with a browser that asks for German", () => {
  test.use({ locale: "de-DE" });

  test("the plain address follows the browser's language", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/de\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    // The page asked for is already German: nothing is offered.
    await expect(page.locator("#also")).toHaveCount(0);
  });

  test("an address with a language keeps it, and offers German in one line that can be closed", async ({ page }) => {
    await page.goto("/fr/");
    await expect(page).toHaveURL(/\/fr\/$/);
    const also = page.locator("#also");
    await expect(also).toHaveText("Diese Seite gibt es auch auf Deutsch.×");
    await expect(also).toHaveAttribute("lang", "de");
    await also.getByRole("button", { name: "Schließen" }).click();
    await expect(also).toHaveCount(0);
    // Closing it was a choice: French, remembered on this device.
    await page.reload();
    await expect(page.locator("#also")).toHaveCount(0);
    await page.goto("/");
    await expect(page).toHaveURL(/\/fr\/$/);
  });

  test("German comes first in the picker, and a choice there is remembered", async ({ page }) => {
    await page.goto("/de/");
    await page.locator("#language").click();
    const items = page.locator("#language-list a");
    await expect(items).toHaveCount(13);
    await expect(items.first()).toHaveText("Deutsch");
    await expect(page.locator("#language-list a[aria-current='page']")).toHaveText("Deutsch");
    await page.locator("#language-list").getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("with a browser that asks for a language QR doesn't have", () => {
  test.use({ locale: "sv-SE" });

  test("the plain address stays in English", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#also")).toHaveCount(0);
  });
});

test("the picker opens, closes with Escape, and lists each language in its own name", async ({ page }) => {
  await page.goto("/");
  const button = page.locator("#language");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  await expect(page.locator("#language-list")).toBeVisible();
  for (const name of ["English", "Español", "Português", "Français", "Deutsch", "Italiano", "Nederlands", "Polski", "Hrvatski", "Türkçe", "Bahasa Indonesia", "日本語", "한국어"])
    await expect(page.locator("#language-list").getByRole("link", { name, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#language-list")).toBeHidden();
  await expect(button).toHaveAttribute("aria-expanded", "false");
});
