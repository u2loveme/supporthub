import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const argumentsByName = new Map(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf("=");
  return separator < 0 ? [argument, ""] : [argument.slice(0, separator), argument.slice(separator + 1)];
}));
const rawBase = argumentsByName.get("--base") ?? "";
const baseSegments = rawBase.split("/").filter(Boolean);
if (baseSegments.some((segment) => segment === "." || segment === ".." || segment.includes("\\"))) {
  throw new Error("--base must be a simple URL path, for example /supporthub");
}
const basePath = baseSegments.length ? `/${baseSegments.join("/")}` : "";
const port = Number(argumentsByName.get("--port") ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be between 1 and 65535");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (pathname.includes("\\") || pathname.includes("\0") || pathname.split("/").some((segment) => segment === "..")) {
    response.writeHead(400).end("Bad request");
    return;
  }
  if (basePath) {
    if (pathname === basePath) {
      response.writeHead(308, { Location: `${basePath}/` }).end();
      return;
    }
    if (!pathname.startsWith(`${basePath}/`)) {
      response.writeHead(404).end("Not found");
      return;
    }
    pathname = pathname.slice(basePath.length) || "/";
  }

  const relative = pathname.split("/").filter(Boolean).join(path.sep);
  let filePath;
  if (pathname === "/") {
    filePath = path.join(root, "index.html");
  } else if (!pathname.endsWith("/") && !path.extname(pathname)) {
    const extensionlessAlias = path.resolve(root, `${relative}.html`);
    filePath = await isFile(extensionlessAlias)
      ? extensionlessAlias
      : path.resolve(root, relative, "index.html");
  } else if (pathname.endsWith("/")) {
    filePath = path.resolve(root, relative, "index.html");
  } else {
    filePath = path.resolve(root, relative);
  }

  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Static production preview: http://127.0.0.1:${port}${basePath}/`);
});
