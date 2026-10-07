# Job status file spec (`dataherb.status/v1`)

Every job that produces data for the catalog (an Airflow DAG, a GitHub Actions
workflow, a cron script, a crawler) writes a small JSON file saying how its
last run went. The explorer reads those files to show freshness and failures,
both on a **Status** page and as a badge on each dataset.

The design goals:

- **Any orchestrator can write it.** It is a JSON file in a bucket or folder.
  No API, no agent, no database.
- **The site stays static.** The browser reads the files directly, so status is
  live without rebuilding the site.
- **One write per run is enough.** Writing at start (`running`) and at the end
  makes "stuck" detection possible, but is optional.

JSON Schema: [`dhx/schemas/job-status.schema.json`](../dhx/schemas/job-status.schema.json).

## Layout

Under a status prefix (configured in `status.sources`), each job owns a folder
named after its id:

```
<prefix>/<job_id>/latest.json                         current state, overwritten on every write
<prefix>/<job_id>/runs/<YYYYMMDDTHHMMSSZ>-<run_id>.json   one file per run (history)
```

- `latest.json` is what the site and `dhx status check` read. It must be
  served with `Cache-Control: no-cache` (writers using `dhx` do this).
- `runs/` files are named with the run's start time first, so a lexical sort
  is a time sort. The builder reads the newest `status.history` of them for
  the run strip. A store that cannot list (git, plain HTTP) only shows `latest.json`.
- Writing the run file and then `latest.json` (in that order) means a reader
  never sees a `latest.json` without its run record.

## Document

```json
{
  "spec": "dataherb.status/v1",
  "job": {
    "id": "sales-export",
    "name": "Nightly sales export",
    "owner": "commercial-analytics@example.com",
    "orchestrator": "airflow",
    "url": "https://airflow.example.com/dags/sales-export",
    "schedule": "0 2 * * *",
    "expected_interval": "P1D",
    "max_duration": "PT2H"
  },
  "run": {
    "id": "scheduled__2026-10-07T02:00:00+00:00",
    "status": "success",
    "started_at": "2026-10-07T02:00:12Z",
    "finished_at": "2026-10-07T02:14:39Z",
    "duration_seconds": 867,
    "attempt": 1,
    "trigger": "schedule",
    "url": "https://airflow.example.com/dags/sales-export/grid?dag_run_id=...",
    "message": "32 files processed",
    "error": null
  },
  "last_success": { "id": "...", "status": "success", "started_at": "...", "finished_at": "..." },
  "datasets": [
    { "id": "demo-daily-sales", "rows": 11680, "bytes": 450123, "data_updated_at": "2026-10-07T00:00:00Z" }
  ],
  "checks": [
    { "name": "row_count_vs_yesterday", "status": "pass", "value": 0.99 },
    { "name": "no_null_region", "status": "fail", "message": "12 rows" }
  ],
  "metrics": { "rows_written": 11680, "source_files": 32 },
  "producer": { "name": "dataherb-explorer", "version": "0.1.0" }
}
```

### `job` (required: `id`)

| Field | Meaning |
|---|---|
| `id` | Stable id, `[A-Za-z0-9][A-Za-z0-9._-]*`. Also the folder name. Datasets link to jobs by this id (`status_job` in dataset metadata). |
| `name`, `description`, `owner`, `tags` | Shown on the status page. `owner` is who gets pinged. |
| `orchestrator` | Free text: `airflow`, `github-actions`, `cron`, `dagster`, ... |
| `url` | Where the job is defined (DAG page, workflow file). |
| `schedule` | Cron expression or description. Informational only. |
| `expected_interval` | ISO 8601 duration between **successful** runs (`PT1H`, `P1D`, `P1W`; `hourly`, `daily`, `weekly`, `monthly` are accepted aliases). Drives staleness. Without it a job is never stale. |
| `max_duration` | A run still `running`/`queued` after this long is **stuck**. |

### `run` (required: `id`, `status`, `started_at`)

`status` is one of `queued`, `running`, `success`, `partial`, `failed`,
`skipped`, `cancelled`. `partial` means some output was written but not all of
it (for example 40 of 41 tables). Timestamps are ISO 8601 with a timezone;
writers should use UTC with a `Z` suffix.

### `last_success`

A copy of the most recent run with `status: success`. **Writers carry it
forward**: when the current run is not a success, `last_success` keeps the
previous value. This is what lets a reader know a job is stale even when its
latest run failed, without reading the history. `dhx status emit` does this
for you; hand-written emitters should read the previous `latest.json` first.

### `datasets`, `checks`, `metrics`

All optional.

- `datasets[].id` matches catalog dataset ids. Listing a dataset here links it
  to the job even if its metadata has no `status_job`.
  `data_updated_at` (the newest record's time) is shown as the dataset's "last update".
- `checks[]` are data quality checks; any `fail` makes a successful run **degraded**.
- `metrics` are free-form numbers shown on the job page.

Unknown fields are allowed everywhere, so teams can add their own.

## Health

Readers derive one health value per job from `latest.json` and the current
time. Rules are applied in order; the first that matches wins.

| Health | When |
|---|---|
| `unknown` | no `run` |
| `stuck` | run is `running`/`queued` for longer than `max_duration` |
| `stale` | run is `running`/`queued` and the last success is older than `expected_interval × (1 + stale_grace)` |
| `running` | run is `running`/`queued` |
| `failing` | run is `failed` or `cancelled` |
| `stale` | last success older than `expected_interval × (1 + stale_grace)`, or never succeeded |
| `degraded` | run is `partial`, or a check failed |
| `healthy` | run is `success` or `skipped` |

`stale_grace` defaults to 0.5, so a daily job turns stale 36 hours after its
last success. Severity order (worst first): failing, stuck, stale, degraded,
running, healthy, unknown. A dataset shows the worst health of its jobs.

The rules are implemented twice and kept in sync: `dhx/status.py` (`assess`)
and `site/assets/lib/health.js`.

## Writing status files

**Python / any orchestrator with Python**

```bash
pip install "dataherb-explorer[s3]"
dhx status emit --target s3://bucket/_dataherb/status/ \
  --job-id sales-export --status running --expected-interval P1D --max-duration PT2H
# ... do the work ...
dhx status emit --target s3://bucket/_dataherb/status/ \
  --job-id sales-export --status success --dataset demo-daily-sales:11680 --metric rows_written=11680
```

The second call finds the `running` run in `latest.json` and completes it
(same run id, start time kept, duration computed). From Python:
`dhx.status.emit(store, prefix, job, run, datasets, checks, metrics)`.

**Airflow**: DAG callbacks in [`examples/airflow/dataherb_status.py`](../examples/airflow/dataherb_status.py).

**GitHub Actions**: the composite action
`DataHerb/dataherb-explorer/.github/actions/emit-status@main`, see
[`examples/github-actions/crawler.yml`](../examples/github-actions/crawler.yml).
It can also send a `dataset-updated` event so the catalog rebuilds right away.

**Shell**: [`examples/shell/emit-status.sh`](../examples/shell/emit-status.sh)
writes a minimal file with the AWS CLI.

## Alerting

`dhx status check` prints every job's health and exits with code 1 when any
job is failing, stuck or stale (`--fail-on` changes the set). Run it on a
schedule in CI to get a red build, or pipe it to your chat tool.
