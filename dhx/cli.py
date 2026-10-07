"""Command line: dhx build | validate | lint | new | status emit | status check | serve."""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import logging
import sys
from pathlib import Path

import yaml

from . import __version__
from .config import load_config
from .util import iso, utcnow


def _cfg(args):
    return load_config(args.config)


def cmd_build(args) -> int:
    from .build import build

    cfg = _cfg(args)
    s = build(cfg, Path(args.out).resolve(), site_dir=Path(args.site).resolve() if args.site else None, strict=args.strict)
    print(f"built {s.datasets} datasets, {s.jobs} jobs -> {s.out}  ({s.errors} errors, {s.warnings} warnings)")
    if s.errors:
        for i in json.loads((s.out / "data" / "build.json").read_text())["issues"]:
            if i["level"] == "error":
                print(f"  error: {i['dataset'] or '-'}: {i['message']}", file=sys.stderr)
    return 0


def cmd_validate(args) -> int:
    from .build import validate_inputs

    cfg = _cfg(args)
    issues = validate_inputs(cfg)
    for i in issues:
        print(f"{i.level}: {i.dataset or '-'}: {i.message}")
    n = sum(1 for i in issues if i.level == "error")
    print(f"{n} error(s)" if n else "config and catalog entries are valid")
    return 1 if n else 0


def cmd_lint(args) -> int:
    from .catalog import build_catalog
    from .lint import lint_dataset
    from .status import collect

    cfg = _cfg(args)
    cat = build_catalog(cfg)
    jobs, _ = collect(cfg)
    known = {j["id"] for j in jobs}
    worst = 100
    rows = []
    for d in cat.datasets:
        q = lint_dataset(d, known_jobs=known)
        worst = min(worst, q["score"])
        rows.append((q["score"], d["id"], q["findings"]))
    for score, did, findings in sorted(rows):
        print(f"{score:>3}  {did}")
        for f in findings:
            print(f"       - {f['message']}")
    if args.min_score is not None and worst < args.min_score:
        print(f"lowest score {worst} is below --min-score {args.min_score}", file=sys.stderr)
        return 1
    return 0


def cmd_new(args) -> int:
    from .infer import scaffold

    folder = Path(args.folder)
    meta = scaffold(folder, dataset_id=args.id, name=args.name)
    text = yaml.safe_dump(meta, sort_keys=False, allow_unicode=True)
    target = folder / "dataherb.yml"
    if args.stdout:
        print(text)
        return 0
    if target.exists() and not args.force:
        print(f"{target} exists; use --force to overwrite or --stdout to print", file=sys.stderr)
        return 1
    target.write_text(text)
    print(f"wrote {target} with {len(meta['datapackage']['resources'])} resource(s). Fill in description, owner and tags.")
    return 0


def _kv(pairs: list[str] | None) -> dict:
    out = {}
    for p in pairs or []:
        k, _, v = p.partition("=")
        try:
            out[k] = float(v) if "." in v else int(v)
        except ValueError:
            out[k] = None
    return out


def cmd_status_emit(args) -> int:
    from .status import emit, store_for_target
    from .stores import make_stores

    if args.target:
        store, prefix = store_for_target(args.target)
    else:
        cfg = _cfg(args)
        stores = make_stores(cfg.stores, cfg.root)
        src = next((s for s in cfg.status.get("sources") or [] if not args.store or s.get("store") == args.store), None)
        if src is None:
            print("no status source in config (or --store not found); pass --target", file=sys.stderr)
            return 2
        store, prefix = stores[src["store"]], src.get("prefix", "")
    job = {
        "id": args.job_id,
        "name": args.job_name,
        "owner": args.owner,
        "orchestrator": args.orchestrator,
        "url": args.job_url,
        "schedule": args.schedule,
        "expected_interval": args.expected_interval,
        "max_duration": args.max_duration,
    }
    run = {
        "id": args.run_id,
        "status": args.status,
        "started_at": args.started_at,
        "finished_at": args.finished_at,
        "attempt": args.attempt,
        "trigger": args.trigger,
        "url": args.run_url,
        "message": args.message,
        "error": {"message": args.error} if args.error else None,
    }
    datasets = []
    for d in args.dataset or []:
        did, _, rows = d.partition(":")
        datasets.append({"id": did, **({"rows": int(rows)} if rows else {}), "data_updated_at": iso(utcnow())})
    checks = []
    for c in args.check or []:
        name, _, status = c.partition("=")
        checks.append({"name": name, "status": status or "pass"})
    doc = emit(store, prefix, job, run, datasets=datasets, checks=checks, metrics=_kv(args.metric))
    print(f"{doc['job']['id']}: run {doc['run']['id']} -> {doc['run']['status']} ({store.describe(prefix)})")
    return 0


