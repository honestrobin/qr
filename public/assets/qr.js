// Honest Robin: QR. Makes a code from what's typed, as it's typed; reads the finished picture back
// the way a phone camera would, and says whether it scans; hands it over as PNG or SVG.
// Everything happens on this page. What's typed is never sent anywhere and never put in the page's
// address, so nothing can carry it away (tests/privacy.spec.js checks every request).
// The code is drawn by qrcode-generator and read back by jsQR (assets/vendor/README.md).
"use strict";

(() => {
  // Every word the script shows is in the page, in its language (written from words/<language>.json).
  const say = JSON.parse(document.getElementById("words").textContent);
  const number = new Intl.NumberFormat(say.lang).format;
  const MOST = 2900; // about how many plain characters one code holds (2,953 at the lowest error correction)

  const plural = new Intl.PluralRules(say.lang);

  /** A string with its {placeholders} filled in. */
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key]);

  /** The words for a number, where a language says "1 znak", "3 znaka" and "5 znakova". */
  const forCount = (words, n) => (typeof words === "string" ? words : words[plural.select(n)] ?? words.other);

  /** A string as nodes: [brackets] in bold, and {placeholders} filled with words or elements. */
  function rich(text, values = {}) {
    return text
      .split(/(\[[^\]]+\]|\{\w+\})/)
      .filter(Boolean)
      .map((part) => {
        if (part.startsWith("[") && part.endsWith("]")) return h("strong", {}, part.slice(1, -1));
        if (/^\{\w+\}$/.test(part)) return values[part.slice(1, -1)];
        return part;
      });
  }

  const INK = "#1c2b25";
  const WHITE = "#ffffff";
  const CLEAR = "transparent";
  const MARGIN = 4; // the quiet zone around a code that the standard asks for, in modules
  const PNG_WIDTH = 1024; // the PNG is at least this wide, in whole pixels per module
  const CHECK_AFTER = 250; // ms after the last change, so the check doesn't run on every key

  const $ = (id) => document.getElementById(id);
  const input = $("text");
  const sticker = $("sticker");
  const empty = $("empty"); // the faded shape that waits for a code
  const inside = $("inside");
  const advice = $("advice");
  const status = $("status");
  const smallest = $("smallest");
  const robin = $("robin");
  const bubble = $("bubble");
  const take = { copy: $("copy"), share: $("share"), png: $("png"), svg: $("svg") };
  const finePointer = matchMedia("(pointer: fine)").matches;

  const state = { fg: INK, bg: WHITE, image: "none", own: null };
  let robinPicture = null; // the robin for the middle of a code: { url, img }
  let pictures = 0; // each picture chosen gets its own number, so a check never hands over an older one
  let shown = null; // the code on the sticker
  let checkTimer = 0;
  let checkRun = 0;
  let adviceKey = "";

  /** Builds an element: h("button", { className: "fix", onclick }, "Add https://"). */
  function h(tag, props, ...children) {
    const element = Object.assign(document.createElement(tag), props);
    element.append(...children.filter((child) => child !== null && child !== undefined));
    return element;
  }

  // ---- Counts: what's done on this page, never what's in it ----

  // Sent to this page's own address, where worker/index.js stores only what worker/counts.js
  // lists. The id is random, made for this one page view, and goes with its counts: the page keeps
  // it nowhere, and it's gone when the page closes. Nothing counted happens as the page closes, so
  // no count needs to outlive it.
  const VIEW = crypto.randomUUID
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  const counted = new Set(); // what's counted once a page view
  function count(event, props = {}, once = "") {
    if (once && counted.has(once)) return;
    if (once) counted.add(once);
    fetch("/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, id: VIEW, lang: say.lang, props }),
    })
      // The answer is empty, but Chrome counts an answer left unread as a failed request.
      .then((answer) => answer.text())
      .catch(() => {});
  }

  // ---- What's typed ----

  const LINK = /^(https?:\/\/|mailto:|tel:|sms:|smsto:|geo:)\S/i;
  const PHONES_KNOW = /^(WIFI:|BEGIN:VCARD|BEGIN:VEVENT|MECARD:|MATMSG:)/i; // not text, not a link either
  const DOMAIN = /^(www\.)?[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.\p{L}{2,}(:\d+)?([/?#]\S*)?$/u;

  /** What one tap could fix, if what's typed looks like a mistake. Nothing changes without the tap. */
  function suggestion(text) {
    const core = text.trim();
    const linkish = LINK.test(core) || DOMAIN.test(core);
    if (core !== text && linkish) return { words: say.spaces, button: say.spacesButton, fixed: core };
    if (!LINK.test(text) && DOMAIN.test(text)) return { words: say.addHttps, button: say.addHttpsButton, fixed: `https://${text}` };
    return null;
  }

  const kindOf = (text) => (LINK.test(text) ? "link" : "text");

  const short = (text) => {
    const chars = [...text.trim()];
    return chars.length > 60 ? `${chars.slice(0, 59).join("")}…` : chars.join("");
  };

  // ---- The code ----

  /** The smallest code that holds the text, trying each error correction level in turn. */
  function encode(text, levels) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    for (const level of levels) {
      try {
        const qr = qrcode(0, level);
        qr.addData(text, "Byte");
        qr.make();
        return { qr, n: qr.getModuleCount(), level };
      } catch {
        // Too long at this level: try the next.
      }
    }
    return null;
  }

  let encoded = { key: null };
  /** The code for the text, with room in the middle when there's an image, and what went wrong. */
  function make(text) {
    const withImage = state.image !== "none";
    const key = `${withImage}\n${text}`;
    if (encoded.key === key) return encoded;
    let result;
    if (!text) result = { kind: "empty" };
    else {
      const plain = encode(text, ["M", "L"]);
      const strong = plain && withImage ? encode(text, ["H"]) : null;
      if (!plain) result = { kind: "too-long" };
      else if (withImage && !strong) result = { kind: "code", code: plain, tooLongForImage: true };
      else result = { kind: "code", code: strong || plain, roomForImage: withImage };
    }
    encoded = { key, ...result };
    return encoded;
  }

  /** The square in the middle the image sits on, in modules: an odd number wide, so it's centred. */
  function padFor(n) {
    let width = Math.round(n * 0.26);
    if (width % 2 === 0) width += 1;
    return { at: (n - width) / 2, width };
  }

  /** Everything that decides how the code looks: the PNG, the SVG and the sticker all come from it. */
  function look(text, made) {
    const { qr, n } = made.code;
    const image = made.roomForImage ? (state.image === "own" ? state.own : robinPicture) : null;
    const pad = made.roomForImage ? padFor(n) : null;
    const dark = (row, col) =>
      qr.isDark(row, col) && !(pad && row >= pad.at && row < pad.at + pad.width && col >= pad.at && col < pad.at + pad.width);
    return {
      text,
      n,
      size: n + 2 * MARGIN,
      dark,
      pad,
      image,
      waitingForImage: made.roomForImage && !image,
      fg: state.fg,
      bg: state.bg,
      key: [text, state.fg, state.bg, state.image, state.image === "own" && state.own ? state.own.id : 0].join("\n"),
    };
  }

  /** Runs of dark modules, row by row: [row, from, to]. */
  function runs(code) {
    const found = [];
    for (let row = 0; row < code.n; row++) {
      let col = 0;
      while (col < code.n) {
        if (!code.dark(row, col)) {
          col++;
          continue;
        }
        const from = col;
        while (col < code.n && code.dark(row, col)) col++;
        found.push([row, from, col]);
      }
    }
    return found;
  }

  /** Where the image goes inside its square, kept whole and centred, in the given unit. */
  function imageBox(code, unit) {
    const box = (code.pad.width - 1.2) * unit;
    const x = (code.pad.at + MARGIN + 0.6) * unit;
    const { naturalWidth: w, naturalHeight: hgt } = code.image.img;
    const fit = Math.min(box / (w || 1), box / (hgt || 1));
    return { x: x + (box - w * fit) / 2, y: x + (box - hgt * fit) / 2, w: w * fit, h: hgt * fit };
  }

  /** The SVG download, which is also what the sticker shows. */
  function svgText(code, cm) {
    const { size } = code;
    const d = runs(code)
      .map(([row, from, to]) => `M${from + MARGIN} ${row + MARGIN}h${to - from}v1h${from - to}z`)
      .join("");
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${size} ${size}" width="${cm ? `${cm}cm` : size * 10}" height="${cm ? `${cm}cm` : size * 10}">`,
    ];
    if (code.bg !== CLEAR) parts.push(`<rect width="${size}" height="${size}" fill="${code.bg}"/>`);
    parts.push(`<path d="${d}" fill="${code.fg}" shape-rendering="crispEdges"/>`);
    if (code.image) {
      const at = code.pad.at + MARGIN;
      const box = imageBox(code, 1);
      parts.push(
        `<rect x="${at}" y="${at}" width="${code.pad.width}" height="${code.pad.width}" fill="${code.bg === CLEAR ? WHITE : code.bg}"/>`,
        `<image x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" xlink:href="${code.image.url}"/>`,
      );
    }
    parts.push("</svg>");
    return parts.join("");
  }

  /** The PNG download, drawn in whole pixels per module so every edge is sharp. */
  function drawPng(code) {
    const scale = Math.ceil(PNG_WIDTH / code.size);
    const width = code.size * scale;
    const canvas = h("canvas", { width, height: width });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (code.bg !== CLEAR) {
      context.fillStyle = code.bg;
      context.fillRect(0, 0, width, width);
    }
    context.fillStyle = code.fg;
    for (const [row, from, to] of runs(code))
      context.fillRect((from + MARGIN) * scale, (row + MARGIN) * scale, (to - from) * scale, scale);
    if (code.image) {
      const at = (code.pad.at + MARGIN) * scale;
      context.fillStyle = code.bg === CLEAR ? WHITE : code.bg;
      context.fillRect(at, at, code.pad.width * scale, code.pad.width * scale);
      const box = imageBox(code, scale);
      context.drawImage(code.image.img, box.x, box.y, box.w, box.h);
    }
    return canvas;
  }

  // ---- The check: read the PNG back, the way a phone would ----

  function luminance(colour) {
    const hex = colour === CLEAR ? WHITE : colour;
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** Reads the code in the picture and compares it, byte for byte, with what was typed. */
  function readsBack(canvas, code) {
    const { width } = canvas;
    const pixels = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, width, width).data;
    if (code.bg === CLEAR) {
      // A see-through code is read as it would be on white paper.
      for (let i = 0; i < pixels.length; i += 4) {
        const a = pixels[i + 3] / 255;
        for (let c = 0; c < 3; c++) pixels[i + c] = pixels[i + c] * a + 255 * (1 - a);
        pixels[i + 3] = 255;
      }
    }
    // A light code on a dark background is read as a phone that inverts would read it: as its
    // negative. jsQR 1.4.0's own inversion doesn't read these, and its "onlyInvert" crashes.
    if (luminance(code.fg) > luminance(code.bg))
      for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] = 255 - pixels[i + c];
    const found = jsQR(pixels, width, width, { inversionAttempts: "dontInvert" });
    if (!found) return false;
    const typed = new TextEncoder().encode(code.text);
    return found.binaryData.length === typed.length && found.binaryData.every((byte, i) => byte === typed[i]);
  }

  /** What the check found, in the words the page uses. */
  function verdict(code, scans) {
    const [light, dark] = [luminance(code.fg), luminance(code.bg)].sort((a, b) => b - a);
    if ((light + 0.05) / (dark + 0.05) < 3) return "alike";
    if (!scans) return code.image ? "image" : "unreadable";
    if (luminance(code.fg) > luminance(code.bg)) return "inverted";
    return code.bg === CLEAR ? "fine-on-light" : "fine";
  }

  // The latest check's picture, kept for the buttons, so a download is the picture that was checked.
  let checked = { key: null };

  function scheduleCheck(code) {
    clearTimeout(checkTimer);
    const run = ++checkRun;
    checkTimer = setTimeout(() => {
      if (run !== checkRun || code.waitingForImage) return;
      const canvas = drawPng(code);
      let scans = false;
      try {
        scans = readsBack(canvas, code);
      } catch {
        // A reader that fails is a code we can't vouch for: it says so, never nothing.
      }
      if (run !== checkRun) return;
      checked = { key: code.key, canvas };
      showVerdict(code, verdict(code, scans));
    }, CHECK_AFTER);
  }

  function showVerdict(code, found) {
    const fix = (label, onclick) => h("button", { type: "button", className: "fix", onclick }, label);
    const ok = (...words) => h("div", { className: "ok" }, h("span", {}, ...words));
    const answers = {
      fine: () => ok(...rich(say.scans)),
      "fine-on-light": () => ok(...rich(say.scansClear)),
      inverted: () => ok(say.inverted),
      alike: () => h("div", { className: "offer" }, h("span", {}, ...rich(say.alike)), fix(say.backToBlack, backToBlack)),
      image: () => h("div", { className: "offer" }, h("span", {}, ...rich(say.imageBreaks)), fix(say.removeImage, removeImage)),
      unreadable: () => h("div", {}, ...rich(say.unreadable)),
    };
    status.replaceChildren(answers[found]());
    status.dataset.verdict = found;
    failing = found === "alike" || found === "image" || found === "unreadable";
    vouched = found === "fine";
    smallest.hidden = failing;
    if (failing) count("qr doesnt scan", { why: found }, `scan ${found}`);
    speak();
  }

  // ---- The page ----

  function setAdvice(key, build) {
    if (key === adviceKey) return;
    adviceKey = key;
    advice.replaceChildren(...(build ? [build()] : []));
  }

  function offer(words, label, onclick, warn) {
    return h(
      "div",
      { className: warn ? "offer warn" : "offer" },
      h("span", {}, words),
      h("button", { type: "button", className: "fix", onclick }, label),
    );
  }

  function accept(fixed) {
    count("qr fix taken", { fix: fixed.startsWith("https://") && !input.value.trim().startsWith("https://") ? "https" : "spaces" });
    input.value = fixed;
    update();
    if (finePointer) input.focus({ preventScroll: true });
  }

  function update() {
    const text = input.value;
    const made = make(text);
    clearTimeout(checkTimer);
    checkRun++;
    vouched = false;
    status.replaceChildren();
    delete status.dataset.verdict;
    smallest.hidden = true;

    // One line on what's inside, or one fix to offer, or what went wrong.
    const fix = made.kind === "code" ? suggestion(text) : null;
    const isLink = LINK.test(text);
    inside.hidden = !(made.kind === "code" && !fix && !PHONES_KNOW.test(text));
    if (!inside.hidden) inside.replaceChildren(...(isLink ? rich(say.opens, { link: h("strong", {}, short(text)) }) : [say.asText]));
    if (made.kind === "too-long") {
      const ascii = /^[\x00-\x7f]*$/.test(text);
      setAdvice(`long ${ascii}`, () => h("div", { className: "offer warn" }, ascii ? fill(forCount(say.tooLong, [...text].length), { count: number([...text].length), most: number(MOST) }) : fill(say.tooLongWide, { most: number(MOST) })));
    } else if (made.tooLongForImage) setAdvice("long-image", () => offer(say.tooLongForImage, say.removeImage, removeImage, true));
    else if (fix) setAdvice(`fix ${fix.fixed}`, () => offer(fix.words, fix.button, () => accept(fix.fixed)));
    else setAdvice("", null);

    // The sticker: the code, or the empty shape waiting for one.
    const has = made.kind === "code";
    for (const button of Object.values(take)) button.disabled = !has;
    $("print").disabled = !has;
    if (!has) {
      shown = null;
      failing = Boolean(text);
      sticker.querySelector("svg.code")?.remove();
      empty.removeAttribute("hidden");
      speak();
      return;
    }
    const code = look(text, made);
    const fresh = !shown;
    shown = code;
    const svg = new DOMParser().parseFromString(svgText(code), "image/svg+xml").documentElement;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("class", `code${fresh ? " pop" : ""}${code.bg === CLEAR ? " see-through" : ""}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", fill(say.alt, { what: short(text) }));
    const old = sticker.querySelector("svg.code");
    if (old) old.replaceWith(svg);
    else sticker.insertBefore(svg, sticker.querySelector(".peel"));
    empty.setAttribute("hidden", ""); // an SVG element has no .hidden property: the attribute it is

    showSize(code);
    sheetSummary();

    if (fresh) count("qr made", { kind: kindOf(text) }, "made");

    // The robin hops when the first code arrives.
    if (fresh) robin.classList.add("hop");
    speak();
    scheduleCheck(code);
  }

  // The robin is there from the start, with its one line: who it is, and then, once the check has
  // read the code back and it scans plainly, the code's own number of squares and that phones can
  // read it. Until then, and for a code that scans only on a light surface or only on newer phones,
  // it keeps its hello. A tap on the robin hides the line or brings it back.
  let quiet = false;
  let failing = false; // the robin has nothing to say while the code doesn't scan
  let vouched = false; // the check read this code back, and it scans fine
  const hello = bubble.textContent;
  function speak() {
    const talks = !quiet && !failing;
    const line = !talks ? "" : shown && vouched ? fill(forCount(say.robin, shown.n * shown.n), { squares: number(shown.n * shown.n) }) : hello;
    if (talks && bubble.textContent !== line) bubble.textContent = line;
    showLine(talks);
    robin.setAttribute("aria-expanded", String(talks));
  }
  // The line grows out of the robin when it's shown (its animation plays each time) and shrinks
  // back when it goes; with reduced motion it simply goes.
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  function showLine(on) {
    if (on) {
      bubble.classList.remove("hush");
      bubble.hidden = false;
    } else if (!bubble.hidden && !bubble.classList.contains("hush")) {
      if (still.matches) bubble.hidden = true;
      else bubble.classList.add("hush");
    }
  }
  bubble.addEventListener("animationend", (event) => {
    if (event.animationName !== "hush") return;
    bubble.classList.remove("hush");
    bubble.hidden = true;
  });
  robin.addEventListener("animationend", () => robin.classList.remove("hop"));
  robin.addEventListener("click", () => {
    quiet = !quiet;
    speak();
  });

  // Keep it plain is gone. A device that chose it before still holds the choice: forget it, so the
  // language picked stays the one thing the page keeps.
  try {
    localStorage.removeItem("qr-plain");
  } catch {
    // Storage is off: there's nothing kept to forget.
  }

  input.addEventListener("input", update);

  // On a phone the field has room for a few words only: there it asks in fewer.
  const narrow = matchMedia("(max-width: 480px)");
  const placeholder = input.placeholder;
  const askIn = () => {
    input.placeholder = narrow.matches ? say.placeholderShort : placeholder;
  };
  narrow.addEventListener("change", askIn);
  askIn();

  // Paste puts what was copied where the cursor is, as pasting with the keyboard would.
  const paste = $("paste");
  if (navigator.clipboard && navigator.clipboard.readText) {
    paste.hidden = false;
    paste.addEventListener("click", async () => {
      try {
        const copied = await navigator.clipboard.readText();
        if (!copied) return;
        const from = input.selectionStart ?? input.value.length;
        const to = input.selectionEnd ?? input.value.length;
        input.setRangeText(copied, from, to, "end");
        update();
        if (finePointer) input.focus({ preventScroll: true });
      } catch {
        setAdvice("paste", () => h("div", { className: "offer warn" }, say.pasteRefused));
      }
    });
  }

  // ---- Colours and image ----

  const more = $("more");
  more.addEventListener("click", () => {
    const open = more.getAttribute("aria-expanded") !== "true";
    more.setAttribute("aria-expanded", String(open));
    $("options").hidden = !open;
  });

  function markColours(which) {
    const chosen = state[which];
    let preset = false;
    for (const chip of document.querySelectorAll(`#${which} .chip[data-colour]`)) {
      const on = chip.dataset.colour === chosen;
      preset ||= on;
      chip.setAttribute("aria-pressed", String(on));
    }
    const custom = document.querySelector(`#${which} label.custom`);
    custom.classList.toggle("chosen", !preset);
    const fill = custom.querySelector(".chip-fill");
    fill.classList.toggle("rainbow", preset);
    fill.style.background = preset ? "" : chosen;
    if (chosen !== CLEAR) $(`${which}-custom`).value = chosen;
  }

  for (const which of ["fg", "bg"]) {
    for (const chip of document.querySelectorAll(`#${which} .chip[data-colour]`)) {
      if (chip.dataset.colour !== CLEAR) chip.querySelector(".chip-fill").style.background = chip.dataset.colour;
      chip.addEventListener("click", () => {
        state[which] = chip.dataset.colour;
        markColours(which);
        update();
      });
    }
    $(`${which}-custom`).addEventListener("input", (event) => {
      state[which] = event.target.value.toLowerCase();
      markColours(which);
      update();
    });
  }

  function backToBlack() {
    state.fg = INK;
    state.bg = WHITE;
    markColours("fg");
    markColours("bg");
    update();
  }

  function markImage() {
    for (const chip of document.querySelectorAll("#image .chip[data-image]"))
      chip.setAttribute("aria-pressed", String(chip.dataset.image === state.image));
    $("own-chip").classList.toggle("chosen", state.image === "own");
  }

  function chooseImage(image) {
    state.image = image;
    $("image-problem").hidden = true;
    markImage();
    update();
  }

  function removeImage() {
    chooseImage("none");
  }

  for (const chip of document.querySelectorAll("#image .chip[data-image]"))
    chip.addEventListener("click", () => chooseImage(chip.dataset.image));

  /** A picture from this device, made small enough to sit in a code. It never leaves the page. */
  async function loadPicture(source, mostPixels) {
    const img = new Image();
    img.src = source;
    await img.decode();
    const w = img.naturalWidth || mostPixels;
    const hgt = img.naturalHeight || mostPixels;
    const fit = Math.min(1, mostPixels / Math.max(w, hgt));
    const canvas = h("canvas", { width: Math.max(1, Math.round(w * fit)), height: Math.max(1, Math.round(hgt * fit)) });
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    const small = new Image();
    small.src = url;
    await small.decode();
    return { url, img: small };
  }

  $("own-image").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) useOwnImage(file);
  });

  // A picture dropped anywhere on the page goes in the middle of the code, as if chosen.
  const carriesFiles = (event) => event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
  document.addEventListener("dragover", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    sticker.classList.add("dropping");
  });
  document.addEventListener("dragleave", (event) => {
    if (!event.relatedTarget) sticker.classList.remove("dropping");
  });
  document.addEventListener("drop", (event) => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    sticker.classList.remove("dropping");
    const file = event.dataTransfer.files[0];
    if (file) useOwnImage(file);
  });

  async function useOwnImage(file) {
    const local = URL.createObjectURL(file);
    try {
      state.own = { ...(await loadPicture(local, 512)), id: ++pictures };
      $("own-fill").replaceChildren(h("img", { src: state.own.url, alt: "" }));
      chooseImage("own");
    } catch {
      const problem = $("image-problem");
      problem.textContent = say.badImage;
      problem.hidden = false;
    } finally {
      URL.revokeObjectURL(local);
    }
  }

  // The robin for the middle of a code: fetched once while the page loads, so it works offline.
  fetch("/assets/img/robin-qr.svg")
    .then((response) => response.text())
    .then((svg) => {
      const sized = svg.replace("<svg ", '<svg width="400" height="440" ');
      const bytes = new TextEncoder().encode(sized);
      const url = `data:image/svg+xml;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
      const img = new Image();
      img.src = url;
      return img.decode().then(() => {
        robinPicture = { url, img };
        if (state.image === "robin") update();
      });
    })
    .catch(() => {});

  // ---- The print size: written into the PNG and the SVG, and chosen for a sheet ----

  // The files carry 5 cm, or more when a code needs it to scan, so a document places them at a
  // sensible size instead of filling the page; people resize them wherever they put them. The page
  // says how small a code can print. A size is chosen only for a sheet, below.
  const FILE_CM = 5;
  const inches = new Intl.NumberFormat(say.lang, { maximumFractionDigits: 1 }).format;
  // A code reads from about ten times its width; this asks for 0.6 mm a module, and never under 2 cm.
  const smallestCm = (code) => Math.max(2, Math.ceil((code.size * 0.6) / 10));
  const cmFor = (code) => Math.max(FILE_CM, smallestCm(code));

  function showSize(code) {
    smallest.textContent = fill(say.measure, { cm: number(smallestCm(code)) });
    smallest.hidden = failing; // a code that doesn't scan can still be taken, but no size makes it scan
    showOwnSize(code);
  }

  /** The PNG of a code at a print size: drawn now, with a pHYs chunk saying how wide to print it,
   *  so documents and printers place it at that size instead of guessing from its pixels. It's
   *  made from the drawing directly, so it needs no read of a file, online or off. */
  function pngAt(code, cm) {
    const canvas = checked.key === code.key ? checked.canvas : drawPng(code); // the one checked, when it's ready
    const encoded = atob(canvas.toDataURL("image/png").split(",")[1]);
    const bytes = Uint8Array.from(encoded, (letter) => letter.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const perMetre = Math.round(view.getUint32(16) / (cm / 100)); // the width, from IHDR
    const chunk = new Uint8Array(21);
    const out = new DataView(chunk.buffer);
    out.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    out.setUint32(8, perMetre);
    out.setUint32(12, perMetre);
    chunk[16] = 1; // the unit is the metre
    out.setUint32(17, crc32(chunk.subarray(4, 17)));
    // Any pHYs the browser wrote goes, and ours follows the header.
    const parts = [bytes.subarray(0, 33), chunk];
    for (let at = 33; at < bytes.length; ) {
      const end = at + 12 + view.getUint32(at);
      if (view.getUint32(at + 4) !== 0x70485973) parts.push(bytes.subarray(at, end));
      at = end;
    }
    return new Blob(parts, { type: "image/png" });
  }

  const CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // A sheet of the code, with the sticker's cut lines, printed by the browser (which can also save
  // it as a PDF): 1, 4, 12 or 30 on a page, picked by sight, and the size follows. Or, out of the
  // way, a size someone chooses, and as many as fit. Every sheet fits both A4 and Letter, inside
  // 1 cm margins and room for the cut lines around the edge, and never prints a code smaller than
  // it scans: a layout too small for the code can't be picked, and a chosen size stops there.
  const SHEET = { width: 18.2, height: 25.1, gap: 1 }; // cm
  const LARGEST_CM = Math.floor(SHEET.width); // one code across the page
  let own = false; // the sheet is at a size someone chose, not a layout
  let ownCm = 5;
  const ownSizeFor = (code) => Math.min(LARGEST_CM, Math.max(ownCm, smallestCm(code)));
  function showOwnSize(code) {
    const cm = ownSizeFor(code);
    $("measure-size").textContent = fill(say.size, { cm: number(cm), inches: inches(cm / 2.54) });
    $("smaller").disabled = cm <= smallestCm(code);
    $("bigger").disabled = cm >= LARGEST_CM;
  }
  const LAYOUTS = { 1: [1, 1], 4: [2, 2], 12: [3, 4], 30: [5, 6] }; // codes across, and down
  const caption = $("caption");
  const layouts = [...document.querySelectorAll('input[name="layout"]')];
  // A caption takes the room it needs under each code: it's measured at the code's width, with
  // the sheet's own font, and the codes get smaller until code and caption fit their row.
  const CM = 96 / 2.54; // CSS pixels in a centimetre
  const measurer = document.body.appendChild(h("p", { className: "caption-measure" }));
  measurer.setAttribute("aria-hidden", "true");
  function captionCm(words, cell) {
    measurer.style.width = `${cell}cm`;
    measurer.textContent = words;
    return measurer.getBoundingClientRect().height / CM + 0.15; // and the room above it
  }
  function sheetFit(count, words) {
    if (count === "own") {
      const cell = ownSizeFor(shown);
      if (justOne()) return { cell, across: 1, count: 1 };
      const across = Math.max(1, Math.floor((SHEET.width + SHEET.gap) / (cell + SHEET.gap)));
      const tall = cell + (words ? captionCm(words, cell) : 0);
      const down = Math.max(1, Math.floor((SHEET.height + SHEET.gap) / (tall + SHEET.gap)));
      return { cell, across, count: across * down };
    }
    const [across, down] = LAYOUTS[count];
    const wide = (SHEET.width - SHEET.gap * (across - 1)) / across;
    const row = (SHEET.height - SHEET.gap * (down - 1)) / down;
    // In half centimetres, rounded down: the size reads simply, and the page still fits.
    let cell = Math.floor(Math.min(wide, row, LARGEST_CM) * 2) / 2;
    while (words && cell > 0.5 && cell + captionCm(words, cell) > row) cell -= 0.5;
    return { cell, across, count };
  }
  function sheetSummary() {
    // Each layout shows its size under its picture, so people who think in centimetres can pick
    // one straight away.
    for (const input of layouts)
      input.closest(".tile").querySelector(".tile-size").textContent = fill(say.tileSize, { cm: number(sheetFit(Number(input.value), caption.value.trim()).cell) });
    if (!shown) {
      $("sheet-summary").textContent = "";
      return;
    }
    const words = caption.value.trim();
    const least = smallestCm(shown);
    for (const input of layouts) input.disabled = sheetFit(Number(input.value), words).cell < least;
    let size;
    if (own) {
      const fit = sheetFit("own", words);
      size = fill(forCount(say.sheetOwn, fit.count), { count: number(fit.count), cm: number(fit.cell) });
    } else {
      // A layout too small for this code gives way to the nearest one with fewer, bigger codes.
      let chosen = layouts.find((input) => input.checked);
      if (chosen.disabled) {
        chosen = layouts.findLast((input) => !input.disabled && Number(input.value) < Number(chosen.value)) ?? layouts[0];
        chosen.checked = true;
      }
      size = fill(say.sheet, { cm: number(sheetFit(Number(chosen.value), words).cell) });
    }
    // Why some layouts are greyed out, while the layouts are what's being picked.
    const why = !own && layouts.some((input) => input.disabled) ? say.tooSmall : "";
    // Japanese ends a sentence with 。 and leaves no space after it.
    $("sheet-summary").textContent = why ? size + (/[。！？]$/.test(size) ? "" : " ") + why : size;
  }
  caption.addEventListener("input", sheetSummary);

  // Picking a layout leaves a chosen size; choosing a size leaves the layouts.
  const ownSize = $("own-size");
  const steps = $("measure");
  const copies = $("copies");
  // At a size of one's own: one code, or as many as fit, for cutting out.
  const justOne = () => copies.querySelector('input[value="one"]').checked;
  for (const input of copies.querySelectorAll("input")) input.addEventListener("change", sheetSummary);
  for (const input of layouts)
    input.addEventListener("change", () => {
      own = false;
      steps.hidden = true;
      copies.hidden = true;
      ownSize.hidden = false;
      ownSize.setAttribute("aria-expanded", "false");
      sheetSummary();
    });
  ownSize.addEventListener("click", () => {
    own = true;
    for (const input of layouts) input.checked = false;
    ownSize.hidden = true;
    ownSize.setAttribute("aria-expanded", "true");
    steps.hidden = false;
    copies.hidden = false;
    if (shown) showOwnSize(shown);
    sheetSummary();
    steps.querySelector(".step:not(:disabled)")?.focus();
  });
  for (const [id, step] of [["smaller", -1], ["bigger", 1]])
    $(id).addEventListener("click", () => {
      if (!shown) return;
      ownCm = Math.min(LARGEST_CM, Math.max(smallestCm(shown), ownSizeFor(shown) + step));
      showOwnSize(shown);
      sheetSummary();
    });

  const sheetMore = $("sheet-more");
  sheetMore.addEventListener("click", () => {
    const open = sheetMore.getAttribute("aria-expanded") !== "true";
    sheetMore.setAttribute("aria-expanded", String(open));
    $("sheet-options").hidden = !open;
  });

  $("print").addEventListener("click", () => {
    if (!shown) return;
    const words = caption.value.trim();
    sheetSummary();
    const fit = sheetFit(own ? "own" : Number(layouts.find((input) => input.checked).value), words);
    const sheet = $("print-sheet");
    sheet.style.gridTemplateColumns = `repeat(${fit.across}, ${fit.cell}cm)`;
    const cells = [];
    for (let n = 0; n < fit.count; n++) {
      const svg = new DOMParser().parseFromString(svgText(shown), "image/svg+xml").documentElement;
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      cells.push(h("div", { className: "cell" }, svg, words ? h("p", {}, words) : null));
    }
    sheet.replaceChildren(...cells);
    // A layout says how many are on the page. A size of one's own says nothing more: how many fit,
    // and a size the code raised, would hint at how long the caption or the text is.
    taken("sheet", own ? { caption: Boolean(words) } : { codes: fit.count, caption: Boolean(words) });
    window.print();
  });

  // ---- Taking it away ----

  function taken(how, more = {}) {
    count("qr taken", {
      how,
      kind: kindOf(shown.text),
      image: state.image,
      colours: state.fg === INK ? "default" : "chosen",
      background: state.bg === WHITE ? "white" : state.bg === CLEAR ? "see-through" : "chosen",
      ...more,
    });
  }

  /** Named after what's in it: https://example.com/menu → qr-example.com-menu.png */
  function fileName(text, extension) {
    const words = text
      .trim()
      .replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}.]+/gu, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 60)
      .replace(/[-.]+$/, "");
    return `qr-${words || "code"}.${extension}`;
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = h("a", { href: url, download: name, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function flash(button, words) {
    clearTimeout(button.flashTimer);
    button.dataset.label ??= button.textContent;
    button.textContent = words;
    button.flashTimer = setTimeout(() => (button.textContent = button.dataset.label), 1600);
  }

  take.png.addEventListener("click", () => {
    if (!shown) return;
    save(pngAt(shown, cmFor(shown)), fileName(shown.text, "png"));
    taken("png");
  });

  take.svg.addEventListener("click", () => {
    if (!shown) return;
    save(new Blob([svgText(shown, cmFor(shown))], { type: "image/svg+xml" }), fileName(shown.text, "svg"));
    taken("svg");
  });

  // On a phone, the phone's own menu: save to Photos, or send in a messaging app. Elsewhere, Copy.
  const sample = new File([""], "qr.png", { type: "image/png" });
  const canShare = matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.canShare({ files: [sample] });
  const canCopy = typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write;
  if (canShare) take.share.hidden = false;
  else if (canCopy) take.copy.hidden = false;

  take.share.addEventListener("click", async () => {
    if (!shown) return;
    const name = fileName(shown.text, "png");
    try {
      const blob = pngAt(shown, cmFor(shown));
      await navigator.share({ files: [new File([blob], name, { type: "image/png" })] });
      taken("share");
    } catch {
      // Closing the menu without choosing is fine; there's nothing to say.
    }
  });

  take.copy.addEventListener("click", () => {
    if (!shown) return;
    // The picture is handed over as a promise, so Safari still counts this as the click's own copy.
    navigator.clipboard
      .write([new ClipboardItem({ "image/png": Promise.resolve(pngAt(shown, cmFor(shown))) })])
      .then(() => {
        taken("copy");
        flash(take.copy, say.copied);
      })
      .catch(() => flash(take.copy, say.copyFailed));
  });

  // ---- Arriving ----

  markColours("fg");
  markColours("bg");
  markImage();
  sheetSummary();
  speak();
  // On a computer the cursor starts in the box. On a phone it doesn't, so the keyboard doesn't
  // cover the page before it's been seen.
  if (finePointer) input.focus({ preventScroll: true });
  if (input.value) update();
})();
