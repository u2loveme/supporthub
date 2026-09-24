# Support Hub

A static routing layer for optional application support. Each application has a stable route, while its payment providers and project link remain centralized and independently replaceable. Support Hub does not accept or process payments.

## Project structure

- `src/assets/products.json` — the product registry and per-product provider settings.
- `src/product.html` — the shared application page template.
- `src/assets/app.js` and `styles.css` — shared rendering and presentation.
- `scripts/build.mjs` — validates product route IDs and creates the deployable site in `dist/`.
- `scripts/verify-production.mjs` — builds and checks the release output and safety rules.
- `scripts/preview.mjs` — serves the built site locally.

## Product configuration

Each entry in `products` defines:

- `id` — stable URL segment, lowercase letters, numbers, and hyphens only.
- `displayName`, `shortDescription`, `icon`, and `accent` / `accentSoft` — product identity.
- `githubUrl` — optional HTTPS project link. Leave it empty until the destination is known.
- `suggestedAmounts` — optional display-only suggestions. These values are not sent to providers and do not affect provider navigation. If omitted or empty, provider choices still render normally.
- `providers.international` and `providers.ukraine` — separate provider settings for this application.

To add an application, add one complete product object to `products` in `src/assets/products.json`. Give it a unique route-safe `id`; the build creates `/<id>/` using the shared page template. No page markup needs to be copied. Product-specific provider URLs preserve attribution at the route and configuration level. If a provider is shared across products, use a provider-supported product reference only after verifying that feature.

## Provider configuration and replacement

Each provider has a `name`, a `state`, and a `url`. Supported states are:

| State | Page behavior |
| --- | --- |
| `configured` | Shows the region-specific support link only when `url` is a non-placeholder HTTPS URL. The card names the provider and shows its hostname before the external link. |
| `coming_soon` | Shows a status and explanatory text, with no payment button. |
| `unavailable` | Shows an unavailable status, with no payment button. |

To replace a provider, edit only that product's provider entry. First verify account onboarding, the payment destination, and a real payment flow. Then set its `name`, set `url` to the verified HTTPS destination, and change `state` to `configured`. The page opens the provider in a new tab and labels the action “Support internationally” or “Support from Ukraine.” It does not add amount parameters or assume amount preselection. A missing, invalid, placeholder, or non-HTTPS URL never becomes a link, even if its state says `configured`.

### Current provider URL status

No payment destination is verified or active in this configuration:

- Token Monitor — Donatello (international) and mono jar (Ukraine): URLs empty; unverified candidates.
- FossiDesk — Donatello (international) and mono jar (Ukraine): URLs empty; unverified candidates.
- PayPal is not configured and is not a dependency.

GitHub/project URLs are also empty until verified destinations are supplied. Do not change a provider to `configured` until its URL and onboarding/payment flow have been checked.

## Attribution and privacy

The product route and per-product provider URL provide the primary attribution. Configure separate provider endpoints per application when possible. Support Hub does not add analytics, cookies, accounts, fingerprinting, payment processing, or card-detail collection. Payment-provider and static-host sites are external and may apply their own privacy practices. GitHub Pages states that visitor IP addresses are logged for security purposes ([GitHub Pages privacy documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)).

## Production deployment

Requires Node.js 20 or newer. No package installation or third-party runtime dependency is needed.

```powershell
npm run verify:production
```

The command runs the production build and checks the generated pages, assets, parsed product configuration, route ID uniqueness, provider URL rules, external-link safety, and relative asset paths. Publish the resulting `dist/` directory.

The build emits both `/<id>.html` and `/<id>/index.html` for every product from the same page template. A host can resolve a no-slash URL through its clean-URL support or redirect it to the directory index; slash URLs resolve directly to `index.html`. This is static output and does not depend on a development server or SPA fallback. Relative assets and links work at the site root and below a repository subpath. No production hostname or domain is embedded in the build.

For GitHub Pages, publish the whole `dist/` tree; the build includes the required top-level `index.html` and a `.nojekyll` marker. Its product folders contain `index.html`, while flat HTML aliases support hosts that resolve extensionless URLs to `.html`. No separate SPA fallback is needed. GitHub Pages documents that it publishes static files in the source tree and looks for a top-level `index.html` entry file ([deployment documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)).

For a cold local check of the production files, run:

```powershell
node scripts/preview.mjs --port=4174
```

To preview it mounted under a subpath, use `node scripts/preview.mjs --port=4175 --base=/supporthub`. The preview serves files from `dist/` directly; it does not rewrite unknown paths to the home page.

Before configuring real payments, replace only the product's provider `url` with the verified public HTTPS address and change its state to `configured`. The production verifier rejects configured providers with missing, unsafe, or non-HTTPS destinations. Keep providers `unavailable` or `coming_soon` until account onboarding and the payment flow are verified. Donatello, mono jar, PayPal, and GitHub URLs remain unconfigured in the current product data.

Upload the contents of `dist/` to GitHub Pages or another conventional static host. Keep the generated relative paths intact. No domain, backend, database, or production provider account is required to publish the unavailable-state pages.
