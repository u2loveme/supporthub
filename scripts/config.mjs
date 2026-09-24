import { resolveProvider } from "../src/assets/provider-policy.js";

const routeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const providerRegions = ["international", "ukraine"];

export function validateProducts(products) {
  if (!Array.isArray(products)) throw new Error("products must be an array");
  const seenIds = new Set();

  for (const product of products) {
    if (!product || typeof product !== "object" || typeof product.id !== "string" || !routeIdPattern.test(product.id)) {
      throw new Error(`Invalid product id: ${String(product?.id)}`);
    }
    if (seenIds.has(product.id)) throw new Error(`Duplicate product id: ${product.id}`);
    seenIds.add(product.id);

    for (const region of providerRegions) {
      const provider = product.providers?.[region];
      if (provider?.state === "configured" && resolveProvider(provider).state !== "configured") {
        throw new Error(`Configured provider ${product.id}.${region} must have a valid public HTTPS URL`);
      }
    }
  }

  return products;
}
