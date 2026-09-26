import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateProducts } from "./config.mjs";
import { resolveProvider } from "../src/assets/provider-policy.js";
import { quotaarcRelease } from "../src/quotaarc-release.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const sitePrefix = process.env.SUPPORTHUB_BASE_PATH?.trim() ?? "";
const build = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
assert.ok((await stat(output)).isDirectory(), "Production output directory dist/ must exist after build");

async function requireFile(relativePath) {
  const filePath = path.join(output, relativePath);
  assert.ok((await stat(filePath)).isFile(), `Missing production file: dist/${relativePath}`);
  return readFile(filePath, "utf8");
}

const cloudflare = JSON.parse(await readFile(path.join(root, "wrangler.jsonc"), "utf8"));
assert.equal(cloudflare.name, "vivi-bureau", "Cloudflare Worker must use the Vivi Bureau identity");
assert.equal(cloudflare.workers_dev, true, "Cloudflare workers.dev must be enabled");
assert.equal(cloudflare.send_metrics, false, "Wrangler metrics must stay disabled");
assert.equal(cloudflare.dependencies_instrumentation?.enabled, false, "Dependency instrumentation must stay disabled");
assert.equal(cloudflare.assets?.directory, "./dist/", "Cloudflare must publish the production output directory");
assert.equal(cloudflare.assets?.html_handling, "drop-trailing-slash", "Cloudflare routes must use canonical no-slash URLs");
assert.equal(cloudflare.assets?.not_found_handling, "404-page", "Unknown routes must use real localized 404 pages");
assert.equal(cloudflare.main, "./src/download-worker.js", "Download routing must use the focused Worker entrypoint");
assert.equal(cloudflare.assets?.binding, "ASSETS", "The Worker must be able to delegate regular routes to static assets");
assert.deepEqual(cloudflare.assets?.run_worker_first, ["/quotaarc/download*", "/uk/quotaarc/download*"], "Only localized QuotaArc download paths should run through the Worker first");
assert.deepEqual(cloudflare.analytics_engine_datasets, [{ binding: "QUOTAARC_ANALYTICS", dataset: "quotaarc_download_events" }]);
const releaseSource = await readFile(path.join(root, "src/quotaarc-release.js"), "utf8");
const releaseConfigured = quotaarcRelease.version !== "" && quotaarcRelease.url !== "";
if (releaseConfigured) {
  assert.equal(quotaarcRelease.version, "0.9.0");
  assert.equal(quotaarcRelease.url, "https://github.com/u2loveme/QuotaArc/releases/download/v0.9.0/QuotaArc-0.9.0-win-x64.zip");
  assert.match(releaseSource, /version:\s*"0\.9\.0"/);
  assert.match(releaseSource, /releases\/download\/v0\.9\.0\/QuotaArc-0\.9\.0-win-x64\.zip/);
} else {
  assert.match(releaseSource, /version:\s*""/);
  assert.match(releaseSource, /url:\s*""/);
}

const sourceProducts = JSON.parse(await readFile(path.join(root, "src/assets/products.json"), "utf8"));
const products = validateProducts(sourceProducts.products);
const builtProducts = JSON.parse(await requireFile("assets/products.json"));
validateProducts(builtProducts.products);
assert.deepEqual(builtProducts, sourceProducts, "Built product configuration must match the source configuration");
assert.throws(
  () => validateProducts([{ id: "duplicate-id" }, { id: "duplicate-id" }]),
  /Duplicate product id/,
  "Duplicate product IDs must fail validation"
);
assert.throws(
  () => validateProducts([{ id: "provider-check", providers: { international: { state: "configured", url: "http://not-a-payment-url" } } }]),
  /valid public HTTPS URL/,
  "A configured provider must have a valid public HTTPS URL"
);
assert.equal(resolveProvider({ state: "unavailable", url: "unverified" }).destination, null);
assert.equal(resolveProvider({ state: "coming_soon", url: "unverified" }).destination, null);
assert.equal(resolveProvider({ state: "configured", url: "javascript:alert(1)" }).destination, null);

