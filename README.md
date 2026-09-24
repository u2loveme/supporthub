# Support Hub

A static routing layer for optional application support. Each application has a stable route, while its provider settings stay centralized and independently replaceable. Support Hub does not accept or process payments.

## Project structure

- `src/assets/products.json` — product registry and per-product provider settings.
- `src/product.html` — shared product page template.
- `src/assets/app.js` and `styles.css` — shared rendering and presentation.
- `scripts/build.mjs` — builds generic static output in `dist/`.
- `scripts/verify-production.mjs` — builds and checks release files, providers, paths, and Wrangler configuration.
- `scripts/preview.mjs` — previews generic static output locally.
- `wrangler.jsonc` — Cloudflare Workers Static Assets settings.

## Product configuration

Each entry in `products` defines an `id`, display name, description, icon/accent, optional GitHub URL, suggested amounts, and separate Ukraine/international provider settings. Add an application by adding one complete object to `src/assets/products.json`; the shared template creates its routes without duplicated page markup. Keep IDs unique and URL-safe.

Suggested amounts are display-only and are never sent to a provider. Empty or omitted amounts do not affect provider links. Product routes and per-product provider URLs preserve attribution.

## Provider configuration

Provider states are `configured`, `unavailable`, and `coming_soon`. Only a valid public HTTPS URL in the `configured` state creates an active link. Each external action names its destination host and opens in a new tab. SupportHub does not assume amount preselection.

To swap a provider, edit only that product's provider entry. Verify onboarding, the public destination, and the real payment flow first; then set the verified HTTPS URL and change the state to `configured`. Invalid, placeholder, missing, or non-HTTPS URLs never become links.

Current provider URLs are intentionally empty. Token Monitor and FossiDesk Donatello/mono options remain `unavailable`; GitHub project URLs are also unset. PayPal is not configured or required. Do not activate a provider until its real URL is verified.

## Privacy

SupportHub itself does not use analytics, cookies, fingerprinting, accounts, payment processing, or card-detail collection. Hosting and external provider services may process technical request information under their own current policies. Review [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/) for the hosting provider's terms.

## Production hosting: Cloudflare Workers Static Assets

Production is intended to use Cloudflare Workers Static Assets on the `workers.dev` hostname. The build remains a static site: Wrangler serves `dist/` directly, with no Worker script, backend, database, or SPA fallback. Static asset requests are free and unlimited under Cloudflare Workers pricing; account limits and plan details can change, so review the [current pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/) before deployment.

The Wrangler config pins the asset directory to `./dist/`, uses `drop-trailing-slash` so `/token-monitor` and `/fossidesk` are canonical, and leaves unmatched URLs as real 404 responses. Product directory index files and flat `.html` aliases remain in the generic build output for portability to other static hosts.

### Local build and verification

Requires Node.js 20 or newer. Wrangler 4 is pinned in `package.json` and `package-lock.json`.

```powershell
npm ci
npm run build
npm run verify:production
npm run verify:cloudflare
npm run cloudflare:preview
```

`verify:production` checks the generated files, product/provider rules, generic relative paths, and Cloudflare configuration, then runs the automated Wrangler routing smoke test. `verify:cloudflare` runs that route test on its own. `cloudflare:preview` starts Wrangler's interactive local asset server. Unknown pages/assets must return 404; trailing-slash product URLs redirect to their no-slash canonical paths.

For a preview using only the generic static host resolver, use `node scripts/preview.mjs`. That preview serves built files directly and never rewrites unknown paths to the home page.

### Initial/manual deployment

Authenticate with the official Wrangler OAuth flow, then run:

```powershell
npx wrangler login
npm run verify:production
npm run cloudflare:deploy
```

The resulting public URL has the form `https://supporthub.<account-subdomain>.workers.dev`; use the exact hostname Wrangler reports. No API token belongs in this repository. An optional custom domain can be attached later without changing product route IDs or application routing concepts.

### Native Workers Builds from GitHub

Connect the existing Worker to `u2loveme/supporthub` through Cloudflare Workers Builds. Select `main` as the production branch and set:

- Build command: `npm run verify:production`
- Deploy command: `npm run cloudflare:deploy`
- Root directory: repository root

Workers Builds uses the Wrangler version pinned in this repository and deploys on pushes to `main`. GitHub authorization and the Workers Builds connection are configured in Cloudflare's dashboard; no Cloudflare credentials are stored in GitHub Actions or the repository.

### Static-host portability

The same `dist/` output remains usable on a conventional static host or under a repository subpath because it uses relative asset paths. Cloudflare Workers Static Assets is the production host; Cloudflare's native Workers Builds integration tracks `main`. GitHub Pages deployment was retired after Cloudflare's production build and live route checks passed. The GitHub repository remains public and unchanged otherwise.
