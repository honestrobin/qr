#!/usr/bin/env python3
"""Draws QR's preview cards: the picture a link to the page shows in chats and on social media,
one per language, into public/assets/cards/<language>.png (1200 × 630). Each is the sticker on
the mat, with a real code for that language's page and the page's headline. Run it after a
headline changes; tools/pages.py writes the tags that point to the cards.

It draws with headless Chromium, using QR's own fonts and code library, then reads each card's
code back with QR's own reader and stops if it doesn't open that language's page.

    python3 tools/cards.py                    draw every card
    python3 tools/cards.py --fonts FOLDER     also use FOLDER/ja.woff2 and FOLDER/ko.woff2

Japanese and Korean need a font with their letters: the system's (Noto Sans CJK, Hiragino, Yu
Gothic, Apple SD Gothic Neo, Malgun Gothic), or ja.woff2 and ko.woff2 in the folder given.
Chromium is `chromium`, or whatever the CHROMIUM environment variable names.
"""
import base64
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True  # importing pages.py leaves no __pycache__ behind
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pages import LANGUAGES, PUBLIC, ROOT, url  # noqa: E402

CARDS = PUBLIC / "assets" / "cards"
CHROMIUM = os.environ.get("CHROMIUM", "chromium")
WIDTH, HEIGHT = 1200, 630


def nowrap(headline):
    """The headline, escaped, with a hyphenated word ("QR-code") kept on one line."""
    return re.sub(r"(\S+-\S+)", r'<span style="white-space: nowrap">\1</span>', html.escape(headline))


def card_html(code, headline, fonts):
    asset = lambda name: (PUBLIC / "assets" / name).as_uri()
    extra = ""
    for lang in ("ja", "ko"):
        if fonts and (fonts / f"{lang}.woff2").exists():
            extra += f'@font-face {{ font-family: "Card {lang}"; font-weight: 800; src: url({(fonts / f"{lang}.woff2").as_uri()}) format("woff2"); }}\n'
    return f"""<!doctype html>
<html lang="{code}">
<meta charset="utf-8" />
<style>
@font-face {{ font-family: "Archivo Variable"; font-weight: 100 900; font-stretch: 62% 125%;
  src: url({asset("fonts/archivo-latin-wdth-normal.woff2")}) format("woff2-variations"); }}
@font-face {{ font-family: "Archivo Variable"; font-weight: 100 900; font-stretch: 62% 125%;
  src: url({asset("fonts/archivo-latin-ext-wdth-normal.woff2")}) format("woff2-variations");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1EFF; }}
{extra}
html, body {{ margin: 0; width: {WIDTH}px; height: {HEIGHT}px; overflow: hidden; }}
body {{
  position: relative;
  font-family: "Archivo Variable", sans-serif;
  color: #1c2b25;
  background-color: #eaf1ec;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36'%3E%3Crect x='15' y='15' width='6' height='6' rx='.8' fill='%23d3e1d7'/%3E%3C/svg%3E");
  background-size: 36px 36px;
}}
:lang(ja) h1 {{ font-family: "Archivo Variable", "Card ja", "Noto Sans CJK JP", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif; word-break: keep-all; font-stretch: 100%; letter-spacing: 0; line-height: 1.12; font-size: 76px; }}
:lang(ko) h1 {{ font-family: "Archivo Variable", "Card ko", "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; word-break: keep-all; font-stretch: 100%; letter-spacing: -0.01em; line-height: 1.12; font-size: 76px; }}
.brand {{ position: absolute; left: 72px; top: 64px; font-size: 26px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }}
.badge {{ padding: 4px 9px 3px; margin-left: 6px; letter-spacing: 0.06em; color: #eaf1ec; background: #1c2b25; border-radius: 8px; }}
h1 {{ position: absolute; left: 72px; top: 150px; width: 560px; margin: 0; font-size: 92px; line-height: 0.98; font-weight: 800; font-stretch: 78%; letter-spacing: -0.015em; text-wrap: balance; }}
.where {{ position: absolute; left: 72px; bottom: 60px; font-size: 26px; font-weight: 600; color: #46554e; }}
.sticker {{ position: absolute; right: 96px; top: 95px; width: 440px; height: 440px; box-sizing: border-box; padding: 20px;
  background: #fff; border-radius: 30px; transform: rotate(-3deg);
  box-shadow: 0 2px 0 rgb(28 43 37 / 0.1), 0 22px 40px -16px rgb(28 43 37 / 0.4); }}
.sticker svg {{ display: block; width: 100%; height: 100%; }}
.peel {{ position: absolute; right: 0; bottom: 0; width: 52px; height: 52px; border-bottom-right-radius: 30px;
  background: linear-gradient(135deg, transparent 50%, #dfe8e1 50%); box-shadow: -3px -3px 7px rgb(28 43 37 / 0.08); }}
.robin {{ position: absolute; right: 470px; bottom: 34px; width: 150px; }}
</style>
<span class="brand" lang="en">Honest Robin<span class="badge">QR</span></span>
<h1>{nowrap(headline)}</h1>
<span class="where">{html.escape(url(code).removeprefix("https://").rstrip("/"))}</span>
<div class="sticker" id="sticker"><span class="peel"></span></div>
<img class="robin" src="{asset("img/robin-qr.svg")}" alt="" />
<script src="{asset("vendor/qrcode.js")}"></script>
<script>
  // The same library and settings as the page: the smallest code at level M, 4 modules of margin.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const qr = qrcode(0, "M");
  qr.addData({json.dumps(url(code))}, "Byte");
  qr.make();
  const n = qr.getModuleCount(), size = n + 8;
  let d = "";
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) if (qr.isDark(row, col)) d += `M${{col + 4}} ${{row + 4}}h1v1h-1z`;
  document.getElementById("sticker").insertAdjacentHTML("afterbegin",
    `<svg viewBox="0 0 ${{size}} ${{size}}"><path d="${{d}}" fill="#1c2b25" shape-rendering="crispEdges"/></svg>`);
</script>
</html>
"""


