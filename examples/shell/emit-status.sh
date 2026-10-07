#!/usr/bin/env bash
# Write a DataHerb status file without Python: build the JSON and copy it to S3.
# Usage: emit-status.sh <job_id> <status> [message]
# This minimal version does not carry `last_success` forward; prefer
# `dhx status emit` when you can, or keep last_success yourself.
set -euo pipefail
JOB_ID="$1"; STATUS="$2"; MESSAGE="${3:-}"
TARGET="${DATAHERB_STATUS_TARGET:-s3://my-company-datalake/_dataherb/status}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
STARTED="${STARTED_AT:-$NOW}"

doc=$(cat <<JSON
{
  "spec": "dataherb.status/v1",
  "job": {"id": "$JOB_ID", "orchestrator": "cron", "expected_interval": "${EXPECTED_INTERVAL:-P1D}"},
  "run": {"id": "$RUN_ID", "status": "$STATUS", "started_at": "$STARTED", "finished_at": "$NOW", "message": "$MESSAGE"},
  "producer": {"name": "emit-status.sh", "version": "1"}
}
JSON
)
stamp="$(date -u -d "$STARTED" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u +%Y%m%dT%H%M%SZ)"
echo "$doc" | aws s3 cp - "$TARGET/$JOB_ID/runs/$stamp-$RUN_ID.json" --content-type application/json
echo "$doc" | aws s3 cp - "$TARGET/$JOB_ID/latest.json" --content-type application/json --cache-control "no-cache"
