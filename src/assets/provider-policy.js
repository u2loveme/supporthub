const placeholderHosts = new Set([
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "placeholder.com",
  "yourdomain.com"
]);

export function parseSafeHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isPlaceholder = placeholderHosts.has(host)
      || host.endsWith(".example")
      || host.endsWith(".invalid")
      || host.endsWith(".test");
    const isLocal = !host.includes(".") || host.startsWith("[") || host === "localhost" || host.endsWith(".localhost")
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
    if (url.protocol !== "https:" || !host || url.username || url.password || isPlaceholder || isLocal) return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveProvider(provider) {
  if (!provider || typeof provider !== "object") return { state: "unavailable", destination: null, hostname: null };
  if (provider.state === "coming_soon") return { state: "coming_soon", destination: null, hostname: null };
  if (provider.state !== "configured") return { state: "unavailable", destination: null, hostname: null };

  const url = parseSafeHttpsUrl(provider.url);
  if (!url) return { state: "unavailable", destination: null, hostname: null };
  return { state: "configured", destination: url.href, hostname: url.hostname };
}

export function parseSafeGithubUrl(value) {
  const url = parseSafeHttpsUrl(value);
  if (!url || url.hostname.toLowerCase() !== "github.com" || url.pathname.split("/").filter(Boolean).length < 2) return null;
  return url;
}
