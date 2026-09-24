import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateProducts } from "./config.mjs";
import { resolveProvider } from "../src/assets/provider-policy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const build = spawnSync(process.execPath, ["scripts/build.mjs"], { cwd: root, stdio: "inherit" });
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

async function requireFile(relativePath) {
  const filePath = path.join(output, relativePath);
  assert.ok((await stat(filePath)).isFile(), `Missing production file: dist/${relativePath}`);
  return readFile(filePath, "utf8");
}

const homeHtml = await requireFile("index.html");
await requireFile(".nojekyll");
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

for (const relativePath of [
  "assets/app.js",
  "assets/provider-policy.js",
  "assets/products.json",
  "assets/styles.css"
]) await requireFile(relativePath);

assert.match(homeHtml, /data-hub-home="true"/, "The production home page must identify itself explicitly");
for (const product of products) {
  const flatPage = await requireFile(`${product.id}.html`);
  const directoryPage = await requireFile(path.join(product.id, "index.html"));
  assert.match(flatPage, new RegExp(`data-product-id="${product.id}"`));
  assert.match(directoryPage, new RegExp(`data-product-id="${product.id}"`));
  assert.match(flatPage, /\.\/assets\/app\.js/);
  assert.match(directoryPage, /\.\.\/assets\/app\.js/);
  assert.doesNotMatch(flatPage + directoryPage, /__(?:ASSET_PREFIX|HOME_HREF|PRODUCT_ID)__/);
}

const appSource = await readFile(path.join(output, "assets/app.js"), "utf8");
const policySource = await readFile(path.join(output, "assets/provider-policy.js"), "utf8");
const staticHtml = [homeHtml, ...await Promise.all(products.map(async (product) => requireFile(`${product.id}.html`)))].join("\n");
assert.match(appSource, /target="_blank"\s+rel="noopener noreferrer"/, "External links must use safe new-tab attributes");
assert.ok(!/<a\b[^>]*\bhref\s*=\s*["']\s*(?:javascript|data|vbscript):/i.test(staticHtml + appSource), "Unsafe navigation protocols must not be present");
assert.match(appSource, /resolveProvider\(details\)/, "Provider actions must use the shared provider policy");
assert.match(policySource, /url\.protocol !== "https:"/, "External destinations must require HTTPS");

const assetPaths = [
  new URL("./assets/app.js", "file:///supporthub/").pathname,
  new URL("../assets/app.js", "file:///supporthub/token-monitor/").pathname,
  new URL("./assets/app.js", "file:///supporthub/token-monitor").pathname
];
assert.deepEqual(assetPaths, ["/supporthub/assets/app.js", "/supporthub/assets/app.js", "/supporthub/assets/app.js"], "Relative assets must resolve under a hosting subpath");

console.log(`Production verification passed: ${products.length} product routes, route aliases, assets, provider policy, and relative paths.`);
