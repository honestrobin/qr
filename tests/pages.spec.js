// Every page loads cleanly, fits the screen, can be used by everyone, and links only to places
// that exist; files that aren't part of the tool aren't served. Adapted from honestrobin.com's.
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { openOptions } from "./helpers.js";

const LANGUAGES = ["es", "pt", "fr", "de", "it", "nl", "pl", "hr", "tr", "id", "ja", "ko"];
const pages = [
  { name: "English", path: "/", status: 200 },
  ...LANGUAGES.map((code) => ({ name: code, path: `/${code}/`, status: 200 })),
  { name: "404", path: "/no/such/page", status: 404 },
];
// The security policy, exactly as _headers sets it: a new address in it fails here until this
// test and the ledger's list of companies change with it.
const POLICY = readFileSync(new URL("../public/_headers", import.meta.url), "utf8")
  .split("\n")
  .find((line) => line.trim().startsWith("Content-Security-Policy:"))
  .split("Content-Security-Policy:")[1]
  .trim();
const EXPECTED_POLICY =
  "default-src 'none'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Collects everything that went wrong while a page loaded. */
function watch(page, baseURL) {
  const origin = new URL(baseURL).origin;
  const problems = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/^Failed to load resource: the server responded with a status of/.test(message.text())) return;
    problems.push(`console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`script error: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`failed to load: ${request.url()} (${request.failure()?.errorText})`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.request().resourceType() !== "document")
      problems.push(`${response.status()}: ${response.url()}`);
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin) problems.push(`loaded from another site: ${request.url()}`);
  });
  return problems;
}

const recordBlocked = () => {
  window.blocked = [];
  document.addEventListener("securitypolicyviolation", (event) =>
    window.blocked.push(`blocked by the security policy: ${event.violatedDirective} ${event.blockedURI}`),
  );
};

// Visible elements that reach past the edge of the screen. The page hides sideways overflow, so
// the page's width alone would never show it.
const pastTheEdge = () => {
  const width = document.documentElement.clientWidth;
  const past = (element) => {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden") return false;
    return box.right > width + 1 || box.left < -1;
  };
  const found = [];
  for (const element of document.body.querySelectorAll("*")) {
    if (element.closest("svg") !== null && element.tagName.toLowerCase() !== "svg") continue;
    if (!past(element)) continue;
    if (element.parentElement && past(element.parentElement)) continue;
    const box = element.getBoundingClientRect();
    const name = element.tagName.toLowerCase() + (typeof element.className === "string" && element.className ? `.${element.className.trim().split(/\s+/).join(".")}` : "");
    const text = (element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    found.push(`${name} "${text}" spans ${Math.round(box.left)} to ${Math.round(box.right)} on a ${width}px screen`);
  }
  return found;
};

/** The page with a code, the options open and the language list open: everything showing. */
async function showEverything(page) {
  await page.locator("#text").fill("https://example.com/a-fairly-long-link/to/the/menu?table=12");
  await expect(page.locator("#status")).not.toBeEmpty();
  await expect(page.locator("#bubble")).toBeVisible();
  await openOptions(page);
  await page.locator("#language").click();
}

for (const { name, path, status } of pages) {
  test.describe(`${name} page`, () => {
    test("loads cleanly, with the security headers", async ({ page, baseURL }) => {
      const problems = watch(page, baseURL);
      await page.addInitScript(recordBlocked);
      const response = await page.goto(path);
      expect(response.status()).toBe(status);
      expect(new URL(page.url()).pathname).toBe(path);
      const headers = response.headers();
      expect(POLICY).toBe(EXPECTED_POLICY);
      expect(headers["content-security-policy"]).toBe(EXPECTED_POLICY);
      expect(headers["x-content-type-options"]).toBe("nosniff");
      await page.waitForLoadState("networkidle");
      if (status === 200) await showEverything(page);
      problems.push(...(await page.evaluate(() => window.blocked)));
      expect(problems).toEqual([]);
    });
  });
}

// The layout and accessibility checks run on English and on the languages whose words are longest
// or written differently; the others share their layout.
for (const path of ["/", "/de/", "/pl/", "/ja/", "/ko/", "/no/such/page"]) {
  test.describe(`${path}`, () => {
    test("fits the screen, with everything showing", async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const widths = testInfo.project.name === "desktop" ? [360, 390, 768, 1024, 1280, 1600] : [page.viewportSize().width];
      await page.goto(path);
      if (path !== "/no/such/page") await showEverything(page);
      for (const width of widths) {
        if (testInfo.project.name === "desktop") await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(pastTheEdge), `at ${width}px`).toEqual([]);
      }
    });

    test("has no serious accessibility problems", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(path);
      const check = async (when) => {
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        return violations
          .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
          .map((violation) => `${when}: ${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).slice(0, 5).join(", ")})`);
      };
      const serious = await check("arriving");
      if (path !== "/no/such/page") {
        await showEverything(page);
        serious.push(...(await check("in use")));
      }
      expect(serious).toEqual([]);
    });
  });
}

