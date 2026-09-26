# QuotaArc launch analytics

This is website-only attribution. The QuotaArc desktop application stays telemetry-free.

## Current release gate

QuotaArc has no public release yet. `src/quotaarc-release.js` therefore keeps both `version` and `url` empty. The product page has no Download button while the URL is empty or invalid. The endpoint responds with a localized `503` and does not emit an event. After publishing a real asset, set the version and the exact public GitHub Release asset URL in that one file, then build, verify, and deploy. The URL must look like `https://github.com/OWNER/REPOSITORY/releases/download/TAG/ASSET`; repository and tag pages are rejected. Do not put credentials or signed/private URLs there.

## Event and privacy

The Workers Analytics Engine dataset is `quotaarc_download_events`. A successful `GET` to a configured download route writes one point:

| Field | Stored value |
| --- | --- |
| index1 | `quotaarc` |
| blob1 | `download_click` |
| blob2 | normalized source |
| blob3 | normalized campaign |
| blob4 | `en` or `uk` |
| blob5 | configured release version, otherwise empty |
| double1 | `1` |
| timestamp | Analytics Engine write timestamp |

The Worker does not write IP, email, name, request URL, referrer, User-Agent, cookies, browser/device traits, or any desktop-application data. Source and campaign values are trimmed, lowercased, limited to 48 characters, and restricted to ASCII lowercase letters, digits, and hyphens. Missing values become `direct` and `evergreen`; invalid or oversized values become `other`. Unknown but well-formed values are retained.

The Analytics Engine write is best effort and non-blocking; write errors do not stop a valid redirect. Only `GET` can count. `HEAD` and other methods return `405`; a trailing slash is canonically redirected without recording an event. No fingerprinting or deduplication is used: repeated valid GET requests are separate download intents.

Cloudflare Web Analytics is enabled with automatic injection on the proxied production hostname. It provides aggregate page visits and referrers for `/`, `/uk`, `/quotaarc`, `/uk/quotaarc`, `/fossidesk`, and `/uk/fossidesk`. Its RUM beacon uses browser performance APIs and does not read/write cookies or browser storage. Cloudflare documents that the beacon request reaches the edge with the source IP as normal HTTP metadata, then Cloudflare discards that IP at the nearest data center and does not store it in its core databases or logs. See [RUM beacon data and privacy](https://developers.cloudflare.com/speed/observatory/rum-beacon/).

## Source and campaign names

Use lowercase slugs. Known source examples: `direct`, `github`, `producthunt`, `showhn`, `reddit-chatgptcoding`, `indiehackers`, `alternativeto`, `itchio`, `winget`, `microsoft-store`, and `vivibureau`. New source and campaign slugs may be used without code changes.

| Channel | Landing URL |
| --- | --- |
| Product Hunt | `https://vivibureau.pp.ua/quotaarc?src=producthunt&campaign=v1-launch` |
| Show HN | `https://vivibureau.pp.ua/quotaarc?src=showhn&campaign=v1-launch` |
| Reddit | `https://vivibureau.pp.ua/quotaarc?src=reddit-chatgptcoding&campaign=v1-launch` |
| GitHub README | `https://vivibureau.pp.ua/quotaarc?src=github&campaign=readme` |

## Controlled release smoke test

After a public asset is configured and deployed, perform at most one end-to-end
CTA click from
`https://vivibureau.pp.ua/quotaarc?src=codex-smoke&campaign=release-verification`.
The page carries these values to `/quotaarc/download`; the event appears under
the dedicated `codex-smoke` source in the local aggregate report. Keep that
row separate from ordinary referral and launch totals. Do not repeat the live
click to troubleshoot; the local analytics tests cover redirect behavior
when Analytics Engine writes fail.

When the download CTA is enabled, a small page script carries only `src` and `campaign` from the current QuotaArc page URL to `/quotaarc/download`. It uses no cookie, localStorage, sessionStorage, or user identifier. Direct product-page visits use `src=vivibureau&campaign=evergreen`; direct endpoint requests without values use `direct&evergreen`.

## Local aggregate report

Create a Cloudflare API token restricted to this account with **Account Analytics Engine Read**. In a local shell (never commit the token), set `CF_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then run:

```powershell
npm run report:downloads
```

Dates are UTC and the end date is exclusive. Omitting them reports the preceding 30 days. The script returns counts grouped by source and campaign; it is local and exposes no public report route. Analytics Engine uses sampling-aware `_sample_interval` totals, so treat values as estimates if the service reports sampling above one.

## Later comparison with GitHub Release counts

After a public release exists, compare the Worker click total for the same time window with the public GitHub Release asset's `download_count` from GitHub's public Releases API. No GitHub token is needed for a public release. The figures are not expected to match: a click is download intent, while GitHub counts completed asset downloads and may include retries or downloads from other entry points. Record the asset and time window when comparing; do not present the difference as user-level attribution.
