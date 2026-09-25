import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProducts } from "./config.mjs";
import { parseSafeGithubUrl, resolveProvider } from "../src/assets/provider-policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const output = path.join(root, "dist");
const assetSource = path.join(source, "assets");
const configuredBasePath = process.env.SUPPORTHUB_BASE_PATH?.trim() ?? "";
if (configuredBasePath && (!/^\/(?:[a-z0-9-]+)(?:\/[a-z0-9-]+)*$/i.test(configuredBasePath) || configuredBasePath.includes(".."))) {
  throw new Error("SUPPORTHUB_BASE_PATH must be an optional simple path such as /supporthub, without a trailing slash");
}
const productConfig = JSON.parse(await readFile(path.join(assetSource, "products.json"), "utf8"));
const products = validateProducts(productConfig.products);
const localeCodes = ["en", "uk"];
const locales = Object.fromEntries(await Promise.all(localeCodes.map(async (code) => [
  code,
  JSON.parse(await readFile(path.join(source, "locales", `${code}.json`), "utf8"))
])));
const homeTemplate = await readFile(path.join(source, "index.html"), "utf8");
const productTemplate = await readFile(path.join(source, "product.html"), "utf8");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function emphasizedSentencePair(value, firstClass, secondClass) {
  const text = String(value);
  const separator = text.indexOf(". ");
  if (separator < 0) return escapeHtml(text);
  return `<span class="${firstClass}">${escapeHtml(text.slice(0, separator + 1))}</span> <span class="${secondClass}">${escapeHtml(text.slice(separator + 2))}</span>`;
}

function footerTagline(value) {
  const text = String(value);
  return text.endsWith(".")
    ? `${escapeHtml(text.slice(0, -1))}<span class="footer-signature-dot">.</span>`
    : escapeHtml(text);
}

function accentPhrase(value, phrase) {
  const text = String(value);
  const index = text.indexOf(phrase);
  if (index < 0 || !phrase) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, index))}<span class="home-title-accent">${escapeHtml(phrase)}</span>${escapeHtml(text.slice(index + phrase.length))}`;
}

function providerNoteMarkup(value) {
  const text = String(value);
  const match = /(?:Visa\s*\/\s*Mastercard|mono Banka|Банку mono)/i.exec(text);
  if (!match) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, match.index))}<span class="provider-note-emphasis">${escapeHtml(match[0])}</span>${escapeHtml(text.slice(match.index + match[0].length))}`;
}

function fill(template, values) {
  return template.replace(/__([A-Z0-9_]+)__/g, (token, key) => {
    if (!(key in values)) throw new Error(`Unresolved page template token: ${token}`);
    return values[key];
  });
}

function productRoute(localeCode, productId) {
  const localePrefix = localeCode === "uk" ? "/uk" : "";
  return `${localePrefix}/${productId}`;
}

function homeRoute(localeCode) {
  return localeCode === "uk" ? "/uk" : "/";
}

function publicPath(route) {
  return route === "/" ? `${configuredBasePath}/` : `${configuredBasePath}${route}`;
}

