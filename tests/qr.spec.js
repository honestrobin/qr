// The page used the way a person uses it, mistakes included: every code made here is read back
// (the sticker, the PNG and the SVG) and compared with what was typed, and after every mistake
// what was typed is still there.
import { expect, test } from "@playwright/test";
import { download, openOptions, pixel, readEverything, readPng, redSquare } from "./helpers.js";

test.use({ reducedMotion: "reduce" });

const LINK = "https://example.com/menu";
const box = (page) => page.locator("#text");
const status = (page) => page.locator("#status");

test("a pasted link shows its code at once, says what it opens, and is checked", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("svg.code")).toHaveCount(0);
  await box(page).fill(LINK);
  // No button to press: the code is there as soon as the link is.
  await expect(page.locator("svg.code")).toBeVisible();
  await expect(page.locator("#inside")).toHaveText(`This code opens ${LINK}`);
  await expect(status(page)).toHaveText("Scans fine.");
  await expect(page.locator("#smallest")).toHaveText("At least 2 cm, so phones can read it");
  await expect(page.locator("svg.code")).toHaveAttribute("aria-label", `QR code for ${LINK}`);
});

test("the sticker, the PNG and the SVG all hold what was typed, named after the link", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  const read = await readEverything(page);
  expect(read.names).toEqual(["qr-example.com-menu.png", "qr-example.com-menu.svg"]);
  expect([read.sticker, read.png, read.svg]).toEqual([LINK, LINK, LINK]);
  // Big enough to print, in whole pixels per module.
  expect(pixel(read.pngBytes, 0, 0).width).toBeGreaterThanOrEqual(1024);
});

test("text in any language, emoji included, comes back exactly", async ({ page }) => {
  const text = "Wi-Fi za goste: Čađa-Žiža 42 😀 — ask at the bar";
  await page.goto("/");
  await box(page).fill(text);
  await expect(page.locator("#inside")).toHaveText("Phones will show this as text.");
  await expect(status(page)).toHaveText("Scans fine.");
  const read = await readEverything(page);
  expect([read.sticker, read.png, read.svg]).toEqual([text, text, text]);
});

test("the Paste button pastes where the cursor is", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === "iphone", "Safari asks the person before a page may read the clipboard");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.evaluate((link) => navigator.clipboard.writeText(link), LINK);
  await page.locator("#paste").click();
  await expect(box(page)).toHaveValue(LINK);
  await expect(page.locator("svg.code")).toBeVisible();
});

test("a link without https:// is offered the fix, and only the tap adds it", async ({ page }) => {
  await page.goto("/");
  await box(page).fill("example.com/menu");
  await expect(page.locator("#advice")).toContainText("Phones may show this as text instead of opening it.");
  // The code holds exactly what was typed until the tap.
  await expect(box(page)).toHaveValue("example.com/menu");
  await expect(status(page)).toHaveText("Scans fine.");
  expect(readPng((await download(page, "#png")).bytes)).toBe("example.com/menu");

  await page.getByRole("button", { name: "Add https://" }).click();
  await expect(box(page)).toHaveValue("https://example.com/menu");
  await expect(page.locator("#advice")).toBeEmpty();
  await expect(page.locator("#inside")).toHaveText(`This code opens ${LINK}`);
  await expect(status(page)).toHaveText("Scans fine.");
  expect(readPng((await download(page, "#png")).bytes)).toBe(LINK);
});

test("spaces around a link are offered for removal, never removed by themselves", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(` ${LINK} `);
  await expect(page.locator("#advice")).toContainText("It starts or ends with a space");
  await expect(status(page)).toHaveText("Scans fine.");
  expect(readPng((await download(page, "#png")).bytes)).toBe(` ${LINK} `);
  await page.getByRole("button", { name: "Remove the spaces" }).click();
  await expect(box(page)).toHaveValue(LINK);
  await expect(page.locator("#advice")).toBeEmpty();
});

