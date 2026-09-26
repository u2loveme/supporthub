import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { quotaarcRelease } from "../src/quotaarc-release.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const products = JSON.parse(await readFile(path.join(output, "assets", "products.json"), "utf8")).products;

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const port = await reservePort();
const child = spawn(process.execPath, [wrangler, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
let exitInfo = null;
child.stdout.setEncoding("utf8").on("data", (chunk) => { logs += chunk; });
child.stderr.setEncoding("utf8").on("data", (chunk) => { logs += chunk; });
child.once("error", (error) => { exitInfo = { error }; });
child.once("exit", (code, signal) => { exitInfo = { code, signal }; });

const base = `http://127.0.0.1:${port}`;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPreview() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (exitInfo) throw new Error(`Wrangler exited before preview was ready: ${JSON.stringify(exitInfo)}\n${logs}`);
    try {
      return await fetch(`${base}/`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    } catch {
      await pause(250);
    }
  }
  throw new Error(`Wrangler preview did not become ready.\n${logs}`);
}

async function response(pathname, options = {}) {
  return fetch(`${base}${pathname}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
    ...options
  });
}

function assertHtmlRoute(html, pathname, locale, text) {
  assert.match(html, new RegExp(`<html lang="${locale}">`), `${pathname} must have lang=${locale}`);
  assert.match(html, /<meta property="og:site_name" content="Vivi Bureau"\s*\/>/);
  assert.doesNotMatch(html, /Support\s*Hub/i, `${pathname} must not expose the former public brand`);
  const visibleText = html.replace(/<[^>]*>/g, "");
  assert.ok(visibleText.includes(text), `${pathname} must include its static ${locale} page text`);
  const isConfiguredQuotaArcPage = quotaarcRelease.url && ["/quotaarc", "/uk/quotaarc"].includes(pathname);
  if (!isConfiguredQuotaArcPage) {
    assert.doesNotMatch(html, /<script\b/i, `${pathname} must render without client-side scripts`);
  }
  const stylesheet = html.match(/<link rel="stylesheet" href="([^"]+)"/);
  assert.ok(stylesheet, `${pathname} must link its stylesheet`);
  const stylesheetUrl = new URL(stylesheet[1], `${base}${pathname}`);
  assert.equal(stylesheetUrl.pathname, "/assets/styles.css", `${pathname} stylesheet must resolve to /assets/styles.css`);
}

try {
  const home = await waitForPreview();
  assert.equal(home.status, 200, "Cloudflare preview home route must return 200");
  assertHtmlRoute(await home.text(), "/", "en", "Vivi Bureau");

  const ukHome = await response("/uk");
  assert.equal(ukHome.status, 200, "/uk must serve its flat localized static route");
  assertHtmlRoute(await ukHome.text(), "/uk", "uk", "Vivi Bureau");
  const ukHomeSlash = await response("/uk/");
  assert.equal(ukHomeSlash.status, 307, "/uk/ must redirect to the no-slash canonical route");
  assert.equal(ukHomeSlash.headers.get("location"), "/uk", "/uk/ must redirect directly to /uk");

  for (const product of products) {
    for (const [prefix, locale, expectedText] of [
      ["", "en", product.id === "quotaarc" ? "Support via mono" : "No support options are available right now."],
      ["/uk", "uk", product.id === "quotaarc" ? "Підтримати через mono" : "Зараз варіантів підтримки немає."]
    ]) {
      const route = `${prefix}/${product.id}`;
      const canonical = await response(route);
      assert.equal(canonical.status, 200, `${route} must return 200`);
      assertHtmlRoute(await canonical.text(), route, locale, expectedText);

      const slash = await response(`${route}/`);
      assert.equal(slash.status, 307, `${route}/ must redirect to its canonical route`);
      assert.equal(slash.headers.get("location"), route, `${route}/ must redirect directly to ${route}`);
    }
  }

  if (quotaarcRelease.url) {
    for (const route of ["/quotaarc/download", "/uk/quotaarc/download"]) {
      const downloadHead = await response(route, { method: "HEAD" });
      assert.equal(downloadHead.status, 405, `${route} HEAD must not be counted as a download intent`);
      assert.equal(downloadHead.headers.get("allow"), "GET");
    }
  } else {
    for (const [route, locale, message] of [
      ["/quotaarc/download?src=smoke&campaign=check", "en", "has not been published yet"],
      ["/uk/quotaarc/download?src=smoke&campaign=check", "uk", "ще не опубліковано"]
    ]) {
      const unavailable = await response(route);
      assert.equal(unavailable.status, 503, `${route} must remain safely unavailable until a release asset exists`);
      const html = await unavailable.text();
      assert.match(html, new RegExp(`<html lang="${locale}">`));
      assert.ok(html.includes(message), `${route} must show localized controlled availability copy`);
      assert.equal(unavailable.headers.get("cache-control"), "no-store");
    }
    const downloadHead = await response("/quotaarc/download", { method: "HEAD" });
    assert.equal(downloadHead.status, 405, "HEAD must not be counted as a download intent");
    assert.equal(downloadHead.headers.get("allow"), "GET");
  }

  for (const [legacyRoute, canonicalRoute] of [["/token-monitor", "/quotaarc"], ["/uk/token-monitor", "/uk/quotaarc"]]) {
    const legacy = await response(legacyRoute);
    assert.equal(legacy.status, 301, `${legacyRoute} must permanently redirect to the QuotaArc route`);
    assert.equal(legacy.headers.get("location"), canonicalRoute, `${legacyRoute} must point to ${canonicalRoute}`);
  }

  for (const assetPath of ["/assets/products.json", "/assets/styles.css", "/assets/vivienne.webp", "/assets/vivienne.jpg", "/assets/support-international.webp", "/assets/support-ukraine.webp", "/assets/token-monitor-icon.png", "/assets/token-monitor-preview.png"]) {
    const asset = await response(assetPath);
    assert.equal(asset.status, 200, `${assetPath} must return 200`);
  }
  assert.equal((await response("/assets/app.js")).status, 404, "No client-side app bundle should be deployed");

  for (const [route, locale, expectedText] of [
    ["/missing-page", "en", "Page not found"],
    ["/uk/missing-page", "uk", "Сторінку не знайдено"],
    ["/uk/deep/missing-page", "uk", "Сторінку не знайдено"],
    ["/assets/missing.js", "en", "Page not found"]
  ]) {
    const missing = await response(route);
    assert.equal(missing.status, 404, `${route} must remain a real 404`);
    const html = await missing.text();
    assert.match(html, new RegExp(`<html lang="${locale}">`), `${route} must use the nearest ${locale} 404 page`);
    assert.ok(html.includes(expectedText), `${route} must include localized not-found copy`);
  }

  console.log(`Wrangler Worker + Static Assets smoke test passed: EN/UK home and product routes, canonical slash redirects, assets, and localized real 404s.`);
} catch (error) {
  console.error(`${error.stack ?? error}\n\nWrangler output:\n${logs}`);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      pause(3000)
    ]);
  }
}