def check_html(png):
    data = base64.b64encode(png.read_bytes()).decode()
    reader = (PUBLIC / "assets" / "vendor" / "jsQR.js").as_uri()
    return f"""<!doctype html>
<meta charset="utf-8" />
<script src="{reader}"></script>
<body>
<script>
  const img = new Image();
  img.onload = () => {{
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(pixels.data, canvas.width, canvas.height);
    document.body.dataset.read = found ? found.data : "nothing";
    document.body.dataset.size = `${{canvas.width}}x${{canvas.height}}`;
  }};
  img.src = "data:image/png;base64,{data}";
</script>
</body>
"""


def chromium(*args):
    return subprocess.run(
        [CHROMIUM, "--headless=new", "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=5000", *args],
        capture_output=True, text=True, timeout=120,
    )


def main():
    fonts = None
    if "--fonts" in sys.argv:
        fonts = Path(sys.argv[sys.argv.index("--fonts") + 1]).resolve()
    CARDS.mkdir(parents=True, exist_ok=True)
    problems = []
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        for code in LANGUAGES:
            words = json.loads((ROOT / "words" / f"{code}.json").read_text(encoding="utf-8"))
            page = work / f"{code}.html"
            page.write_text(card_html(code, words["page"]["headline"], fonts), encoding="utf-8")
            target = CARDS / f"{code}.png"
            chromium(f"--window-size={WIDTH},{HEIGHT}", f"--screenshot={target}", page.as_uri())
            check = work / f"{code}-check.html"
            check.write_text(check_html(target), encoding="utf-8")
            dom = chromium("--dump-dom", check.as_uri()).stdout
            read = re.search(r'data-read="([^"]*)"', dom)
            size = re.search(r'data-size="([^"]*)"', dom)
            read = html.unescape(read.group(1)) if read else "no answer"
            size = size.group(1) if size else "?"
            if read != url(code) or size != f"{WIDTH}x{HEIGHT}":
                problems.append(f"{target.relative_to(ROOT)}: reads {read!r}, {size}; expected {url(code)!r}, {WIDTH}x{HEIGHT}")
            else:
                print(f"{target.relative_to(ROOT)}: opens {read}")
    if problems:
        print("Cards that aren't right:", *problems, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
