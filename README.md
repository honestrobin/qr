# Honest Robin: QR

A QR code that's yours to keep, at [qr.honestrobin.com](https://qr.honestrobin.com). Type or paste
a link, or any text, and the code appears as you type. The page reads its own code back with a QR
reader and says whether it scans, and how small you can print it. Take it as PNG or SVG.

- **Yours to keep.** The code opens your link directly, not through us, so it works for as long as
  your link does.
- **We never see what you type.** Nothing typed is sent anywhere, and once the page has
  loaded it works with the network off. Your own image for the middle of a code is read in the
  browser and never uploaded.
- **Never changes what you typed.** When something looks like a mistake ("example.com/menu"
  without https://), the page suggests the fix, and only your tap makes it.
- **Ready to print.** The PNG and the SVG come out 5 cm wide in a document, and you can resize
  them there. Or print a sheet: 1, 4, 12 or 30 on a page, or one or a page full at a size you pick.
  We make sure every code prints big enough for phones to read.
- **Free**, with no account, ads, watermark or expiry. In 13 languages.

Made with AI: Claude, Anthropic's AI, wrote it. The maintainer, Marko Kruljac, gives the
instructions, tests it and approves every release. Every promise it makes, and what guards it, is
in [`PROMISES.md`](PROMISES.md). It follows the [Robin's Code](https://honestrobin.com/code).

## Companies that see anything

| Company | Country | What it does |
|---|---|---|
| Cloudflare | United States | Serves the page and runs its one piece of server code. Counts visits with its cookie-free Web Analytics: the counter records the page's address, the site a visit came from, the country, browser, system, device type and load times. It runs inside the page and sends nothing you type. Keeps the counts of what's done on the page (below) for three months, in its own store (Workers Analytics Engine), with nothing of yours: not your address, not your browser. We use Cloudflare because it already serves honestrobin.com and serves static pages well at no cost; we'll move to a European host that serves you as well. |

Nobody else. The page's security policy (`public/_headers`) lets it talk to nothing but its own address
and Cloudflare's counter. Our server code sends nothing anywhere. A copy of QR anywhere else sends us nothing: Cloudflare adds the
visit counter only at qr.honestrobin.com, and a copy's server code keeps its counts in the store
of whoever deploys it.

## What we count

Visits, by Cloudflare's counter, and what's done on the page, never what's in it:

| Count | With |
|---|---|
| A code made (the first on a page view) | link or text |
| A code taken | how (PNG or SVG downloaded, copied, shared, or a sheet sent to print), link or text, the image (none, the robin, your own), colours and background (as they are, or chosen), on a sheet, which layout (how many on a page, or a size of one's own) and whether the codes have a caption |
| A suggested fix taken | which: adding https://, or removing spaces |
| A code that doesn't scan | why: colours too alike, the image, or the reader couldn't read it |

Each count also has the page's language and a random id made for that page view, so counts from one
visit can be seen together, and the id doesn't link one visit to another. The page keeps the id
nowhere and forgets it when it closes. `worker/counts.js` holds the list and refuses anything else.
About 60 counts a minute are kept from one address: Cloudflare's limiter uses the address only to
apply the limit, and it isn't stored with the counts. The limiter is approximate, and counts in each
Cloudflare location apart. Cloudflare keeps no log of the count requests for us: the Worker's logs
are off.

To read them, query the dataset `qr_counts` with Cloudflare's Analytics Engine SQL API, with a
token that can read Account Analytics. Each count is one row: `index1` is the page view's id, and
the blobs and doubles are in the order `worker/counts.js` lists them (`blob1` is the event).
Count rows with `SUM(_sample_interval)`, not `COUNT()`, since Cloudflare samples at high volume.

## How it's built

Plain HTML, CSS and JavaScript, with no build step and no dependencies at run time, and one small
piece of server code that stores the counts.

| Path | What |
|---|---|
| `tools/page.html` | The page, with a `{{key}}` for every word |
| `words/<language>.json` | The words, one file per language, with the same keys as `en.json` |
| `tools/pages.py` | Writes `public/index.html` (English), `public/<language>/index.html`, `sitemap.xml` and `robots.txt` from the two above, with what search engines and chats read (the preview card's tags and the structured data), and stamps each stylesheet and script link (in `404.html` too) with its version. Run it after changing either; CI fails if a page is out of date |
| `tools/cards.py` | Draws the preview card a shared link shows, one per language (`public/assets/cards/`): the page's headline, and a code that opens that language's page, read back before it's kept. Run it after a headline changes; it needs Chromium |
| `public/` | Everything that's served, and nothing else: the pages, `404.html`, `_headers`, the icons and `assets/` |
| `public/assets/qr.js` | Makes the code, checks it, and hands it over |
| `public/assets/language.js` | Picks the language: what you picked, else your browser's list, never your IP address |
| `public/assets/qr.css` | The look: a mat of small squares, a sticker, and a field drawn like the robin |
| `public/assets/vendor/` | The QR encoder and the reader for the check, copied in (`public/assets/vendor/README.md`) |
| `public/assets/fonts/` | Archivo, under the SIL Open Font License |
| `public/_headers`, `wrangler.jsonc` | How Cloudflare serves it |
| `worker/index.js`, `worker/counts.js` | The one piece of server code: it stores the page's counts, as listed above, in Cloudflare's store, and does nothing else |
| `tests/` | The checks every change runs before it merges and before it goes live |
| `docs/releases/` | The record of each release |

### Languages

English, Spanish, Portuguese (Brazil), French, German, Italian, Dutch, Polish, Croatian, Turkish,
Indonesian, Japanese and Korean. A new language is a new `words/<code>.json` and its code in
`LANGUAGES` in `tools/pages.py`. Words that change with a number ("1 znak", "3 znaka", "5
znakova") can be plural forms, chosen with `Intl.PluralRules`. Translations are made by an AI and
checked by a second one translating them back to English.

### The check

When typing stops, the page draws the exact PNG it would download and reads it back with jsQR. It
says "Scans fine" only when what it reads is, byte for byte, what was typed, and "Doesn't scan"
otherwise. Colours too alike for a phone (a contrast under 3:1) are called out even when the reader
manages. jsQR isn't a phone camera, which is why the page also says how small you can print.

## Checks

Every pull request runs `.github/workflows/checks.yml`, and every deploy runs it first: the pages
are up to date with their words, the HTML is valid, Cloudflare would accept the deploy, and in
desktop Chrome, Chrome on Android and Safari on iPhone the tests in `tests/` pass. They use the
page as a person does, mistakes included, and read back every code they make with their own copy
of jsQR. Each run keeps a picture of every screen (the `screens` artifact).

To run them yourself:

```sh
cd tests && npm ci && npx playwright install chromium webkit
npm run html && npx playwright test
```

## Deploy

`.github/workflows/deploy.yml` runs the checks, then `wrangler deploy`, which uploads `public/`
(minus the one file in `public/.assetsignore`) and the server code to Cloudflare Workers at
qr.honestrobin.com. For now it runs only when
started by hand (Actions → Deploy → Run workflow). The Cloudflare token lives in GitHub's secrets,
never in the files.

Visits are counted by Cloudflare Web Analytics: its automatic setup for honestrobin.com adds the
cookie-free counter to every page at Cloudflare's edge, so QR's own files have none, and a copy of
QR anywhere else counts nothing. QR's visits show in honestrobin.com's Web Analytics, under the
hostname qr.honestrobin.com. The tests add the same tag to check what it sends.

## Run your own copy

The page is plain files. Serve `public/` from the root of an address, with any web server, and
it works the same; without `worker/`, its counts go nowhere. `public/_headers` is Cloudflare's format, so
on another server, set the same headers yourself. To run it on your own Cloudflare account, put
your address in `wrangler.jsonc` and run `npx wrangler deploy`. On your own address, also put it in
`SITE` in `tools/pages.py` and run `python3 tools/pages.py` and `python3 tools/cards.py`: the
addresses search engines read, and the preview picture a shared link shows, then point to your
copy, not to ours.

## Contributing

Issues and pull requests are welcome: [CONTRIBUTING.md](CONTRIBUTING.md) says how. Report a
security problem privately, as [SECURITY.md](SECURITY.md) says.

## Licence

The code is under the [GNU AGPL v3](LICENSE), with no contributor licence agreement. The libraries
in `public/assets/vendor/` keep their own licences ([`public/assets/vendor/README.md`](public/assets/vendor/README.md)),
and the font is under the SIL Open Font License. The name and the robin aren't part of the
licence: [TRADEMARKS.md](TRADEMARKS.md) says what's fine.
