"""Report Airflow DAG runs to a DataHerb catalog.

Put this file next to your DAGs (or in a shared plugins module) and add the
callbacks to any DAG:

    from dataherb_status import status_callbacks

    with DAG(
        "sales_export",
        schedule="0 2 * * *",
        **status_callbacks(
            target="s3://my-company-datalake/_dataherb/status/",
            expected_interval="P1D",
            max_duration="PT2H",
            owner="commercial-analytics@example.com",
            datasets=["demo-daily-sales"],
        ),
    ) as dag:
        ...

Requires `pip install "dataherb[s3]"` on the workers. The worker's
AWS credentials (instance role, connection env vars) are used to write.
Status writes never fail the DAG: errors are logged and swallowed.
"""

from __future__ import annotations

import logging
from typing import Any

from dataherb.catalog.status import emit, store_for_target

log = logging.getLogger(__name__)

AIRFLOW_STATE = {"success": "success", "failed": "failed", "running": "running", "queued": "queued"}


def _write(target: str, context: dict, status: str, job_extra: dict, datasets: list[str], error: str | None = None) -> None:
    try:
        dag_run = context["dag_run"]
        dag = context["dag"]
        store, prefix = store_for_target(target)
        base_url = context.get("conf").get("webserver", "base_url") if context.get("conf") else ""
        job = {
            "id": dag.dag_id,
            "name": dag.description or dag.dag_id,
            "orchestrator": "airflow",
            "schedule": str(dag.timetable.summary) if getattr(dag, "timetable", None) else None,
            "url": f"{base_url}/dags/{dag.dag_id}/grid" if base_url else None,
            **job_extra,
        }
        run = {
            "id": dag_run.run_id,
            "status": status,
            "started_at": dag_run.start_date.isoformat() if dag_run.start_date else None,
            "finished_at": dag_run.end_date.isoformat() if (dag_run.end_date and status != "running") else None,
            "trigger": {"scheduled": "schedule", "manual": "manual", "backfill": "backfill"}.get(str(dag_run.run_type).split(".")[-1].lower(), "unknown"),
            "url": f"{base_url}/dags/{dag.dag_id}/grid?dag_run_id={dag_run.run_id}" if base_url else None,
            "error": {"type": type(context.get("exception")).__name__, "message": error} if error else None,
        }
        emit(store, prefix, job, run, datasets=[{"id": d} for d in datasets])
    except Exception:  # never break the DAG because of monitoring
        log.exception("could not write DataHerb status")


def status_callbacks(target: str, expected_interval: str | None = None, max_duration: str | None = None,
                     owner: str | None = None, datasets: list[str] | None = None) -> dict[str, Any]:
    """Keyword arguments for DAG(...) that report start, success and failure."""
    extra = {"expected_interval": expected_interval, "max_duration": max_duration, "owner": owner}
    ds = datasets or []

    def on_start(context):  # used as the first task's on_execute_callback
        _write(target, context, "running", extra, ds)

    def on_success(context):
        _write(target, context, "success", extra, ds)

    def on_failure(context):
        _write(target, context, "failed", extra, ds, error=str(context.get("reason") or context.get("exception") or "DAG run failed"))

    return {
        "on_success_callback": on_success,
        "on_failure_callback": on_failure,
        "default_args": {"on_execute_callback": on_start},
    }
