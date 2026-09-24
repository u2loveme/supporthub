import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

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

try {
  const home = await waitForPreview();
  assert.equal(home.status, 200, "Cloudflare preview home route must return 200");

  const products = JSON.parse(await (await fetch(`${base}/assets/products.json`)).text()).products;
  for (const product of products) {
    const canonicalPath = `/${product.id}`;
    const canonical = await fetch(`${base}${canonicalPath}`, { redirect: "manual" });
    assert.equal(canonical.status, 200, `${canonicalPath} must return 200`);

    const trailingSlash = await fetch(`${base}${canonicalPath}/`, { redirect: "manual" });
    assert.equal(trailingSlash.status, 307, `${canonicalPath}/ must redirect to its canonical route`);
    assert.equal(trailingSlash.headers.get("location"), canonicalPath, `${canonicalPath}/ must redirect directly to ${canonicalPath}`);
  }

  for (const assetPath of ["/assets/app.js", "/assets/styles.css", "/assets/products.json"]) {
    const response = await fetch(`${base}${assetPath}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${assetPath} must return 200`);
  }

  for (const missingPath of ["/missing-page", "/assets/missing.js"]) {
    const response = await fetch(`${base}${missingPath}`, { redirect: "manual" });
    assert.equal(response.status, 404, `${missingPath} must remain a 404 (no SPA fallback)`);
  }

  console.log(`Wrangler Static Assets smoke test passed: /, ${products.map((product) => `/${product.id}`).join(", ")}, slash redirects, assets, and 404s.`);
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