test("nothing typed: no message, the empty shape waits, and nothing can be taken", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#empty")).toBeVisible();
  await expect(page.locator("#advice")).toBeEmpty();
  await expect(status(page)).toBeEmpty();
  for (const id of ["#png", "#svg"]) await expect(page.locator(id)).toBeDisabled();
  await box(page).fill("hello");
  await expect(page.locator("#png")).toBeEnabled();
  await box(page).fill("");
  await expect(page.locator("#empty")).toBeVisible();
  await expect(page.locator("svg.code")).toHaveCount(0);
  await expect(status(page)).toBeEmpty();
  // The robin stays, and says who it is again.
  await expect(page.locator("#bubble")).toHaveText("I’m the robin. I’m here to lighten up your day.");
  for (const id of ["#png", "#svg"]) await expect(page.locator(id)).toBeDisabled();
});

test("too long for one code: says how long, and what was typed stays", async ({ page }) => {
  const text = "a".repeat(3412);
  await page.goto("/");
  await box(page).fill(text);
  await expect(page.locator("#advice")).toHaveText(
    "Too long for one code: this is 3,412 characters, and a code holds at most about 2,900.",
  );
  await expect(box(page)).toHaveValue(text);
  await expect(page.locator("#empty")).toBeVisible();
  await expect(page.locator("#png")).toBeDisabled();
  // Shorten it, and the code is back.
  await box(page).fill(text.slice(0, 2000));
  await expect(page.locator("#advice")).toBeEmpty();
  await expect(status(page)).toHaveText("Scans fine.", { timeout: 10_000 });
});

test("too long for a code with an image: offers to remove the image", async ({ page }) => {
  // 1,400 characters fit a code, but not one strong enough to carry an image (at most 1,273).
  const text = `https://example.com/?q=${"b".repeat(1377)}`;
  await page.goto("/");
  await openOptions(page);
  await page.getByRole("button", { name: "Robin", exact: true }).click();
  await box(page).fill(text);
  await expect(page.locator("#advice")).toContainText("Too long for a code with an image.");
  // The code without the image is still there, and still checked.
  await expect(status(page)).toHaveText("Scans fine.", { timeout: 10_000 });
  await page.locator("#advice").getByRole("button", { name: "Remove the image" }).click();
  await expect(page.locator("#advice")).toBeEmpty();
  await expect(page.getByRole("button", { name: "None", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(box(page)).toHaveValue(text);
});

for (const [what, reader] of [
  ["reads nothing", "window.jsQR = () => null;"],
  ["reads something else", "window.jsQR = () => ({ binaryData: [104, 105], data: 'hi' });"],
]) {
  test(`"Scans fine" only when the reader reads exactly what was typed: not when it ${what}`, async ({ page }) => {
    // By its path: the page asks for it with its version after a "?".
    await page.route((url) => url.pathname === "/assets/vendor/jsQR.js", (route) => route.fulfill({ contentType: "text/javascript", body: reader }));
    await page.goto("/");
    await box(page).fill(LINK);
    await expect(status(page)).toHaveText("Doesn’t scan.");
    await expect(status(page)).toHaveAttribute("data-verdict", "unreadable");
    await expect(page.locator("#smallest")).toBeHidden();
    // A code that doesn't scan can still be taken away.
    await expect(page.locator("#png")).toBeEnabled();
  });
}

test("colours too alike: says it won't scan, still downloads, and one tap goes back to black", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.locator("#fg").getByRole("button", { name: "Pale" }).click();
  await expect(status(page)).toContainText("Doesn’t scan: the colours are too alike.");
  await expect(page.locator("#smallest")).toBeHidden();
  // The robin has nothing proud to say about a code that doesn't scan.
  await expect(page.locator("#bubble")).toBeHidden();
  await expect(page.locator("#png")).toBeEnabled();
  await download(page, "#png");
  await page.getByRole("button", { name: "Back to black" }).click();
  await expect(status(page)).toHaveText("Scans fine.");
  await expect(page.locator("#bubble")).toBeVisible();
  await expect(page.locator("#fg").getByRole("button", { name: "Ink" })).toHaveAttribute("aria-pressed", "true");
});

test("a light code on a dark background: says newer phones read it", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.locator("#fg").getByRole("button", { name: "Pale" }).click();
  await page.locator("#bg").getByRole("button", { name: "Ink" }).click();
  await expect(status(page)).toHaveText("Newer phones read this. Some older scanner apps can’t.");
  const read = await readEverything(page, { lightOnDark: true });
  expect([read.sticker, read.png, read.svg]).toEqual([LINK, LINK, LINK]);
});

test("a see-through background: scans on a light surface, and the PNG is see-through", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.locator("#bg").getByRole("button", { name: "See-through" }).click();
  await expect(status(page)).toHaveText(
    "Scans fine on a light surface. With a see-through background, leave some space around it.",
  );
  // Phones read it only on a light surface, so the robin doesn't say they can.
  await expect(page.locator("#bubble")).toHaveText("I’m the robin. I’m here to lighten up your day.");
  const read = await readEverything(page);
  expect([read.sticker, read.png, read.svg]).toEqual([LINK, LINK, LINK]);
  expect(pixel(read.pngBytes, 1, 1).rgba[3]).toBe(0);
});

