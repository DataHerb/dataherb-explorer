import json

from dhx.build import build
from dhx.cli import main
from dhx.config import load_config


def test_build_writes_site(project):
    cfg = load_config(project / "dataherb.config.yml")
    assert main(["-c", str(project / "dataherb.config.yml"), "status", "emit", "--job-id", "orders-etl",
                 "--status", "success", "--expected-interval", "P1D", "--dataset", "orders:2"]) == 0
    s = build(cfg, project / "dist")
    assert (project / "dist" / "index.html").exists()
    assert (project / "dist" / "files" / "local" / "datasets" / "regions" / "regions.csv").exists()
    cat = json.loads((project / "dist" / "data" / "catalog.json").read_text())
    orders = next(d for d in cat["datasets"] if d["id"] == "orders")
    assert orders["health"] == "healthy"
    assert orders["updated_at"]
    assert 0 <= orders["quality"]["score"] <= 100
    status = json.loads((project / "dist" / "data" / "status.json").read_text())
    assert status["jobs"][0]["latest_url"] == "files/local/status/orders-etl/latest.json"
    public = json.loads((project / "dist" / "data" / "config.json").read_text())
    assert "raw_url_template" not in json.dumps(public["stores"])  # no internals leak to the browser
    assert s.errors == 1  # the broken entry


def test_validate_and_new(project, capsys):
    cfg = str(project / "dataherb.config.yml")
    assert main(["-c", cfg, "validate"]) == 0
    folder = project / "demo" / "datasets" / "regions"
    assert main(["new", str(folder), "--stdout"]) == 0
    out = capsys.readouterr().out
    assert "regions.csv" in out and "code" in out
