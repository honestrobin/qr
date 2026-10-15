# What keeps our promises

Every promise QR makes, from the [Robin's Code](https://honestrobin.com/code) and from its own
page, and what keeps each one today. QR is a free page with no account; its one piece of server
code only stores counts. So many of the Code's promises don't apply to it; each says why. "Tested" means a named
test fails if the promise breaks by accident. Nothing in code can stop a promise being broken on
purpose.

The statuses: **Tested**; **Built, no test** (the code does it, and nothing checks it); **Not
built**; **By hand** (kept by how we work, not by code); **Doesn't apply**.

Last checked: 2026-10-11, against the Robin's Code at robinscode ce0ee0a.

## QR's own promises

| Promise | Status | Guarded by |
|---|---|---|
| A code that's yours to keep: the code opens your link directly, not through us, because it holds what you typed itself, byte for byte. It works for as long as your link does. The checks read back the sticker, the PNG and the SVG with a reader of their own and compare them with what was typed, in any language and with emoji. | Tested | `tests/qr.spec.js::the sticker, the PNG and the SVG all hold what was typed, named after the link`, `tests/qr.spec.js::text in any language, emoji included, comes back exactly` |
| What you type is never changed for you: when something looks like a mistake, the page suggests the fix, and only your tap makes it. Until then the code holds exactly what you typed. | Tested | `tests/qr.spec.js::a link without https:// is offered the fix, and only the tap adds it`, `tests/qr.spec.js::spaces around a link are offered for removal, never removed by themselves` |
| Checked before you print it: the page reads its own code back, the PNG you'd download, and says "Scans fine" only when it reads exactly what you typed; otherwise "Doesn't scan". It also says when colours are too alike for a phone, even if its reader manages. Its reader (jsQR) isn't a phone camera, so it also says how small you can print. | Tested | `tests/qr.spec.js::"Scans fine" only when the reader reads exactly what was typed`, `tests/qr.spec.js::a pasted link shows its code at once, says what it opens, and is checked`, `tests/qr.spec.js::colours too alike: says it won't scan, still downloads, and one tap goes back to black`, `tests/qr.spec.js::the robin in the middle: the code makes room, still scans, and every download carries it`, `tests/qr.spec.js::the PNG and the SVG carry 5 cm, more when a code needs it to scan, and the page says how small it can print` |
| A mistake costs nothing: what you typed stays after every message, and a code that won't scan still downloads. | Tested | `tests/qr.spec.js::too long for one code: says how long, and what was typed stays`, `tests/qr.spec.js::colours too alike: says it won't scan, still downloads, and one tap goes back to black` |
| Free: no account, trial, ads, watermark, expiry or upsell. | By hand | |

## Your data works for you

| Promise | Status | Guarded by |
|---|---|---|
| We never see what you type: no request carries it, not even Cloudflare's visit counter, and it's never put in the page's address, its storage or a cookie. The one place it can end up is the name of a file you download, in your browser's list of downloads. The test uses everything on the page with the counter on, Paste, a change of language and a printed sheet's caption included, then reads every request and every report the counter sends after the page was used. | Tested | `tests/privacy.spec.js::nothing typed leaves the page, even with Cloudflare's visit counter on it`, `tests/privacy.spec.js::what's typed is never put in the page's address or kept in the browser` |
| Your own image stays on this page: it's read and shrunk in the browser, and never uploaded. The test looks for pieces of the picture, as chosen and as shrunk, in every request and every report. | Tested | `tests/privacy.spec.js::nothing typed leaves the page, even with Cloudflare's visit counter on it`, `tests/qr.spec.js::your own image stays on the page and goes into the code` |
| Once the page has loaded, it works with the network off, in every language and with letters beyond plain English: both font files load with the page, so typing č asks nothing of the network. | Tested | `tests/privacy.spec.js::once loaded, it works with the network off` |
| No ads and no cookies: the page loads everything from its own address, and its security policy lets it talk to nothing else except Cloudflare's cookie-free visit counter. The check compares the policy word for word. | Tested | `tests/pages.spec.js::loads cleanly, with the security headers`, `public/_headers` |
| By default we count visits: Cloudflare's cookie-free counter records the page's address, the site a visit came from, the country, browser, system, device type and load times. It sets no cookie, stores nothing in the browser, and our checks read everything it sends and find nothing typed. Cloudflare adds it to every page at its edge (Web Analytics' automatic setup for honestrobin.com); the tag pins the script's version and hash, which Cloudflare chooses, and the checks run that same tag. Nothing beyond counting is tracked. | Tested | `tests/privacy.spec.js::the counter counts the visit and nothing more: no cookies, nothing stored, nothing typed`, `tests/privacy.spec.js::nothing typed leaves the page, even with Cloudflare's visit counter on it` |
| The counter never learns who you are and doesn't follow you to other sites: that rests on how Cloudflare runs Web Analytics, not on our code. | By hand | |
| By default we also count what's done on the page, never what's in it: a code made (link or text), a code taken (PNG or SVG downloaded, copied, shared, or a sheet sent to print; an image or not; chosen colours or not; on a sheet, which layout, and whether captioned), a suggested fix taken, and a code that doesn't scan and why. Each count carries the page's language and a random id made for that one page view, which the page keeps nowhere and forgets when it closes. The page sends them to its own address, and our server code (`worker/index.js`, with its list in `worker/counts.js`) refuses anything not on that list. A longer list needs a change to its test. | Tested | `tests/count.spec.js::what may be counted is exactly this list: a longer one changes this test too`, `tests/count.spec.js::a count passes only as listed: names and plain values, never anything typed`, `tests/count.spec.js::anything not on the list is refused, and nothing is stored or sent`, `tests/qr.spec.js::counts go to the page's own address: what was done, never what was typed`, `tests/privacy.spec.js::nothing typed leaves the page, even with Cloudflare's visit counter on it` |
| The counts are kept with nothing of yours: our server code writes each one to Cloudflare's own store (Workers Analytics Engine) as one row of the listed values, never your address or your browser, and sends nothing to anyone else. Cloudflare keeps the rows for three months. About 60 counts a minute are kept from one address: Cloudflare's limiter uses the address only to apply the limit, counts in each of its locations apart, and is approximate; the address is never part of a row. Requests from the machine itself, which happen only when QR runs locally, aren't limited. Cloudflare keeps no log of these requests for us: the Worker's logs are off. | Tested | `tests/count.spec.js::the store gets one row with the count, and nothing of the visitor's: not their address, not their browser`, `tests/count.spec.js::past about 60 a minute from one address, counts are refused and nothing is stored`, `tests/count.spec.js::live, the counts go to QR's own store, about 60 a minute from one address, with no log; run locally, nowhere` |
| A copy of QR running anywhere but qr.honestrobin.com sends us nothing: QR's files have no counter, Cloudflare adds it only at that address, and a copy's server code writes to the store of whoever deploys it, never ours. It holds no address or key of ours, and sends nothing anywhere. Run locally, as the checks run it, the store keeps nothing. | Tested | `tests/privacy.spec.js::a copy of QR served anywhere else sends us nothing: its files have no counter`, `tests/count.spec.js::the store gets one row with the count, and nothing of the visitor's: not their address, not their browser`, `tests/count.spec.js::live, the counts go to QR's own store, about 60 a minute from one address, with no log; run locally, nowhere` |
| What we count, and every company that handles data for us, is named in the privacy policy. There's no privacy policy yet; the list of companies is in `README.md`. | Not built | |
| One thing is kept on your device, and only once you choose it: the language you picked, so the plain address opens in it next time. Nothing else is kept: a Keep it plain choice from before that setting went is forgotten when the page opens. | Tested | `tests/privacy.spec.js::what's typed is never put in the page's address or kept in the browser`, `tests/qr.spec.js::the robin says who it is and counts each code's squares, and stays` |
| The counts carry the page's language (the one you picked, if you did); nothing else about it leaves your device. | Built, no test | `public/assets/language.js`, `public/assets/qr.js` |
| Your data never trains AI: QR has no AI, and what you type never reaches us. | Doesn't apply | |
| You can have your data deleted: we have none of it. | Doesn't apply | |

## Your data's home is Europe

| Promise | Status | Guarded by |
|---|---|---|
| Every company that touches your data is listed: one. Cloudflare (United States) serves the page, runs its server code, counts visits, and keeps the counts of what's done on the page. Its visit counter runs inside the page; our checks read everything it sends, and it sends nothing you type. The list is in `README.md`, with why we use it. The checks fail if the page loads anything from another address, or if its security policy names a new one. | Tested | `tests/pages.spec.js::loads cleanly, with the security headers` |
| Your data stored in Europe: nothing you type is stored anywhere but your own device. Cloudflare, an American company, keeps its request logs, the visit counts and the counts of what's done on the page, where Cloudflare decides. | Not built | |

## You can always leave

| Promise | Status | Guarded by |
|---|---|---|
| Everything you make is yours to take: PNG and SVG downloads, and Copy. | Tested | `tests/qr.spec.js::the sticker, the PNG and the SVG all hold what was typed, named after the link`, `tests/qr.spec.js::Copy puts the picture on the clipboard` |
| The files carry nothing of ours: no watermark, no name, no link. | Built, no test | `public/assets/qr.js` |
| Move out, export and cancelling: there's no account and nothing stored with us. | Doesn't apply | |
| The code is open source under the AGPL, with no contributor licence agreement, at [github.com/honestrobin/qr](https://github.com/honestrobin/qr). | By hand | `LICENSE`, `CONTRIBUTING.md` |
| Run it yourself: the page is plain files (`public/`), served from the root of an address. The one piece of server code, `worker/`, only stores the page's counts; without it a copy works the same, and its counts go nowhere. The checks serve `public/` locally, with wrangler, the way Cloudflare does, and once as a plain web server would answer the counts; other web servers aren't tried. | Tested | `tests/pages.spec.js::loads cleanly, with the security headers`, `tests/qr.spec.js::without the server code, as on a plain web server, the page works the same: its counts go nowhere` |

## The deal doesn't change after you move in

| Promise | Status | Guarded by |
|---|---|---|
| A feature you use is never removed without 90 days' notice, and changes to how you work are in a public, dated changelog, [`CHANGELOG.md`](CHANGELOG.md), before they ship. | By hand | |
| Your price stays the same: QR is free, with no plan or subscription. | Doesn't apply | |
| Each version of the API keeps working for 12 months: QR has no API. | Doesn't apply | |

## No surprise bills

| Promise | Status | Guarded by |
|---|---|---|
| Prices, fees, meters and caps: QR is free and charges nothing. | Doesn't apply | |

## You get the whole product

| Promise | Status | Guarded by |
|---|---|---|
| The self-hosted edition is the same software: there's one edition, these files. | Doesn't apply | |

## It's a joy to use

| Promise | Status | Guarded by |
|---|---|---|
| No tricks, no nagging, no emails, no AI. | By hand | |
| A person is one step away: QR has no way to reach one yet. | Not built | |

## We tell you the truth, and you can see how it's made

| Promise | Status | Guarded by |
|---|---|---|
| Every page, in every language, links to the Robin's Code, which says how it's made, AI included. | Tested | `tests/languages.spec.js::page works in its own language` |
| The page speaks your language without guessing from where you are: it reads your browser's language list and what you picked, never your IP address. | Tested | `tests/languages.spec.js::the plain address follows the browser's language`, `tests/languages.spec.js::an address with a language keeps it, and offers German in one line that can be closed` |
| Every change says who or what wrote it, and every release has a record (`docs/releases/`). | By hand | |
| Your customers get the same deal; we trust you; if we're sold or shut down: QR has no customers' customers, limits or cloud service. Its codes never touch us, so they keep working whatever happens to us. | Doesn't apply | |

## Where our words are ahead of the code

- The robin's line, "I checked all 625 squares: phones can read this code", is the maintainer's
  approved line, and it shows only once the check passes. The check reads the whole code back with a
  QR reader in the browser; it doesn't compare each square one by one, and it isn't a phone. It
  reads a perfect picture, not a print or a screen: phones read the code at the size the page gives
  under the buttons ("At least … cm, so phones can read it"), and the robin's line doesn't repeat
  that limit. With an image, the squares under it are counted too; the
  code's error correction stands in for them.
- The robin's first line, "I check every code before you print it", is true of Print, which sits
  behind a button nobody reaches in the quarter second between the last keystroke and the check.
  The PNG, SVG, Copy and Share buttons go live as soon as a code is drawn, so a file taken in that
  quarter second is drawn fresh and hasn't been read back.



