# Configuration (`dataherb.config.yml`)

One YAML file drives the whole site. `dataherb catalog validate` checks it against
[`dataherb/catalog/schemas/config.schema.json`](https://github.com/DataHerb/dataherb-python/blob/master/dataherb/catalog/schemas/config.schema.json).
Anything left out falls back to the defaults in [`dataherb/catalog/config.py`](https://github.com/DataHerb/dataherb-python/blob/master/dataherb/catalog/config.py).

Only a safe subset reaches the browser (`dist/data/config.json`): site
settings, store types and public base URLs, status and explorer options, and
snippets. Bucket names used for building, raw URL templates and token
variable names stay on the build machine.

## `site`

| Key | Default | |
|---|---|---|
| `title` | DataHerb Explorer | Header and page title |
| `description` | | Shown under the title on the catalog page |
| `logo` | none | URL or path relative to `site/` |
| `accent` | `#2f7d4f` | Buttons, links, focus rings |
| `links` | `[]` | `[{label, url}]` shown in the header |
| `repository` | none | Repo holding the catalog; enables "Edit catalog entry" links (`<repository>/blob/main/<file>`) |

Deeper theming: edit the CSS custom properties at the top of
`site/assets/style.css`, or pass a different site folder with `dataherb catalog build --site`.

## `stores`

Named places where metadata, data files and status files live. Giving
`stores` replaces the defaults entirely.

```yaml
stores:
  github:                 # type git: files read through raw URLs
    type: git
    raw_url_template: https://raw.githubusercontent.com/{repo}/{ref}/{path}
    web_url_template: https://github.com/{repo}
    default_ref: HEAD
    token_env: GITHUB_TOKEN      # build-time token for private repos

  ghe:                    # GitHub Enterprise
    type: git
    raw_url_template: https://github.example.com/raw/{repo}/{ref}/{path}
    web_url_template: https://github.example.com/{repo}
    token_env: GHE_TOKEN

  local:                  # a folder in this repo, copied to the site under files/<name>/
    type: local
    path: demo

  datalake:               # S3 or S3-compatible
    type: s3
    bucket: my-company-datalake
    region: eu-central-1
    endpoint_url: null          # e.g. https://minio.internal for MinIO/Ceph/R2
    public_base_url: https://data.internal.example.com   # what browsers fetch
    anonymous: false            # unsigned requests at build time
    presign: false              # sign URLs at build time instead
    presign_expiry_hours: 72

  portal:                 # any static file server
    type: http
    base_url: https://files.example.com/open-data/
```

How browser URLs are made for each type:

| Type | Browser URL for `<path>` |
|---|---|
| git | `raw_url_template` with repo, ref and path |
| local | `files/<store>/<prefix>/<path>` on the site itself |
| http | `base_url` + path |
| s3 | presigned URL if `presign`, else `public_base_url/<key>`, else `https://<bucket>.s3.<region>.amazonaws.com/<key>` (or `endpoint_url/<bucket>/<key>`) |

Resource paths that are already absolute (`https://...`) are kept as is;
`s3://bucket/key` paths are mapped through the store with that bucket.

See [s3.md](s3.md) for bucket permissions and CORS.

## `catalog`

```yaml
catalog:
  dirs: [catalog]          # folders of catalog entries (*.yml, *.yaml, *.json; files starting with _ are skipped)
  discover:                # find datasets without catalog entries
    - store: datalake
      prefix: datasets/    # every <prefix>/**/dataherb.{json,yml,yaml}
```

A catalog entry with the same id as a discovered dataset is merged on top of
it, so you can add tags or owners to discovered datasets.

## `status`

```yaml
status:
  sources:
    - store: datalake
      prefix: _dataherb/status/      # job folders are discovered by listing
    - store: portal
      prefix: status/
      jobs: [nightly-export]         # stores that cannot list need explicit job ids
  live: true          # browsers re-read latest.json on load and every 2 minutes
  stale_grace: 0.5    # stale after expected_interval * 1.5
  history: 30         # runs kept per job in the build snapshot
```

## `explorer`

```yaml
explorer:
  enabled: true
  duckdb:
    mode: cdn         # or "vendored": serve DuckDB-WASM from the site (npm ci && npm run vendor)
    version: 1.29.0
    cdn_base: https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@{version}   # point at an internal mirror if you have one
  preview_rows: 200
  max_browser_bytes: 500000000   # ask before loading bigger files
```

## `snippets`

Code shown under each file on dataset pages. Placeholders: `{url}` (absolute
file URL), `{format}` (csv, parquet, json), `{name}` (resource name).

```yaml
snippets:
  - label: Python (pandas)
    language: python
    template: |
      import pandas as pd
      df = pd.read_{format}("{url}")
  - label: R
    language: r
    template: |
      df <- readr::read_csv("{url}")
```