test("custom colours come from the device's own picker", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.locator("#fg-custom").fill("#123456");
  await expect(page.locator("#fg label.custom")).toHaveClass(/chosen/);
  await expect(page.locator("#fg .chip[aria-pressed='true']")).toHaveCount(0);
  await expect(page.locator("svg.code path")).toHaveAttribute("fill", "#123456");
  await expect(status(page)).toHaveText("Scans fine.");
  const png = (await download(page, "#png")).bytes;
  expect(readPng(png)).toBe(LINK);
});

test("the robin in the middle: the code makes room, still scans, and every download carries it", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.getByRole("button", { name: "Robin", exact: true }).click();
  await expect(page.locator("svg.code image")).toHaveCount(1);
  await expect(status(page)).toHaveText("Scans fine.");
  const read = await readEverything(page);
  expect([read.sticker, read.png, read.svg]).toEqual([LINK, LINK, LINK]);
  // The middle of the PNG is the robin, not the code: its orange breast is there.
  const middle = pixel(read.pngBytes, Math.floor(pixel(read.pngBytes, 0, 0).width / 2), Math.floor(pixel(read.pngBytes, 0, 0).width / 2) - 20);
  expect(middle.rgba.slice(0, 3)).not.toEqual([28, 43, 37]);
  await page.getByRole("button", { name: "None", exact: true }).click();
  await expect(page.locator("svg.code image")).toHaveCount(0);
});

test("your own image stays on the page and goes into the code", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.locator("#own-image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: redSquare() });
  await expect(page.locator("#own-chip")).toHaveClass(/chosen/);
  await expect(page.locator("svg.code image")).toHaveCount(1);
  await expect(status(page)).toHaveText("Scans fine.");
  const read = await readEverything(page);
  expect([read.sticker, read.png, read.svg]).toEqual([LINK, LINK, LINK]);
  // The picture's red, beside the white dot in its middle (the dot is about a third of it wide).
  const size = pixel(read.pngBytes, 0, 0).width;
  expect(pixel(read.pngBytes, Math.floor(size / 2) - 60, Math.floor(size / 2)).rgba.slice(0, 3)).toEqual([200, 30, 40]);
});

