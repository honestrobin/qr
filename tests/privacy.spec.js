// "We never see what you type": the promise, checked by watching every request the page
// makes while someone uses all of it, with Cloudflare's visit counter added exactly as Cloudflare
// adds it on qr.honestrobin.com. The counter's requests may leave; nothing typed and no part of a chosen
// image is in any of them, nor in the page's address, its storage or its cookies. Then the page
// is used with the network off, and a copy at another address is checked for sending us nothing.
import { expect, test } from "@playwright/test";
import { download, openOptions, readPng, redSquare } from "./helpers.js";
import { clean } from "../worker/counts.js";

test.use({ reducedMotion: "reduce" });

// Unusual enough that it can't turn up in a request by chance.
const SECRET = "https://example.com/menu-7f3a9c2e";
const COUNTER = "https://cloudflareinsights.com";
const COUNTER_SCRIPT = "https://static.cloudflareinsights.com/";

/** Every way something could be written into a request: as it is, encoded, or as base64. */
function forms(text) {
  return [text, encodeURIComponent(text), Buffer.from(text).toString("base64")];
}
const secretForms = [...forms(SECRET), "menu-7f3a9c2e"];

/** Pieces of a picture's base64 long enough that they can only come from that picture. */
function slices(base64) {
  const found = [];
  for (let at = 0; at + 64 <= base64.length && found.length < 8; at += Math.max(64, Math.floor(base64.length / 8)))
    found.push(base64.slice(at, at + 64));
  return found;
}

/** A checker for one test: the secret, and the chosen image once there is one. */
function watchFor() {
  const looking = [...secretForms, ...slices(redSquare().toString("base64"))];
  return {
    addPicture: (dataUrl) => looking.push(...slices(dataUrl.split(",")[1] || "")),
    carries: (text) => !!text && looking.some((form) => text.includes(form)),
    carriesBytes(buffer) {
      return !!buffer && (this.carries(buffer.toString("utf8")) || this.carries(buffer.toString("latin1")) || this.carries(buffer.toString("base64")));
    },
  };
}

// The counter exactly as Cloudflare adds it to every page of qr.honestrobin.com (Web Analytics'
// automatic setup for honestrobin.com, seen live on 11 October 2026), with a stand-in token. QR's
// own files have no counter: Cloudflare adds it at its edge, so a copy anywhere else has none.
const CLOUDFLARE_TAG =
  '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/v4bc70e2c01a94c73b74392e4234840661791215815920" integrity="sha512-L0ha0OXavK/8okipN9F8BtP84dg9DUhPERbBXzwI6dgTA55d2+yweo3pn5CSFYs45/r8md2+xvUPtTdvTNRfjA==" data-cf-beacon=\'{"version":"2024.11.0","token": "00000000000000000000000000000000","r":1,"spa":2}\' crossorigin="anonymous"></script>';

/** Adds the counter to every page, as Cloudflare does live, and catches its reports instead of
 * letting them reach Cloudflare. Returns what the counter did, for when it reports nothing. */
