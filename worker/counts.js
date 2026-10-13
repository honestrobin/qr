// What QR may count, and what is stored: the list worker/index.js keeps to. Only what's listed in
// COUNTS gets through: an event's name, a few plain values chosen from short lists, the page's
// language, and a random id for that one page view. Anything else is refused, so nothing typed can
// pass. What gets through is written to Cloudflare's own store (Workers Analytics Engine) in the
// columns below, and nothing else is: not the visitor's address, not their browser. A copy of QR
// deployed anywhere else writes to its own Cloudflare account's store, never to ours.
// (A Worker's main file may export only its handler, so the list lives here, where the tests can
// read it too.)

const LANGUAGES = ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "hr", "tr", "id", "ja", "ko"];
const KIND = ["link", "text"];
export const MOST_BYTES = 1000;

/** Every count the page may send, and the values each of its properties may take. */
export const COUNTS = {
  // The first code on a page view.
  "qr made": { kind: KIND },
  // A code taken away, and how.
  "qr taken": {
    how: ["png", "svg", "copy", "share", "sheet"],
    kind: KIND,
    image: ["none", "robin", "own"],
    colours: ["default", "chosen"],
    background: ["white", "see-through", "chosen"],
    size_cm: { from: 2, to: 50 },
    codes: { from: 1, to: 200 },
    caption: [true, false],
  },
  // A suggested fix, taken.
  "qr fix taken": { fix: ["https", "spaces"] },
  // The check said a code doesn't scan, and why.
  "qr doesnt scan": { why: ["alike", "image", "unreadable"] },
};

// The store's columns, in order: its rows have numbered columns, not names. To read them,
// blob1 is the event, blob2 the language, and so on; index1 is the page view's random id.
// A new column goes at the end, so older rows keep their meaning.
export const BLOBS = ["event", "lang", "kind", "how", "image", "colours", "background", "fix", "why", "caption"];
export const DOUBLES = ["size_cm", "codes"];

const VIEW = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The count as it may be stored, or null when anything in it isn't on the list. */
export function clean(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { event, id, lang, props = {}, ...more } = body;
  if (Object.keys(more).length || typeof event !== "string" || !Object.hasOwn(COUNTS, event)) return null;
  if (typeof id !== "string" || !VIEW.test(id) || !LANGUAGES.includes(lang)) return null;
  if (!props || typeof props !== "object" || Array.isArray(props)) return null;
  const allowed = COUNTS[event];
  for (const [key, value] of Object.entries(props)) {
    if (!Object.hasOwn(allowed, key)) return null;
    const rule = allowed[key];
    const fits = Array.isArray(rule) ? rule.includes(value) : Number.isInteger(value) && value >= rule.from && value <= rule.to;
    if (!fits) return null;
  }
  return { event, id, lang, props: { ...props } };
}

/** The one row a count becomes in the store: its values in the columns above, and nothing more. */
export function row(count) {
  const values = { event: count.event, lang: count.lang, ...count.props };
  return {
    indexes: [count.id],
    blobs: BLOBS.map((name) => (name in values ? String(values[name]) : "")),
    doubles: DOUBLES.map((name) => values[name] ?? 0),
  };
}
