#!/usr/bin/env python3
"""Writes QR's page in every language, into public/, from tools/page.html and words/<language>.json.

English is at /, every other language at /<code>/ (Deutsch at /de/), so people searching in their
own language find it. It also writes sitemap.xml, the list of those pages for search engines, and
robots.txt, which points to it, and stamps every stylesheet and script link, in the pages and in
the hand-written 404.html, with the file's own version. Only the template and the words files are edited by hand; the pages are
written by this script and committed, so the site still has no build step.

Every words file has exactly the keys English has, the same {placeholders} in each string, and the
same [brackets] (a link, or the words to show in bold). If one doesn't, nothing is written.

    python3 tools/pages.py            write the pages
    python3 tools/pages.py --check    exit 1 if a page isn't what this would write (CI runs this)
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"  # everything served, and nothing else

SITE = "https://qr.honestrobin.com"

# The order of the language picker, and of the links search engines read.
LANGUAGES = ["en", "es", "pt", "fr", "de", "it", "nl", "pl", "hr", "tr", "id", "ja", "ko"]

# Where the words in [brackets] link to, for the page strings that have a link.
LINKS = {
    "follows": "https://honestrobin.com/code",
    "otherTools": "https://honestrobin.com/#products",
}

PLACEHOLDER = re.compile(r"\{[a-z]+\}")
PLURALS = {"zero", "one", "two", "few", "many", "other"}
BRACKETS = re.compile(r"\[([^\]]+)\]")



def url(code):
    return f"{SITE}/" if code == "en" else f"{SITE}/{code}/"


def path(code):
    return "/" if code == "en" else f"/{code}/"


def shape(value):
    """What must match between languages: the placeholders and the number of brackets."""
    return sorted(PLACEHOLDER.findall(value)), len(BRACKETS.findall(value))


def check_words(words):
    problems = []
    english = words["en"]
    for code in LANGUAGES[1:]:
        theirs = words[code]
        for part in ("page", "script"):
            missing = english[part].keys() - theirs[part].keys()
            extra = theirs[part].keys() - english[part].keys()
            if missing:
                problems.append(f"words/{code}.json: {part} is missing {sorted(missing)}")
            if extra:
                problems.append(f"words/{code}.json: {part} has keys English doesn't: {sorted(extra)}")
            for key in english[part].keys() & theirs[part].keys():
                value = theirs[part][key]
                # The script's words may come in plural forms, chosen by Intl.PluralRules.
                forms = value if isinstance(value, dict) and part == "script" else {"other": value}
                if not isinstance(value, (str, dict)) or "other" not in forms or set(forms) - PLURALS:
                    problems.append(f"words/{code}.json: {part}.{key} is neither words nor plural forms with 'other'")
                    continue
                mine = english[part][key]
                reference = shape(mine["other"] if isinstance(mine, dict) else mine)
                for form, text in forms.items():
                    found = shape(text)
                    # Only the "other" form must name the count: "1 code" needn't say {count}.
                    if form != "other":
                        found = ([p for p in found[0] if p != "{count}"], found[1])
                        wanted = ([p for p in reference[0] if p != "{count}"], reference[1])
                    else:
                        wanted = reference
                    if found != wanted:
                        problems.append(f"words/{code}.json: {part}.{key} ({form}) doesn't have English's placeholders and brackets")
    for code in LANGUAGES:
        for key in ("language", "alsoIn", "close"):
            if not isinstance(words[code].get(key), str) or not words[code][key]:
                problems.append(f"words/{code}.json: no {key}")
    return problems


def linked(key, value):
    """Escapes a page string, and turns its [brackets] into its link."""
    escaped = html.escape(value, quote=True)
    if key in LINKS:
        return BRACKETS.sub(lambda m: f'<a href="{LINKS[key]}">{m.group(1)}</a>', escaped)
    return escaped


def page(template, code, words):
    mine = words[code]
    values = {key: linked(key, value) for key, value in mine["page"].items()}
    values["lang"] = code
    values["url"] = url(code)
    values["language"] = html.escape(mine["language"])
    values["alternates"] = "\n".join(
        [f'    <link rel="alternate" hreflang="{c}" href="{url(c)}" />' for c in LANGUAGES]
        + [f'    <link rel="alternate" hreflang="x-default" href="{url("en")}" />']
    )
    values["languages"] = "\n".join(
        f'            <li><a class="item" href="{path(c)}" hreflang="{c}" lang="{c}" data-language="{c}"'
        + (' aria-current="page"' if c == code else "")
        + f'><span class="dot"></span>{html.escape(words[c]["language"])}</a></li>'
        for c in LANGUAGES
    )
    # What assets/language.js needs before the page is drawn: every language's address, and the
    # line that offers it, in that language.
    values["languagesData"] = json.dumps(
        {"page": code, "languages": [{"code": c, "path": path(c), **{k: words[c][k] for k in ("alsoIn", "close")}} for c in LANGUAGES]},
        ensure_ascii=False,
    ).replace("</", "<\\/")
    # The script's words travel in the page as data, never as code: "</" can't end the block early.
    values["words"] = json.dumps({"lang": code, **mine["script"]}, ensure_ascii=False).replace("</", "<\\/")

    def fill(match):
        key = match.group(1)
        if key not in values:
            raise KeyError(f"tools/page.html asks for {{{{{key}}}}}, which words/{code}.json doesn't have")
        return values[key]

    written = re.sub(r"\{\{(\w+)\}\}", fill, template)
    return versioned(re.sub(r"\n\s*\n(\s*<script src=\"/assets/vendor)", r"\n\1", written))


ASSET = re.compile(r'((?:href|src)="(/assets/[^"?]+\.(?:css|js)))(?:\?v=[0-9a-f]+)?"')


def versioned(text):
    """Each stylesheet and script is asked for by its own version (a hash of the file), so a page
    never meets the stylesheet or script of another release while Cloudflare's cache catches up."""
    def stamp(match):
        digest = hashlib.sha256((PUBLIC / match.group(2).lstrip("/")).read_bytes()).hexdigest()[:10]
        return f'{match.group(1)}?v={digest}"'
    return ASSET.sub(stamp, text)


def outputs():
    template = (ROOT / "tools" / "page.html").read_text(encoding="utf-8")
    words = {c: json.loads((ROOT / "words" / f"{c}.json").read_text(encoding="utf-8")) for c in LANGUAGES}
    problems = check_words(words)
    if problems:
        return None, problems
    files = {}
    for code in LANGUAGES:
        target = "index.html" if code == "en" else f"{code}/index.html"
        files[target] = page(template, code, words)
    files["404.html"] = versioned((PUBLIC / "404.html").read_text(encoding="utf-8"))
    files["sitemap.xml"] = sitemap()
    files["robots.txt"] = f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n"
    return files, []


def sitemap():
    pages = "".join(f"  <url><loc>{url(code)}</loc></url>\n" for code in LANGUAGES)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{pages}</urlset>\n"
    )


def main():
    files, problems = outputs()
    if problems:
        print("The words files don't match English:", *problems, sep="\n  ")
        return 1
    if "--check" in sys.argv:
        stale = [name for name, text in files.items() if not (PUBLIC / name).exists() or (PUBLIC / name).read_text(encoding="utf-8") != text]
        if stale:
            print("Out of date, run python3 tools/pages.py:", *stale, sep="\n  ")
            return 1
        return 0
    for name, text in files.items():
        (PUBLIC / name).parent.mkdir(parents=True, exist_ok=True)
        (PUBLIC / name).write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
