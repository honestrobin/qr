// The counter's server code, worker/index.js, on its own: what it lets through, and what it stores.
// No browser: these call it the way Cloudflare does.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import worker from "../worker/index.js";
import { BLOBS, COUNTS, DOUBLES, clean } from "../worker/counts.js";

const ID = "3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c";
const TAKEN = { event: "qr taken", id: ID, lang: "hr", props: { how: "png", kind: "link", image: "own", colours: "chosen", background: "see-through", size_cm: 5 } };
const VISITOR = "203.0.113.7";
const COUNT = "https://qr.honestrobin.com/count";

/** Calls the worker as Cloudflare would. Returns its answer, the rows it stored, the keys it asked
 * the limit about, and any request it tried to send anywhere. */
async function call(url, init, { allowed = true } = {}) {
  const stored = [];
  const limited = [];
  const onward = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (to) => {
    onward.push(String(to));
    return new Response(null, { status: 200 });
  };
  try {
    const env = {
      ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
      COUNTS: { writeDataPoint: (point) => stored.push(point) },
      LIMIT: { limit: async ({ key }) => (limited.push(key), { success: allowed }) },
    };
    const response = await worker.fetch(new Request(url, init), env, { waitUntil: () => {} });
    return { response, stored, limited, onward };
  } finally {
    globalThis.fetch = real;
  }
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "no browser here: once is enough");
});

const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("what may be counted is exactly this list: a longer one changes this test too", () => {
  expect(COUNTS).toEqual({
    "qr made": { kind: ["link", "text"] },
    "qr taken": {
      how: ["png", "svg", "copy", "share", "sheet"],
      kind: ["link", "text"],
      image: ["none", "robin", "own"],
      colours: ["default", "chosen"],
      background: ["white", "see-through", "chosen"],
      size_cm: { from: 2, to: 50 },
      codes: { from: 1, to: 200 },
      caption: [true, false],
    },
    "qr fix taken": { fix: ["https", "spaces"] },
    "qr doesnt scan": { why: ["alike", "image", "unreadable"] },
  });
  expect(BLOBS).toEqual(["event", "lang", "kind", "how", "image", "colours", "background", "fix", "why", "caption"]);
  expect(DOUBLES).toEqual(["size_cm", "codes"]);
});

test("a count passes only as listed: names and plain values, never anything typed", () => {
  expect(clean(TAKEN)).toEqual(TAKEN);
  expect(clean({ event: "qr made", id: ID, lang: "en", props: { kind: "text" } })).not.toBeNull();
  expect(clean({ event: "qr fix taken", id: ID, lang: "ja", props: { fix: "https" } })).not.toBeNull();
  // Keep it plain went in 1.5.0, and its count with it.
  expect(clean({ event: "qr kept plain", id: ID, lang: "ja" })).toBeNull();
  const refused = [
    { ...TAKEN, props: { ...TAKEN.props, kind: "https://example.com/menu" } }, // what was typed, as a value
    { ...TAKEN, props: { ...TAKEN.props, link: "https://example.com/menu" } }, // a property not on the list
    { ...TAKEN, props: { ...TAKEN.props, toString: "png" } },
    { ...TAKEN, text: "https://example.com/menu" }, // a field not on the list
    { ...TAKEN, event: "qr typed" },
    { ...TAKEN, event: "toString" },
    { ...TAKEN, event: ["qr taken"] }, // a name in disguise
    { ...TAKEN, id: "visitor-42" },
    { ...TAKEN, lang: "xx" },
    { ...TAKEN, props: { ...TAKEN.props, size_cm: 1 } },
    { ...TAKEN, props: { ...TAKEN.props, size_cm: 5.5 } },
    { ...TAKEN, props: { ...TAKEN.props, size_cm: "5" } },
    { ...TAKEN, props: ["png"] },
    null,
    "qr taken",
  ];
  for (const body of refused) expect(clean(body), JSON.stringify(body)).toBeNull();
});

test("the store gets one row with the count, and nothing of the visitor's: not their address, not their browser", async () => {
  const { response, stored, onward } = await call(COUNT, post(TAKEN, { "CF-Connecting-IP": VISITOR, "X-Forwarded-For": VISITOR, "User-Agent": "A secret browser/1.0" }));
  expect(response.status).toBe(204);
  expect(stored).toEqual([
    {
      indexes: [ID],
      blobs: ["qr taken", "hr", "link", "png", "own", "chosen", "see-through", "", "", ""],
      doubles: [5, 0],
    },
  ]);
  expect(JSON.stringify(stored)).not.toContain(VISITOR);
  expect(JSON.stringify(stored)).not.toContain("secret browser");
  expect(onward).toEqual([]);
});

test("anything not on the list is refused, and nothing is stored or sent", async () => {
  for (const body of [{ ...TAKEN, text: "https://example.com/menu" }, "not json", "x".repeat(2000)]) {
    const { response, stored, onward } = await call(COUNT, post(body));
    expect([400, 413]).toContain(response.status);
    expect(stored).toEqual([]);
    expect(onward).toEqual([]);
  }
  const { response, stored } = await call(COUNT, { method: "GET" });
  expect(response.status).toBe(405);
  expect(stored).toEqual([]);
});

test("past about 60 a minute from one address, counts are refused and nothing is stored", async () => {
  const { response, stored, limited } = await call(COUNT, post(TAKEN, { "CF-Connecting-IP": VISITOR }), { allowed: false });
  expect(response.status).toBe(429);
  expect(stored).toEqual([]);
  // The address is asked about, and goes no further.
  expect(limited).toEqual([VISITOR]);
  // The machine itself, which only happens when QR runs locally, as the checks do, isn't limited.
  for (const here of ["127.0.0.1", "::1"]) {
    const local = await call(COUNT, post(TAKEN, { "CF-Connecting-IP": here }), { allowed: false });
    expect(local.response.status).toBe(204);
    expect(local.limited).toEqual([]);
  }
});

test("live, the counts go to QR's own store, about 60 a minute from one address, with no log; run locally, nowhere", () => {
  // The whole of Cloudflare's settings, so nothing new (a log, a key, another binding) slips in
  // unseen. Locally, wrangler's stand-in for the store keeps nothing, and this binding takes no
  // setting that would make it reach the real one: the leak that once sent the checks' counts out
  // can't happen this way.
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const config = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  expect(config).toEqual({
    name: "honestrobin-qr",
    compatibility_date: "2026-10-01",
    workers_dev: false,
    preview_urls: false,
    routes: [{ pattern: "qr.honestrobin.com", custom_domain: true }],
    main: "worker/index.js",
    assets: { directory: ".", binding: "ASSETS", not_found_handling: "404-page", run_worker_first: ["/count"] },
    analytics_engine_datasets: [{ binding: "COUNTS", dataset: "qr_counts" }],
    ratelimits: [{ name: "LIMIT", namespace_id: "1101", simple: { limit: 60, period: 60 } }],
    observability: { enabled: false },
  });
});

test("every other address is the page's own files", async () => {
  const { response, stored, onward } = await call("https://qr.honestrobin.com/", { method: "GET" });
  expect(await response.text()).toBe("asset");
  expect(stored).toEqual([]);
  expect(onward).toEqual([]);
});
