# Adding a dataset

A dataset is a folder of data files plus a metadata file (`dataherb.yml` or
`dataherb.json`) next to them. The folder can be a git repository, an S3
prefix, a folder on a web server, or a folder in this repository.

## 1. Describe the data

In the folder that holds the files:

```bash
pip install "dataherb-explorer[infer]"   # duckdb gives exact types and row counts for CSV, Parquet, JSON
dhx new . --id orders-daily --name "Daily orders"
```

This writes `dataherb.yml` with one resource per data file, the columns and
their types. Fill in the blanks:

```yaml
spec: dataherb/v2
id: orders-daily
name: Daily orders
description: One row per order line, refreshed nightly from the shop database.
owner:
  team: Commerce Data
  email: commerce-data@example.com
tags: [sales, orders]
domain: commerce
license: Internal use only
classification: internal          # public | internal | confidential | restricted
update_frequency: daily
status_job: orders-export         # id of the job that writes status files, see job-status-spec.md
related:
  - id: regions
    on: orders.region_code = regions.code     # offered as a one-click join in the explorer
datapackage:
  resources:
    - name: orders
      path: orders.parquet
      format: parquet
      rows: 1250000
      schema:
        primaryKey: order_id
        fields:
          - { name: order_id, type: integer, description: Order line id }
          - { name: region_code, type: string, description: Region, see regions }
          - { name: amount_eur, type: number, unit: EUR, description: Net amount }
```

The full schema is [`dhx/schemas/dataset.schema.json`](../dhx/schemas/dataset.schema.json).
`datapackage` follows [Frictionless Data Package](https://specs.frictionlessdata.io/data-package/),
so `dataherb.json` files written by the v1 `dataherb` CLI keep working, and so
does the original `.dataherb/metadata.yml` format.

Prefer Parquet for anything over a few MB: the explorer reads only the columns
and row groups a query needs, while CSV and JSON files are downloaded whole.

## 2. Put it where the catalog can read it

**Git repository**: commit `dataherb.yml` at the repository root.

**S3**: upload the folder, e.g. `aws s3 sync . s3://my-company-datalake/datasets/orders-daily/`.

**This repository**: put it under the `local` store's folder (`demo/` by default).

## 3. List it in the catalog

Add one file to `catalog/` and open a pull request:

```yaml
# catalog/orders-daily.yml
id: orders-daily
store: datalake            # git: use `repo: my-org/orders-daily` (+ optional `ref`)
prefix: datasets/orders-daily/
```

Anything else you put in the entry overrides the dataset's own metadata, which
is handy for adding tags or an owner to a dataset you don't control. An entry
can also hold the whole metadata itself with `inline: true`.

With `catalog.discover` configured for a prefix, step 3 is unnecessary: every
`dataherb.{json,yml}` under it is picked up on the next build.

CI runs `dhx validate` and `dhx lint` on the pull request. After merge the
site rebuilds. Datasets in other repos or buckets are re-read on the hourly
scheduled build, or immediately when their pipeline sends a
`dataset-updated` event (see the emit-status action).

## Metadata quality score

Every dataset gets a 0 to 100 score shown as **Q** on the catalog. It rewards
a real description, an owner, declared and documented columns, tags, a
license, an update frequency and a linked status job. `dhx lint` prints what
is missing for each dataset; `dhx lint --min-score 60` fails CI below a bar.
