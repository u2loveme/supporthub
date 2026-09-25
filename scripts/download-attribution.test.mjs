import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAttribution,
  handleDownloadRequest,
  normalizeAttributionValue,
  resolveReleaseTarget
} from "../src/assets/download-attribution-core.js";

const release = {
  version: "1.0.0",
  url: "https://github.com/example/quotaarc/releases/download/v1.0.0/QuotaArc-Setup.exe"
};

function request(path, method = "GET") {
  return new Request(`https://vivibureau.pp.ua${path}`, { method });
}

test("normalizes source and campaign values into bounded slugs", () => {
  assert.equal(normalizeAttributionValue(" Reddit_ChatGPTCoding ", "direct"), "reddit-chatgptcoding");
  assert.equal(normalizeAttributionValue("NewLaunch-42", "evergreen"), "newlaunch-42");
  assert.equal(normalizeAttributionValue(null, "direct"), "direct");
  assert.equal(normalizeAttributionValue("  ", "evergreen"), "evergreen");
  assert.equal(normalizeAttributionValue("bad/value", "direct"), "other");
  assert.equal(normalizeAttributionValue("x".repeat(129), "direct"), "other");
  assert.equal(normalizeAttributionValue("x".repeat(49), "direct"), "other");
});

test("accepts only a single canonical GitHub release asset URL", () => {
  assert.equal(resolveReleaseTarget(release), release.url);
  assert.equal(resolveReleaseTarget({ url: "" }), null);
  assert.equal(resolveReleaseTarget({ url: "https://github.com/example/quotaarc" }), null);
  assert.equal(resolveReleaseTarget({ url: "https://github.com/../quotaarc/releases/download/v1/file.exe" }), null);
  assert.equal(resolveReleaseTarget({ url: "https://github.com.example.evil/a/b/releases/download/v1/file.exe" }), null);
  assert.equal(resolveReleaseTarget({ url: "https://github.com/a/b/releases/download/v1/file.exe?next=https://evil" }), null);
});

test("EN download records one minimal event and redirects to the configured artifact", async () => {
  const dataPoints = [];
  const response = handleDownloadRequest(request("/quotaarc/download?src=producthunt&campaign=v1-launch"), {
    QUOTAARC_ANALYTICS: { writeDataPoint: (point) => dataPoints.push(point) }
  }, release);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), release.url);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(dataPoints, [{
    indexes: ["quotaarc"],
    blobs: ["download_click", "producthunt", "v1-launch", "en", "1.0.0"],
    doubles: [1]
  }]);
});

test("UK route uses UK locale and missing attribution defaults consistently", () => {
  let point;
  const response = handleDownloadRequest(request("/uk/quotaarc/download"), {
    QUOTAARC_ANALYTICS: { writeDataPoint: (value) => { point = value; } }
  }, release);

  assert.equal(response.status, 302);
  assert.deepEqual(point.blobs, ["download_click", "direct", "evergreen", "uk", "1.0.0"]);
});

test("analytics synchronous or asynchronous failure never blocks the redirect", async () => {
  const sync = handleDownloadRequest(request("/quotaarc/download"), {
    QUOTAARC_ANALYTICS: { writeDataPoint: () => { throw new Error("offline"); } }
  }, release);
  assert.equal(sync.status, 302);

  const async = handleDownloadRequest(request("/quotaarc/download"), {
    QUOTAARC_ANALYTICS: { writeDataPoint: () => Promise.reject(new Error("offline")) }
  }, release);
  assert.equal(async.status, 302);
  await new Promise((resolve) => setImmediate(resolve));
});

test("unconfigured target returns controlled localized unavailable page without logging", async () => {
  let calls = 0;
  const response = handleDownloadRequest(request("/uk/quotaarc/download?src=github"), {
    QUOTAARC_ANALYTICS: { writeDataPoint: () => { calls += 1; } }
  }, { url: "", version: "" });
  const body = await response.text();

  assert.equal(response.status, 503);
  assert.match(body, /lang="uk"/);
  assert.match(body, /ще не опубліковано/);
  assert.equal(calls, 0);
});

test("HEAD and other non-GET requests are not counted", () => {
  let calls = 0;
  const env = { QUOTAARC_ANALYTICS: { writeDataPoint: () => { calls += 1; } } };
  const head = handleDownloadRequest(request("/quotaarc/download", "HEAD"), env, release);
  const post = handleDownloadRequest(request("/quotaarc/download", "POST"), env, release);
  assert.equal(head.status, 405);
  assert.equal(post.status, 405);
  assert.equal(head.headers.get("allow"), "GET");
  assert.equal(calls, 0);
});

test("trailing slash canonical redirect preserves query and does not log", () => {
  let calls = 0;
  const response = handleDownloadRequest(request("/uk/quotaarc/download/?src=showhn&campaign=v1-launch"), {
    QUOTAARC_ANALYTICS: { writeDataPoint: () => { calls += 1; } }
  }, release);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/uk/quotaarc/download?src=showhn&campaign=v1-launch");
  assert.equal(calls, 0);
});

test("campaign source and name flow from page query to the download route without storage", () => {
  const path = appendAttribution(
    "/quotaarc/download?src=vivibureau&campaign=evergreen",
    "https://vivibureau.pp.ua/quotaarc?src=reddit-chatgptcoding&campaign=v1-launch&ignored=private"
  );
  assert.equal(path, "/quotaarc/download?src=reddit-chatgptcoding&campaign=v1-launch");
});
