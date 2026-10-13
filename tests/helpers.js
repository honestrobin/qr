// What the checks share: reading a code back the way a phone would, and taking the downloads.
// They read codes with their own copy of jsQR from npm, not the page's, and decode the PNG with
// pngjs, so a code the page drew wrong can't be read back wrong in the same way.
import { readFile } from "node:fs/promises";
import jsQR from "jsqr";
import { PNG } from "pngjs";

/** Reads the code in a PNG as it would be read on white paper, or null when nothing reads. */
export function readPng(bytes, { lightOnDark = false } = {}) {
  const png = PNG.sync.read(bytes);
  const pixels = new Uint8ClampedArray(png.data);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    for (let c = 0; c < 3; c++) pixels[i + c] = pixels[i + c] * alpha + 255 * (1 - alpha);
    pixels[i + 3] = 255;
  }
  // jsQR's own inversion doesn't read a light code on a dark background: read its negative.
  if (lightOnDark) for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) pixels[i + c] = 255 - pixels[i + c];
  const found = jsQR(pixels, png.width, png.height, { inversionAttempts: "dontInvert" });
  return found ? Buffer.from(found.binaryData).toString("utf8") : null;
}

/** The PNG's size and the colour of one pixel, to check what was drawn. */
export function pixel(bytes, x, y) {
  const png = PNG.sync.read(bytes);
  const i = (png.width * y + x) * 4;
  return { width: png.width, height: png.height, rgba: [...png.data.subarray(i, i + 4)] };
}

/** Presses a download button and returns the file it gave. */
export async function download(page, button) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.locator(button).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

/** Draws an SVG the way an app that opens it would, 1000 pixels wide, and returns it as a PNG. */
export async function svgToPng(page, svg) {
  const dataUrl = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1000;
      canvas.getContext("2d").drawImage(image, 0, 0, 1000, 1000);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }, svg);
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

/** The code on the sticker, as an SVG file. */
export async function stickerSvg(page) {
  return page.locator("svg.code").evaluate((svg) => {
    const copy = svg.cloneNode(true);
    copy.setAttribute("width", "1000");
    copy.setAttribute("height", "1000");
    return new XMLSerializer().serializeToString(copy);
  });
}

/** Reads the sticker, the PNG and the SVG, and returns what each one says. */
export async function readEverything(page, options) {
  const png = await download(page, "#png");
  const svg = await download(page, "#svg");
  return {
    sticker: readPng(await svgToPng(page, await stickerSvg(page)), options),
    png: readPng(png.bytes, options),
    svg: readPng(await svgToPng(page, svg.bytes.toString("utf8")), options),
    names: [png.name, svg.name],
    pngBytes: png.bytes,
  };
}

/** Opens "Colours and image" if it's closed. */
export async function openOptions(page) {
  const more = page.locator("#more");
  if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
}

/** A small picture made here, for "Your own": a red square with a white dot. */
export function redSquare() {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const i = (64 * y + x) * 4;
      const dot = (x - 32) ** 2 + (y - 32) ** 2 < 100;
      png.data.set(dot ? [255, 255, 255, 255] : [200, 30, 40, 255], i);
    }
  return PNG.sync.write(png);
}