function relativeHref(fromDocumentPath, targetPath) {
  const fromPath = new URL(fromDocumentPath, "https://supporthub.invalid").pathname;
  const target = new URL(targetPath, "https://supporthub.invalid").pathname;
  const fromDirectory = fromPath.endsWith("/") ? fromPath : `${path.posix.dirname(fromPath)}/`;
  let relative = path.posix.relative(fromDirectory, target);

  if (!relative && fromPath.endsWith("/") && target !== fromPath) {
    relative = `../${path.posix.basename(fromPath.slice(0, -1))}`;
  }
  if (!relative) return "./";
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function languageFlag(code) {
  if (code === "uk") {
    return '<svg class="language-flag" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="6" fill="#1688e8"/><rect y="6" width="18" height="6" fill="#ffd43b"/></svg>';
  }
  return '<svg class="language-flag" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" fill="#012169"/><path d="M0 0 18 12M18 0 0 12" stroke="#fff" stroke-width="3.2"/><path d="M0 0 18 12M18 0 0 12" stroke="#c8102e" stroke-width="1.2"/><path d="M9 0v12M0 6h18" stroke="#fff" stroke-width="5"/><path d="M9 0v12M0 6h18" stroke="#c8102e" stroke-width="2.3"/></svg>';
}

function languageSwitcher(localeCode, documentPath, equivalentId = null, useBasePath = false) {
  const englishTarget = equivalentId ? productRoute("en", equivalentId) : homeRoute("en");
  const ukrainianTarget = equivalentId ? productRoute("uk", equivalentId) : homeRoute("uk");
  const locale = locales[localeCode];
  const languageLinks = [
    ["en", "EN", locale.languageEnglish, englishTarget],
    ["uk", "УКР", locale.languageUkrainian, ukrainianTarget]
  ];

  return `<nav class="language-switch" aria-label="${escapeHtml(locale.languageNav)}">${languageLinks.map(([code, shortLabel, fullLabel, target]) => {
    const current = code === localeCode ? ' aria-current="page"' : "";
    const href = useBasePath ? publicPath(target) : relativeHref(documentPath, target);
    return `<a href="${escapeHtml(href)}" lang="${code}" hreflang="${code}"${current}>${languageFlag(code)}${shortLabel}<span class="sr-only"> — ${escapeHtml(fullLabel)}</span></a>`;
  }).join('<span class="language-divider" aria-hidden="true">|</span>')}</nav>`;
}

function localizedProduct(product, localeCode) {
  const translation = locales[localeCode].products?.[product.id];
  return {
    ...product,
    shortDescription: translation?.shortDescription ?? product.shortDescription,
    supportMessage: translation?.supportMessage ?? product.supportMessage
  };
}

function safeColor(value, pattern, fallback) {
  return typeof value === "string" && pattern.test(value) ? value : fallback;
}

function productIcon(product, className, documentPath) {
  const contents = product.iconImage
    ? `<img src="${escapeHtml(relativeHref(documentPath, `/assets/${product.iconImage}`))}" alt="" decoding="async" />`
    : escapeHtml(product.icon);
  return `<span class="${className}" aria-hidden="true">${contents}</span>`;
}

function productCard(product, localeCode, documentPath) {
  const locale = locales[localeCode];
  const route = relativeHref(documentPath, productRoute(localeCode, product.id));
  const accent = safeColor(product.accent, /^#[0-9a-f]{6}$/i, "#f2a875");
  const accentSoft = safeColor(product.accentSoft, /^rgba?\([\d.,%\s]+\)$/i, "rgba(242, 168, 117, .13)");
  const hasPreview = Boolean(product.previewImage);
  return `<a class="project-card${hasPreview ? " has-preview" : ""}" href="${escapeHtml(route)}" style="--product-accent:${accent};--product-accent-soft:${accentSoft}">
    ${productIcon(product, "project-icon", documentPath)}
    <span class="project-copy"><strong>${escapeHtml(product.displayName)}</strong><small>${escapeHtml(localizedProduct(product, localeCode).shortDescription)}</small></span>
    <span class="project-cta">${escapeHtml(locale.viewSupport)} <span aria-hidden="true">→</span></span>
  </a>`;
}

function catSignature(localeCode, documentPath) {
  const locale = locales[localeCode];
  const webp = relativeHref(documentPath, "/assets/vivienne.webp");
  const jpeg = relativeHref(documentPath, "/assets/vivienne.jpg");
  return `<aside class="cat-signature" aria-label="${escapeHtml(locale.catLandmark)}">
    <picture class="cat-photo">
      <source srcset="${escapeHtml(webp)}" type="image/webp" />
      <img src="${escapeHtml(jpeg)}" alt="${escapeHtml(locale.catAlt)}" width="1000" height="750" loading="lazy" decoding="async" draggable="false" />
    </picture>
    <div class="cat-copy"><span class="eyebrow">${escapeHtml(locale.catRegion)}</span><p>${escapeHtml(locale.catCaption)}</p></div>
  </aside>`;
}

function renderHomeContent(localeCode, documentPath) {
  const locale = locales[localeCode];
  return `<section class="home-hero" aria-labelledby="home-title">
    <h1 id="home-title">${accentPhrase(locale.homeTitle, locale.homeTitleAccent)}</h1>
    <p>${escapeHtml(locale.homeDescription)}</p>
  </section>
  <div class="home-overview">
    <section class="projects-section" id="projects" aria-labelledby="projects-title">
      <div class="section-heading"><h2 id="projects-title">${escapeHtml(locale.projectsTitle)}</h2></div>
      <div class="project-list">${products.map((product) => productCard(product, localeCode, documentPath)).join("")}</div>
    </section>
    ${catSignature(localeCode, documentPath)}
  </div>`;
}

function providerCard(localeCode, provider, region, documentPath) {
  const locale = locales[localeCode];
  const { state, destination } = resolveProvider(provider);
  const isConfigured = state === "configured";
  const isComingSoon = state === "coming_soon";
  const isUkraine = region === "ukraine";
  const fallbackProviderName = isUkraine ? locale.providerUkraine : locale.providerInternational;
  const providerName = typeof provider.name === "string" && provider.name.trim() ? provider.name.trim() : fallbackProviderName;
  const regionLabel = isUkraine ? locale.providerUkraine : providerName;
  const providerNameClass = provider.nameInArtwork === true ? " sr-only" : "";
  const providerNameMarkup = isUkraine ? `<p class="provider-name${providerNameClass}">${escapeHtml(providerName)}</p>` : "";
  const title = isUkraine ? locale.providerUkraineTitle : locale.providerInternationalTitle;
  const titleWords = title.split(/\s+/);
  const titleMarkup = titleWords.length > 1
    ? `<span>${escapeHtml(titleWords.slice(0, -1).join(" "))}</span><span>${escapeHtml(titleWords.at(-1))}</span>`
    : escapeHtml(title);
  const note = isComingSoon
    ? locale.providerInternationalNote
    : (isUkraine ? locale.providerUkraineNote : locale.providerInternationalNote);
  const artwork = isUkraine ? "support-ukraine.webp" : "support-international.webp";
  const providerArtwork = `<figure class="provider-artwork" aria-hidden="true"><img src="${escapeHtml(relativeHref(documentPath, `/assets/${artwork}`))}" alt="" width="1536" height="1024" decoding="async" /></figure>`;
  const stateLabel = isComingSoon ? locale.providerComingSoon : "";
  const actionText = isUkraine ? locale.supportViaMono : locale.supportInternationally;
  const providerNote = isConfigured && !isUkraine ? locale.providerInternationalConfiguredNote : note;
  const qrMarkup = isConfigured && isUkraine && provider.qrImage
    ? `<a class="provider-qr" href="${escapeHtml(destination)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(locale.providerQrAction)}"><img src="${escapeHtml(relativeHref(documentPath, `/assets/${provider.qrImage}`))}" alt="" width="128" height="128" decoding="async" /></a>`
    : "";
  const actionMarkup = isConfigured
    ? `<a class="provider-action" href="${escapeHtml(destination)}" target="_blank" rel="noopener noreferrer"><span class="provider-action-content">${escapeHtml(actionText)} <span aria-hidden="true">↗</span></span></a>`
    : (isComingSoon ? `<button class="provider-action" type="button" disabled>${escapeHtml(actionText)} <span aria-hidden="true">↗</span></button>` : "");

  return `<article class="provider-card ${isConfigured ? "is-configured" : "is-coming-soon"}${isUkraine ? "" : " is-international"}${qrMarkup ? " has-qr" : ""}">
    <div class="provider-topline"><span class="provider-region">${escapeHtml(regionLabel)}</span>${stateLabel ? `<span class="provider-status">${escapeHtml(stateLabel)}</span>` : ""}</div>
    <div class="provider-identity">
      <h3 class="provider-title" aria-label="${escapeHtml(title)}">${titleMarkup}</h3>
      ${providerNameMarkup}
    </div>
    ${providerArtwork}
    ${qrMarkup}
    <div class="provider-bottom">
      <p class="provider-note">${providerNoteMarkup(providerNote)}</p>
      ${actionMarkup}
    </div>
  </article>`;
}

function renderSupport(product, localeCode, documentPath) {
  const locale = locales[localeCode];
  const providers = ["international", "ukraine"].flatMap((region) => {
    const provider = product.providers?.[region];
    const state = resolveProvider(provider).state;
    return state === "configured" || state === "coming_soon" ? [{ provider, region }] : [];
  });
  const hasConfiguredProvider = providers.some(({ provider }) => resolveProvider(provider).state === "configured");
  const options = providers.length
    ? `<div class="provider-grid">${providers.map(({ provider, region }) => providerCard(localeCode, provider, region, documentPath)).join("")}</div>`
    : `<p class="support-empty">${escapeHtml(locale.emptySupport)}</p>`;

  return `<section class="support-section" aria-labelledby="support-title">
    <div class="support-heading"><h2 id="support-title">${escapeHtml(locale.supportTitle)}</h2></div>
    ${options}
    ${hasConfiguredProvider ? `<p class="trust-note">${emphasizedSentencePair(locale.trustNote, "trust-note-context", "trust-note-reassurance")}</p>` : ""}
  </section>`;
}

function renderProductContent(product, localeCode, documentPath) {
  const locale = locales[localeCode];
  const localized = localizedProduct(product, localeCode);
  const accent = safeColor(product.accent, /^#[0-9a-f]{6}$/i, "#f2a875");
  const accentSoft = safeColor(product.accentSoft, /^rgba?\([\d.,%\s]+\)$/i, "rgba(242, 168, 117, .13)");
  const github = parseSafeGithubUrl(product.githubUrl);
  const githubLink = github
    ? `<div class="product-bottom-row"><a class="project-link" href="${escapeHtml(github.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(locale.githubLink)} <span aria-hidden="true">↗</span></a></div>`
    : "";
  const preview = localized.previewImage
    ? `<figure class="product-preview"><img src="${escapeHtml(relativeHref(documentPath, `/assets/${localized.previewImage}`))}" alt="${escapeHtml(localized.previewAlt ?? `${localized.displayName} application preview`)}" width="1180" height="800" decoding="async" /></figure>`
    : "";

  return `<section class="product-heading${preview ? " has-preview" : ""}" style="--product-accent:${accent};--product-accent-soft:${accentSoft}" aria-labelledby="product-title">
    <div class="product-copy">
    <div class="product-title-row">${productIcon(localized, "product-icon", documentPath)}<h1 id="product-title">${escapeHtml(localized.displayName)}</h1></div>
    <p class="product-description">${escapeHtml(localized.shortDescription)}</p>
    <p class="product-message">${emphasizedSentencePair(localized.supportMessage, "product-message-lead", "product-message-detail")}</p>
    </div>
    ${preview}
  </section>
    ${renderSupport(product, localeCode, documentPath)}
  ${githubLink}`;
}

function metadataValues(localeCode, documentPath, title, description, alternateLocale = localeCode === "en" ? "uk" : "en") {
  const locale = locales[localeCode];
  const alternate = locales[alternateLocale];
  const canonicalPath = documentPath.length > 1 ? documentPath.replace(/\/$/, "") : "/";
  const routeSuffix = canonicalPath.startsWith("/uk") ? canonicalPath.slice(3) || "/" : canonicalPath;
  const enRoute = routeSuffix === "/" ? "/" : routeSuffix;
  const ukRoute = routeSuffix === "/" ? "/uk" : `/uk${routeSuffix}`;
  const alternateOgLocale = alternate.ogLocale;
  return {
    LANG: locale.lang,
    TITLE: escapeHtml(title),
    DESCRIPTION: escapeHtml(description),
    OG_LOCALE: locale.ogLocale,
    OG_ALTERNATE: alternateOgLocale,
    SEO_TAGS: `<link rel="canonical" href="${escapeHtml(relativeHref(documentPath, canonicalPath))}" />\n    <link rel="alternate" hreflang="en" href="${escapeHtml(relativeHref(documentPath, enRoute))}" />\n    <link rel="alternate" hreflang="uk" href="${escapeHtml(relativeHref(documentPath, ukRoute))}" />\n    <link rel="alternate" hreflang="x-default" href="${escapeHtml(relativeHref(documentPath, enRoute))}" />`,
    STYLESHEET: escapeHtml(relativeHref(documentPath, "/assets/styles.css")),
    FOOTER_TAGLINE: footerTagline(locale.footerTagline)
  };
}

async function writePage(relativeFile, template, values) {
  const filePath = path.join(output, relativeFile);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, fill(template, values));
}

function pagePaths(localeCode, productId = null) {
  if (productId) {
    const route = productRoute(localeCode, productId);
    return [
      { file: `${route.slice(1)}.html`, documentPath: route },
      { file: `${route.slice(1)}/index.html`, documentPath: `${route}/` }
    ];
  }
  if (localeCode === "uk") {
    return [
      { file: "uk.html", documentPath: "/uk" },
      { file: "uk/index.html", documentPath: "/uk/" }
    ];
  }
  return [{ file: "index.html", documentPath: "/" }];
}

function homeValues(localeCode, documentPath) {
  const locale = locales[localeCode];
  return {
    ...metadataValues(localeCode, documentPath, locale.homeTitleMeta, locale.homeMetaDescription),
    BODY_CLASS: "home-page",
    HOME_HREF: escapeHtml(relativeHref(documentPath, homeRoute(localeCode))),
    PROJECTS_HREF: "#projects",
    PROJECTS_LINK: escapeHtml(locale.projectsTitle),
    LANGUAGE_SWITCHER: languageSwitcher(localeCode, documentPath),
    CONTENT: renderHomeContent(localeCode, documentPath)
  };
}

function productValues(product, localeCode, documentPath) {
  const locale = locales[localeCode];
  const localized = localizedProduct(product, localeCode);
  const title = `${localized.displayName} ${locale.productMetaSuffix}`;
  const description = locale.productMetaDescription.replace("{product}", localized.displayName);
  const favicon = product.iconImage
    ? relativeHref(documentPath, `/assets/${product.iconImage}`)
    : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='18' fill='%23f2a875'/%3E%3Ctext x='32' y='46' text-anchor='middle' font-family='system-ui,sans-serif' font-size='42' font-weight='700' fill='%23171614'%3EV%3C/text%3E%3C/svg%3E";
  return {
    ...metadataValues(localeCode, documentPath, title, description),
    FAVICON: escapeHtml(favicon),
    HOME_HREF: escapeHtml(relativeHref(documentPath, homeRoute(localeCode))),
    PRODUCT_NAV_LABEL: escapeHtml(locale.languageNav),
    ALL_APPS: escapeHtml(locale.allApps),
    LANGUAGE_SWITCHER: languageSwitcher(localeCode, documentPath, product.id),
    CONTENT: renderProductContent(product, localeCode, documentPath),
    BODY_CLASS: product.previewImage ? "token-monitor-page" : "product-page"
  };
}

function notFoundValues(localeCode, documentPath) {
  const locale = locales[localeCode];
  const content = `<section class="not-found" aria-labelledby="not-found-title"><span class="not-found-mark" aria-hidden="true">404</span><h1 id="not-found-title">${escapeHtml(locale.notFoundTitle)}</h1><p>${escapeHtml(locale.notFoundDescription)}</p><a class="back-link" href="${escapeHtml(publicPath(homeRoute(localeCode)))}">${escapeHtml(locale.homeLink)}</a></section>`;
  const localeHome = publicPath(homeRoute(localeCode));
  const languageNav = `<nav class="language-switch" aria-label="${escapeHtml(locale.languageNav)}"><a href="${escapeHtml(publicPath("/"))}" lang="en" hreflang="en">${languageFlag("en")}EN<span class="sr-only"> — ${escapeHtml(locale.languageEnglish)}</span></a><span class="language-divider" aria-hidden="true">|</span><a href="${escapeHtml(publicPath("/uk"))}" lang="uk" hreflang="uk">${languageFlag("uk")}УКР<span class="sr-only"> — ${escapeHtml(locale.languageUkrainian)}</span></a></nav>`;
  return {
    LANG: locale.lang,
    TITLE: escapeHtml(locale.notFoundMeta),
    DESCRIPTION: escapeHtml(locale.notFoundMetaDescription),
    OG_LOCALE: locale.ogLocale,
    OG_ALTERNATE: locales[localeCode === "en" ? "uk" : "en"].ogLocale,
    SEO_TAGS: "<meta name=\"robots\" content=\"noindex, follow\" />",
    BODY_CLASS: "page-not-found",
    STYLESHEET: escapeHtml(publicPath("/assets/styles.css")),
    FOOTER_TAGLINE: footerTagline(locale.footerTagline),
    HOME_HREF: escapeHtml(localeHome),
    PROJECTS_HREF: `${localeHome}#projects`,
    PROJECTS_LINK: escapeHtml(locale.projectsTitle),
    LANGUAGE_SWITCHER: languageNav,
    CONTENT: content
  };
}

for (const code of localeCodes) {
  if (locales[code].lang !== code) throw new Error(`Locale ${code} must declare the matching HTML lang value`);
  if (!locales[code].products || typeof locales[code].products !== "object") {
    locales[code].products = {};
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
for (const asset of ["products.json", "styles.css", "vivienne.jpg", "vivienne.webp", "support-international.webp", "support-ukraine.webp", ...products.flatMap((product) => [product.iconImage, product.previewImage, ...Object.values(product.providers ?? {}).map((provider) => provider.qrImage)]).filter(Boolean)]) {
  await cp(path.join(assetSource, asset), path.join(output, "assets", asset));
}
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(path.join(output, "_redirects"), "/token-monitor /quotaarc 301\n/token-monitor/ /quotaarc 301\n/uk/token-monitor /uk/quotaarc 301\n/uk/token-monitor/ /uk/quotaarc 301\n");

for (const localeCode of localeCodes) {
  for (const route of pagePaths(localeCode)) {
    await writePage(route.file, homeTemplate, homeValues(localeCode, route.documentPath));
  }
  for (const product of products) {
    for (const route of pagePaths(localeCode, product.id)) {
      await writePage(route.file, productTemplate, productValues(product, localeCode, route.documentPath));
    }
  }

  const errorFile = localeCode === "uk" ? "uk/404.html" : "404.html";
  const errorPath = localeCode === "uk" ? "/uk/404.html" : "/404.html";
  await writePage(errorFile, homeTemplate, notFoundValues(localeCode, errorPath));
}

console.log(`Built Vivi Bureau as static HTML for ${localeCodes.length} locales and ${products.length} products in dist/.`);
