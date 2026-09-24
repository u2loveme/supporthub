import { parseSafeGithubUrl, resolveProvider } from "./provider-policy.js";

const app = document.querySelector("#app");
const routeId = app.dataset.productId;
const isHome = app.dataset.hubHome === "true";
const homeHref = app.dataset.homeHref || "./";
const productsUrl = new URL("./products.json", import.meta.url);
const supportedProviderStates = new Set(["configured", "unavailable", "coming_soon"]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function normalizedProduct(product) {
  if (!product || typeof product !== "object") return null;
  if (typeof product.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.id)) return null;
  if (typeof product.displayName !== "string" || !product.displayName.trim()) return null;
  return {
    ...product,
    shortDescription: typeof product.shortDescription === "string" ? product.shortDescription : "",
    supportMessage: typeof product.supportMessage === "string" ? product.supportMessage : "Support is optional.",
    icon: typeof product.icon === "string" ? product.icon : "•",
    accent: typeof product.accent === "string" && /^#[0-9a-f]{6}$/i.test(product.accent) ? product.accent : "#d7f26b",
    accentSoft: typeof product.accentSoft === "string" && /^rgba?\([\d.,%\s]+\)$/i.test(product.accentSoft) ? product.accentSoft : "rgba(215, 242, 107, .12)",
    suggestedAmounts: Array.isArray(product.suggestedAmounts)
      ? product.suggestedAmounts.filter((amount) => typeof amount === "string" && amount.trim() && amount.length <= 16)
      : [],
    providers: product.providers && typeof product.providers === "object" ? product.providers : {}
  };
}

function providerCard(provider, region) {
  const details = provider && typeof provider === "object" ? provider : {};
  const providerName = typeof details.name === "string" && details.name.trim() ? details.name.trim() : `${region === "ukraine" ? "Ukraine" : "International"} support`;
  const resolved = resolveProvider(details);
  const { state, destination, hostname } = resolved;
  const statusLabel = state === "configured" ? "Available" : state === "coming_soon" ? "Coming soon" : "Unavailable";
  const detailText = state === "configured"
    ? `Payment is handled by ${providerName}. Opens ${hostname} in a new tab.`
    : state === "coming_soon"
      ? "This support option is being prepared. No payment link is active."
      : "This support option is not available right now.";
  const action = state === "configured"
    ? `<a class="provider-action" href="${escapeHtml(destination)}" target="_blank" rel="noopener noreferrer" aria-label="${region === "ukraine" ? "Support from Ukraine" : "Support internationally"} with ${escapeHtml(providerName)} at ${escapeHtml(hostname)}; opens in a new tab">${region === "ukraine" ? "Support from Ukraine" : "Support internationally"} <span aria-hidden="true">↗</span></a>`
    : "";

  return `
    <article class="provider-card ${region} is-${state.replace("_", "-")}">
      <div class="provider-topline"><span class="provider-region">${region === "ukraine" ? "For Ukraine" : "International"}</span><span class="provider-status"><span></span>${statusLabel}</span></div>
      <div class="provider-name">${escapeHtml(providerName)}${destination ? `<span class="provider-arrow" aria-hidden="true">↗</span>` : ""}</div>
      <p>${escapeHtml(detailText)}</p>
      ${action}
    </article>`;
}

function productCard(product) {
  return `
    <a class="project-card" href="./${escapeHtml(encodeURIComponent(product.id))}/" style="--product-accent:${escapeHtml(product.accent)};--product-accent-soft:${escapeHtml(product.accentSoft)}">
      <span class="project-icon">${escapeHtml(product.icon)}</span>
      <span class="project-copy"><strong>${escapeHtml(product.displayName)}</strong><small>${escapeHtml(product.shortDescription)}</small></span>
      <span class="project-arrow" aria-hidden="true">↗</span>
    </a>`;
}

function renderHome(products) {
  app.innerHTML = `
    <section class="home-hero">
      <div class="eyebrow"><span></span> Independent apps · optional support</div>
      <h1>Support the tools<br /> <em>you use.</em></h1>
      <p class="home-intro">Choose an application to see its available support options. Contributions are optional and handled by the external provider.</p>
      <div class="home-doodle" aria-hidden="true"><span>✳</span><i>·</i><b>♡</b></div>
    </section>
    <section class="projects-section" aria-labelledby="projects-title">
      <div class="section-heading"><div><span class="eyebrow">APPLICATIONS</span><h2 id="projects-title">Choose an application</h2></div><span class="project-count">${products.length} apps</span></div>
      <div class="project-list">${products.map(productCard).join("")}</div>
    </section>
    <aside class="home-note"><span class="note-icon">☼</span><p><strong>Support is always optional.</strong> You can keep using each application without contributing.</p></aside>`;
  document.title = "Support independent apps · Support Hub";
}

