# QR, for agents

Honest Robin: QR, the free QR code maker at qr.honestrobin.com. The rules every agent follows
are in `robinscode`; this adds what's particular to QR.

- **What's typed never leaves the page.** No request may carry it, and it's never put in the
  address or in storage. `tests/privacy.spec.js` checks it; read `PROMISES.md` before touching
  `assets/qr.js` or `_headers`, or switching Cloudflare's counter for something else.
- **Never change what someone typed.** Suggest the fix; only their tap applies it.
- **Words live in `words/<language>.json`.** Edit `tools/page.html` and the words, then run
  `python3 tools/pages.py`; never edit `index.html` or `<language>/index.html` by hand. A new or
  changed English string needs every language, translated and checked back.
- **QR's words may play more than a work tool's.** People use it for a minute, and it isn't
  serious work, so the robin may lighten the moment more than it would in Time. Each line still
  says plainly what happens and stays professional. A translation carries the meaning and the
  lightness, not the words.
- **The first version is the core.** Nothing more goes in until the maintainer, using it, says
  it's a joy.
- **The repository is public.** Nothing private goes in: no customers' data, no keys, no
  personal details, no plans that aren't decided.