async function countHere(page, sent) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.resourceType() !== "document" || !["127.0.0.1", "localhost"].includes(new URL(request.url()).hostname))
      return route.fallback();
    const response = await route.fetch();
    const body = (await response.text()).replace("</body>", `${CLOUDFLARE_TAG}</body>`);
    return route.fulfill({ response, body });
  });
  // Cloudflare's counter reports to cloudflareinsights.com, or to /cdn-cgi/rum on the page's own
  // address, where Cloudflare answers: both are Cloudflare's, and both are read here.
  const report = (route) => {
    sent.push(route.request().postDataBuffer() || Buffer.alloc(0));
    return route.fulfill({ status: 204 });
  };
  await page.route(`${COUNTER}/**`, report);
  await page.route("**/cdn-cgi/rum**", report);
  const seen = [];
  page.on("request", (request) => {
    if (/cloudflareinsights|cdn-cgi/.test(request.url())) seen.push(`${request.method()} ${request.url()}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") seen.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => seen.push(`script error: ${error.message}`));
  return seen;
}

/** What leaving or hiding the page does, as far as the counter can tell: it reports then. */
async function hide(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  });
  await page.waitForTimeout(1000);
}

/** Uses everything on the page that touches what's typed or the chosen image. */
async function useEverything(page, watch, testInfo) {
  if (testInfo.project.name !== "iphone") {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate((text) => navigator.clipboard.writeText(text), SECRET);
    await page.locator("#paste").click();
  } else {
    await page.locator("#text").fill(SECRET);
  }
  await expect(page.locator("#text")).toHaveValue(SECRET);
  await expect(page.locator("#status")).toHaveText("Scans fine.");
  await page.locator("#robin").click();
  await openOptions(page);
  await page.locator("#fg").getByRole("button", { name: "Forest", exact: true }).click();
  await page.locator("#bg").getByRole("button", { name: "See-through", exact: true }).click();
  await page.getByRole("button", { name: "Robin", exact: true }).click();
  await page.locator("#own-image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: redSquare() });
  watch.addPicture(await page.locator("#own-fill img").getAttribute("src"));
  await expect(page.locator("#status")).toContainText("Scans fine");
  expect(readPng((await download(page, "#png")).bytes)).toBe(SECRET);
  await download(page, "#svg");
  if (testInfo.project.name === "desktop") {
    await page.locator("#copy").click();
    await expect(page.locator("#copy")).toHaveText("Copied");
  }
  await page.locator("#text").fill(`${SECRET} `);
  await page.getByRole("button", { name: "Remove the spaces" }).click();
  await expect(page.locator("#text")).toHaveValue(SECRET);
  // A sheet with what's typed as its caption: printed by the browser, sent nowhere.
  await page.evaluate(() => (window.print = () => {}));
  await page.getByRole("button", { name: "Print a sheet" }).click();
  await page.locator("#caption").fill(SECRET);
  await page.getByRole("button", { name: "Print", exact: true }).click();
  // And at a size of one's own.
  await page.getByRole("button", { name: "Choose your own size" }).click();
  await page.getByRole("button", { name: "Bigger" }).click();
  await page.getByRole("button", { name: "Print", exact: true }).click();
}

/** Everything the page keeps in this browser: storage of every kind, and cookies. */
async function kept(page) {
  const inPage = await page.evaluate(async () => {
    const stored = [];
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i++) stored.push([store.key(i), store.getItem(store.key(i))]);
    const databases = indexedDB.databases ? (await indexedDB.databases()).map((database) => database.name) : [];
    const caches = self.caches ? await self.caches.keys() : [];
    return { stored, databases, caches };
  });
  return { ...inPage, cookies: await page.context().cookies() };
}

test("nothing typed leaves the page, even with Cloudflare's visit counter on it", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the requests are the same in every browser");
  const watch = watchFor();
  const sent = [];
  const seen = await countHere(page, sent);

  const afterLoad = [];
  let loaded = false;
  page.on("request", (request) => {
    if (loaded) afterLoad.push(request);
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  loaded = true;
  const reportsAtLoad = sent.length;

  await useEverything(page, watch, testInfo);
  // The counter reports again when the page is hidden or left: that report is the one that
  // could carry what was typed, so it has to be read.
  await hide(page);
  expect(sent.length, `the counter sent no report after the page was used, so nothing was checked. It did: ${seen.join(" | ") || "nothing"}`).toBeGreaterThan(reportsAtLoad);
  // Switching language leaves the page: the new address must not carry what was typed either.
  await page.locator("#language").click();
  await page.locator("#language-list").getByRole("link", { name: "Deutsch", exact: true }).click();
  await expect(page).toHaveURL(/\/de\/$/);
  expect(watch.carries(page.url())).toBe(false);
  await page.goto("about:blank");

  const origin = new URL(baseURL).origin;
  const problems = [];
  const counts = [];
  for (const request of afterLoad) {
    const url = request.url();
    if (url.startsWith("blob:") || url.startsWith("data:") || url === "about:blank") continue;
    if (watch.carries(url) || watch.carriesBytes(request.postDataBuffer())) problems.push(`carries what was typed or chosen: ${request.method()} ${url}`);
    const allowed = url.startsWith(`${origin}/`) || url.startsWith(`${COUNTER}/`) || url.startsWith(COUNTER_SCRIPT);
    if (!allowed) problems.push(`went somewhere else: ${url}`);
    const counterHere = url.startsWith(`${origin}/cdn-cgi/rum`);
    // Our own counts go to /count, and each must be one on worker/counts.js's list, exactly.
    const ours = url === `${origin}/count` && request.method() === "POST";
    if (ours) {
      let count = null;
      try {
        count = clean(JSON.parse(request.postData() || ""));
      } catch {
        count = null;
      }
      if (!count) problems.push(`a count that isn't on the list: ${request.postData()}`);
      else counts.push(count.event);
    }
    if (url.startsWith(`${origin}/`) && request.method() !== "GET" && !counterHere && !ours) problems.push(`sent something to this site: ${request.method()} ${url}`);
  }
  // The counts were sent, and read: a code made, and taken in every way that was used.
  expect(counts).toContain("qr made");
  expect(counts).toContain("qr taken");
  for (const body of sent) if (watch.carriesBytes(body)) problems.push(`the visit counter carried what was typed or chosen: ${body.toString("utf8").slice(0, 200)}`);
  expect(problems).toEqual([]);
});