test("a file that isn't a picture: says so, and nothing else changes", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await openOptions(page);
  await page.locator("#own-image").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("not a picture") });
  await expect(page.locator("#image-problem")).toHaveText("That file isn’t a picture this browser can open.");
  await expect(page.getByRole("button", { name: "None", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(box(page)).toHaveValue(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
});

test("the robin says who it is and counts each code's squares, and stays", async ({ page }) => {
  // A device that chose Keep it plain before it went still holds the choice: the page forgets it.
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("qr-plain", "yes"));
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem("qr-plain"))).toBeNull();
  const robin = page.locator("#robin");
  const bubble = page.locator("#bubble");
  // Before a code, the robin says who it is.
  await expect(robin).toBeVisible();
  await expect(bubble).toHaveText("I’m the robin. I’m here to lighten up your day.");
  // It stands just above the field it lends its look to, and it stays there: a tap, a code, its
  // longer line and the check's answer move neither the robin nor the field under it.
  // Where they are on the page, not in the window: a tap on a phone scrolls the robin into view.
  const at = async () => {
    await robin.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished))); // its hop is over
    return robin.evaluate((element) => {
      const robinBox = element.getBoundingClientRect();
      const fieldBox = document.querySelector(".field-box").getBoundingClientRect();
      return { x: Math.round(robinBox.x), y: Math.round(robinBox.y + scrollY), bottom: Math.round(robinBox.bottom + scrollY), field: Math.round(fieldBox.y + scrollY) };
    });
  };
  const start = await at();
  expect(start.bottom).toBeLessThan(start.field);
  await robin.click();
  await expect(bubble).toBeHidden();
  expect(await at()).toEqual(start);
  await robin.click();
  // It says it checked the code only once the check has read it back: until then, its hello.
  const beforeTheCheck = await page.evaluate((link) => {
    const input = document.getElementById("text");
    input.value = link;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return { line: document.getElementById("bubble").textContent, checked: "verdict" in document.getElementById("status").dataset };
  }, LINK);
  expect(beforeTheCheck).toEqual({ line: "I’m the robin. I’m here to lighten up your day.", checked: false });
  // A version 2 code is 25 modules wide: 625 squares. The line follows without a tap.
  await expect(status(page)).toHaveText("Scans fine.");
  await expect(bubble).toHaveText("I checked all 625 squares: phones can read this code.");
  expect(await at()).toEqual(start);
  const withCode = await at();
  await robin.click();
  expect(await at()).toEqual(withCode);
  await robin.click();

  // It never covers the field, the code, the check or the buttons.
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const what of [".field-box", "#sticker", "#status", ".actions"]) {
    const other = await page.locator(what).boundingBox();
    expect(overlap(await robin.boundingBox(), other), `the robin covers ${what}`).toBe(false);
    expect(overlap(await bubble.boundingBox(), other), `the robin's line covers ${what}`).toBe(false);
  }

  // A bigger code, a bigger number: its own.
  await box(page).fill(`${LINK}/and/a/much/longer/path/to/the/lunch/menu`);
  const size = Number((await page.locator("svg.code").getAttribute("viewBox")).split(" ")[2]);
  const squares = ((size - 8) ** 2).toLocaleString("en-GB");
  expect(squares).not.toBe("625");
  await expect(bubble).toHaveText(`I checked all ${squares} squares: phones can read this code.`);

  // A tap on the robin hides its line, and another brings it back.
  await robin.click();
  await expect(bubble).toBeHidden();
  await box(page).fill(`${LINK}/menu`);
  await expect(bubble).toBeHidden();
  await robin.click();
  await expect(bubble).toBeVisible();

  // The robin stays: there's no Keep it plain to send it away (the maintainer, 11 October 2026).
  await expect(page.getByRole("button", { name: "Keep it plain" })).toHaveCount(0);
  await page.reload();
  await expect(robin).toBeVisible();
  await expect(bubble).toHaveText("I’m the robin. I’m here to lighten up your day.");
});

test("the PNG and the SVG carry 5 cm, more when a code needs it to scan, and the page says how small it can print", async ({ page }) => {
  await page.goto("/");
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  // How small it can print is said under the buttons, without a tap; there's nothing to set.
  await expect(page.locator("#smallest")).toHaveText("At least 2 cm, so phones can read it");
  await expect(page.locator("#smallest")).toBeVisible();
  await expect(page.locator("#measure")).toBeHidden();

  // The PNG says how wide to print it, in pixels per metre: its width over 5 cm.
  const png = (await download(page, "#png")).bytes;
  const at = png.indexOf("pHYs");
  expect(at, "the PNG has no print size").toBeGreaterThan(0);
  const width = png.readUInt32BE(16);
  expect(png.readUInt32BE(at + 4)).toBe(Math.round(width / 0.05));
  expect(png.readUInt32BE(at + 8)).toBe(Math.round(width / 0.05));
  expect(png[at + 12]).toBe(1);
  expect(png.indexOf("pHYs", at + 4), "a second print size").toBe(-1);
  expect(readPng(png)).toBe(LINK);
  expect((await download(page, "#svg")).bytes.toString("utf8")).toContain('width="5cm" height="5cm"');

  // A code too dense to scan at 5 cm is never printed smaller than it scans.
  await box(page).fill("x".repeat(1200));
  await expect(status(page)).toHaveText("Scans fine.");
  await expect(page.locator("#smallest")).toHaveText("At least 9 cm, so phones can read it");
  expect((await download(page, "#svg")).bytes.toString("utf8")).toContain('width="9cm" height="9cm"');
  const dense = (await download(page, "#png")).bytes;
  const denseAt = dense.indexOf("pHYs");
  expect(dense.readUInt32BE(denseAt + 4)).toBe(Math.round(dense.readUInt32BE(16) / 0.09));
});

