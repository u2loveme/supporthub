# Vivi Bureau

Apps, tools & side projects. Vivi Bureau is a small independent home for QuotaArc, FossiDesk, and future projects. Support is optional; the site does not accept or process payments.

## Project structure

- `src/assets/products.json` — product registry and per-product provider settings.
- `src/quotaarc-release.js` — the single optional QuotaArc release target/version configuration.
- `src/download-worker.js` and `src/assets/download-attribution-core.js` — localized download endpoint and anonymous attribution event.
- `src/locales/en.json` and `src/locales/uk.json` — shared UI copy and localized product descriptions.
- `src/product.html` — shared product page template.
- `src/assets/styles.css` — shared presentation.
- `scripts/build.mjs` — builds complete localized static HTML routes and assets in `dist/`.
- `scripts/verify-production.mjs` — builds and checks release files, providers, paths, and Wrangler configuration.
- `scripts/download-attribution.test.mjs` — focused endpoint and privacy tests.
- `scripts/report-downloads.mjs` — local aggregate report for Workers Analytics Engine.
- `docs/QUOTAARC_DOWNLOAD_ANALYTICS.md` — source/campaign convention, reporting, release setup, and privacy details.
- `scripts/preview.mjs` — previews generic static output locally.
- `wrangler.jsonc` — Cloudflare Worker with static assets and Analytics Engine bindings; only QuotaArc download paths run through Worker code first.

## Product configuration

Each entry in `products` defines an `id`, display name, description, icon/accent, optional GitHub URL, and separate Ukraine/international provider settings. Add an application by adding one complete object to `src/assets/products.json`; the shared template creates its routes without duplicated page markup. Keep IDs unique and URL-safe.

Vivi Bureau does not show an amount selector. Amount preselection can return only after a provider's capability has been verified. Product routes and per-product provider URLs preserve attribution.

## Provider configuration

Provider states are `configured`, `unavailable`, and `coming_soon`. Only a valid public HTTPS URL in the `configured` state creates an active link. Each external action names its destination host and opens in a new tab. Vivi Bureau does not assume amount preselection.

Set `nameInArtwork: true` only when the provider name is printed in that provider's illustration; the name stays available to assistive technology without appearing a second time in the card text.

The support page shows only providers that resolve to a valid configured URL. If none are ready, it shows one short “No support options are available right now” message; unavailable or coming-soon entries are not presented as payment choices.

When exactly one provider is configured, the page also reserves one blank, noninteractive tile for a future option. It has no provider identity, status, or payment link.

To swap a provider, edit only that product's provider entry. Verify onboarding, the public destination, and the real payment flow first; then set the verified HTTPS URL and change the state to `configured`. Invalid, placeholder, missing, or non-HTTPS URLs never become links.

QuotaArc uses the existing configured mono Banka URL for Ukraine and its verified public Donatello destination for international support. Both FossiDesk providers remain `unavailable`; GitHub project URLs are unset. PayPal is not configured or required. Do not activate another provider until its real URL is verified.

## Bilingual pages

English is the default locale. The build creates English routes at `/`, `/quotaarc`, and `/fossidesk`, plus Ukrainian equivalents at `/uk`, `/uk/quotaarc`, and `/uk/fossidesk`. The legacy `/token-monitor` routes permanently redirect to the QuotaArc route in each language. Cloudflare uses the no-trailing-slash form as canonical, so `/uk/` redirects to `/uk` and product routes with a trailing slash redirect to their no-slash route.

All shared navigation, support copy, metadata, empty states, and the homepage signature are in `src/locales/en.json` and `src/locales/uk.json`. Each locale file also contains translated descriptions for every product ID. Add the same product IDs to both dictionaries when adding an application. `src/product.html` remains the single product template; `scripts/build.mjs` writes separate HTML for each language and route. The published pages render without a client-side framework or runtime translation library. The language switch keeps users on the equivalent app page, does not detect locale automatically, and stores no preference.

Each localized page has its own language attribute, title, description, canonical, and reciprocal `hreflang` links. Cloudflare serves the nearest localized `404.html` with an HTTP 404 response; unmatched paths never fall back to the homepage. If building for a static subpath such as `/supporthub/`, set `SUPPORTHUB_BASE_PATH=/supporthub` for the build so the not-found page's stylesheet and home/language links use that prefix. Normal page assets remain relative and work from either root or subpath hosting.

