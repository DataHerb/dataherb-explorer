# How it works

```
                 build time (CI, hourly + on change)                     read time (browser)
 ┌──────────────────────────┐
 │ dataherb.config.yml      │
 │ catalog/*.md             │──┐
 └──────────────────────────┘  │   ┌────────────┐   dist/            ┌─────────────────────────┐
 ┌──────────────────────────┐  ├──▶│ dataherb catalog build  │──▶ index.html ────▶│ catalog / dataset pages │
 │ git repos: dataherb.json │──┤   │  resolve   │    assets/         │ explorer (DuckDB-WASM)  │──▶ data files
 │ S3 prefixes: dataherb.yml│──┤   │  validate  │    data/*.json     │ status page             │──▶ latest.json (live)
 │ status/<job>/latest.json │──┘   │  lint      │    files/ (local)  └─────────────────────────┘     (S3 / git / site)
 └──────────────────────────┘      └────────────┘
```

**Build** (`dataherb catalog build`, Python, stdlib + PyYAML + jsonschema; boto3 for S3):

1. Load the config and every catalog entry; validate them against the schemas.
2. Discover `dataherb.{json,yml}` files under configured prefixes.
3. Fetch each dataset's metadata (in parallel), merge catalog overrides,
   normalize v1, v2 and legacy formats into one record, and resolve every
   file to the URL a browser will use.
4. Read every job's `latest.json` and recent `runs/`, compute health.
5. Link jobs to datasets (`status_job`, or `datasets[]` in status files) and
   score metadata quality.
6. Copy `site/` and local stores into `dist/`, write `data/catalog.json`,
   `data/status.json`, `data/config.json` (public subset) and
   `data/build.json` (problems found while building).

A dataset whose metadata cannot be fetched still appears, flagged, with the
error in the build report, so one broken repo never breaks the site.

**Read time** is plain static files:

- Catalog search and facets run in the browser over `catalog.json` (fine into
  the thousands of datasets).
- The explorer lazy-loads DuckDB-WASM on first use. CSV/JSON files are loaded
  into in-memory tables; Parquet stays remote and is read with HTTP range
  requests. Joins, charts and statistics are SQL against those tables.
  Nothing leaves the reader's browser.
- The status page re-reads each job's `latest.json` directly from storage
  (when `status.live` is on), so job health is current even between builds.

## Why these choices

- **No backend**: the only moving part is a scheduled CI job. Hosting is
  any static file host; cost is close to zero.
- **YAML config + catalog folder**: forking means editing one file and a
  folder of small YAML files, reviewed through pull requests.
- **Status as files, not an API**: every orchestrator can write a JSON file
  to S3. Carrying `last_success` inside `latest.json` keeps readers to one
  request per job.
- **DuckDB-WASM**: real SQL (joins, window functions, `SUMMARIZE`) on CSV,
  Parquet and JSON over HTTP, without a server. Charts are a small
  dependency-free SVG module, so the only external asset is DuckDB, which can
  be vendored for networks without CDN access.
- **Vanilla JS, no build step for the site**: a fork can change the UI with a
  text editor; nothing to keep up to date except DuckDB's version number.

## From DataHerb v1

| v1 | v2 |
|---|---|
| `dataherb-flora` (YAML listing per dataset) | `catalog/` folder, same idea, plus S3/HTTP/local sources and discovery |
| `dataherb-metadata-aggregator` | `dataherb catalog build` (aggregation, validation, linting) |
| `dataherb.github.io` (Jekyll) | `site/`: static SPA with preview, explorer and status |
| `dataherb` CLI `create` / `upload` | `dataherb create` now infers the schema; `dataherb catalog` and `dataherb status` added; upload with git or `aws s3 sync` |
| `dataherb.json` (`source: git | s3`, `datapackage`) | read as is; v2 adds owner, tags, license, classification, update frequency, status job, related datasets |
| `.dataherb/metadata.yml` | still read |
