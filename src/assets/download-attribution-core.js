const valuePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxRawLength = 128;
const maxValueLength = 48;

export function normalizeAttributionValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string" || value.length > maxRawLength) return "other";

  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  if (!normalized) return fallback;
  if (normalized.length > maxValueLength || !valuePattern.test(normalized)) return "other";
  return normalized;
}

export function resolveReleaseTarget(configuration) {
  const url = configuration?.url;
  if (typeof url !== "string" || url.length > 512) return null;

  const match = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/download\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(url);
  return match && match.slice(1).every((segment) => segment !== "." && segment !== "..") ? url : null;
}

export function routeLocale(pathname) {
  return pathname === "/uk/quotaarc/download" || pathname === "/uk/quotaarc/download/" ? "uk" : "en";
}

function unavailableResponse(locale) {
  const message = locale === "uk"
    ? "Завантаження QuotaArc ще не опубліковано."
    : "The QuotaArc download has not been published yet.";
  const home = locale === "uk" ? "/uk/quotaarc" : "/quotaarc";
  const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QuotaArc</title><body><main><p>${message}</p><a href="${home}">${locale === "uk" ? "Повернутися до QuotaArc" : "Return to QuotaArc"}</a></main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer"
    }
  });
}

export function handleDownloadRequest(request, env, release = {}) {
  const url = new URL(request.url);
  const locale = routeLocale(url.pathname);

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET", "cache-control": "no-store" }
    });
  }

  if (url.pathname.endsWith("/")) {
    return new Response(null, {
      status: 308,
      headers: {
        location: `${url.pathname.slice(0, -1)}${url.search}`,
        "cache-control": "no-store"
      }
    });
  }

  const target = resolveReleaseTarget(release);
  if (!target) return unavailableResponse(locale);

  const source = normalizeAttributionValue(url.searchParams.get("src"), "direct");
  const campaign = normalizeAttributionValue(url.searchParams.get("campaign"), "evergreen");
  const version = typeof release.version === "string" && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$/.test(release.version)
    ? release.version
    : "";

  try {
    const write = env.QUOTAARC_ANALYTICS?.writeDataPoint({
      indexes: ["quotaarc"],
      blobs: ["download_click", source, campaign, locale, version],
      doubles: [1]
    });
    if (write && typeof write.then === "function") write.catch(() => {});
  } catch {
    // Analytics is best-effort; a logging failure must never stop the download.
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: target,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer"
    }
  });
}

export function appendAttribution(downloadHref, pageUrl) {
  const target = new URL(downloadHref, pageUrl);
  const page = new URL(pageUrl);
  for (const name of ["src", "campaign"]) {
    const value = page.searchParams.get(name);
    if (value !== null && value !== "") target.searchParams.set(name, value.slice(0, maxRawLength));
  }
  return `${target.pathname}${target.search}`;
}
