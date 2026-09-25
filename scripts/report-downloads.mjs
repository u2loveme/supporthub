const accountId = process.env.CF_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !apiToken) {
  throw new Error("Set CF_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics Engine Read) in the local shell.");
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
};
const to = option("--to") ?? new Date().toISOString().slice(0, 10);
const from = option("--from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
if (!datePattern.test(from) || !datePattern.test(to) || from >= to) {
  throw new Error("Use --from and --to as an increasing UTC date range: YYYY-MM-DD.");
}

const query = `SELECT blob2 AS source, blob3 AS campaign, sum(_sample_interval) AS clicks FROM quotaarc_download_events WHERE index1 = 'quotaarc' AND blob1 = 'download_click' AND timestamp >= toDateTime('${from} 00:00:00') AND timestamp < toDateTime('${to} 00:00:00') GROUP BY source, campaign ORDER BY clicks DESC`;
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/analytics_engine/sql`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiToken}`,
    "content-type": "text/plain; charset=utf-8"
  },
  body: query
});
if (!response.ok) {
  throw new Error(`Analytics Engine SQL request failed (${response.status}). Check the account ID and Analytics Engine Read permission.`);
}

const body = await response.text();
let result;
try {
  result = JSON.parse(body);
} catch {
  result = body.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
const rows = Array.isArray(result) ? result : result.data ?? result.rows ?? [];
if (!Array.isArray(rows)) throw new Error("Unexpected Analytics Engine SQL response format.");

const bySource = new Map();
const byCampaign = new Map();
for (const row of rows) {
  const clicks = Number(row.clicks ?? row["clicks"] ?? 0);
  const source = String(row.source ?? "other");
  const campaign = String(row.campaign ?? "evergreen");
  bySource.set(source, (bySource.get(source) ?? 0) + clicks);
  byCampaign.set(campaign, (byCampaign.get(campaign) ?? 0) + clicks);
}

function printGroup(title, counts) {
  console.log(`\n${title}`);
  for (const [name, clicks] of [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))) {
    console.log(`${name.padEnd(28)} ${Math.round(clicks)}`);
  }
  if (!counts.size) console.log("No events in this range.");
}

console.log(`QuotaArc download clicks · ${from} to ${to} (UTC, end exclusive)`);
printGroup("By source", bySource);
printGroup("By campaign", byCampaign);
