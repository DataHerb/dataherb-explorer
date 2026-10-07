---
id: economic-trading-indicators
repo: DataHerb/dataset-ecomonic-trading-indicators-by-country
tags:
- economics
- trade
- time-series
owner:
  team: DataHerb
update_frequency: monthly
---

## Sources

Collected monthly by a scheduled GitHub Action from free SDMX APIs:

- [OECD Data Explorer](https://data-explorer.oecd.org/), preferred where it covers a country.
- [IMF data portal](https://data.imf.org/) for the remaining countries, PPI, reserves, policy rates and commodity prices.
- [National Bureau of Statistics of China](https://www.stats.gov.cn/english/PressRelease/) for China's official PMI.
- [Eurostat](https://ec.europa.eu/eurostat/web/euro-indicators/business-and-consumer-surveys) business and consumer surveys.
- [New York Fed](https://www.newyorkfed.org/survey/empire/empiresurvey_overview) Empire State Manufacturing Survey.

Each series comes from a single source; the `source` column says which.

## Files

| File | Contents |
| --- | --- |
| `data/indicators.csv` | Every country indicator in one long table |
| `data/by_indicator/<indicator>.csv` | One file per indicator |
| `data/catalog.csv` | Indicator names, units, sources, coverage |
| `data/commodities.csv` | Global commodity prices and indices |

The repository is private: the catalog build reads it with the `CATALOG_GITHUB_TOKEN` secret.