test.describe("the whole tool", () => {
  test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== "desktop", "the same in every browser"));

  test("every link leads somewhere", async ({ page, request, baseURL }) => {
    test.setTimeout(180_000);
    const warn = (description) => {
      test.info().annotations.push({ type: "warning", description });
      console.log(`::warning::${description}`);
    };
    const origin = new URL(baseURL).origin;
    const found = new Map();
    for (const { path } of pages) {
      await page.goto(path);
      const addresses = await page.evaluate(() =>
        [...document.querySelectorAll("a[href], link[href], img[src], script[src]")].map((element) => element.href || element.src),
      );
      for (const address of addresses) if (!found.has(address)) found.set(address, path);
    }
    const broken = [];
    for (const [address, on] of found) {
      const url = new URL(address);
      if (url.origin === origin) {
        const response = await request.get(url.pathname, { maxRedirects: 0 });
        if (response.status() !== 200) broken.push(`${url.pathname} on ${on}: ${response.status()}`);
        continue;
      }
      // The canonical and alternate addresses are the live site's own, served from this folder.
      if (url.origin === "https://qr.honestrobin.com") {
        const response = await request.get(url.pathname, { maxRedirects: 0 });
        if (response.status() !== 200) broken.push(`${address} on ${on}: ${response.status()} here`);
        continue;
      }
      let status = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          status = (await request.get(address, { timeout: 20_000, maxRedirects: 5 })).status();
        } catch {
          status = 0;
        }
        if (status && status < 400) break;
        if (status !== 429 && status < 500 && status !== 0) break;
        await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
      }
      const problem = `${address} on ${on}: ${status || "no answer"}`;
      if (status === 429 || status === 0 || status >= 500) warn(`${problem} (didn't answer)`);
      else if (status >= 400) process.env.OUTSIDE_LINKS === "warn" ? warn(problem) : broken.push(problem);
    }
    expect(broken).toEqual([]);
  });

  test("files that aren't part of the tool aren't served", async ({ request }) => {
    const notServed = [
      "/README.md",
      "/CONTRIBUTING.md",
      "/PROMISES.md",
      "/CHANGELOG.md",
      "/CLAUDE.md",
      "/wrangler.jsonc",
      "/.assetsignore",
      "/.gitignore",
      "/.git/config",
      "/.github/workflows/deploy.yml",
      "/tools/pages.py",
      "/tools/page.html",
      "/words/en.json",
      "/docs/releases/1.0.0.md",
      "/tests/package.json",
      "/tests/playwright.config.js",
      "/tools/cards.py",
      "/assets/vendor/README.md",
      "/public/index.html",
    ];
    const served = [];
    for (const path of notServed) {
      const response = await request.get(path, { maxRedirects: 0 });
      if (response.status() === 200) served.push(path);
    }
    expect(served).toEqual([]);
  });

  test("every language has its title, description, preview card, structured data and questions", async ({ page, request }) => {
    for (const code of ["en", ...LANGUAGES]) {
      const path = code === "en" ? "/" : `/${code}/`;
      const address = `https://qr.honestrobin.com${path}`;
      await page.goto(path);
      const head = await page.evaluate(() => {
        const meta = (selector) => document.querySelector(selector)?.getAttribute("content") ?? null;
        return {
          title: document.title,
          description: meta('meta[name="description"]'),
          ogTitle: meta('meta[property="og:title"]'),
          ogDescription: meta('meta[property="og:description"]'),
          ogUrl: meta('meta[property="og:url"]'),
          ogImage: meta('meta[property="og:image"]'),
          ogImageAlt: meta('meta[property="og:image:alt"]'),
          twitterCard: meta('meta[name="twitter:card"]'),
          structured: [...document.querySelectorAll('script[type="application/ld+json"]')].map((script) => script.textContent),
          questions: [...document.querySelectorAll(".answer")].map((answer) => [
            answer.querySelector("h3")?.textContent.trim() ?? "",
            answer.querySelector("p")?.textContent.trim() ?? "",
          ]),
        };
      });
      expect(head.title, code).toMatch(/ · Honest Robin$/);
      // Search engines cut a description at about 160 characters.
      expect(head.description?.length ?? 0, code).toBeGreaterThan(40);
      expect(head.description.length, code).toBeLessThanOrEqual(160);
      expect([head.ogTitle, head.ogDescription, head.ogUrl], code).toEqual([head.title, head.description, address]);
      expect(head.ogImage, code).toBe(`https://qr.honestrobin.com/assets/cards/${code}.png`);
      expect(head.ogImageAlt, code).toBeTruthy();
      expect(head.twitterCard, code).toBe("summary_large_image");

      // The card is served, and is the size the tags say: a PNG's width and height are bytes 16 to 24.
      const card = await request.get(new URL(head.ogImage).pathname);
      expect(card.status(), code).toBe(200);
      expect(card.headers()["content-type"], code).toBe("image/png");
      const bytes = await card.body();
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], code).toEqual([1200, 630]);

      expect(head.structured, code).toHaveLength(1);
      const data = JSON.parse(head.structured[0]);
      expect(data, code).toMatchObject({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Honest Robin QR",
        url: address,
        inLanguage: code,
        description: head.description,
        image: head.ogImage,
        isAccessibleForFree: true,
        offers: { price: "0" },
      });

      expect(head.questions, code).toHaveLength(6);
      for (const [question, answer] of head.questions) {
        expect(question, code).toBeTruthy();
        expect(answer, code).toBeTruthy();
      }
    }
  });

  test("every page is what tools/pages.py writes, with the same parts in every language", async ({ page }) => {
    const shape = () =>
      [...document.querySelectorAll("[id], button, input, a, label, fieldset")]
        .filter((element) => !element.closest("#also")) // the offer of another language differs by page
        .map((element) => `${element.tagName}#${element.id}.${element.className}`);
    await page.goto("/");
    const english = await page.evaluate(shape);
    for (const code of LANGUAGES) {
      await page.goto(`/${code}/`);
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(page.url().split("/").at(-2));
      expect(await page.evaluate(shape), code).toEqual(english);
    }
  });
});