test("what's typed is never put in the page's address or kept in the browser", async ({ page }, testInfo) => {
  const watch = watchFor();
  const sent = [];
  await countHere(page, sent);
  await page.goto("/");
  await useEverything(page, watch, testInfo);
  expect(watch.carries(page.url())).toBe(false);
  const found = await kept(page);
  // The page keeps one thing, and only after someone chooses it: the language they picked.
  expect(found.stored.filter(([key]) => key !== "qr-language")).toEqual([]);
  expect(found.stored.filter(([, value]) => watch.carries(value))).toEqual([]);
  expect(found.databases).toEqual([]);
  expect(found.caches).toEqual([]);
  expect(found.cookies).toEqual([]);
});

test("the counter counts the visit and nothing more: no cookies, nothing stored, nothing typed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the requests are the same in every browser");
  const watch = watchFor();
  const sent = [];
  const seen = await countHere(page, sent);
  // A browser that asks not to be tracked is counted like any other: counting isn't tracking.
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true }));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("#text").fill(SECRET);
  await expect(page.locator("#status")).toHaveText("Scans fine.");
  await hide(page);
  expect(sent.length, `the counter didn't count the visit. It did: ${seen.join(" | ") || "nothing"}`).toBeGreaterThan(0);
  for (const body of sent) expect(watch.carriesBytes(body), body.toString("utf8").slice(0, 200)).toBe(false);
  const found = await kept(page);
  expect(found.stored).toEqual([]);
  expect(found.databases).toEqual([]);
  expect(found.caches).toEqual([]);
  expect(found.cookies).toEqual([]);
});

test("a copy of QR served anywhere else sends us nothing: its files have no counter", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the requests are the same in every browser");
  const outside = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && !["127.0.0.1", "localhost"].includes(url.hostname)) outside.push(request.url());
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator("#text").fill(SECRET);
  await expect(page.locator("#status")).toHaveText("Scans fine.");
  await hide(page);
  expect(outside).toEqual([]);
  expect(await page.locator("script[src*='cloudflareinsights']").count()).toBe(0);
});

test("once loaded, it works with the network off", async ({ page, context }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.locator("#text").fill(SECRET);
  await expect(page.locator("#status")).toHaveText("Scans fine.");
  await openOptions(page);
  await page.getByRole("button", { name: "Robin", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Scans fine.");
  expect(readPng((await download(page, "#png")).bytes)).toBe(SECRET);
  expect((await download(page, "#svg")).name).toBe("qr-example.com-menu-7f3a9c2e.svg");
  // A letter beyond plain English, typed offline, needs nothing from the network either.
  await page.locator("#text").fill(`${SECRET}?č=ł`);
  await expect(page.locator("#status")).toHaveText("Scans fine.");
  await context.setOffline(false);
});
