// Offline tests for the DataHerb MCP: node mcp/test.mjs
// fetch is replaced by a table of canned responses, so nothing goes to the network.
import assert from "node:assert/strict";
import worker, { firstArrayItems, parseCsv, tableName } from "./worker.js";

const SITE = "https://example.org/explorer/";
const CSV = "https://data.example.org/fuel/weekly.csv";
const NDJSON = "https://data.example.org/events.jsonl";
const pages = {
  [SITE + "data/catalog.json"]: JSON.stringify({
    datasets: [
      {
        id: "eu-fuel-prices",
        name: "EU weekly fuel prices",
        description: "Pump prices from the Weekly Oil Bulletin.",
        tags: ["fuel", "prices"],
        license: "CC-BY-4.0",
        owner: { name: "spikinglabs" },
        health: "healthy",
        status_jobs: ["fuel-job"],
        web_url: "https://github.com/acme/cars",
        resources: [
          { name: "weekly", url: CSV, format: "csv", fields: [{ name: "date", type: "string" }, { name: "diesel", type: "number" }] },
          { name: "Raw Data", url: "https://data.example.org/raw.parquet", format: "parquet", fields: [] },
        ],
      },
      {
        id: "family-events",
        name: "Family events",
        description: "Events for children.",
        tags: ["events"],
        health: "failing",
        status_jobs: ["events-job"],
        resources: [{ name: "records", url: NDJSON, format: "ndjson", fields: [{ name: "title", type: "string" }] }],
      },
      { id: "secret", name: "Hidden", hidden: true, resources: [] },
    ],
  }),
  [SITE + "data/status.json"]: JSON.stringify({
    jobs: [
      { id: "fuel-job", health: "healthy" },
      { id: "running-job", health: "running" },
      { id: "events-job", health: "failing", reason: "last run failed", last_success_at: "2026-11-01T00:00:00Z" },
    ],
  }),
  [CSV]: 'date,diesel\n2026-01-05,1.61\n2026-01-12,"1.62"\n2026-01-19,1.6\n',
  [NDJSON]: '{"title":"Puppet show"}\n{"title":"Concert"}\n{"title":"Cut',
};
const fetched = [];
globalThis.fetch = async (url, init = {}) => {
  fetched.push({ url, range: init.headers && init.headers.range });
  if (!(url in pages)) return new Response("nope", { status: 404 });
  const body = pages[url];
  const partial = url === NDJSON; // pretend the server honoured Range and cut the file
  return new Response(body, { status: partial ? 206 : 200 });
};

const env = { SITE_URL: SITE };
let n = 0;
async function call(name, args = {}) {
  const request = new Request("https://mcp.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }),
  });
  const reply = await (await worker.fetch(request, env, {})).json();
  return reply.result;
}

// initialize + tools/list
{
  const r = await worker.fetch(
    new Request("https://mcp.example/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18" } }),
    }),
    env,
    {}
  );
  const body = await r.json();
  assert.equal(body.result.protocolVersion, "2025-06-18");
  assert.equal(body.result.serverInfo.name, "dataherb");
  const list = await (await worker.fetch(new Request("https://mcp.example/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env, {})).json();
  assert.deepEqual(list.result.tools.map((t) => t.name), ["search_datasets", "get_dataset", "preview_rows", "explore_link", "list_unhealthy_jobs"]);
}

// search: words, columns, tags, health, hidden
{
  let r = (await call("search_datasets")).structuredContent;
  assert.equal(r.total, 2, "hidden datasets are left out");
  r = (await call("search_datasets", { query: "diesel" })).structuredContent;
  assert.deepEqual(r.datasets.map((d) => d.id), ["eu-fuel-prices"], "column names are searched");
  assert.equal(r.datasets[0].page, SITE + "#/d/eu-fuel-prices");
  r = (await call("search_datasets", { health: "failing" })).structuredContent;
  assert.deepEqual(r.datasets.map((d) => d.id), ["family-events"]);
  r = (await call("search_datasets", { tag: "fuel", query: "events" })).structuredContent;
  assert.equal(r.total, 0);
}

// get_dataset
{
  const r = (await call("get_dataset", { id: "eu-fuel-prices" })).structuredContent;
  assert.equal(r.owner, "spikinglabs");
  assert.equal(r.resources[1].table, "raw_data");
  assert.deepEqual(r.jobs.map((j) => j.id), ["fuel-job"]);
  const missing = await call("get_dataset", { id: "nope" });
  assert.equal(missing.isError, true);
  const bad = await call("get_dataset", { id: "../etc" });
  assert.equal(bad.isError, true);
}

// preview_rows: CSV with a Range request, NDJSON drops the cut last line, parquet refused
{
  let r = (await call("preview_rows", { id: "eu-fuel-prices", limit: 2 })).structuredContent;
  assert.deepEqual(r.columns, ["date", "diesel"]);
  assert.deepEqual(r.rows, [{ date: "2026-01-05", diesel: "1.61" }, { date: "2026-01-12", diesel: "1.62" }]);
  assert.ok(fetched.find((f) => f.url === CSV).range.startsWith("bytes=0-"));
  r = (await call("preview_rows", { id: "family-events" })).structuredContent;
  assert.deepEqual(r.rows, [{ title: "Puppet show" }, { title: "Concert" }]);
  const parquet = await call("preview_rows", { id: "eu-fuel-prices", resource: "Raw Data" });
  assert.equal(parquet.isError, true);
  assert.match(parquet.content[0].text, /explore_link/);
}

// explore_link
{
  const r = (await call("explore_link", { id: "eu-fuel-prices", resources: ["weekly"], sql: "SELECT * FROM weekly" })).structuredContent;
  const u = new URL(r.url.replace("#/explore?", "?"));
  assert.equal(u.searchParams.get("t"), "eu-fuel-prices/weekly");
  assert.equal(u.searchParams.get("q"), "SELECT * FROM weekly");
  assert.ok(r.url.startsWith(SITE + "#/explore?"));
}

// list_unhealthy_jobs
{
  const r = (await call("list_unhealthy_jobs")).structuredContent;
  assert.equal(r.total_jobs, 3);
  assert.deepEqual(r.unhealthy.map((j) => [j.id, j.datasets]), [["events-job", ["family-events"]]]);
}

// never fetches anything but the site and catalog-listed files
for (const f of fetched) assert.ok(f.url in pages, `unexpected fetch ${f.url}`);

// helpers
assert.deepEqual(parseCsv('a,b\n"x,1",2\n', 5).rows, [{ a: "x,1", b: "2" }]);
assert.deepEqual(firstArrayItems('[{"a":"x]\\"y"},{"b":[1,2]}, 3, {"cut":', 10), [{ a: 'x]"y' }, { b: [1, 2] }, 3]);
assert.equal(tableName({ id: "d" }, { name: "2024 Data" }), "t_2024_data");

console.log("mcp tests passed");