def cmd_status_check(args) -> int:
    from .status import collect

    cfg = _cfg(args)
    jobs, issues = collect(cfg)
    bad = set(args.fail_on.split(","))
    failing = 0
    for j in jobs:
        mark = "!!" if j["health"] in bad else "  "
        failing += j["health"] in bad
        print(f"{mark} {j['health']:<9} {j['id']:<32} {j['reason']}")
    for i in issues:
        print(f"{i['level']}: {i['message']}", file=sys.stderr)
    return 1 if failing else 0


def cmd_serve(args) -> int:
    root = Path(args.dir).resolve()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as httpd:
        print(f"serving {root} at http://127.0.0.1:{args.port}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="dhx", description="DataHerb Explorer: static data catalog builder.")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("-c", "--config", default="dataherb.config.yml")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build the static site")
    b.add_argument("-o", "--out", default="dist")
    b.add_argument("--site", help="alternative site/ folder (custom theme)")
    b.add_argument("--strict", action="store_true", help="exit non-zero when any dataset fails to resolve")
    b.set_defaults(fn=cmd_build)

    v = sub.add_parser("validate", help="validate the config and catalog entries")
    v.set_defaults(fn=cmd_validate)

    lint = sub.add_parser("lint", help="score catalog quality")
    lint.add_argument("--min-score", type=int)
    lint.set_defaults(fn=cmd_lint)

    n = sub.add_parser("new", help="scaffold dataherb.yml from the data files in a folder")
    n.add_argument("folder", nargs="?", default=".")
    n.add_argument("--id")
    n.add_argument("--name")
    n.add_argument("--stdout", action="store_true")
    n.add_argument("--force", action="store_true")
    n.set_defaults(fn=cmd_new)

    st = sub.add_parser("status", help="job status files").add_subparsers(dest="status_cmd", required=True)
    e = st.add_parser("emit", help="write a job status update (start, finish, fail)")
    e.add_argument("--target", help="s3://bucket/prefix or a local folder; overrides the config")
    e.add_argument("--store", help="status source store from the config")
    e.add_argument("--job-id", required=True)
    e.add_argument("--job-name")
    e.add_argument("--owner")
    e.add_argument("--orchestrator")
    e.add_argument("--job-url")
    e.add_argument("--schedule")
    e.add_argument("--expected-interval", help="ISO 8601 duration, e.g. P1D, PT6H")
    e.add_argument("--max-duration", help="ISO 8601 duration")
    e.add_argument("--run-id")
    e.add_argument("--status", required=True, choices=["queued", "running", "success", "partial", "failed", "skipped", "cancelled"])
    e.add_argument("--started-at")
    e.add_argument("--finished-at")
    e.add_argument("--attempt", type=int)
    e.add_argument("--trigger", choices=["schedule", "manual", "event", "backfill", "unknown"])
    e.add_argument("--run-url")
    e.add_argument("--message")
    e.add_argument("--error")
    e.add_argument("--dataset", action="append", help="dataset id this run refreshed, optionally id:rows")
    e.add_argument("--check", action="append", help="name=pass|warn|fail")
    e.add_argument("--metric", action="append", help="name=number")
    e.set_defaults(fn=cmd_status_emit)

    c = st.add_parser("check", help="print job health; exit 1 if any job is unhealthy")
    c.add_argument("--fail-on", default="failing,stuck,stale")
    c.set_defaults(fn=cmd_status_check)

    s = sub.add_parser("serve", help="serve a built site locally")
    s.add_argument("dir", nargs="?", default="dist")
    s.add_argument("-p", "--port", type=int, default=8000)
    s.set_defaults(fn=cmd_serve)
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.WARNING, format="%(levelname)s %(message)s")
    return args.fn(args)