const quotaArc = products.find((product) => product.id === "quotaarc");
assert.ok(quotaArc, "QuotaArc must be the canonical registered product");
assert.equal(quotaArc.displayName, "QuotaArc");
assert.equal(quotaArc.providers.ukraine.name, "mono");
assert.equal(quotaArc.providers.ukraine.nameInArtwork, true);
assert.equal(quotaArc.providers.ukraine.state, "configured");
assert.equal(quotaArc.providers.ukraine.url, "https://send.monobank.ua/jar/2DSgR5hSoW");
assert.equal(quotaArc.providers.international.state, "configured");
assert.equal(quotaArc.providers.international.url, "https://donatello.to/vlad_2love?g=quota-arc");
const fossiDesk = products.find((product) => product.id === "fossidesk");
assert.ok(fossiDesk, "FossiDesk must remain registered");
assert.equal(fossiDesk.providers.ukraine.state, "unavailable");
assert.equal(fossiDesk.providers.international.state, "unavailable");
assert.ok(products.every((product) => product.githubUrl === ""), "No unverified GitHub provider URLs may be active");

const expectedAssets = ["download-attribution-core.js", "download-attribution.js", "products.json", "styles.css", "support-international.webp", "support-ukraine.webp", "token-monitor-icon.png", "token-monitor-mono-qr.png", "token-monitor-preview.png", "vivienne.jpg", "vivienne.webp"];
for (const asset of expectedAssets) await requireFile(`assets/${asset}`);
assert.deepEqual((await readdir(path.join(output, "assets"))).sort(), expectedAssets.slice().sort(), "Production must contain only required static assets");
await requireFile(".nojekyll");
await requireFile("404.html");
await requireFile("uk/404.html");
await assert.rejects(stat(path.join(output, "assets", "app.js")), "The client-side renderer must not ship");

const translations = Object.fromEntries(await Promise.all(["en", "uk"].map(async (locale) => [
  locale,
  JSON.parse(await readFile(path.join(root, "src/locales", `${locale}.json`), "utf8"))
])));
for (const product of products) {
  for (const locale of Object.values(translations)) {
    assert.equal(locale.lang === "en" ? "en" : "uk", locale.lang, "Locale HTML language code must be standard");
    assert.ok(locale.products[product.id]?.shortDescription, `Missing ${locale.lang} description for ${product.id}`);
    assert.ok(locale.products[product.id]?.supportMessage, `Missing ${locale.lang} support copy for ${product.id}`);
    if (product.id === "quotaarc") assert.ok(locale.products[product.id]?.previewAlt, `Missing ${locale.lang} preview alt text`);
  }
}

function canonicalRoute(locale, productId = null) {
  const prefix = locale === "uk" ? "/uk" : "";
  return productId ? `${prefix}/${productId}` : locale === "uk" ? "/uk" : "/";
}

function expectedBody(locale, productId = null) {
  if (!productId) return translations[locale].homeTitle;
  const product = products.find((item) => item.id === productId);
  if (productId === "quotaarc") return locale === "uk" ? "Підтримати через mono" : "Support via mono";
  return translations[locale].emptySupport;
}

function validateSeo(html, routePath, locale, productId = null) {
  assert.match(html, new RegExp(`<html lang="${locale}">`), `${routePath} must declare lang=${locale}`);
  if (!(productId === "quotaarc" && releaseConfigured)) {
    assert.doesNotMatch(html, /<script\b/i, `${routePath} must be static HTML with no client-side rendering script`);
  }
  assert.match(html, /<meta property="og:locale"/);
  assert.match(html, /<meta property="og:site_name" content="Vivi Bureau"\s*\/>/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/vivibureau\.pp\.ua[^\"]*"\s*\/>/);
  assert.match(html, /<meta name="application-name" content="Vivi Bureau"\s*\/>/);
  assert.match(html, /<meta name="twitter:card" content="summary"\s*\/>/);
  assert.match(html, /<meta name="twitter:title"/);
  assert.match(html, /<meta name="twitter:description"/);
  assert.doesNotMatch(html, /Support\s*Hub/i, `${routePath} must not expose the former public brand`);
  const visibleText = html.replace(/<[^>]*>/g, "");
  assert.ok(visibleText.includes(expectedBody(locale, productId)), `${routePath} must contain its ${locale} UI copy in built HTML`);

  const fullRoute = `${sitePrefix}${routePath}` || "/";
  const base = `https://vivibureau.pp.ua${fullRoute}`;
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"\s*\/>/);
  assert.ok(canonical, `${routePath} must have a self-canonical`);
  const canonicalUrl = new URL(canonical[1], base);
  assert.equal(canonicalUrl.origin, "https://vivibureau.pp.ua", `${routePath} canonical must use the public domain`);
  assert.equal(canonicalUrl.pathname, canonicalRoute(locale, productId), `${routePath} canonical must target its own locale route`);

  const hreflangs = [...html.matchAll(/<link rel="alternate" hreflang="(en|uk|x-default)" href="([^"]+)"\s*\/>/g)];
  assert.equal(hreflangs.length, 3, `${routePath} must list reciprocal EN, UK, and x-default alternates`);
  const alternateUrls = Object.fromEntries(hreflangs.map(([, language, href]) => [language, new URL(href, base)]));
  const routes = Object.fromEntries(Object.entries(alternateUrls).map(([language, url]) => [language, url.pathname]));
  assert.ok(Object.values(alternateUrls).every((url) => url.origin === "https://vivibureau.pp.ua"), `${routePath} hreflang URLs must use the public domain`);
  assert.equal(routes.en, canonicalRoute("en", productId));
  assert.equal(routes.uk, canonicalRoute("uk", productId));
  assert.equal(routes["x-default"], routes.en);

  const stylesheet = html.match(/<link rel="stylesheet" href="([^"]+)"/);
  assert.ok(stylesheet, `${routePath} must reference its stylesheet`);
  const stylesheetPath = new URL(stylesheet[1], base).pathname;
  assert.equal(stylesheetPath, `${sitePrefix}/assets/styles.css`, `${routePath} asset path must work at root and subpath hosting`);
}