test("a sheet is picked by how many on a page, with the caption under each code, and stays on the page", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window.print = () => (window.printed = true)));
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  await page.getByRole("button", { name: "Print a sheet" }).click();
  const layout = (count) => page.getByRole("radio", { name: String(count), exact: true });
  const summary = page.locator("#sheet-summary");
  await expect(layout(12)).toBeChecked();
  await expect(summary).toHaveText("Each code is 5 cm wide, on A4 or Letter paper.");
  // Each layout shows its size under its picture.
  const sizes = () => page.locator(".tile-size").allTextContents();
  expect(await sizes()).toEqual(["18 cm", "8.5 cm", "5 cm", "2.5 cm"]);
  for (const [count, cm] of [[1, "18"], [4, "8.5"], [30, "2.5"]]) {
    await page.locator(".tile", { has: layout(count) }).click();
    await expect(summary).toHaveText(`Each code is ${cm} cm wide, on A4 or Letter paper.`);
  }
  // Out of the way, a size of one's own: as many as fit, never smaller than the code scans.
  await page.getByRole("button", { name: "Choose your own size" }).click();
  expect(await page.locator('input[name="layout"]:checked').count()).toBe(0);
  const size = page.locator("#measure-size");
  await expect(size).toHaveText("5 cm wide · 2 in");
  await expect(summary).toHaveText("12 codes, 5 cm wide, on one page");
  await page.getByRole("button", { name: "Bigger" }).click();
  await expect(summary).toHaveText("6 codes, 6 cm wide, on one page");
  const printed = async (count, cm) => {
    await page.getByRole("button", { name: "Print", exact: true }).click();
    await expect(page.locator("#print-sheet .cell")).toHaveCount(count);
    expect(await page.locator("#print-sheet").evaluate((sheet) => sheet.style.gridTemplateColumns)).toMatch(new RegExp(`\\b${cm}cm\\)?$`));
  };
  await printed(6, 6);
  // Or just one, at that size.
  await page.locator(".copy-choice", { has: page.getByRole("radio", { name: "Just one" }) }).click();
  await expect(summary).toHaveText("1 code, 6 cm wide, on one page");
  await printed(1, 6);
  await page.locator(".copy-choice", { has: page.getByRole("radio", { name: "Fill the page" }) }).click();
  const smaller = page.getByRole("button", { name: "Smaller" });
  while (await smaller.isEnabled()) await smaller.click();
  await expect(size).toHaveText("2 cm wide · 0.8 in");
  await expect(summary).toHaveText("48 codes, 2 cm wide, on one page");
  await printed(48, 2);
  // Picking a layout again puts the size away.
  await page.locator(".tile", { has: layout(30) }).click();
  await expect(page.locator("#measure")).toBeHidden();
  await expect(page.getByRole("button", { name: "Choose your own size" })).toBeVisible();

  // A caption takes its room under each code, so the codes get smaller.
  await page.locator("#caption").fill("Scan for the menu");
  await expect(summary).toHaveText("Each code is 2 cm wide, on A4 or Letter paper.");
  expect(await sizes()).toEqual(["18 cm", "8.5 cm", "4.5 cm", "2 cm"]);
  await page.getByRole("button", { name: "Print", exact: true }).click();
  expect(await page.evaluate(() => window.printed)).toBe(true);
  await expect(page.locator("#print-sheet .cell")).toHaveCount(30);
  await expect(page.locator("#print-sheet .cell p").first()).toHaveText("Scan for the menu");
  // What's printed is the same code.
  const svg = await page.locator("#print-sheet .cell svg").first().evaluate((element) => element.outerHTML);
  expect(svg).toContain("<path");

  // A long link makes a denser code: a layout that would print it too small to scan is greyed
  // out, says why, and the one chosen gives way to fewer, bigger codes.
  await box(page).fill(`${LINK}/${"lunch-menu-and-the-wine-list-for-autumn/".repeat(4)}`);
  await expect(status(page)).toHaveText("Scans fine.");
  await expect(layout(30)).toBeDisabled();
  await expect(layout(12)).toBeChecked();
  await expect(summary).toHaveText("Each code is 4.5 cm wide, on A4 or Letter paper. The greyed-out ones would print the code too small to scan.");
  // A size of one's own stops at the smallest size this code scans at, and prints at it.
  await expect(page.locator("#smallest")).toHaveText("At least 4 cm, so phones can read it");
  await page.getByRole("button", { name: "Choose your own size" }).click();
  while (await smaller.isEnabled()) await smaller.click();
  await expect(size).toHaveText("4 cm wide · 1.6 in");
  await expect(summary).toHaveText("12 codes, 4 cm wide, on one page");
  await printed(12, 4);
});

