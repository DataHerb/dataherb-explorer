# DataHerb Explorer

A data catalog and explorer for your organization's open data that is just a
static website. Fork it, point one YAML file at your git repositories and S3
buckets, and get:

- **A searchable catalog** with facets (tags, domain, owner, freshness, storage, format), schemas, documentation and copy-paste snippets.
- **Job status monitoring**: every pipeline (Airflow, GitHub Actions, cron) writes a small JSON status file; the site shows what is failing, stuck or stale, live, without a backend. See the [status file spec](docs/job-status-spec.md).
- **In-browser exploration** with DuckDB-WASM: preview and profile any CSV, Parquet or JSON file, write SQL across datasets, build joins with a helper, draw bar, line, scatter and histogram charts, and get summary statistics and correlations. Shareable links capture the query.
- **Catalog tooling**: `dhx new` drafts metadata from data files, `dhx validate` checks entries in CI, `dhx lint` scores metadata quality, `dhx status check` alerts on unhealthy jobs.

No server, no database. A scheduled GitHub Actions job rebuilds the site; data
is served straight from S3, git or the site itself. This is v2 of
[DataHerb](https://dataherb.github.io).

| Catalog | Explore |
|---|---|
| ![Catalog](docs/img/catalog.png) | ![Explorer](docs/img/explore.png) |
| **Dataset** | **Job status** |
| ![Dataset](docs/img/dataset.png) | ![Status](docs/img/status.png) |

## Quick start

```bash
git clone https://github.com/DataHerb/dataherb-explorer && cd dataherb-explorer
pip install -e .
dhx build        # reads dataherb.config.yml + catalog/, writes dist/
dhx serve        # http://127.0.0.1:8000
```

The demo catalog mixes datasets in this repo (`demo/`), datasets in other
DataHerb git repos, and simulated job status files.

## Make it yours

1. **Fork** (or use as a template) and enable GitHub Pages with source "GitHub Actions".
2. **Edit `dataherb.config.yml`**: title, accent colour, links, and your stores
   (git hosts, S3 buckets). See [docs/config.md](docs/config.md).
3. **Replace `catalog/`** with one small YAML file per dataset, or turn on
   `catalog.discover` to pick up every `dataherb.yml` under an S3 prefix.
   See [docs/adding-datasets.md](docs/adding-datasets.md).
4. **Point `status.sources`** at where your jobs write status files, and add
   the emitter to your jobs ([Airflow](examples/airflow/dataherb_status.py),
   [GitHub Actions](examples/github-actions/crawler.yml), [shell](examples/shell/emit-status.sh)).
5. **Delete `demo/`** and `scripts/make_demo_*.py`.
6. If your data is in S3, set up browser access and CORS: [docs/s3.md](docs/s3.md).
   If browsers can't reach public CDNs, set `explorer.duckdb.mode: vendored`.

The site rebuilds on every push to `main`, every hour, and whenever a pipeline
sends a `dataset-updated` event. To host on S3/CloudFront instead of Pages,
set `DEPLOY_TARGET=s3` (see [deploy-s3.yml](.github/workflows/deploy-s3.yml)).

## Repository layout

```
dataherb.config.yml     the one config file
catalog/                one YAML entry per dataset
demo/                   demo datasets and status files (delete in a fork)
dhx/                    the builder and CLI (Python)
  schemas/              JSON Schemas: config, catalog entry, dataset metadata, job status
site/                   the static site (vanilla JS, no build step)
.github/workflows/      CI, Pages and S3 deploys
.github/actions/emit-status/   GitHub Action that writes status files
examples/               status emitters for Airflow, Actions, shell
docs/                   config, adding datasets, status spec, S3, architecture
```

## CLI

| Command | |
|---|---|
| `dhx build [-o dist] [--strict]` | Build the site. `--strict` fails on unreachable datasets. |
| `dhx validate` | Validate the config and catalog entries against the schemas. |
| `dhx lint [--min-score N]` | Metadata quality report per dataset. |
| `dhx new [folder]` | Draft `dataherb.yml` from the data files in a folder. |
| `dhx status emit --target s3://... --job-id X --status running/success/failed ...` | Write a job status file. |
| `dhx status check` | Print job health; exit 1 if any job is failing, stuck or stale. |
| `dhx serve [dist]` | Serve a built site locally. |

## Development

```bash
pip install -e ".[dev,s3,infer]"
pytest
npm ci && npm run vendor     # optional: self-host DuckDB-WASM in site/vendor
```

How the pieces fit: [docs/architecture.md](docs/architecture.md).

## License

MIT