## Privacy

Vivi Bureau does not use analytics, advertising trackers, cookies, fingerprinting, accounts, payment processing, or payment-detail collection. Hosting and external provider services may process technical request information under their own current policies. Review [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/) for the hosting provider's terms.

The homepage QA photo is the developer's cat, Vivienne. The page serves a resized WebP first, with the original JPEG as a browser fallback.

## Production hosting: Cloudflare Workers Static Assets

Production is intended to use Cloudflare Workers Static Assets on the `workers.dev` hostname. The build remains a static site: Wrangler serves `dist/` directly, with no Worker script, backend, database, or SPA fallback. Static asset requests are free and unlimited under Cloudflare Workers pricing; account limits and plan details can change, so review the [current pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/) before deployment.

The Wrangler config pins the asset directory to `./dist/`, uses `drop-trailing-slash` so `/quotaarc` and `/fossidesk` are canonical, and leaves unmatched URLs as real 404 responses. The old `/token-monitor` path is retained as a permanent redirect. Product directory index files and flat `.html` aliases remain in the generic build output for portability to other static hosts.

The QuotaArc product screenshot is `src/assets/token-monitor-preview.png`; keep its 1180 × 800 aspect ratio when replacing it. The homepage hover preview uses the same asset.

### Local build and verification

Requires Node.js 20 or newer. Wrangler 4 is pinned in `package.json` and `package-lock.json`.

```powershell
npm ci
npm run build
npm run test:analytics
npm run verify:production
npm run verify:cloudflare
npm run cloudflare:preview
```

`verify:production` builds and checks all English and Ukrainian pages, provider rules, SEO/language metadata, required assets, portable relative paths, and Cloudflare configuration, then runs the automated Wrangler routing smoke test. `verify:cloudflare` runs that route test on its own. `cloudflare:preview` starts Wrangler's interactive local asset server. Unknown pages/assets must return a localized HTTP 404; trailing-slash routes redirect to their no-slash canonical paths. The QuotaArc attribution module is included only when a valid public release asset is configured; the desktop app remains telemetry-free.

For a preview using only the generic static host resolver, use `node scripts/preview.mjs`. That preview serves built files directly and never rewrites unknown paths to the home page.

### Initial/manual deployment

Authenticate with the official Wrangler OAuth flow, then run:

```powershell
npx wrangler login
npm run verify:production
npm run cloudflare:deploy
```

The target public domain is `https://vivibureau.pp.ua/`; the target Worker identity is `vivi-bureau`. Keep the existing `supporthub` Worker and `https://supporthub.support-hub.workers.dev/` address available until the new domain and HTTPS certificate are verified. Do not change the Cloudflare account's `support-hub` workers.dev subdomain as part of this migration.

### Native Workers Builds from GitHub

Connect a separate `vivi-bureau` Worker to `u2loveme/supporthub` through Cloudflare Workers Builds. Keep the existing `supporthub` Worker and its current Builds binding intact until the new domain is live. Use the migration branch for initial verification, then `main` after acceptance, and set:

- Build command: `npm run verify:production`
- Deploy command: `npm run cloudflare:deploy`
- Root directory: repository root

Attach `vivibureau.pp.ua` as a Worker Custom Domain only after the domain is registered, its Cloudflare zone is active, and Cloudflare's assigned nameservers are set at the registrar. Verify the custom domain and HTTPS before changing links or retiring the legacy Worker.

After the custom domain passes its live checks, the legacy `supporthub` Worker can be switched to `wrangler.legacy.jsonc` to permanently redirect requests while preserving their path and query string. Until then, keep its current production deployment and Workers Builds configuration unchanged. The redirect-only deployment command is `npm run cloudflare:deploy:legacy`.

Workers Builds uses the Wrangler version pinned in this repository and deploys on pushes to `main`. GitHub authorization and the Workers Builds connection are configured in Cloudflare's dashboard; no Cloudflare credentials are stored in GitHub Actions or the repository.

### Static-host portability

The same `dist/` output remains usable on a conventional static host or under a repository subpath because it uses relative asset paths. Cloudflare Workers Static Assets is the production host; Cloudflare's native Workers Builds integration tracks `main`. GitHub Pages deployment was retired after Cloudflare's production build and live route checks passed. The GitHub repository remains public and unchanged otherwise.