test("every layout, and a size of one's own, prints on one page, A4 or Letter, with a short caption or the longest", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "only Chromium prints to PDF here");
  // Some 60 PDFs, a few hundred milliseconds each: more than the usual 30 seconds.
  test.setTimeout(180_000);
  await page.goto("/");
  await page.evaluate(() => (window.print = () => {}));
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  await page.getByRole("button", { name: "Print a sheet" }).click();
  // With each caption, the layouts greyed out: a long caption takes 30's room, and no more.
  const captions = {
    "": [],
    "Scan for the menu": [],
    "Scan this code for our lunch menu, prices and the wine list!": [30],
    "Speisekarte_und_Weinkarte_für_den_Herbst_2026_hier_scannen": [30],
  };
  for (const [words, greyed] of Object.entries(captions)) {
    await page.locator("#caption").fill(words);
    const off = await page.$$eval('input[name="layout"]', (all) => all.filter((input) => input.disabled).map((input) => Number(input.value)));
    expect(off, `greyed out with "${words}"`).toEqual(greyed);
    for (const count of [1, 4, 12, 30]) {
      const layout = page.getByRole("radio", { name: String(count), exact: true });
      if (greyed.includes(count)) continue;
      await page.locator(".tile", { has: layout }).click();
      await page.getByRole("button", { name: "Print", exact: true }).click();
      await expect(page.locator("#print-sheet .cell")).toHaveCount(count);
      await onePage(`${count}`, words);
    }
    // A size of one's own, at its smallest and at 6 cm: as many as fit, still one page.
    await page.getByRole("button", { name: "Choose your own size" }).click();
    const smaller = page.getByRole("button", { name: "Smaller" });
    while (await smaller.isEnabled()) await smaller.click();
    for (const cm of [2, 6, 18]) {
      while ((await page.locator("#measure-size").textContent()).split(" ")[0] !== String(cm)) await page.getByRole("button", { name: "Bigger" }).click();
      await page.getByRole("button", { name: "Print", exact: true }).click();
      const said = Number((await page.locator("#sheet-summary").textContent()).match(/\d+/)[0]);
      await expect(page.locator("#print-sheet .cell")).toHaveCount(said);
      await onePage(`${cm} cm`, words);
    }
    // And one code alone at 18 cm, the largest.
    await page.locator(".copy-choice", { has: page.getByRole("radio", { name: "Just one" }) }).click();
    await page.getByRole("button", { name: "Print", exact: true }).click();
    await expect(page.locator("#print-sheet .cell")).toHaveCount(1);
    await onePage("one at 18 cm", words);
    await page.locator(".copy-choice", { has: page.getByRole("radio", { name: "Fill the page" }) }).click();
    await page.locator(".tile", { has: page.getByRole("radio", { name: "1", exact: true }) }).click();
  }

  async function onePage(what, words) {
    for (const format of ["A4", "Letter"]) {
      const margin = { top: "1cm", right: "1cm", bottom: "1cm", left: "1cm" }; // as the sheet's @page asks
      const pages = ((await page.pdf({ format, margin })).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages, `${what} on ${format} with "${words}"`).toBe(1);
    }
  }
});

