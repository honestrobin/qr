# Contributing to Honest Robin: QR

Thanks for helping. Issues and pull requests are welcome. QR is small on purpose: one page that
makes a code, checks it and hands it over. Before you build a new feature, open an issue, so we can
say whether it fits.

Everyone who takes part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Licence and sign-off

QR is under the GNU AGPL v3 (`AGPL-3.0-only`). We don't ask for a contributor licence agreement:
you keep your copyright. Every commit carries a
[Developer Certificate of Origin](https://developercertificate.org/) sign-off, which
`git commit -s` adds:

```
Signed-off-by: Your Name <you@example.com>
```

## Changing the page

- Everything in `public/` is served at qr.honestrobin.com, and nothing outside it is.


- The page is `tools/page.html`, and its words are in `words/<language>.json`. After changing
  either, run `python3 tools/pages.py`. Never edit the pages in `public/` by hand: they're
  written from those two.
- A new or changed English line needs every language. If you can't translate it, say so in the
  pull request, and we will.
- What's typed never leaves the page: no request may carry it, and it's never put in the address
  or in storage. Read [`PROMISES.md`](PROMISES.md) before you change `public/assets/qr.js`,
  `public/_headers` or `worker/`.
- Never change what someone typed. Suggest a fix, and only their tap applies it.
- A library is copied into `public/assets/vendor/` as it was published, with its licence, and
  listed in `public/assets/vendor/README.md`. The page loads nothing from anywhere else.

## Before you open a pull request

```sh
python3 tools/pages.py
cd tests && npm ci && npx playwright install chromium webkit
npm run html && npx playwright test
```

Every pull request runs the same checks in CI.

## Who decides

Claude, Anthropic's AI, writes most of QR's code, under the rules in the
[Robin's Code](https://honestrobin.com/code). The maintainer decides what merges.
