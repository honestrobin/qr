// Honest Robin: QR's one piece of server code. Everything else is plain files. It answers /count
// only: it keeps to the list in counts.js and writes what's on it to Cloudflare's own store. It
// sends nothing anywhere else.
import { MOST_BYTES, clean, row } from "./counts.js";

// The machine itself: only when QR runs locally, as the checks run it. Live, Cloudflare always
// gives the visitor's own address.
const HERE = /^(127\.|::1$)/;

async function receive(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (Number(request.headers.get("Content-Length")) > MOST_BYTES) return new Response(null, { status: 413 });
  const text = await request.text();
  if (text.length > MOST_BYTES) return new Response(null, { status: 413 });
  // About 60 counts a minute from one address, so nobody can flood the store. Cloudflare's limiter
  // is approximate and counts in each of its locations apart. The address is used only to apply
  // the limit: the row below doesn't have it.
  const address = request.headers.get("CF-Connecting-IP") ?? "";
  if (!HERE.test(address) && !(await env.LIMIT.limit({ key: address })).success) return new Response(null, { status: 429 });
  let count = null;
  try {
    count = clean(JSON.parse(text));
  } catch {
    count = null;
  }
  if (!count) return new Response(null, { status: 400 });
  env.COUNTS.writeDataPoint(row(count));
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === "/count") return receive(request, env);
    return env.ASSETS.fetch(request);
  },
};