test("a picture dropped on the page goes in the middle of the code", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "dragging a file onto a page is a computer's");
  await page.goto("/");
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  const picture = Array.from(redSquare());
  const drop = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" }));
    return transfer;
  }, picture);
  await page.dispatchEvent("body", "dragover", { dataTransfer: drop });
  await expect(page.locator("#sticker")).toHaveClass(/dropping/);
  await page.dispatchEvent("body", "drop", { dataTransfer: drop });
  await expect(page.locator("#sticker")).not.toHaveClass(/dropping/);
  await expect(page.locator("#own-fill img")).toHaveCount(1);
  await expect(status(page)).toContainText("Scans fine");
});

test("counts go to the page's own address: what was done, never what was typed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the counts are the same in every browser");
  const counts = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/count") counts.push(request.postDataJSON());
  });
  await page.goto("/");
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  await box(page).fill(`${LINK}/2`);
  await expect(status(page)).toHaveText("Scans fine.");
  await download(page, "#png");
  await expect.poll(() => counts.length).toBe(2);
  // One code made a page view, however much is typed after it.
  expect(counts.map((sent) => sent.event)).toEqual(["qr made", "qr taken"]);
  expect(counts[0].props).toEqual({ kind: "link" });
  // No size: nobody chooses the files' size, so it would only hint at how long the text is.
  expect(counts[1].props).toEqual({ how: "png", kind: "link", image: "none", colours: "default", background: "white" });
  // One random id for this page view, the same on each count, and nothing else about anyone.
  const ids = new Set(counts.map((sent) => sent.id));
  expect(ids.size).toBe(1);
  expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(JSON.stringify(counts)).not.toContain("example.com");
  // The next page view has an id of its own: nothing joins two visits.
  await page.reload();
  await box(page).fill(LINK);
  await expect.poll(() => counts.length).toBe(3);
  expect(counts[2].id).not.toBe(counts[0].id);
});

test("without the server code, as on a plain web server, the page works the same: its counts go nowhere", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the same in every browser");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // A plain web server has nothing at /count, and says so.
  await page.route((url) => url.pathname === "/count", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.goto("/");
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  expect(readPng((await download(page, "#png")).bytes)).toBe(LINK);
  expect(errors).toEqual([]);
});

test("on a computer the cursor starts in the box; on a phone the keyboard waits", async ({ page }, testInfo) => {
  await page.goto("/");
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  const focused = await page.evaluate(() => document.activeElement?.id);
  if (testInfo.project.name === "desktop") expect(focused).toBe("text");
  else if (coarse) expect(focused).not.toBe("text");
});

test("the code redraws within 100 ms while typing", async ({ page }) => {
  await page.goto("/");
  const link = `https://example.com/menu?table=12&lang=en&ref=${"x".repeat(200)}`;
  // Each length is drawn three times and its fastest kept: a pause of the test machine's own (a
  // garbage collection, another job) lands on one draw, never on all three. Before each timed draw,
  // another text of the same length is drawn untimed, so the page can't reuse the code it just
  // made: every timed draw encodes the text again. Every length must still redraw within 100 ms.
  const slowest = await page.evaluate((text) => {
    const input = document.getElementById("text");
    let worst = 0;
    for (let length = 1; length <= text.length; length += 7) {
      let fastest = Infinity;
      for (let attempt = 0; attempt < 3; attempt++) {
        input.value = `y${text.slice(1, length)}`;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.value = text.slice(0, length);
        const start = performance.now();
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (!document.querySelector("svg.code")) throw new Error(`no code after ${length} characters`);
        fastest = Math.min(fastest, performance.now() - start);
      }
      worst = Math.max(worst, fastest);
    }
    return worst;
  }, link);
  expect(slowest).toBeLessThan(100);
});

test("Copy puts the picture on the clipboard", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a computer's button; phones get Save or share where they can");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await box(page).fill(LINK);
  await expect(status(page)).toHaveText("Scans fine.");
  await page.locator("#copy").click();
  await expect(page.locator("#copy")).toHaveText("Copied");
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item.getType("image/png");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  expect(readPng(Buffer.from(copied, "base64"))).toBe(LINK);
});