function renderAmounts(amounts) {
  if (!amounts.length) return "";
  const options = [...amounts, "Other"];
  return `
    <div class="amount-group" role="group" aria-label="Suggested support amounts">
      ${options.map((amount, index) => `<button class="amount-option${index === 0 ? " is-selected" : ""}" type="button" aria-pressed="${index === 0}" data-amount="${escapeHtml(amount)}">${escapeHtml(amount)}</button>`).join("")}
    </div>
    <p class="amount-hint">Suggestions only. Your selection is not sent to the provider; choose an amount there.</p>`;
}

function renderProduct(product) {
  const githubUrl = parseSafeGithubUrl(product.githubUrl);
  const githubLink = githubUrl
    ? `<a class="project-link" href="${escapeHtml(githubUrl.href)}" target="_blank" rel="noopener noreferrer">View project on GitHub <span aria-hidden="true">↗</span></a>`
    : `<span class="project-link is-unavailable" aria-disabled="true">Project link not configured</span>`;

  app.innerHTML = `
    <section class="product-heading" style="--product-accent:${escapeHtml(product.accent)};--product-accent-soft:${escapeHtml(product.accentSoft)}">
      <div class="product-eyebrow"><span class="eyebrow-dot"></span>${escapeHtml(product.shortDescription)}</div>
      <div class="product-title-row"><div class="product-icon">${escapeHtml(product.icon)}</div><h1>Support ${escapeHtml(product.displayName)}</h1></div>
      <p class="product-message">${escapeHtml(product.supportMessage)}</p>
    </section>
    <section class="support-panel" aria-labelledby="support-title">
      <div class="support-panel-head"><div><span class="eyebrow">OPTIONAL CONTRIBUTION</span><h2 id="support-title">Choose a support option</h2></div><span class="hand-drawn-heart" aria-hidden="true">♡</span></div>
      ${renderAmounts(product.suggestedAmounts)}
      <div class="provider-grid">${providerCard(product.providers.international, "international")}${providerCard(product.providers.ukraine, "ukraine")}</div>
      <div class="privacy-note"><span class="privacy-lock" aria-hidden="true">✳</span><p><strong>Payments stay outside Support Hub.</strong> This site does not collect payment details, create accounts, or track visitors. A configured provider link opens its website in a new tab.</p></div>
    </section>
    <div class="product-bottom-row">
      ${githubLink}
      <a class="back-link" href="${escapeHtml(homeHref)}">← All applications</a>
    </div>`;

  app.querySelectorAll(".amount-option").forEach((button) => {
    button.addEventListener("click", () => {
      app.querySelectorAll(".amount-option").forEach((option) => {
        const selected = option === button;
        option.classList.toggle("is-selected", selected);
        option.setAttribute("aria-pressed", String(selected));
      });
    });
  });
  document.title = `Support ${product.displayName} · Support Hub`;
}

function renderNotFound() {
  app.innerHTML = `<section class="not-found"><span class="not-found-mark">?</span><h1>Application not found</h1><p>This support page may not be available.</p><a class="back-link" href="${escapeHtml(homeHref)}">← All applications</a></section>`;
  document.title = "Application not found · Support Hub";
}

try {
  const response = await fetch(productsUrl);
  if (!response.ok) throw new Error("settings-unavailable");
  const config = await response.json();
  const rawProducts = Array.isArray(config?.products) ? config.products : [];
  const products = rawProducts.map(normalizedProduct).filter(Boolean);
  const uniqueProducts = [...new Map(products.map((product) => [product.id, product])).values()];
  if (isHome) renderHome(uniqueProducts);
  else {
    const product = uniqueProducts.find((item) => item.id === routeId);
    if (product) renderProduct(product);
    else renderNotFound();
  }
} catch {
  app.innerHTML = `<section class="not-found"><h1>Support options are temporarily unavailable</h1><p>Please try again later, or return to the applications list.</p><a class="back-link" href="${escapeHtml(homeHref)}">← Support Hub home</a></section>`;
  document.title = "Support options unavailable · Support Hub";
}