function pageFiles(locale, productId = null) {
  if (productId) {
    const route = canonicalRoute(locale, productId).slice(1);
    return [
      { file: `${route}.html`, documentPath: canonicalRoute(locale, productId) },
      { file: `${route}/index.html`, documentPath: `${canonicalRoute(locale, productId)}/` }
    ];
  }
  if (locale === "uk") return [
    { file: "uk.html", documentPath: "/uk" },
    { file: "uk/index.html", documentPath: "/uk/" }
  ];
  return [{ file: "index.html", documentPath: "/" }];
}

for (const locale of ["en", "uk"]) {
  for (const page of pageFiles(locale)) {
    const html = await requireFile(page.file);
    validateSeo(html, page.documentPath, locale);
    if (page.file.includes("index")) {
      assert.match(html, new RegExp(`href="(?:\\.\\./)?(?:\\./)?${locale === "uk" ? "quotaarc" : "quotaarc"}`), "App navigation must use the canonical QuotaArc route");
    }
  }

  for (const product of products) {
    for (const page of pageFiles(locale, product.id)) {
      const html = await requireFile(page.file);
      validateSeo(html, page.documentPath, locale, product.id);
      assert.match(html, /Vivi Bureau/);
      assert.doesNotMatch(html, /__([A-Z0-9_]+)__/);
      assert.ok(!/<a\b[^>]*\bhref\s*=\s*["']\s*(?:javascript|data|vbscript):/i.test(html), `${page.file} must not contain unsafe protocols`);
      const languageLinks = [...html.matchAll(/<a href="([^"]+)" lang="(en|uk)" hreflang="\2"/g)];
      assert.equal(languageLinks.length, 2, `${page.file} must include a two-language switcher`);
      assert.match(html, /aria-current="page"/, `${page.file} must identify the active language`);
      assert.match(html, /aria-label="[^"]+"/, `${page.file} must label its language navigation`);
      assert.match(html, /aria-labelledby="(?:product-title|home-title)/, `${page.file} must use semantic section labels`);
      assert.match(html, /a:focus-visible|styles\.css/, `${page.file} must load visible keyboard focus styling`);
      if (product.id === "quotaarc") {
        assert.match(html, /class="product-preview"><img src="(?:(?:\.\.\/)|(?:\.\/))*assets\/token-monitor-preview\.png" alt="[^"]+" width="1180" height="800"/);
        assert.match(html, /<link rel="icon" href="(?:(?:\.\.\/)|(?:\.\/))*assets\/token-monitor-icon\.png"\s*\/>/);
        assert.match(html, /class="product-icon" aria-hidden="true"><img src="(?:(?:\.\.\/)|(?:\.\/))*assets\/token-monitor-icon\.png" alt=""/);
        assert.match(html, /href="https:\/\/send\.monobank\.ua\/jar\/2DSgR5hSoW"/);
        assert.match(html, /href="https:\/\/donatello\.to\/vlad_2love\?g=quota-arc" target="_blank" rel="noopener noreferrer"/);
        assert.doesNotMatch(html, /provider-placeholder/, `${page.file} must not render an empty provider placeholder`);
        assert.equal((html.match(/class="provider-action"/g) ?? []).length, 2, `${page.file} must show both provider actions`);
        assert.equal((html.match(/<a class="provider-action"/g) ?? []).length, 2, `${page.file} must link both configured provider actions`);
        assert.equal((html.match(/<button class="provider-action"[^>]* disabled>/g) ?? []).length, 0, `${page.file} must not show a disabled configured provider`);
        assert.equal((html.match(/class="provider-card /g) ?? []).length, 2, `${page.file} must show both support choices`);
        assert.equal((html.match(/class="trust-note"/g) ?? []).length, 1, `${page.file} must show exactly one trust statement`);
        const renderedTrustNote = html.match(/<p class="trust-note">([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]*>/g, "");
        assert.equal(renderedTrustNote, translations[locale].trustNote, `${page.file} must preserve its localized trust statement`);
        assert.match(html, /class="trust-note-context"/);
        assert.match(html, /class="trust-note-reassurance"/);
        assert.match(html, /Support via mono|Підтримати через mono/, `${page.file} must use clear mono support language`);
        assert.match(html, /Donatello/);
        assert.ok(html.includes(translations[locale].supportInternationally), `${page.file} must show the localized international support action`);
        assert.match(html, /International support|Міжнародна підтримка/);
        assert.match(html, /class="provider-region">Donatello<\/span>/);
        assert.doesNotMatch(html, /<p class="provider-name">Donatello<\/p>/);
        assert.match(html, /<span class="provider-note-emphasis">Visa \/ Mastercard<\/span> via Donatello\.|<span class="provider-note-emphasis">Visa \/ Mastercard<\/span> через Donatello\./);
        assert.doesNotMatch(html, /send\.monobank\.ua in a new tab|send\.monobank\.ua в новій вкладці/);
      } else {
        assert.doesNotMatch(html, /token-monitor-icon\.png/, `${page.file} must not use the Token Monitor icon`);
        assert.doesNotMatch(html, /href="https:\/\/send\.monobank\.ua/, `${page.file} must not expose a provider link`);
        assert.doesNotMatch(html, /provider-placeholder/, `${page.file} must not gain the Token Monitor reserved slot`);
      }

      const anchors = [...html.matchAll(/<a\b([^>]*)>/g)].map(([, attributes]) => attributes);
      for (const attributes of anchors.filter((item) => /href="https?:\/\//i.test(item))) {
        assert.match(attributes, /target="_blank"/, `${page.file} external links must open in a new tab`);
        assert.match(attributes, /rel="noopener noreferrer"/, `${page.file} external links must use safe rel attributes`);
      }
    }
  }
}

const quotaArcPage = await requireFile("quotaarc.html");
assert.match(quotaArcPage, /href="https:\/\/send\.monobank\.ua\/jar\/2DSgR5hSoW" target="_blank" rel="noopener noreferrer"/);
assert.match(quotaArcPage, /Banka · Ukraine/);
assert.match(quotaArcPage, /Support via mono/);
assert.match(quotaArcPage, /href="https:\/\/donatello\.to\/vlad_2love\?g=quota-arc" target="_blank" rel="noopener noreferrer"/);
assert.match(quotaArcPage, /class="provider-name sr-only">mono<\/p>/);
assert.match(quotaArcPage, /assets\/support-ukraine\.webp/);
assert.match(quotaArcPage, /assets\/support-international\.webp/);
assert.doesNotMatch(quotaArcPage, /provider-placeholder/);
assert.match(quotaArcPage, /QuotaArc/);
assert.doesNotMatch(quotaArcPage, /card number|\b\d{16}\b/i);
assert.doesNotMatch(quotaArcPage, /Unavailable|No payment link is configured/i);
if (releaseConfigured) {
  assert.match(quotaArcPage, /data-download-attribution|download-attribution\.js|Download for Windows/);
} else {
  assert.doesNotMatch(quotaArcPage, /data-download-attribution|download-attribution\.js|Download for Windows/);
}
assert.match(await requireFile("uk/quotaarc.html"), /Donatello/);
if (releaseConfigured) {
  assert.match(await requireFile("uk/quotaarc.html"), /data-download-attribution|download-attribution\.js|Завантажити для Windows/);
} else {
  assert.doesNotMatch(await requireFile("uk/quotaarc.html"), /data-download-attribution|download-attribution\.js|Завантажити для Windows/);
}
assert.doesNotMatch(await requireFile("uk/quotaarc.html"), /Номер картки|\b\d{16}\b/i);
const redirectRules = await requireFile("_redirects");
assert.match(redirectRules, /^\/token-monitor \/quotaarc 301$/m);
assert.match(redirectRules, /^\/uk\/token-monitor \/uk\/quotaarc 301$/m);
for (const locale of ["en", "uk"]) {
  const fossi = await requireFile(locale === "uk" ? "uk/fossidesk.html" : "fossidesk.html");
  assert.ok(fossi.includes(translations[locale].emptySupport));
  assert.doesNotMatch(fossi, /mono|Donatello|send\.monobank\.ua|href="https:\/\/github\.com/i);
  assert.doesNotMatch(fossi, /<a\b[^>]*class="provider-action"/);
  assert.doesNotMatch(fossi, /support-(?:international|ukraine)\.webp/);
  assert.doesNotMatch(fossi, /Payments are handled|Оплата відбувається|provider-placeholder|trust-note/);
}

const englishHome = await requireFile("index.html");
const ukrainianHome = await requireFile("uk.html");
assert.match(englishHome, /class="project-icon" aria-hidden="true"><img src="\.\/assets\/token-monitor-icon\.png" alt=""/);
assert.match(ukrainianHome, /class="project-icon" aria-hidden="true"><img src="\.\/assets\/token-monitor-icon\.png" alt=""/);
assert.match(englishHome, /class="project-card has-preview"/);
assert.match(ukrainianHome, /class="project-card has-preview"/);
assert.match(englishHome, /<strong>QuotaArc<\/strong>/);
assert.match(ukrainianHome, /<strong>QuotaArc<\/strong>/);
assert.doesNotMatch(englishHome, /Token Monitor|Codex Usage Monitor/);
assert.doesNotMatch(ukrainianHome, /Token Monitor|Codex Usage Monitor/);
assert.match(englishHome, /<h1 id="home-title">Vivi <span class="home-title-accent">Bureau<\/span><\/h1>/);
assert.match(englishHome, /Apps, tools &amp; side projects\./);
assert.match(ukrainianHome, /<h1 id="home-title">Vivi <span class="home-title-accent">Bureau<\/span><\/h1>/);
assert.match(ukrainianHome, /Застосунки, інструменти та власні проєкти\./);
assert.match(englishHome, /href="#projects">Projects<\/a>/);
assert.match(ukrainianHome, /href="#projects">Проєкти<\/a>/);
assert.doesNotMatch(englishHome, /class="project-preview"/, "Project card must not show a static screenshot thumbnail");
const builtStyles = await requireFile("assets/styles.css");
assert.match(builtStyles, /project-card\.has-preview:hover::before, \.project-card\.has-preview:focus-visible::before/);
assert.match(builtStyles, /url\("\.\/token-monitor-preview\.png"\)/);
assert.match(englishHome, /<link rel="icon" href="data:image\/svg\+xml,/ , "Vivi Bureau homepage must keep its own favicon");
assert.match(englishHome, /alt="Vivienne, a brown tabby cat with green eyes"/);
assert.match(ukrainianHome, /alt="Віві/);
assert.match(englishHome, /loading="lazy"[\s\S]*decoding="async"/);
assert.match(englishHome, /aria-label="Vivienne’s QA note"/);
assert.match(ukrainianHome, /aria-label="Нотатка від Віві"/);
assert.match(await requireFile("404.html"), /Vivi Bureau home/);
assert.match(await requireFile("uk/404.html"), /На головну Vivi Bureau/);

const assets = [
  new URL("./assets/styles.css", "file:///supporthub/").pathname,
  new URL("../../assets/styles.css", "file:///supporthub/uk/quotaarc/").pathname,
  new URL("../assets/styles.css", "file:///supporthub/uk/quotaarc").pathname
];
assert.deepEqual(assets, ["/supporthub/assets/styles.css", "/supporthub/assets/styles.css", "/supporthub/assets/styles.css"], "Relative asset paths must preserve static subpath hosting");

const cloudflareSmoke = spawnSync(process.execPath, ["scripts/verify-cloudflare.mjs"], { cwd: root, stdio: "inherit" });
if (cloudflareSmoke.error) throw cloudflareSmoke.error;
if (cloudflareSmoke.status !== 0) process.exit(cloudflareSmoke.status ?? 1);

console.log(`Production verification passed: ${products.length} apps, ${products.length * 2 + 1} EN/UK route families, static SEO, provider policy, portable assets, and Cloudflare routing.`);
