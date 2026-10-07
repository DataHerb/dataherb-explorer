"""Write demo job status files into demo/status, with timestamps relative to now.

The deploy workflow runs this before building so the demo site always shows a
realistic mix of healthy, failing and stale jobs. Delete it (and demo/) in a fork.
"""

import datetime as dt
import random
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dataherb.catalog.status import emit  # noqa: E402
from dataherb.catalog.stores import LocalStore  # noqa: E402
from dataherb.catalog.util import iso, utcnow  # noqa: E402

OUT = ROOT / "demo" / "status"


def history(store, job, every, n, durations, fail_at=(), last="success", checks=None, metrics=None, datasets=None, error=None):
    rng = random.Random(job["id"])
    now = utcnow().replace(microsecond=0)
    for i in range(n, 0, -1):
        start = now - every * i + dt.timedelta(minutes=rng.randint(0, 9))
        dur = dt.timedelta(seconds=rng.randint(*durations))
        status = "failed" if i in fail_at else "success"
        if i == 1:
            status = last
            if last == "running":
                start = now - dt.timedelta(minutes=12)
        run = {
            "id": f"{job['id']}-{start.strftime('%Y%m%dT%H%M')}",
            "status": status,
            "started_at": iso(start),
            "trigger": "schedule",
            "url": f"https://airflow.example.com/dags/{job['id']}/grid" if job.get("orchestrator") == "airflow" else f"https://github.com/DataHerb/dataherb-explorer/actions/runs/{start:%Y%m%d%H}",
        }
        if status != "running":
            run["finished_at"] = iso(start + dur)
        if status == "failed":
            run["error"] = {"type": "HTTPError", "message": error or "upstream returned 503"}
        m = {k: (v() if callable(v) else v) for k, v in (metrics or {}).items()}
        emit(store, "", job, run, datasets=datasets, checks=checks if i == 1 else [], metrics=m, now=start + dur)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    store = LocalStore("demo", {"type": "local", "path": str(OUT)}, ROOT)
    rng = random.Random(7)
    day, hour = dt.timedelta(days=1), dt.timedelta(hours=1)

    history(
        store,
        {"id": "sales-export", "name": "Nightly sales export", "owner": "commercial-analytics@example.com",
         "orchestrator": "airflow", "schedule": "0 2 * * *", "expected_interval": "P1D", "max_duration": "PT2H",
         "url": "https://airflow.example.com/dags/sales-export"},
        day, 21, (600, 1500), fail_at=(9,),
        datasets=[{"id": "demo-daily-sales", "rows": 11680, "data_updated_at": iso(utcnow() - dt.timedelta(hours=20))}],
        checks=[{"name": "row_count_vs_yesterday", "status": "pass", "value": 0.99},
                {"name": "no_null_region", "status": "pass"}],
        metrics={"rows_written": lambda: rng.randint(11000, 12000), "source_files": 32},
    )
    history(
        store,
        {"id": "nuforc-crawler", "name": "NUFORC UFO report crawler", "owner": "data-platform@example.com",
         "orchestrator": "github-actions", "schedule": "0 */6 * * *", "expected_interval": "PT6H",
         "url": "https://github.com/DataHerb/nuforc-ufo-records/actions"},
        6 * hour, 24, (120, 400), fail_at=(1, 2), last="failed",
        error="nuforc.org responded 503 Service Unavailable (3 retries)",
        metrics={"pages_crawled": lambda: rng.randint(40, 60), "http_errors": lambda: rng.randint(0, 3)},
        datasets=[{"id": "nuforc-ufo-records"}],
    )
    # Stale: daily job whose last success was 4 days ago.
    job = {"id": "samsung-updates-crawler", "name": "Samsung update schedule scraper", "owner": "devices@example.com",
           "orchestrator": "cron", "schedule": "30 5 * * *", "expected_interval": "P1D"}
    now = utcnow().replace(microsecond=0)
    for i in range(12, 3, -1):
        s = now - day * i
        emit(store, "", job, {"id": f"run-{i}", "status": "success", "started_at": iso(s), "finished_at": iso(s + dt.timedelta(minutes=3))},
             datasets=[{"id": "samsung-device-updates"}], now=s + dt.timedelta(minutes=3))
    # Degraded: last run partial with a failed check.
    history(
        store,
        {"id": "warehouse-sync", "name": "Warehouse to S3 sync", "owner": "data-platform@example.com",
         "orchestrator": "airflow", "schedule": "@hourly", "expected_interval": "PT3H", "max_duration": "PT30M"},
        hour, 30, (60, 240), last="partial",
        checks=[{"name": "freshness_orders", "status": "pass"},
                {"name": "schema_drift_customers", "status": "fail", "message": "column 'segment' disappeared"}],
        metrics={"tables_synced": 41, "tables_failed": 1},
    )
    # Running now.
    history(
        store,
        {"id": "eu-nuts-refresh", "name": "Eurostat NUTS refresh", "owner": "geo@example.com",
         "orchestrator": "github-actions", "expected_interval": "P7D", "max_duration": "PT1H"},
        3 * day, 8, (300, 900), last="running", datasets=[{"id": "eu-nuts"}],
    )
    print(f"wrote demo status to {OUT}")


if __name__ == "__main__":
    main()
