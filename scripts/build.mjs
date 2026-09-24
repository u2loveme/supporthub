import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateProducts } from "./config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "src");
const output = path.join(root, "dist");
const config = JSON.parse(await readFile(path.join(source, "assets", "products.json"), "utf8"));
const products = validateProducts(config.products);

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "assets"), { recursive: true });
await cp(path.join(source, "assets"), path.join(output, "assets"), { recursive: true });
await cp(path.join(source, "index.html"), path.join(output, "index.html"));
await writeFile(path.join(output, ".nojekyll"), "");

const productTemplate = await readFile(path.join(source, "product.html"), "utf8");
for (const product of products) {
  const nestedPage = productTemplate
    .replaceAll("__ASSET_PREFIX__", "../")
    .replaceAll("__HOME_HREF__", "../")
    .replaceAll("__PRODUCT_ID__", product.id);
  const flatPage = productTemplate
    .replaceAll("__ASSET_PREFIX__", "./")
    .replaceAll("__HOME_HREF__", "./")
    .replaceAll("__PRODUCT_ID__", product.id);
  const routeDirectory = path.join(output, product.id);
  await mkdir(routeDirectory, { recursive: true });
  await writeFile(path.join(routeDirectory, "index.html"), nestedPage);
  await writeFile(path.join(output, `${product.id}.html`), flatPage);
}

console.log(`Built Support Hub with ${products.length} product routes in dist/.`);
