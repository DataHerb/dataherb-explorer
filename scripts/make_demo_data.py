"""Generate the small demo datasets in demo/datasets (deterministic)."""

import csv
import datetime as dt
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "demo" / "datasets"

REGIONS = [
    ("DE-BE", "Berlin", "DE", 3_878_000),
    ("DE-BY", "Bavaria", "DE", 13_369_000),
    ("DE-HH", "Hamburg", "DE", 1_892_000),
    ("FR-IDF", "Ile-de-France", "FR", 12_271_000),
    ("FR-ARA", "Auvergne-Rhone-Alpes", "FR", 8_114_000),
    ("NL-NH", "North Holland", "NL", 2_952_000),
    ("ES-MD", "Madrid", "ES", 6_871_000),
    ("IT-LOM", "Lombardy", "IT", 10_020_000),
]
PRODUCTS = {"herbal-tea": 4.5, "basil-seeds": 2.2, "mint-oil": 11.0, "dried-sage": 6.8}


def main() -> None:
    rng = random.Random(42)
    (ROOT / "regions").mkdir(parents=True, exist_ok=True)
    with open(ROOT / "regions" / "regions.csv", "w", newline="") as fp:
        w = csv.writer(fp)
        w.writerow(["region_code", "region_name", "country", "population"])
        w.writerows(REGIONS)

    (ROOT / "sales").mkdir(parents=True, exist_ok=True)
    start = dt.date(2025, 1, 1)
    with open(ROOT / "sales" / "daily_sales.csv", "w", newline="") as fp:
        w = csv.writer(fp)
        w.writerow(["date", "region_code", "product", "units", "revenue_eur"])
        for day in range(365):
            d = start + dt.timedelta(days=day)
            season = 1 + 0.35 * (1 if d.month in (11, 12, 1, 2) else 0) - 0.15 * (d.weekday() >= 5)
            for code, _, _, pop in REGIONS:
                for product, price in PRODUCTS.items():
                    base = pop / 1_000_000 * (8 if product == "herbal-tea" else 3)
                    units = max(0, int(rng.gauss(base * season, base * 0.25)))
                    w.writerow([d.isoformat(), code, product, units, round(units * price * rng.uniform(0.95, 1.05), 2)])


if __name__ == "__main__":
    main()
